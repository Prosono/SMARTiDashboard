from types import SimpleNamespace

from app.demo import Demo
from app.device_energy_sources import DEVICE_ENERGY_SOURCES_KEY, device_energy_sources_router
from app.energy_repository import EnergyConfig, EnergyRepository, Meter
from app.ha import HAError
from app.storage import Store
from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient

PATH = "/api/home/energy/device-sources"


def add_device(ha, key, name):
    ha.devices[key] = {"name_by_user": name, "area_id": "kitchen"}
    ha.entities["switch." + key] = {"device_id": key}
    ha.states["switch." + key] = {"state": "on", "attributes": {}}


def add_meter(ha, key, *, device=None, unit="kWh", disabled=False):
    entity = "sensor." + key
    ha.entities[entity] = {
        "id": "uid-" + key,
        "device_id": device,
        "disabled_by": "user" if disabled else None,
    }
    power = unit in {"W", "kW"}
    ha.states[entity] = {
        "state": "12.4",
        "attributes": {
            "friendly_name": key,
            "device_class": "power" if power else "energy",
            "unit_of_measurement": unit,
            "state_class": "measurement" if power else "total_increasing",
        },
    }
    return entity


def client(ha, store, repo, actor=None, mode="live"):
    current = actor or {"id": 1, "role": "admin"}
    app = FastAPI()

    def user():
        return current

    def admin(active=Depends(user)):
        if active["role"] != "admin":
            raise HTTPException(403, "admin_required")
        return active

    app.include_router(device_energy_sources_router(ha, store, user, admin, SimpleNamespace(mode=mode), repo))
    return TestClient(app)


def test_device_sources_prioritize_cumulative_or_discover_power_and_exclude_aggregates(tmp_path):
    ha = Demo()
    for key, name in (
        ("kettle", "Vannkoker"),
        ("heater", "Varmtvannsbereder"),
        ("strip", "Grenuttak"),
        ("grid", "Hovedmåler"),
        ("solar", "Solproduksjon"),
        ("export", "Eksport"),
    ):
        add_device(ha, key, name)
    add_meter(ha, "kettle_kwh", device="kettle")
    add_meter(ha, "kettle_w", device="kettle", unit="W")
    add_meter(ha, "heater_w", device="heater", unit="kW")
    add_meter(ha, "one_kwh", device="strip")
    add_meter(ha, "two_kwh", device="strip")
    add_meter(ha, "grid_total", device="grid")
    add_meter(ha, "grid_rate", device="grid", unit="W")
    add_meter(ha, "solar_total", device="solar")
    add_meter(ha, "export_total", device="export")
    add_meter(ha, "inactive", disabled=True)
    add_meter(ha, "custom_kwh", unit="Wh")
    add_meter(ha, "orphan_kwh")

    async def request(kind, **kwargs):
        assert kind == "energy/get_prefs" and kwargs == {"_timeout": 3}
        return {
            "energy_sources": [
                {"type": "grid", "flow_from": [{"stat_energy_from": "sensor.grid_total"}]},
                {"type": "grid", "stat_energy_to": "sensor.export_total"},
            ],
            "device_consumption": [
                {"name": "Kaffemaskin", "stat_consumption": "sensor.custom_kwh"},
                {"name": "Nett", "stat_consumption": "sensor.grid_total"},
            ],
        }

    ha.request = request
    store = Store(tmp_path / "meters.sqlite")
    repo = EnergyRepository(store)
    repo.save(EnergyConfig(meters=[Meter(role="solar", entity="sensor.solar_total", name="Sol")]))
    response = client(ha, store, repo).get(PATH)
    assert response.status_code == 200
    inventory = response.json()
    assert inventory["mode"] == "automatic"
    assert inventory["can_edit"]
    assert set(inventory["selected_ids"]) == {"uid-kettle_kwh", "uid-heater_w", "uid-custom_kwh"}
    meters = {row["id"]: row for row in inventory["sources"]}
    assert set(meters) == {
        "uid-kettle_kwh",
        "uid-kettle_w",
        "uid-heater_w",
        "uid-one_kwh",
        "uid-two_kwh",
        "uid-custom_kwh",
        "uid-orphan_kwh",
    }
    assert meters["uid-kettle_kwh"] == {
        "id": "uid-kettle_kwh",
        "name": "Vannkoker",
        "room": "Kjøkken",
        "meter": "kettle_kwh",
        "kind": "energy",
        "unit": "kWh",
        "group": "device:kettle",
        "automatic": True,
    }
    assert meters["uid-kettle_w"]["group"] == meters["uid-kettle_kwh"]["group"]
    assert meters["uid-heater_w"]["kind"] == "power"
    assert meters["uid-custom_kwh"]["name"] == "Kaffemaskin"


def test_manual_selection_is_home_wide_and_switches_back_to_automatic(tmp_path):
    ha = Demo()
    add_device(ha, "heater", "Varmeovn")
    add_meter(ha, "heater_energy", device="heater")
    add_meter(ha, "heater_power", device="heater", unit="W")
    add_meter(ha, "unlinked", unit="Wh")

    async def request(*_args, **_kwargs):
        raise HAError("energy_module_unavailable")

    ha.request = request
    store = Store(tmp_path / "meters.sqlite")
    repo = EnergyRepository(store)
    owner = client(ha, store, repo)

    for invalid in (
        ["uid-heater_power", "uid-heater_energy"],
        ["uid-heater_energy", "uid-heater_energy"],
        ["nonexistent"],
    ):
        assert owner.put(PATH, json={"selected_ids": invalid}).status_code == 422
    assert store.get(DEVICE_ENERGY_SOURCES_KEY) == ""

    selected = ["uid-unlinked", "uid-heater_power"]
    assert owner.put(PATH, json={"selected_ids": selected}).json()["selected_ids"] == selected
    member = client(ha, store, repo, {"id": 2, "role": "user", "permissions": ["energy.view"]})
    saved = member.get(PATH).json()
    assert saved["selected_ids"] == selected
    assert saved["mode"] == "manual"
    assert not saved["can_edit"]
    assert member.put(PATH, json={"selected_ids": None}).status_code == 403
    denied = client(ha, store, repo, {"id": 3, "role": "user", "permissions": []})
    assert denied.get(PATH).status_code == 403

    assert owner.put(PATH, json={"selected_ids": []}).json()["selected_ids"] == []
    assert owner.get(PATH).json()["mode"] == "manual"
    automatic = owner.put(PATH, json={"selected_ids": None}).json()
    assert automatic["mode"] == "automatic"
    assert automatic["selected_ids"] == ["uid-heater_energy"]


def test_device_sources_retains_saved_selection_while_disconnected(tmp_path):
    ha = Demo()
    add_meter(ha, "known")

    async def request(*_args, **_kwargs):
        return {}

    ha.request = request
    store = Store(tmp_path / "meters.sqlite")
    repo = EnergyRepository(store)
    browser = client(ha, store, repo)
    assert browser.put(PATH, json={"selected_ids": ["uid-known"]}).status_code == 200
    ha.connected = False
    assert browser.get(PATH).status_code == 503
    assert browser.put(PATH, json={"selected_ids": []}).status_code == 503
    ha.connected = True
    assert browser.get(PATH).json()["selected_ids"] == ["uid-known"]
