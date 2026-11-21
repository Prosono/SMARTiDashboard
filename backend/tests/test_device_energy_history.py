import json
from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace

from app.demo import Demo
from app.device_energy_history import MAX_PRICE_DAYS, OSLO, DeviceEnergyHistory
from app.device_energy_sources import DEVICE_ENERGY_SOURCES_KEY, DeviceEnergySource
from app.energy import energy_router
from app.energy_repository import EnergyConfig, EnergyRepository
from app.ha import HAError
from app.storage import Store
from fastapi import FastAPI
from fastapi.testclient import TestClient


def source(key, kind):
    return DeviceEnergySource(
        key, f"sensor.{key}", key, None, key, kind, "Wh" if kind == "energy" else "W", key, True
    )


def statistic(stamp, key, value):
    return {"start": stamp.timestamp() * 1000, key: value}


def preferences(**updates):
    return EnergyConfig(
        vat_exempt=True,
        electricity_tax_exempt=True,
        manual_grid_rate="0.2",
        scheme="norgespris",
        monthly_fee=1000,
        manual_capacity=100,
        **updates,
    )


async def test_hourly_history_uses_effective_agreement_and_preserves_negative_zero_and_missing(tmp_path):
    end = datetime(2026, 11, 3, 11, tzinfo=UTC)
    start = end - timedelta(hours=24)
    changed = start + timedelta(hours=2)
    repo = EnergyRepository(Store(tmp_path / "history.sqlite"))
    repo.save(preferences(contract="fixed", fixed_price="0.5", markup="0.3"), start)
    repo.save(preferences(contract="spot", markup="0.1"), changed)
    spot = [
        {
            "time_start": (changed + timedelta(minutes=15 * i)).isoformat(),
            "time_end": (changed + timedelta(minutes=15 * (i + 1))).isoformat(),
            "NOK_per_kWh": rate,
        }
        for i, rate in enumerate([-0.7, -1.3, -0.7, -1.3])
    ]
    with repo.store.connect() as db:
        db.execute(
            "INSERT INTO energy_prices VALUES(?,?,?,?)",
            ("NO1", str(changed.date()), json.dumps(spot), end.isoformat()),
        )

    async def request(command, **params):
        assert command == "recorder/statistics_during_period"
        assert params["period"] == "hour"
        assert params["start_time"] == start.isoformat()
        assert params["end_time"] == end.isoformat()
        if params["statistic_ids"] == ["sensor.counter"]:
            assert params["units"] == {"energy": "kWh"}
            assert params["types"] == ["change"]
            return {
                "sensor.counter": [
                    statistic(start, "change", 2),
                    statistic(start + timedelta(hours=1), "change", 0),
                    statistic(changed, "change", 4),
                    statistic(changed + timedelta(hours=1), "change", 1),
                    statistic(changed + timedelta(hours=2), "change", True),
                    statistic(end, "change", 10),
                ]
            }
        assert params["statistic_ids"] == ["sensor.watts"]
        assert params["units"] == {"power": "kW"}
        assert params["types"] == ["mean"]
        return {"sensor.watts": [statistic(start, "mean", 0.5), statistic(changed, "mean", -4)]}

    history = DeviceEnergyHistory(SimpleNamespace(connected=True, request=request), repo, None)
    readings = await history.read(
        "24h", 24, [source("counter", "energy"), source("watts", "power")], False, now=end
    )
    assert readings["currency"] == "NOK"
    meter, watt = readings["devices"]
    assert (meter["kind"], meter["kwh"], meter["cost"]) == ("measured", 7, -0.74)
    assert (meter["coverage"], meter["cost_coverage"]) == (16.7, 12.5)
    assert [point["cost"] for point in meter["points"][:5]] == [2.02, 0, -2.76, None, None]
    assert [point["kwh"] for point in meter["points"][:5]] == [2, 0, 4, 1, None]
    assert (watt["kind"], watt["kwh"], watt["cost"]) == ("estimated", 0.5, 0.505)


async def test_day_buckets_keep_both_hours_at_autumn_clock_change():
    end = datetime(2026, 10, 26, tzinfo=OSLO).astimezone(UTC)

    async def request(command, **params):
        start = datetime.fromisoformat(params["start_time"])
        return {"sensor.counter": [statistic(start + timedelta(hours=i), "change", 1) for i in range(168)]}

    history = DeviceEnergyHistory(SimpleNamespace(connected=True, request=request), None, None)
    readings = await history.read("7d", 168, [source("counter", "energy")], False, now=end)
    points = readings["devices"][0]["points"]
    assert points[-1]["start"].astimezone(OSLO).date() == date(2026, 10, 25)
    assert points[-1]["end"] - points[-1]["start"] == timedelta(hours=25)
    assert points[-1]["kwh"] == 25 and points[-1]["cost"] is None
    assert sum(point["kwh"] for point in points) == 168


async def test_missing_prices_fetches_a_bounded_batch_without_repeating_failed_days():
    calls = []

    async def prices(area, day):
        calls.append((area, day))
        return None

    history = DeviceEnergyHistory(None, None, SimpleNamespace(prices=prices))
    days = {("NO1", date(2026, 11, i)): None for i in range(1, 9)}
    await history.fetch_missing_prices(days)
    assert len(calls) == MAX_PRICE_DAYS
    await history.fetch_missing_prices(days)
    assert len(calls) == len(set(calls)) == len(days)


def test_history_api_uses_saved_selection_and_keeps_legacy_endpoint(tmp_path):
    ha = Demo()
    for key in ["one", "two"]:
        ha.entities[f"sensor.{key}"] = {"id": key}
        ha.states[f"sensor.{key}"] = {
            "state": "1",
            "attributes": {"device_class": "energy", "unit_of_measurement": "kWh"},
        }

    async def request(kind, **params):
        if kind == "energy/get_prefs":
            return {"device_consumption": [{"stat_consumption": "sensor.one"}]}
        start = datetime.fromisoformat(params["start_time"])
        ids = params["statistic_ids"]
        return {key: [statistic(start, "change", 0)] for key in ids}

    ha.request = request
    store = Store(tmp_path / "history_routes.sqlite")
    repo = EnergyRepository(store)
    settings = SimpleNamespace(mode="live")
    app = FastAPI()
    app.include_router(energy_router(ha, store, lambda: {"id": 1, "role": "admin"}, settings, repo))
    browser = TestClient(app)
    base = "/api/home/energy/device-consumption"
    assert browser.get(base).json()["devices"][0]["id"] == "one"
    assert browser.get(base + "/history").json()["devices"][0]["id"] == "one"
    store.set(DEVICE_ENERGY_SOURCES_KEY, '{"selected_ids":["two"]}')
    response = browser.get(base + "/history").json()
    selected = response["devices"]
    assert [device["id"] for device in selected] == ["two"]
    assert selected[0]["kwh"] == selected[0]["cost"] == 0
    assert len(selected[0]["points"]) == 24
    assert browser.get(base + "/history?period=1y").status_code == 422
    store.set(DEVICE_ENERGY_SOURCES_KEY, '{"selected_ids":[]}')
    assert browser.get(base + "/history").json()["devices"] == []

    async def fail(*args, **kwargs):
        raise HAError("unavailable")

    ha.request = fail
    store.set(DEVICE_ENERGY_SOURCES_KEY, '{"selected_ids":["two"]}')
    assert browser.get(base + "/history").status_code == 503
    settings.mode = "demo"
    result = browser.get(base + "/history").json()
    assert result["demo"] and result["devices"] == []
