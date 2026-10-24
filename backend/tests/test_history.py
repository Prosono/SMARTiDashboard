from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.history import history_router
from app.models import normalize


@pytest.fixture
def history():
    ha = SimpleNamespace(
        connected=True,
        states={
            "sensor.temperature": {"state": "22", "attributes": {"unit_of_measurement": "°C"}},
            "input_boolean.away": {"state": "off", "attributes": {"friendly_name": "Borte"}},
        },
        entities={},
        devices={},
    )
    ha.controls = lambda: normalize(ha.states, {}, {})
    calls = []
    now = datetime.now(UTC)

    async def rest(method, path):
        calls.append(path)
        if path.startswith("logbook"):
            return [
                {"when": now.isoformat(), "name": "Lys", "entity_id": "sensor.temperature", "state": "22"},
                {"when": "invalid", "name": "Broken"},
            ]
        return [
            [
                {
                    "entity_id": "sensor.temperature",
                    "state": "21",
                    "last_changed": (now - timedelta(hours=2)).isoformat(),
                },
                {"state": "nan", "last_changed": now.isoformat()},
            ]
        ]

    ha.rest = rest
    enabled = [True]

    def user():
        if not enabled[0]:
            raise HTTPException(401)
        return {"id": 1}

    app = FastAPI()
    app.include_router(history_router(ha, user, SimpleNamespace(mode="live")))
    client = TestClient(app)
    params = {
        "start": (now - timedelta(hours=1)).isoformat(),
        "end": (now + timedelta(seconds=1)).isoformat(),
    }
    return client, ha, calls, enabled, params


def test_history_requires_login_and_valid_bounded_period(history):
    client, ha, calls, enabled, params = history
    enabled[0] = False
    for path in ["entities", "states", "activity", "report"]:
        assert (
            client.get(
                "/api/history/" + path, params=params | {"entity_ids": "sensor.temperature"}
            ).status_code
            == 401
        )
    enabled[0] = True
    assert client.get("/api/history/states", params=params | {"entity_ids": "unknown.x"}).status_code == 422
    assert client.get("/api/history/states", params=params | {"entity_ids": ""}).status_code == 422
    assert (
        client.get("/api/history/activity", params=params | {"start": "2026-01-01T00:00:00"}).status_code
        == 422
    )
    assert (
        client.get(
            "/api/history/activity",
            params=params | {"start": (datetime.now(UTC) - timedelta(days=32)).isoformat()},
        ).status_code
        == 422
    )
    assert not calls
    ha.connected = False
    assert client.get("/api/history/activity", params=params).status_code == 503


def test_sources_history_initial_state_nan_and_ha_parameters(history):
    client, ha, calls, enabled, params = history
    assert {c["entity_id"] for c in client.get("/api/history/entities").json()} == {
        "sensor.temperature",
        "input_boolean.away",
    }
    response = client.get(
        "/api/history/states", params=params | {"entity_ids": "sensor.temperature,input_boolean.away"}
    )
    assert response.status_code == 200
    series = response.json()["series"]
    assert series[0]["points"][0]["time"] == params["start"]
    assert series[0]["points"][1]["value"] is None
    assert series[0]["minimum"] == 21 and series[0]["unit"] == "°C"
    assert series[1]["points"] == []
    query = parse_qs(urlparse(calls[0]).query)
    assert query["end_time"] == [params["end"]]
    assert query["filter_entity_id"] == ["sensor.temperature,input_boolean.away"]
    log = client.get("/api/history/activity", params=params).json()
    assert len(log["entries"]) == 1
    assert not log["truncated"]


def test_house_report_categorizes_activity_and_marks_truncation(history):
    client, ha, calls, enabled, params = history
    async def rest(method, path):
        if path.startswith("logbook"):
            return [{"when": params["end"], "entity_id": "light.kitchen", "state": "on"}] * 1001 + [
                {"when": params["end"], "entity_id": "alarm_control_panel.home", "state": "triggered"},
            ]
        return []
    ha.rest = rest
    response = client.get("/api/history/report", params=params)
    assert response.status_code == 200
    data = response.json()
    assert data["events"] == 1002
    assert data["analyzed_events"] == 1000
    assert data["truncated"] is True
    assert sum(data["categories"].values()) == 1000
    assert data["categories"]["Lys"] == 1000
    assert data["active_entities"] == 1


def test_house_report_temperature_ignores_non_finite_values(history):
    client, ha, calls, enabled, params = history
    ha.states["sensor.temperature"]["attributes"]["device_class"] = "temperature"
    result = client.get("/api/history/report", params=params)
    assert result.status_code == 200
    data = result.json()
    assert data["temperature_sensor_count"] == 1
    assert data["temperatures"][0]["minimum"] == 21
    assert data["temperatures"][0]["maximum"] == 21
    assert data["categories"]["Klima"] == 1
