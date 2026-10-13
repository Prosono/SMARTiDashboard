from datetime import UTC, datetime, timedelta

from test_api import login
from test_management import client  # noqa: F401


def install(ha, id, value, unit="W", age=0):
    ha.states[id] = {
        "state": str(value),
        "attributes": {"unit_of_measurement": unit},
        "last_updated": (datetime.now(UTC) - timedelta(seconds=age)).isoformat(),
    }


def test_flow_direction_units_split_and_no_commands(client):  # noqa: F811
    c = client
    ha = c.app.state.ha
    install(ha, "sensor.grid", 1.5, "kW")
    install(ha, "sensor.export", 300)
    install(ha, "sensor.battery", 500)
    install(ha, "sensor.soc", 74, "%")
    install(ha, "sensor.solar", 0)
    p = c.get("/api/home/energy-flow/preferences").json()
    p.update(
        grid={"source": "sensor.grid", "return_source": "sensor.export", "positive": "supply"},
        battery={"source": "sensor.battery", "positive": "consume"},
        battery_level="sensor.soc",
        solar={"source": "sensor.solar"},
    )
    assert c.put("/api/home/energy-flow/preferences", json=p).status_code == 200
    live = c.get("/api/home/energy-flow/live").json()
    assert live["flows"]["grid"]["watts"] == 1200
    assert live["flows"]["battery"]["watts"] == -500
    assert live["flows"]["solar"]["watts"] == 0
    assert live["battery_level"] == 74
    install(ha, "sensor.grid", -2, "kW")
    p["grid"]["return_source"] = None
    assert c.put("/api/home/energy-flow/preferences", json=p).status_code == 200
    assert c.get("/api/home/energy-flow/live").json()["flows"]["grid"]["watts"] == -2000
    assert ha.states["sensor.battery"]["state"] == "500"


def test_flow_freshness_and_invalid_mappings(client):  # noqa: F811
    c = client
    ha = c.app.state.ha
    install(ha, "sensor.power", 500, age=600)
    install(ha, "sensor.energy", 5, "kWh")
    assert (
        c.put("/api/home/energy-flow/preferences", json={"home": {"source": "sensor.power"}}).status_code
        == 200
    )
    live = c.get("/api/home/energy-flow/live").json()
    assert live["flows"]["home"]["status"] == "stale"
    assert live["flows"]["home"]["watts"] is None
    ha.states["sensor.power"]["last_reported"] = datetime.now(UTC).isoformat()
    assert c.get("/api/home/energy-flow/live").json()["flows"]["home"]["watts"] == 500
    install(ha, "sensor.power", -100)
    assert c.get("/api/home/energy-flow/live").json()["flows"]["home"]["status"] == "invalid"
    for body in [
        {"solar": {"source": "sensor.energy"}},
        {"ev": {"source": "sensor.power", "return_source": "sensor.power"}},
        {"grid": {"return_source": "sensor.power"}},
        {"grid": {"source": "sensor.power", "return_source": "sensor.power"}},
        {"battery_level": "sensor.power"},
        {"max_age": 5},
        {"solar": {"source": "sensor.missing"}},
    ]:
        assert c.put("/api/home/energy-flow/preferences", json=body).status_code == 422
    install(ha, "sensor.power", "not-a-number")
    assert c.get("/api/home/energy-flow/live").json()["flows"]["home"]["status"] == "invalid"
    install(ha, "sensor.power", 50, "%")
    assert c.get("/api/home/energy-flow/live").json()["flows"]["home"]["status"] == "invalid"
    ha.connected = False
    assert c.get("/api/home/energy-flow/live").json()["flows"]["home"]["status"] == "unavailable"


def test_flow_personal_preferences_and_auth(client):  # noqa: F811
    c = client
    assert c.put("/api/home/energy-flow/preferences", json={"solar": {"visible": False}}).status_code == 200
    assert (
        c.put("/api/home/energy-flow/preferences", json={}, headers={"x-csrf-token": "bad"}).status_code
        == 403
    )
    c.post("/api/users", json={"name": "resident", "password": "another long password", "role": "user"})
    c.post("/api/logout")
    login(c, "resident", "another long password")
    assert c.get("/api/home/energy-flow/preferences").json()["solar"]["visible"]
    c.cookies.clear()
    assert c.get("/api/home/energy-flow/live").status_code == 401
    assert c.get("/api/home/energy-flow/preferences").status_code == 401
