import base64
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from app.home_extras import daily_forecasts, extras_router, person_image_path
from app.models import normalize
from app.storage import Store
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from test_api import login
from test_management import client  # noqa: F401


def test_people_preferences_photo_and_roles(client):  # noqa: F811
    c = client
    c.app.state.ha.states["person.ada"] = {
        "state": "home",
        "attributes": {"friendly_name": "Ada", "entity_picture": "https://elsewhere.invalid/private.jpg"},
    }
    assert c.get("/api/home/people").json()["people"] is None
    assert c.put("/api/home/people", json={"people": [], "only_home": True}).status_code == 200
    assert c.get("/api/home/people").json()["people"] == []
    assert c.put("/api/home/people", json={"people": ["person.missing"]}).status_code == 404
    assert c.get("/api/home/people/person.ada/photo").status_code == 404
    png = b"\x89PNG\r\n\x1a\n" + b"test"
    assert (
        c.put("/api/home/people/person.ada/photo", json={"data": base64.b64encode(png).decode()}).status_code
        == 200
    )
    assert c.get("/api/home/people/person.ada/photo").content == png
    assert c.get("/api/home/people").json()["photos"]["person.ada"]["custom"]
    assert (
        c.put(
            "/api/home/people/person.ada/photo", json={"data": base64.b64encode(b"<svg/>").decode()}
        ).status_code
        == 422
    )
    assert c.put("/api/home/people", json={"people": []}, headers={"x-csrf-token": "bad"}).status_code == 403
    c.post("/api/users", json={"name": "resident", "password": "another long password", "role": "user"})
    c.post("/api/logout")
    login(c, "resident", "another long password")
    assert c.get("/api/home/people").json()["people"] is None
    assert c.put("/api/home/people/person.ada/photo", json={"data": ""}).status_code == 403
    assert c.get("/api/manage/device/anything").status_code == 403


def test_photo_paths_and_forecast_local_calendar():
    assert person_image_path("/api/image/serve/abcd/512x512") == "/api/image/serve/abcd/512x512"
    for path in [
        "https://evil.example/image.png",
        "//evil/image",
        "/api/states",
        "/local/../secret",
        "/local/a.png?token=abc",
    ]:
        with pytest.raises(HTTPException):
            person_image_path(path)
    # Local midnight falls on the next UTC day in Oslo.
    now = datetime(2026, 10, 12, 23, 30, tzinfo=UTC)
    days = daily_forecasts(
        [
            {"datetime": "2026-10-13T12:00:00+02:00", "temperature": 10, "condition": "sunny"},
            {"datetime": "2026-10-14T12:00:00+02:00", "temperature": 12, "templow": 5, "precipitation": 0},
            {"datetime": "bad", "temperature": 99},
        ],
        "Europe/Oslo",
        now,
    )
    assert days["today"]["date"] == "2026-10-13"
    assert days["tomorrow"]["temperature"] == 12
    assert days["tomorrow"]["precipitation"] == 0


@pytest.mark.parametrize("period", [None, "24", "168"])
def test_live_forecast_and_device_history_contract(tmp_path, period):
    class HA:
        connected = True
        devices = {"one": {"id": "one", "name": "Meter", "manufacturer": "Maker", "sw_version": "1"}}
        areas = {}
        entities = {"sensor.temp": {"device_id": "one"}, "sensor.other": {"device_id": "two"}}
        states = {
            "weather.home": {"state": "sunny", "attributes": {"temperature_unit": "°C"}},
            "sensor.temp": {"state": "21", "attributes": {"unit_of_measurement": "°C"}},
            "sensor.other": {"state": "10", "attributes": {}},
        }

        def controls(self):
            return normalize(self.states, self.entities, self.devices)

        async def request(self, kind, **kwargs):
            assert kind == "call_service"
            assert kwargs["service"] == "get_forecasts" and kwargs["return_response"] is True
            return {"response": {"weather.home": {"forecast": []}}}

        async def rest(self, method, path):
            assert "filter_entity_id=sensor.temp" in path
            return [
                [
                    {"state": "20", "last_changed": "2026-10-13T01:00:00Z"},
                    {"state": "unknown", "last_changed": "2026-10-13T02:00:00Z"},
                    {"state": "23", "last_changed": "2026-10-13T03:00:00Z"},
                ]
            ]

    store = Store(tmp_path / "extras.sqlite3")
    app = FastAPI()
    app.include_router(
        extras_router(store, lambda: {"id": "user", "role": "admin"}, HA(), SimpleNamespace(mode="live"))
    )
    with TestClient(app) as c:
        assert c.get("/api/home/weather/weather.home").json()["days"] == {}
        assert c.get("/api/manage/device/one").json()["firmware"] == "1"
        url = "/api/manage/device/one/history?entity_id=sensor.temp"
        response = c.get(url + (f"&hours={period}" if period else ""))
        assert response.status_code == 200, response.text
        history = response.json()
        duration = datetime.fromisoformat(history["end"]) - datetime.fromisoformat(history["start"])
        assert abs(duration.total_seconds() - int(period or "24") * 3600) < 5
        assert history["minimum"] == 20 and history["maximum"] == 23
        assert history["points"][1]["value"] is None
        assert c.get("/api/manage/device/one/history?entity_id=sensor.other").status_code == 404
        assert c.get("/api/manage/device/one/history?entity_id=sensor.temp&hours=999").status_code == 422


def test_profile_proxy_keeps_supervisor_prefix_and_credentials_server_side(tmp_path, monkeypatch):
    import app.home_extras as extras
    import httpx

    seen = []

    def handler(request):
        seen.append(request)
        return httpx.Response(200, content=b"\x89PNG\r\n\x1a\nimage")

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        extras.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs),
    )
    states = {
        "person.ada": {"state": "home", "attributes": {"entity_picture": "/api/image/serve/abc123/512x512"}}
    }
    ha = SimpleNamespace(
        states=states,
        connected=True,
        http_url="http://supervisor/core/api/",
        token="test-only-secret",
        controls=lambda: normalize(states, {}, {}),
    )
    app = FastAPI()
    app.include_router(
        extras_router(
            Store(tmp_path / "photos.sqlite3"),
            lambda: {"id": "resident", "role": "user"},
            ha,
            SimpleNamespace(mode="live"),
        )
    )
    with TestClient(app) as c:
        response = c.get("/api/home/people/person.ada/photo")
        assert response.status_code == 200
        assert str(seen[0].url) == "http://supervisor/core/api/image/serve/abc123/512x512"
        assert seen[0].headers["authorization"] == "Bearer test-only-secret"
        assert "test-only-secret" not in response.text
        assert response.headers["cache-control"] == "no-store"
        states["person.ada"]["attributes"]["entity_picture"] = "https://untrusted.invalid/image"
        assert c.get("/api/home/people/person.ada/photo").status_code == 404
        assert len(seen) == 1
