from datetime import datetime, timedelta
from types import SimpleNamespace

from app.demo import Demo
from app.energy import energy_router
from app.energy_repository import EnergyConfig, EnergyRepository, Meter
from app.ha import HAError
from app.storage import Store
from fastapi import FastAPI
from fastapi.testclient import TestClient

PATH = "/api/home/energy/device-consumption"


def appliance(ha, key, name, meters=1, unit="kWh"):
    ha.devices[key] = {"name": name, "area_id": "kitchen"}
    ha.entities[f"switch.{key}"] = {"device_id": key}
    ha.states[f"switch.{key}"] = {"state": "on", "attributes": {}}
    for index in range(meters):
        entity = f"sensor.{key}_{index}"
        ha.entities[entity] = {"id": f"meter-{key}-{index}", "device_id": key}
        ha.states[entity] = {
            "state": "3210.9",
            "attributes": {
                "friendly_name": f"{name} energy {index}",
                "device_class": "energy" if unit in {"Wh", "kWh"} else "power",
                "unit_of_measurement": unit,
                "state_class": "total_increasing",
            },
        }


def client(tmp_path, ha, mode="live", config=None):
    store = Store(tmp_path / "device_energy.sqlite")
    repo = EnergyRepository(store)
    if config:
        repo.save(config)
    app = FastAPI()
    app.include_router(
        energy_router(ha, store, lambda: {"id": 1, "role": "admin"}, SimpleNamespace(mode=mode), repo)
    )
    return TestClient(app)


def row(start, hour, change):
    return {"start": (start + timedelta(hours=hour)).timestamp() * 1000, "change": change}


def test_device_consumption_combines_configured_and_linked_meters(tmp_path):
    ha = Demo()
    for key, name, unit, meters in [
        ("charger", "Lader", "kWh", 1),
        ("heater", "Varmtvannsbereder", "kWh", 1),
        ("lamp", "Lampe", "Wh", 1),
        ("power", "Kun effekt", "W", 1),
        ("grid", "Hovedmåler", "kWh", 2),
        ("solar", "Solproduksjon", "kWh", 1),
        ("strips", "Flere mulige målere", "kWh", 2),
        ("washer", "Vaskemaskin", "kWh", 1),
        ("hidden", "Skjult", "kWh", 1),
    ]:
        appliance(ha, key, name, meters=meters, unit=unit)
    ha.entities["sensor.hidden_0"]["disabled_by"] = "user"
    config = EnergyConfig(
        meters=[
            Meter(entity="sensor.solar_0", name="Solproduksjon", role="solar"),
            Meter(entity="sensor.charger_0", name="Elbil", role="ev"),
            Meter(entity="sensor.power_0", name="Effekt", role="consumer"),
        ],
    )

    async def request(kind, **params):
        if kind == "energy/get_prefs":
            assert params == {"_timeout": 3}
            return {
                "energy_sources": [{"type": "grid", "flow_from": [{"stat_energy_from": "sensor.grid_0"}]}],
                "device_consumption": [
                    {"name": "Lader fra HA", "stat_consumption": "sensor.charger_0"},
                    {"name": "Bereder", "stat_consumption": "sensor.heater_0", "stat_rate": "sensor.power_0"},
                    {"name": "Hovedmåler", "stat_consumption": "sensor.grid_0"},
                    {"name": "Klarte ikke måle", "stat_consumption": "sensor.hidden_0"},
                ],
            }
        assert kind == "recorder/statistics_during_period"
        assert set(params["statistic_ids"]) == {
            "sensor.charger_0",
            "sensor.heater_0",
            "sensor.lamp_0",
            "sensor.washer_0",
        }
        assert params["_timeout"] == 9
        assert params["period"] == "hour"
        assert params["types"] == ["change"]
        assert params["units"] == {"energy": "kWh"}
        start, end = map(datetime.fromisoformat, [params["start_time"], params["end_time"]])
        assert end - start == timedelta(hours=24)
        assert end.minute == end.second == end.microsecond == 0
        return {
            "sensor.charger_0": [row(start, i, 0.5) for i in range(24)],
            "sensor.heater_0": [row(start, 0, 1.6), row(start, 3, 0.4), row(start, 24, 50)],
            "sensor.lamp_0": [
                row(start, 0, 0),
                row(start, 1, True),
                row(start, 2, -2),
                row(start, 3, None),
                row(start, 4, 10**1000),
            ],
        }

    ha.request = request
    response = client(tmp_path, ha, config=config).get(PATH + "?period=24h")
    assert response.status_code == 200, response.text
    assert response.json()["devices"] == [
        {"id": "meter-charger-0", "name": "Elbil", "room": "Kjøkken", "kwh": 12, "coverage": 100},
        {"id": "meter-heater-0", "name": "Bereder", "room": "Kjøkken", "kwh": 2, "coverage": 8.3},
        {"id": "meter-lamp-0", "name": "Lampe", "room": "Kjøkken", "kwh": 0, "coverage": 4.2},
        {"id": "meter-washer-0", "name": "Vaskemaskin", "room": "Kjøkken", "kwh": None, "coverage": 0},
    ]


def test_device_consumption_prefs_optional_but_recorder_required(tmp_path):
    ha = Demo()
    appliance(ha, "lamp", "Lampe")
    fail = False

    async def request(kind, **params):
        if kind == "energy/get_prefs":
            raise HAError("unknown_command")
        if fail:
            raise TimeoutError()
        start, end = map(datetime.fromisoformat, [params["start_time"], params["end_time"]])
        assert end - start == timedelta(days=30)
        return {"sensor.lamp_0": [row(start, 2, 0.75), row(start, 10.5, 80)]}

    ha.request = request
    browser = client(tmp_path, ha)
    assert browser.get(PATH + "?period=30d").json()["devices"][0]["kwh"] == 0.75
    fail = True
    assert browser.get(PATH + "?period=30d").status_code == 503
    assert browser.get(PATH + "?period=1y").status_code == 422
    ha.connected = False
    assert browser.get(PATH).json() == {"detail": "ha_disconnected"}


def test_device_consumption_demo_has_no_invented_statistics(tmp_path):
    ha = Demo()
    appliance(ha, "lamp", "Lampe")

    async def request(*args, **kwargs):
        raise AssertionError("Demo must not request recorder data")

    ha.request = request
    response = client(tmp_path, ha, mode="demo").get(PATH + "?period=7d")
    assert response.status_code == 200
    assert response.json()["demo"] and response.json()["devices"] == []
