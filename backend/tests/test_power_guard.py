import asyncio
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import httpx
from app.config import Settings
from app.energy_repository import EnergyConfig, EnergyRepository
from app.ha import HomeAssistant
from app.main import create_app
from app.power_guard import PowerGuard, PowerGuardConfig
from app.storage import Store
from fastapi.testclient import TestClient
from test_api import ORIGIN, SECRET, login
from websockets.exceptions import ConnectionClosedError

PATH = "/api/home/energy/power-guard"
ADMIN = {"id": 1, "role": "admin"}
START = datetime(2026, 11, 20, 12, tzinfo=UTC)
DEVICES = [
    {"id": "switch.user_off", "watts": 500},
    {"id": "switch.water_heater", "watts": 2000},
    {"id": "switch.flexible_load", "watts": 1800},
]
ENABLED = {"enabled": True, "limit_kw": 5, "devices": DEVICES}


class GuardHome(HomeAssistant):
    def __init__(self):
        super().__init__("http://unused-ha.example", "test-token")
        self.connected = True
        self.epoch = 1
        self.calls = []
        self.confirm_calls = True
        self.now = START
        for entity, state in [
            ("switch.water_heater", "on"),
            ("switch.flexible_load", "on"),
            ("switch.user_off", "off"),
            ("light.status", "on"),
        ]:
            self.write_state(entity, state)
        self.sample(self.now, 1000)

    def write_state(self, entity, state, *, context="manual", attributes=None, stamp=None):
        time = (stamp or self.now).isoformat()
        self.states[entity] = {
            "entity_id": entity,
            "state": str(state),
            "attributes": attributes or {},
            "context": {"id": context, "parent_id": None, "user_id": None},
            "last_changed": time,
            "last_updated": time,
            "last_reported": time,
        }

    def sample(self, at, watts, *, age=0):
        self.now = at
        self.write_state(
            "sensor.grid",
            watts,
            attributes={"friendly_name": "Grid", "device_class": "power", "unit_of_measurement": "W"},
            stamp=at - timedelta(seconds=age),
        )

    async def rest(self, method, path, *args, **kwargs):
        assert (method, path) == ("GET", "states/sensor.grid")
        return self.states["sensor.grid"].copy()

    async def request(self, kind, *, domain, service, target, service_data=None, **kwargs):
        assert kind == "call_service"
        entity = target["entity_id"]
        self.calls.append((entity, service_data["hvac_mode"] if domain == "climate" else service))
        context = f"call-{len(self.calls)}"
        if domain == "climate":
            self.write_state(
                entity,
                service_data["hvac_mode"],
                context=context,
                attributes=self.states[entity]["attributes"],
            )
        else:
            assert domain == "switch"
            assert service in {"turn_on", "turn_off"}
            self.write_state(
                entity,
                "on" if service == "turn_on" else "off",
                context=context if self.confirm_calls else "external-action",
            )
        return {"context": {"id": context}}

    async def run(self):
        await asyncio.Event().wait()


def test_power_guard_admin_opt_in_and_real_tariff_steps(tmp_path):
    ha = GuardHome()
    app = create_app(
        Settings(
            _env_file=None,
            mode="demo",
            data_dir=tmp_path,
            development=True,
            origin=ORIGIN,
            bootstrap_secret=SECRET,
        ),
        ha,
    )
    app.state.management.update_approval.transport = httpx.MockTransport(
        lambda request: httpx.Response(200, json={"releases": []})
    )
    with TestClient(app) as client:
        assert client.get(PATH).status_code == 401
        client.headers["origin"] = ORIGIN
        login(client)
        response = client.get(PATH)
        assert response.status_code == 200, response.text
        assert response.json()["config"]["enabled"] is False
        assert response.json()["tiers"] == []
        assert client.put(PATH, json=ENABLED).status_code == 422  # No configured meter or grid tariff.
        saved = client.put(
            "/api/home/energy/platform/setup",
            json={"power_entity": "sensor.grid", "company": "elvia", "cloud_history": False},
        )
        assert saved.status_code == 200, saved.text
        options = client.get(PATH).json()
        assert options["configured_meter"]
        assert {2, 5, 10}.issubset({float(tier["limit_kw"]) for tier in options["tiers"]})
        assert client.put(PATH, json=ENABLED | {"limit_kw": 3.14159}).status_code == 422
        assert client.put(PATH, json=ENABLED | {"devices": DEVICES * 2}).status_code == 422
        light = {"id": "light.status", "watts": 100}
        assert client.put(PATH, json=ENABLED | {"devices": [light]}).status_code == 422
        assert client.put(PATH, json=ENABLED, headers={"x-csrf-token": "forged"}).status_code == 403
        saved = client.put(PATH, json=ENABLED)
        assert saved.status_code == 200, saved.text
        configured = client.get(PATH).json()["config"]
        assert configured["enabled"] and configured["limit_kw"] == 5
        assert [device["id"] for device in configured["devices"]] == [device["id"] for device in DEVICES]
        assert (
            client.post(
                "/api/users", json={"name": "resident", "password": "another long password", "role": "user"}
            ).status_code
            == 200
        )
        client.post("/api/logout")
        login(client, "resident", "another long password")
        assert client.put(PATH, json=ENABLED | {"enabled": False}).status_code == 403
    assert not ha.calls


def configured_service(tmp_path, *, config=ENABLED, resetting=lambda: False, ha=None):
    ha = ha or GuardHome()
    store = Store(tmp_path / "guard.db")
    repo = EnergyRepository(store)
    repo.save(
        EnergyConfig(power_entity="sensor.grid", company="elvia", cloud_history=False),
        START - timedelta(hours=1),
    )
    guard = PowerGuard(ha, store, repo, SimpleNamespace(mode="live"), resetting=resetting)
    guard.configure(PowerGuardConfig.model_validate(config), ADMIN)
    return guard, ha


async def tick(guard, ha, seconds, watts, *, age=0):
    now = START + timedelta(seconds=seconds)
    ha.sample(now, watts, age=age)
    await guard.tick(now)


async def test_power_guard_deactivation_leaves_paused_devices_under_user_control(tmp_path):
    guard, ha = configured_service(tmp_path)
    for seconds in range(0, 70, 5):
        await tick(guard, ha, seconds, 6000 if not ha.calls else 3800)
    assert ha.calls == [("switch.flexible_load", "turn_off")]

    # A separate surface writes the same settings while the hub has ownership of a pause.
    remote = PowerGuard(ha, guard.store, guard.repo, guard.settings)
    disabled = remote.configure(PowerGuardConfig.model_validate(ENABLED | {"enabled": False}), ADMIN)
    assert disabled["status"]["paused_ids"] == []
    for seconds in range(70, 240, 5):
        await tick(guard, ha, seconds, 1000)
    assert ha.calls == [("switch.flexible_load", "turn_off")]


async def test_power_guard_distinguishes_repeated_reads_from_new_meter_reports(tmp_path):
    guard, ha = configured_service(tmp_path)
    ha.sample(START, 6000)
    for seconds in range(0, 45, 5):
        await guard.tick(START + timedelta(seconds=seconds))
    assert not ha.calls
    assert guard.record().runtime.state == "warming_up"

    # The repeated observation leaves a gap, so work starts with a new warm-up.
    for seconds in range(45, 75, 5):
        await tick(guard, ha, seconds, 6000)
    assert not ha.calls
    await tick(guard, ha, 75, 6000)
    assert ha.calls == [("switch.flexible_load", "turn_off")]


async def test_power_guard_checks_meter_binding_after_delayed_read(tmp_path, monkeypatch):
    guard, ha = configured_service(tmp_path)
    for seconds in range(0, 30, 5):
        await tick(guard, ha, seconds, 6000)
    original = ha.rest

    async def changed_meter(method, path, *args, **kwargs):
        guard.repo.save(
            EnergyConfig(power_entity="sensor.replacement", company="elvia", cloud_history=False), ha.now
        )
        return await original(method, path, *args, **kwargs)

    monkeypatch.setattr(ha, "rest", changed_meter)
    await tick(guard, ha, 30, 6000)
    assert not ha.calls
    assert guard.record().runtime.state == "settings_changed"


async def test_power_guard_handles_a_websocket_close_during_dispatch(tmp_path, monkeypatch):
    guard, ha = configured_service(tmp_path)

    async def disconnected(*args, **kwargs):
        raise ConnectionClosedError(None, None)

    monkeypatch.setattr(ha, "request", disconnected)
    for seconds in range(0, 35, 5):
        await tick(guard, ha, seconds, 6000)
    record = guard.record()
    assert record.runtime.state == "command_failed"
    assert not record.runtime.paused
    assert record.runtime.pending is None


async def test_power_guard_sheds_low_priority_and_restarts_only_its_paused_load(tmp_path):
    guard, ha = configured_service(tmp_path)
    for seconds in range(0, 90, 5):
        watts = 6000 if ha.states["switch.flexible_load"]["state"] == "on" else 3800
        await tick(guard, ha, seconds, watts)
    assert ha.calls == [("switch.flexible_load", "turn_off")]
    assert ha.states["switch.water_heater"]["state"] == "on"

    for seconds in range(90, 180, 5):
        await tick(guard, ha, seconds, 3800)
    assert ha.calls == [("switch.flexible_load", "turn_off")]  # 3.8 + 1.8 kW exceeds target.

    for seconds in range(180, 420, 5):
        await tick(guard, ha, seconds, 1000)
    assert ha.calls == [("switch.flexible_load", "turn_off"), ("switch.flexible_load", "turn_on")]
    assert ha.states["switch.user_off"]["state"] == "off"


async def test_power_guard_never_switches_with_stale_readings_or_during_reset(tmp_path):
    resetting = False
    guard, ha = configured_service(tmp_path, resetting=lambda: resetting)
    for seconds in range(0, 120, 5):
        await tick(guard, ha, seconds, 6000, age=3600)
    assert not ha.calls

    resetting = True
    for seconds in range(120, 240, 5):
        await tick(guard, ha, seconds, 6000)
    assert not ha.calls


async def test_power_guard_releases_ownership_after_manual_cycle(tmp_path):
    guard, ha = configured_service(tmp_path)
    for seconds in range(0, 120, 5):
        watts = 6000 if ha.states["switch.flexible_load"]["state"] == "on" else 3800
        await tick(guard, ha, seconds, watts)
    assert ha.calls == [("switch.flexible_load", "turn_off")]

    ha.sample(START + timedelta(seconds=120), 1500)
    ha.write_state("switch.flexible_load", "on", context="manual-restart")
    ha.write_state("switch.flexible_load", "off", context="manual-stop")
    for seconds in range(120, 420, 5):
        await tick(guard, ha, seconds, 1500)
    assert ha.calls == [("switch.flexible_load", "turn_off")]
    assert ha.states["switch.flexible_load"]["state"] == "off"


async def test_power_guard_restores_original_thermostat_mode_after_minimum_pause(tmp_path):
    ha = GuardHome()
    thermostat = "climate.office"
    attributes = {"hvac_modes": ["auto", "cool", "heat", "off"], "temperature": 22}
    ha.write_state(thermostat, "cool", attributes=attributes)
    guard, _ = configured_service(
        tmp_path, config=ENABLED | {"devices": [{"id": thermostat, "watts": 1800}]}, ha=ha
    )
    for seconds in range(0, 80, 5):
        watts = 6000 if ha.states[thermostat]["state"] == "cool" else 1000
        await tick(guard, ha, seconds, watts)
    assert ha.calls == [(thermostat, "off")]
    assert ha.states[thermostat]["state"] == "off"

    for seconds in range(80, 180, 5):
        await tick(guard, ha, seconds, 1000)
    assert ha.calls == [(thermostat, "off")]

    for seconds in range(180, 430, 5):
        await tick(guard, ha, seconds, 1000)
    assert ha.calls == [(thermostat, "off"), (thermostat, "cool")]
    assert ha.states[thermostat]["attributes"]["temperature"] == 22


async def test_power_guard_does_not_claim_a_device_without_matching_home_assistant_context(tmp_path):
    ha = GuardHome()
    ha.confirm_calls = False
    only_load = ENABLED | {"devices": [DEVICES[-1]]}
    guard, _ = configured_service(tmp_path, config=only_load, ha=ha)
    for seconds in range(0, 80, 5):
        watts = 6000 if ha.states["switch.flexible_load"]["state"] == "on" else 1000
        await tick(guard, ha, seconds, watts)
    assert ha.calls == [("switch.flexible_load", "turn_off")]
    assert not guard.view(ADMIN, START + timedelta(seconds=80))["status"]["paused_ids"]

    for seconds in range(80, 420, 5):
        await tick(guard, ha, seconds, 1000)
    assert ha.calls == [("switch.flexible_load", "turn_off")]
