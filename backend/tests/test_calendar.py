from datetime import datetime, timedelta
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit
from zoneinfo import ZoneInfo

from app.calendar import calendar_router, normalize_event
from app.ha import HAError
from app.storage import Store
from fastapi import FastAPI
from fastapi.testclient import TestClient
from test_api import login
from test_management import client  # noqa: F401


def test_calendar_auth_preferences_and_empty_demo(client):  # noqa: F811
    c = client
    c.app.state.ha.states["calendar.family"] = {"state": "off", "attributes": {"friendly_name": "Familie"}}
    assert c.get("/api/home/calendar").json()["calendars"] == []
    assert c.put("/api/home/calendar", json={"calendars": ["calendar.family"]}).status_code == 200
    assert c.get("/api/home/calendar").json()["calendars"] == ["calendar.family"]
    today = c.get("/api/home/calendar").json()["today"]
    result = c.get("/api/home/calendar/events", params={"start": today})
    assert result.status_code == 200
    assert len(result.json()["days"]) == 7
    assert not any(result.json()["days"].values())
    assert c.put("/api/home/calendar", json={"calendars": ["sensor.fake"]}).status_code == 422
    assert c.get("/api/home/calendar/events?start=2020-01-01").status_code == 422
    assert c.get("/api/home/calendar/events?start=not-a-date").status_code == 422
    csrf = c.headers.pop("x-csrf-token")
    assert c.put("/api/home/calendar", json={"calendars": []}).status_code == 403
    c.headers["x-csrf-token"] = csrf
    c.post("/api/users", json={"name": "reader", "password": "reader-password-long", "role": "user"})
    c.post("/api/logout")
    login(c, "reader", "reader-password-long")
    assert c.get("/api/home/calendar").json()["calendars"] == []
    assert c.put("/api/home/calendar", json={"calendars": ["calendar.family"]}).status_code == 200
    assert c.get("/api/home/calendar/events", params={"start": today}).status_code == 200
    c.cookies.clear()
    assert c.get("/api/home/calendar").status_code == 401
    assert c.get("/api/home/calendar/events", params={"start": today}).status_code == 401


def test_calendar_timezone_midnight_and_exclusive_end():
    zone = ZoneInfo("Europe/Oslo")
    event = normalize_event(
        {"start": {"date": "2026-10-24"}, "end": {"date": "2026-10-26"}, "summary": "Helg"},
        "calendar.family",
        zone,
    )
    assert event["all_day"]
    assert event["start"] == "2026-10-24T00:00:00+02:00"
    assert event["end"] == "2026-10-26T00:00:00+01:00"
    event = normalize_event(
        {"start": {"dateTime": "2026-10-13T23:30:00Z"}, "end": {"dateTime": "2026-10-14T01:00:00Z"}},
        "calendar.family",
        zone,
    )
    assert event["start"] == "2026-10-14T01:30:00+02:00"
    assert normalize_event({"start": {"date": "bad"}, "end": {}}, "calendar.family", zone) is None


def test_calendar_live_contract_partial_failure_and_day_overlap(tmp_path):
    today = datetime.now(ZoneInfo("Europe/Oslo")).date()
    next_day = today + timedelta(days=1)
    last = today + timedelta(days=2)
    calls = []

    class HA:
        connected = True
        states = {
            "calendar.family": {"attributes": {"friendly_name": "Familie"}},
            "calendar.broken": {"attributes": {}},
            "calendar.disabled": {"attributes": {}},
        }
        entities = {"calendar.disabled": {"disabled_by": "user"}}

        async def rest(self, method, path):
            assert method == "GET"
            calls.append(path)
            if "calendar.broken" in path:
                raise HAError("unavailable")
            query = parse_qs(urlsplit(path).query)
            assert datetime.fromisoformat(query["start"][0]).date() == today
            assert datetime.fromisoformat(query["end"][0]).date() == today + timedelta(days=7)
            return [
                {"summary": "Hel dag", "start": {"date": str(today)}, "end": {"date": str(next_day)}},
                {
                    "summary": "Natt",
                    "start": {"dateTime": f"{today}T23:00:00+02:00"},
                    "end": {"dateTime": f"{next_day}T01:00:00+02:00"},
                },
                {"summary": "Flerdag", "start": {"date": str(today)}, "end": {"date": str(last)}},
            ]

    store = Store(tmp_path / "calendar.db")
    ha = HA()
    app = FastAPI()
    app.include_router(calendar_router(store, lambda: {"id": "owner"}, ha, SimpleNamespace(mode="live")))
    with TestClient(app) as c:
        assert len(c.get("/api/home/calendar").json()["sources"]) == 2
        c.put("/api/home/calendar", json={"calendars": ["calendar.family", "calendar.broken"]})
        r = c.get("/api/home/calendar/events", params={"start": str(today)})
        assert r.status_code == 200
        data = r.json()
        assert data["failed"] == ["calendar.broken"]
        assert len(data["days"][str(today)]) == 3
        assert len(data["days"][str(next_day)]) == 2
        assert data["days"][str(last)] == []
        assert len(calls) == 2
        ha.connected = False
        assert c.get("/api/home/calendar/events", params={"start": str(today)}).status_code == 503
