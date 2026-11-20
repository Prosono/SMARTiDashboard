import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from app.factory_reset_provider import HomeResetProvider
from app.power_guard_history import PowerGuardHistory, clear_power_guard_history, power_guard_history_router
from app.storage import Store
from fastapi import FastAPI
from fastapi.testclient import TestClient

KEY = "energy_power_guard"
METER = "sensor.grid"
SWITCH = "switch.heater"
CLIMATE = "climate.heat_pump"
START = datetime(2026, 11, 20, 12, tzinfo=UTC)
NAMES = {SWITCH: "Varmeovn", CLIMATE: "Varmepumpe"}


@pytest.fixture
def history(tmp_path):
    store = Store(tmp_path / "history.sqlite")
    configure(store, "test")
    return PowerGuardHistory(store, KEY)


def configure(store, revision, enabled=True, meter=METER):
    store.set(
        KEY, json.dumps({"revision": revision, "config": {"enabled": enabled}, "binding": {"entity": meter}})
    )


def sample(history, at, *, power=3.7, projection=4.2, limit=5, watts=None, revision="test", meter=METER):
    history.sample(revision, at.timestamp(), power, projection, limit, watts or {}, meter_entity=meter)


def read(history, period="hour", now=START + timedelta(minutes=10), meter=METER):
    return history.read(period, now, meter_entity=meter, device_names=NAMES, trace_ids=set(NAMES))


def test_samples_keep_gaps_zero_readings_and_historical_limits(history):
    sample(history, START, watts={SWITCH: 750, CLIMATE: None})
    sample(history, START + timedelta(seconds=3), power=90)
    configure(history.store, "changed")
    sample(
        history,
        START + timedelta(minutes=2),
        revision="changed",
        power=0,
        projection=None,
        limit=10,
        watts={SWITCH: 0},
    )
    data = read(history)
    recorded = [point for point in data["points"] if point["power_kw"] is not None]
    assert recorded == [
        {"at": START, "power_kw": 3.7, "projected_kw": 4.2, "limit_kw": 5},
        {"at": START + timedelta(minutes=2), "power_kw": 0, "projected_kw": None, "limit_kw": 10},
    ]
    assert len(data["points"]) == 241
    missing = next(point for point in data["points"] if point["at"] == START + timedelta(seconds=15))
    assert missing == {
        "at": START + timedelta(seconds=15),
        "power_kw": None,
        "projected_kw": None,
        "limit_kw": None,
    }
    assert len(data["devices"]) == 1
    trace = data["devices"][0]
    assert trace["id"] == SWITCH
    assert [point["watts"] for point in trace["points"][-11:-8]] == [750, None, 0]


def test_today_handles_autumn_clock_change_and_bounds_points(history):
    day_start = datetime(2026, 10, 24, 22, tzinfo=UTC)
    first_two_am = day_start + timedelta(hours=2)
    second_two_am = first_two_am + timedelta(hours=1)
    sample(history, first_two_am)
    sample(history, first_two_am + timedelta(minutes=2), power=4)
    sample(history, second_two_am, power=1)
    now = day_start + timedelta(hours=24, minutes=59)
    data = read(history, "today", now)
    assert data["start"] == day_start
    assert data["step_seconds"] == 300
    assert len(data["points"]) == 300
    actual = [point for point in data["points"] if point["power_kw"] is not None]
    assert [(point["at"], point["power_kw"]) for point in actual] == [
        (first_two_am + timedelta(minutes=2), 4),
        (second_two_am, 1),
    ]


def test_invalid_disabled_and_superseded_samples_cannot_pollute_history(history):
    sample(history, START, power=float("nan"))
    sample(history, START, revision="superseded")
    sample(history, START, meter="sensor.other")
    configure(history.store, "test", enabled=False)
    sample(history, START)
    assert read(history)["points"] == []
    configure(history.store, "test", meter="sensor.other")
    sample(history, START, meter="sensor.other")
    assert read(history)["points"] == []
    assert any(p["power_kw"] == 3.7 for p in read(history, meter="sensor.other")["points"])


async def test_idle_retention_and_reset_clear_samples_and_actions(history):
    old = START - timedelta(hours=27)
    sample(history, old)
    sample(history, START)
    with history.store.connect() as db:
        history.action(db, SWITCH, "turn_off", old, 475)
        history.action(db, SWITCH, "turn_off", START, 300)
        history.action(db, SWITCH, "turn_off", START, 350)  # Retry is idempotent.
    history.prune(START)
    with history.store.connect() as db:
        assert db.execute("SELECT COUNT(*) FROM power_guard_samples").fetchone()[0] == 1
        assert db.execute("SELECT COUNT(*) FROM power_guard_actions").fetchone()[0] == 1
        assert db.execute("SELECT watts FROM power_guard_actions").fetchone()[0] == 300
    provider = HomeResetProvider(None, None, SimpleNamespace(ingress=False), history.store)
    assert await provider.execute({"kind": "local", "id": "smarti"}) == ("done", "")
    sample(history, START + timedelta(minutes=1))  # In-flight pre-reset tick.
    data = read(history)
    assert data["points"] == data["actions"] == data["devices"] == []
    assert history.store.get(KEY) == ""
    with history.store.connect() as db:
        clear_power_guard_history(db)  # Repeated resets are idempotent.


def test_history_endpoint_filters_hidden_loads_and_demo_returns_no_data(history):
    now = datetime.now(UTC) - timedelta(minutes=1)
    sample(history, now, watts={SWITCH: 600, CLIMATE: 800})
    with history.store.connect() as db:
        history.action(db, SWITCH, "turn_off", now, 600)
        history.action(db, CLIMATE, "turn_off", now, 800)
        history.action(db, SWITCH, "turn_on", now + timedelta(seconds=30), None)
    air = SimpleNamespace(name=NAMES[CLIMATE], domain="climate", attributes={})
    heater = SimpleNamespace(name=NAMES[SWITCH], domain="switch", attributes={})
    meter = SimpleNamespace(entity_id=METER, domain="sensor", attributes={"device_class": "power"})
    guard = SimpleNamespace(
        history=history,
        settings=SimpleNamespace(mode="live"),
        resetting=lambda: False,
        inventory=lambda _: (None, meter, [], None, {SWITCH: heater, CLIMATE: air}, {}),
        record=lambda: SimpleNamespace(
            config=SimpleNamespace(devices=[SimpleNamespace(id=id) for id in NAMES])
        ),
    )
    app = FastAPI()
    app.include_router(
        power_guard_history_router(
            guard, lambda: {"role": "user", "permissions": ["energy.view", "other.view"]}
        )
    )
    with TestClient(app) as client:
        endpoint = "/api/home/energy/power-guard/history"
        data = client.get(endpoint).json()
        assert data["counts"] == {"paused": 1, "restored": 1}
        assert [(row["id"], row["command"], row["watts"]) for row in data["actions"]] == [
            (SWITCH, "turn_on", None),
            (SWITCH, "turn_off", 600),
        ]
        assert len(data["devices"]) == 1 and data["devices"][0]["id"] == SWITCH
        assert client.get(endpoint + "?period=invalid").status_code == 422
        guard.settings.mode = "demo"
        data = client.get(endpoint).json()
        assert data["points"] == data["devices"] == data["actions"] == []
