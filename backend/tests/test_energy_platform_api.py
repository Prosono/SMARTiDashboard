from datetime import UTC, datetime, timedelta

from test_api import login
from test_energy_flow import install
from test_management import client  # noqa: F401


def test_setup_shared_admin_only_and_no_sensor_double_counting(client):  # noqa: F811
    install(client.app.state.ha, "sensor.import", 100, "kWh")
    install(client.app.state.ha, "sensor.grid", 500, "W")
    setup = client.get("/api/home/energy/platform/setup").json()
    assert len(setup["companies"]) > 60
    assert setup["elhub"] == "requires_business_access"
    body = {
        "area": "NO1",
        "company": "elvia",
        "scheme": "none",
        "meters": [{"role": "grid", "entity": "sensor.import", "name": "Forbruk"}],
        "power_entity": "sensor.grid",
    }
    result = client.put("/api/home/energy/platform/setup", json=body)
    assert result.status_code == 200, result.text
    assert client.get("/api/home/energy-flow/preferences").json()["grid"]["source"] == "sensor.grid"
    invalid = body | {"meters": body["meters"] * 2}
    assert client.put("/api/home/energy/platform/setup", json=invalid).status_code == 422
    invalid = body | {"power_entity": "sensor.import"}
    assert client.put("/api/home/energy/platform/setup", json=invalid).status_code == 422
    client.post(
        "/api/users", json={"name": "resident", "password": "a different long password", "role": "user"}
    )
    client.post("/api/logout")
    login(client, "resident", "a different long password")
    assert client.get("/api/home/energy/platform/setup").json()["config"]["company"] == "elvia"
    assert client.put("/api/home/energy/platform/setup", json=body).status_code == 403


def test_dashboard_keeps_missing_readings_missing(client):  # noqa: F811
    install(client.app.state.ha, "sensor.import", 100, "kWh")
    body = {"company": "elvia", "meters": [{"role": "grid", "entity": "sensor.import", "name": "Forbruk"}]}
    assert client.put("/api/home/energy/platform/setup", json=body).status_code == 200
    today = datetime.now(UTC).date()
    result = client.get(
        "/api/home/energy/platform/dashboard",
        params={"start": str(today - timedelta(days=1)), "end": str(today)},
    )
    assert result.status_code == 200, result.text
    data = result.json()
    assert data["meters"][0]["summary"]["available_kwh"] is None
    assert data["meters"][0]["cost_total"] is None
    assert data["forecast"] is None
    assert all(p["kwh"] is None for p in data["meters"][0]["points"])


def test_equipment_controls_scene_without_requiring_sensors(client):  # noqa: F811
    install(client.app.state.ha, "sensor.battery", 500, "W")
    # Old personal bindings must not resurrect equipment removed by the household.
    assert (
        client.put(
            "/api/home/energy-flow/preferences", json={"battery": {"source": "sensor.battery"}}
        ).status_code
        == 200
    )
    body = {"company": "elvia", "equipment": {"solar": True, "ev": False, "battery": False}}
    assert client.put("/api/home/energy/platform/setup", json=body).status_code == 200
    assert client.get("/api/home/energy/platform/setup").json()["config"]["equipment"] == body["equipment"]
    pref = client.get("/api/home/energy-flow/preferences").json()
    assert pref["solar"]["visible"] and pref["solar"]["source"] is None
    assert not pref["ev"]["visible"]
    assert not pref["battery"]["visible"] and pref["battery"]["source"] is None
    live = client.get("/api/home/energy-flow/live").json()
    assert live["flows"]["solar"]["status"] == "unconfigured"
    assert live["flows"]["solar"]["watts"] is None
    assert not live["flows"]["battery"]["visible"]
    body["equipment"]["ev"] = True
    assert client.put("/api/home/energy/platform/setup", json=body).status_code == 200
    assert client.get("/api/home/energy-flow/preferences").json()["ev"]["visible"]


def test_legacy_setup_infers_equipment(client):  # noqa: F811
    install(client.app.state.ha, "sensor.solar", 15, "kWh")
    body = {"company": "elvia", "meters": [{"role": "solar", "entity": "sensor.solar", "name": "Solar"}]}
    assert client.put("/api/home/energy/platform/setup", json=body).status_code == 200
    pref = client.get("/api/home/energy-flow/preferences").json()
    assert pref["solar"]["visible"]
    assert not pref["ev"]["visible"]
    assert not pref["battery"]["visible"]


def test_setup_exposes_latest_readings_and_disconnect(client):  # noqa: F811
    ha = client.app.state.ha
    for value in (0, -123.45, "unknown", "unavailable"):
        install(ha, "sensor.reading", value, "W")
        sensors = client.get("/api/home/energy/platform/setup").json()["sensors"]
        reading = next(s for s in sensors if s["entity"] == "sensor.reading")
        assert reading["state"] == str(value)
        assert reading["unit"] == "W"
    install(ha, "sensor.reading", 1500, "W")
    ha.connected = False
    sensors = client.get("/api/home/energy/platform/setup").json()["sensors"]
    assert next(s for s in sensors if s["entity"] == "sensor.reading")["state"] == "unavailable"


def test_consumer_power_and_energy_are_kept_separate(client):  # noqa: F811
    ha = client.app.state.ha
    install(ha, "sensor.heat_energy", 123, "kWh")
    install(ha, "sensor.water_power", 1.5, "kW")
    body = {
        "meters": [
            {"role": "consumer", "entity": "sensor.heat_energy", "name": "Varmepumpe"},
            {"role": "consumer", "entity": "sensor.water_power", "name": "Varmtvann"},
        ]
    }
    assert client.put("/api/home/energy/platform/setup", json=body).status_code == 200
    assert len(client.get("/api/home/energy/platform/setup").json()["config"]["meters"]) == 2
    today = datetime.now(UTC).date()
    data = client.get(
        "/api/home/energy/platform/dashboard",
        params={"start": str(today - timedelta(days=1)), "end": str(today)},
    ).json()
    assert [m["name"] for m in data["meters"]] == ["Varmepumpe"]
    assert data["power_consumers"][0]["watts"] == 1500
    ha.connected = False
    data = client.get(
        "/api/home/energy/platform/dashboard",
        params={"start": str(today - timedelta(days=1)), "end": str(today)},
    ).json()
    assert data["power_consumers"][0]["watts"] is None
    body["meters"][1]["role"] = "grid"
    assert client.put("/api/home/energy/platform/setup", json=body).status_code == 422


def test_power_history_is_persisted_estimated_and_not_double_counted(client, monkeypatch):  # noqa: F811
    import asyncio
    from decimal import Decimal
    from types import SimpleNamespace

    from app.energy_platform import EnergyPlatform
    from app.energy_repository import EnergyRepository

    ha, store = client.app.state.ha, client.app.state.store
    install(ha, "sensor.house_power", 1.2, "kW")
    assert (
        client.put(
            "/api/home/energy/platform/setup",
            json={"power_entity": "sensor.house_power", "cloud_history": False},
        ).status_code
        == 200
    )
    service = EnergyPlatform(ha, store, SimpleNamespace(mode="live", remote_identity_file=None))
    end = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
    start = end - timedelta(hours=1)

    async def request(kind, **args):
        assert kind == "recorder/statistics_during_period"
        assert args["units"]["power"] == "W"
        return {
            "sensor.house_power": [
                {"start": start.timestamp() * 1000, "mean": 1200},
                {"start": (start - timedelta(hours=1)).timestamp() * 1000, "mean": None},
            ]
        }

    async def prices(*args):
        return None

    monkeypatch.setattr(ha, "request", request)
    monkeypatch.setattr(service, "prices", prices)
    asyncio.run(service.collect())
    asyncio.run(service.collect())
    repo = EnergyRepository(store)
    readings = repo.rows("sensor.house_power", start - timedelta(hours=1), end)
    assert len(readings) == 1
    assert readings[0].value == Decimal("1.2")
    assert readings[0].quality == "estimated"
    today = datetime.now(UTC).date()
    response = client.get(
        "/api/home/energy/platform/dashboard",
        params={"start": str(today - timedelta(days=1)), "end": str(today + timedelta(days=1))},
    ).json()
    assert response["history_estimated"] is True
    assert response["meters"][0]["summary"]["available_kwh"] == 1.2
    install(ha, "sensor.house_energy", 100, "kWh")
    assert (
        client.put(
            "/api/home/energy/platform/setup",
            json={
                "power_entity": "sensor.house_power",
                "meters": [{"entity": "sensor.house_energy", "name": "Import", "role": "grid"}],
            },
        ).status_code
        == 200
    )
    response = client.get(
        "/api/home/energy/platform/dashboard",
        params={"start": str(today - timedelta(days=1)), "end": str(today + timedelta(days=1))},
    ).json()
    assert response["history_estimated"] is False
    assert len(response["meters"]) == 1
    assert response["meters"][0]["name"] == "Import"


def test_direct_minutes_are_visible_before_hour_finishes(client):  # noqa: F811
    from types import SimpleNamespace

    from app.energy_platform import EnergyPlatform
    from app.energy_repository import EnergyConfig

    ha, store = client.app.state.ha, client.app.state.store
    install(ha, "sensor.power", 1200, "W")
    service = EnergyPlatform(ha, store, SimpleNamespace(mode="live", remote_identity_file=None))
    end = datetime.now(UTC).replace(second=0, microsecond=0)
    start = end - timedelta(minutes=2)
    service.repo.save(EnergyConfig(power_entity="sensor.power", scheme="none"), start)
    for minute in range(3):
        stamp = start + timedelta(minutes=minute)
        ha.states["sensor.power"]["last_updated"] = stamp.isoformat()
        service.sample_power(stamp)
    data = client.get(
        "/api/home/energy/platform/dashboard",
        params={
            "start": str((start - timedelta(days=1)).date()),
            "end": str((end + timedelta(days=1)).date()),
        },
    ).json()
    meter = data["meters"][0]
    assert meter["summary"]["available_kwh"] == 0.04
    assert meter["summary"]["complete"] is False
    points = [p for p in meter["points"] if p["kwh"] is not None]
    assert points
    assert sum(p["kwh"] for p in points) == 0.04
    assert all(p["partial"] for p in points)
    assert meter["capacity"] is None


def test_report_prices_follow_requested_period_and_are_opt_in(client):  # noqa: F811
    import json

    install(client.app.state.ha, "sensor.import", 100, "kWh")
    body = {"area": "NO2", "company": "elvia", "meters": [{"role": "grid", "entity": "sensor.import", "name": "Forbruk"}]}
    assert client.put("/api/home/energy/platform/setup", json=body).status_code == 200
    prices = [{"time_start": "2026-07-01T00:00:00+02:00", "time_end": "2026-07-01T01:00:00+02:00", "NOK_per_kWh": -0.1}]
    with client.app.state.store.connect() as db:
        db.execute("INSERT OR REPLACE INTO energy_prices VALUES(?,?,?,?)", ("NO2", "2026-07-01", json.dumps(prices), "2026-07-01T00:00:00Z"))
    params = {"start": "2026-07-01", "end": "2026-07-02"}
    normal = client.get("/api/home/energy/platform/dashboard", params=params).json()
    assert normal["period_prices"] is None
    report = client.get("/api/home/energy/platform/dashboard", params=params | {"report": "true"}).json()
    assert report["price_area"] == "NO2"
    assert len(report["period_prices"]) == 1
    assert report["period_prices"][0]["NOK_per_kWh"] == -0.1
    for key in ["time_start", "time_end"]:
        assert datetime.fromisoformat(report["period_prices"][0][key]) == datetime.fromisoformat(prices[0][key])
    assert client.get("/api/home/energy/platform/dashboard", params={"start": "2024-01-01", "end": "2026-01-01", "report": "true"}).status_code == 422
