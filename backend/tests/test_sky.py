import json
import math
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from test_api import login
from test_management import client  # noqa: F401

from app.ha import HAError
from app.sky import calculate_sky, location_from_config, sky_router
from app.storage import Store


def test_equatorial_sun_and_paths_use_real_angles_and_utc_events():
    data = calculate_sky(0, 0, "UTC", datetime(2026, 3, 20, 12, tzinfo=UTC))
    assert 87 < data["sun"]["altitude"] <= 90
    assert 11.8 * 3600 < data["sun"]["daylight_seconds"] < 12.3 * 3600
    start, end = (datetime.fromisoformat(data["day"][key]) for key in ["start", "end"])
    for body in ["sun", "moon"]:
        assert 0 <= data[body]["azimuth"] < 360
        assert -90 <= data[body]["altitude"] <= 90
        for name in ["rise", "set"]:
            if data[body][name]:
                assert start <= datetime.fromisoformat(data[body][name]) <= end
    assert data["path"][0]["time"] == data["day"]["start"]
    assert data["path"][-1]["time"] == data["day"]["end"]
    assert all(
        math.isfinite(point[body][key])
        for point in data["path"]
        for body in ["sun", "moon"]
        for key in ["azimuth", "altitude"]
    )
    assert 0 <= data["moon"]["fraction"] <= 1


@pytest.mark.parametrize("month,day,hours", [(3, 29, 23), (10, 25, 25)])
def test_sky_follows_the_actual_local_dst_day(month, day, hours):
    data = calculate_sky(59.9139, 10.7522, "Europe/Oslo", datetime(2026, month, day, 12, tzinfo=UTC))
    start, end = (datetime.fromisoformat(data["day"][key]) for key in ["start", "end"])
    assert (end - start).total_seconds() == hours * 3600
    assert len(data["path"]) == hours * 2 + 1


@pytest.mark.parametrize("month,state,seconds", [(6, "always_up", 86400), (12, "always_down", 0)])
def test_polar_days_have_explicit_states_without_invented_rise_or_set(month, state, seconds):
    data = calculate_sky(69.6492, 18.9553, "Europe/Oslo", datetime(2026, month, 21, 12, tzinfo=UTC))
    assert data["sun"]["rise"] is None and data["sun"]["set"] is None
    assert data["sun"]["state"] == state
    assert data["sun"]["daylight_seconds"] == seconds


@pytest.mark.parametrize("lat,lon", [(None, 0), (True, 0), (91, 0), (0, -181), (float("nan"), 0), (0, "10")])
def test_missing_or_invalid_coordinates_never_fall_back_to_a_made_up_location(lat, lon):
    assert location_from_config({"latitude": lat, "longitude": lon, "time_zone": "Europe/Oslo"}) == (
        "Europe/Oslo",
        None,
    )


def test_zero_coordinates_are_real_and_invalid_timezones_are_not_silently_assumed():
    assert location_from_config({"latitude": 0, "longitude": 0, "time_zone": "UTC"}) == ("UTC", (0, 0))
    assert location_from_config({"latitude": 59, "longitude": 10, "time_zone": "not/a/zone"}) == (None, None)
    assert location_from_config({"latitude": 59, "longitude": 10}, "Europe/Oslo") == ("Europe/Oslo", (59, 10))


def sky_client(tmp_path, fail=False):
    calls = []

    async def request(kind):
        calls.append(kind)
        if fail:
            raise HAError("disconnected")
        return {
            "latitude": 59.9139,
            "longitude": 10.7522,
            "time_zone": "Europe/Oslo",
            "secret": "do-not-expose",
            "location_name": "private name",
        }

    ha = SimpleNamespace(connected=True, epoch=1, request=request)
    app = FastAPI()
    app.include_router(
        sky_router(Store(tmp_path / "sky.sqlite3"), lambda: {"id": 1}, ha, SimpleNamespace(mode="live"))
    )
    return TestClient(app), ha, calls


def test_live_sky_caches_config_and_exposes_no_coordinates_secrets_or_config(tmp_path):
    sky_api, ha, calls = sky_client(tmp_path)
    first, second = sky_api.get("/api/home/sky"), sky_api.get("/api/home/sky")
    assert first.status_code == 200 and first.json()["available"]
    assert first.json()["generated_at"] == second.json()["generated_at"]
    assert calls == ["get_config"]
    serialized = json.dumps(first.json())
    assert all(
        word not in serialized
        for word in ["latitude", "longitude", "secret", "do-not-expose", "private name"]
    )
    assert "no-store" in first.headers["cache-control"]
    ha.connected = False
    assert sky_api.get("/api/home/sky").json()["location_status"] == "cached"
    assert calls == ["get_config"]


def test_failed_location_fetch_has_honest_empty_positions_without_hammering_ha(tmp_path):
    sky_api, _, calls = sky_client(tmp_path, fail=True)
    data = sky_api.get("/api/home/sky").json()
    assert data["available"] is False and data["sun"] is None and data["path"] == []
    assert "altitude" not in data["moon"] and data["timezone"] is None
    sky_api.get("/api/home/sky")
    assert calls == ["get_config"]


def test_sky_is_authenticated_read_only_and_available_to_restricted_residents(client):  # noqa: F811
    assert client.get("/api/home/sky").json()["demo"] is True
    client.post(
        "/api/users", json={"name": "clock-viewer", "password": "a-long-clock-password", "role": "user"}
    )
    account = next(
        account for account in client.get("/api/manage/accounts").json() if account["name"] == "clock-viewer"
    )
    client.put(f"/api/manage/accounts/{account['id']}/access", json={"profile": "custom", "permissions": []})
    client.post("/api/logout")
    assert client.get("/api/home/sky").status_code == 401
    login(client, "clock-viewer", "a-long-clock-password")
    response = client.get("/api/home/sky")
    assert response.status_code == 200 and "latitude" not in response.text
    assert client.get("/api/manage/settings/home").status_code == 403
    assert client.put("/api/home/sky", json={}).status_code != 200
