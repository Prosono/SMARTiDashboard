from test_api import login
from test_management import client  # noqa: F401


def test_vehicle_preferences_validate_roles_and_isolate_users(client):  # noqa: F811
    c = client
    ha = c.app.state.ha
    ha.states["sensor.ev_battery"] = {"state": "74", "attributes": {"unit_of_measurement": "%"}}
    ha.states["sensor.ev_power"] = {"state": "7.4", "attributes": {"unit_of_measurement": "kW"}}
    ha.states["switch.charger"] = {"state": "off", "attributes": {}}
    assert c.get("/api/home/vehicle").json()["battery"] is None
    data = {
        "name": "Min bil",
        "battery": "sensor.ev_battery",
        "power": "sensor.ev_power",
        "switch": "switch.charger",
    }
    assert c.put("/api/home/vehicle", json=data).status_code == 200
    assert c.get("/api/home/vehicle").json()["name"] == "Min bil"
    assert ha.states["switch.charger"]["state"] == "off"  # configuration never executes
    for invalid in [
        {"battery": "sensor.ev_power"},
        {"switch": "sensor.ev_battery"},
        {"power": "sensor.missing"},
        {"status": "switch.charger"},
        {"name": "a" * 81},
    ]:
        assert c.put("/api/home/vehicle", json=invalid).status_code == 422
    assert c.put("/api/home/vehicle", json=data, headers={"x-csrf-token": "bad"}).status_code == 403
    c.post("/api/users", json={"name": "driver", "password": "another long password", "role": "user"})
    c.post("/api/logout")
    login(c, "driver", "another long password")
    assert c.get("/api/home/vehicle").json()["battery"] is None
    assert c.put("/api/home/vehicle", json=data).status_code == 200
    c.cookies.clear()
    assert c.get("/api/home/vehicle").status_code == 401
