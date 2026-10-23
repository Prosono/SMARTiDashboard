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
