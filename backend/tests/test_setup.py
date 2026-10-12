import asyncio
import json
import time

import pytest
from app.config import Settings
from app.demo import Demo
from app.ha import HAError
from app.main import create_app
from app.setup import DeviceSetup
from app.storage import Store
from fastapi import HTTPException
from fastapi.testclient import TestClient


class Radio(Demo):
    def __init__(self):
        super().__init__()
        self.calls = []
        self.epoch = 1
        self.controller_state = 0
        self.fail_start = False
        self.joining = False

    def event(self, kind, event):
        for name, data in self.calls:
            if name == kind and data.get("_callback"):
                data["_callback"](event)

    async def request(self, kind, **data):
        self.calls.append((kind, data))
        callback = data.get("_callback")
        if kind == "mqtt/subscribe":
            suffix = data["topic"].split("/")[-1]
            if suffix == "state":
                callback({"topic": data["topic"], "payload": '{"state":"online"}', "retain": True})
            if suffix == "info":
                callback(
                    {
                        "topic": data["topic"],
                        "payload": json.dumps(
                            {
                                "version": "fixture",
                                "permit_join": self.joining,
                                "config": {"password": "never-return"},
                            }
                        ),
                        "retain": True,
                    }
                )
            self.callbacks[len(self.calls)] = callback
            return len(self.calls)
        if kind == "config_entries/get":
            return [{"entry_id": "zwave", "title": "House", "domain": "zwave_js", "state": "loaded"}]
        if kind == "zwave_js/network_status":
            return {
                "client": {"state": "connected"},
                "controller": {"inclusion_state": self.controller_state},
            }
        if kind == "call_service":
            body = json.loads(data["service_data"]["payload"])
            if self.fail_start and body["time"]:
                raise HAError("disconnected")
            self.joining = body["time"] > 0
            self.event(
                "mqtt/subscribe",
                {
                    "topic": "zigbee2mqtt/bridge/response/permit_join",
                    "payload": json.dumps({"status": "ok", "transaction": body["transaction"]}),
                },
            )
        if kind == "zwave_js/add_node":
            self.controller_state = 1
            self.callbacks[len(self.calls)] = callback
            return len(self.calls)
        if kind == "zwave_js/stop_inclusion":
            self.controller_state = 0
        return None


@pytest.fixture
def setup(tmp_path):
    return DeviceSetup(
        Radio(), Settings(_env_file=None, mode="live", data_dir=tmp_path), Store(tmp_path / "db")
    )


@pytest.mark.asyncio
async def test_zigbee_real_contract_ack_completion_and_close(setup):
    try:
        assert (await setup.providers())[0]["status"] == "ready"
        result = await setup.start("zigbee2mqtt", None, 1)
        assert result["status"] == "searching"
        calls = [d for name, d in setup.ha.calls if name == "call_service"]
        assert calls[0]["domain"] == "mqtt" and calls[0]["service"] == "publish"
        assert json.loads(calls[0]["service_data"]["payload"])["time"] == 120
        assert calls[0]["service_data"]["retain"] is False
        setup.mqtt_event(
            {
                "topic": "zigbee2mqtt/bridge/event",
                "payload": json.dumps(
                    {"type": "device_interview", "data": {"status": "successful", "friendly_name": "Lamp"}}
                ),
                "retain": True,
            }
        )
        assert setup.snapshot()["status"] == "searching"
        setup.mqtt_event(
            {
                "topic": "zigbee2mqtt/bridge/event",
                "payload": json.dumps(
                    {"type": "device_interview", "data": {"status": "successful", "friendly_name": "Lamp"}}
                ),
            }
        )
        await asyncio.sleep(0.6)
        assert setup.snapshot()["status"] == "paired"
        assert not setup.snapshot()["radio_open"]
        assert setup.store.get("pairing_active") == ""
        assert "never-return" not in json.dumps(setup.snapshot())
    finally:
        await setup.close()


@pytest.mark.asyncio
async def test_zwave_security_pin_not_persisted_and_no_premature_success(setup):
    try:
        result = await setup.start("zwave_js", "zwave", 1)
        assert result["status"] == "searching"
        setup.zwave_event(
            {
                "event": "grant security classes",
                "requested_grant": {"securityClasses": [1], "clientSideAuth": False},
            }
        )
        assert setup.snapshot()["status"] == "security"
        await setup.answer(result["id"], "grant", None)
        assert any(
            k == "zwave_js/grant_security_classes" and v["securityClasses"] == [1] for k, v in setup.ha.calls
        )
        setup.zwave_event({"event": "validate dsk and enter pin", "dsk": "xxxxx-12345-12345"})
        await setup.answer(result["id"], "pin", "12345")
        assert "dsk" not in setup.snapshot()
        assert "12345" not in setup.store.get("pairing_active")
        setup.zwave_event({"event": "device registered", "device": {"id": "other-device"}})
        assert setup.snapshot()["status"] == "interviewing"
        setup.zwave_event({"event": "node added", "node": {"low_security": True}})
        setup.zwave_event({"event": "interview completed"})
        await asyncio.sleep(0.6)
        assert setup.snapshot()["status"] == "paired"
        assert setup.snapshot()["low_security"] is True
    finally:
        await setup.close()


@pytest.mark.asyncio
async def test_uncertain_start_blocks_retry_and_restart_retains_stop_marker(setup):
    setup.ha.fail_start = True
    result = await setup.start("zigbee2mqtt", None, 1)
    try:
        assert result["status"] == "needs_stop"
        with pytest.raises(HTTPException) as error:
            await setup.start("zwave_js", "zwave", 1)
        assert error.value.status_code == 409
        restored = DeviceSetup(setup.ha, setup.settings, setup.store)
        assert restored.snapshot()["status"] == "needs_stop"
        await setup.stop(result["id"])
        assert setup.store.get("pairing_active") == ""
    finally:
        await setup.close()


@pytest.mark.asyncio
async def test_timeout_stops_and_does_not_replay_start(setup):
    try:
        await setup.start("zwave_js", "zwave", 1)
        setup.session["expires_at"] = time.time() - 1
        await asyncio.sleep(0.6)
        assert setup.snapshot()["status"] == "stopped"
        assert sum(k == "zwave_js/add_node" for k, _ in setup.ha.calls) == 1
        assert sum(k == "zwave_js/stop_inclusion" for k, _ in setup.ha.calls) == 1
    finally:
        await setup.close()


@pytest.mark.asyncio
async def test_busy_unknown_controller_and_disconnect(setup):
    with pytest.raises(HTTPException):
        await setup.start("zwave_js", "forged", 1)
    setup.ha.controller_state = 2
    with pytest.raises(HTTPException) as error:
        await setup.start("zwave_js", "zwave", 1)
    assert error.value.detail == "controller_busy"
    setup.ha.controller_state = 0
    try:
        result = await setup.start("zwave_js", "zwave", 1)
        setup.ha.connected = False
        setup.zwave_event({"event": "smarti disconnected"})
        assert setup.snapshot()["status"] == "needs_stop"
        await setup.stop(result["id"])
        assert setup.snapshot()["radio_open"]
    finally:
        setup.ha.connected = True
        await setup.close()


def test_pairing_routes_require_admin_csrf_and_validate_pin(tmp_path):
    settings = Settings(
        _env_file=None,
        mode="live",
        data_dir=tmp_path,
        origin="https://ha.example",
        bootstrap_secret="setup-fixture-at-least-24-characters",
    )
    app = create_app(settings, Radio())
    with TestClient(app, base_url=settings.origin) as client:
        client.headers["origin"] = settings.origin
        credentials = {"name": "owner", "password": "pairing fixture password"}
        client.post("/api/bootstrap", json=credentials | {"secret": settings.bootstrap_secret})
        login = client.post("/api/login", json=credentials).json()
        assert client.post("/api/setup/sessions", json={"provider": "zigbee2mqtt"}).status_code == 403
        assert (
            client.post(
                "/api/devices/remove", json={"provider": "zwave_js", "device_id": "zwave:2"}
            ).status_code
            == 403
        )
        client.headers["x-csrf-token"] = login["csrf"]
        result = client.post("/api/setup/sessions", json={"provider": "zigbee2mqtt"}).json()
        assert result["status"] == "searching"
        assert (
            client.post(
                f"/api/setup/sessions/{result['id']}/answer", json={"action": "pin", "pin": "99999"}
            ).status_code
            == 422
        )
        client.post(f"/api/setup/sessions/{result['id']}/stop")
        with app.state.store.connect() as db:
            db.execute("UPDATE users SET role='user'")
        assert client.get("/api/setup/session").status_code == 403
        assert client.post("/api/setup/sessions", json={"provider": "zigbee2mqtt"}).status_code == 403

        assert client.get("/api/devices/zwave_js").status_code == 200
        assert (
            client.post(
                "/api/devices/remove", json={"provider": "zwave_js", "device_id": "zwave:2"}
            ).status_code
            == 403
        )


@pytest.mark.asyncio
async def test_stop_waits_for_delayed_controller_state_and_allows_restart(setup):
    original = setup.ha.request
    lag = 0

    async def request(kind, **data):
        nonlocal lag
        result = await original(kind, **data)
        if kind == "zwave_js/stop_inclusion":
            lag = 3
        if kind == "zwave_js/network_status" and lag:
            lag -= 1
            result["controller"]["inclusion_state"] = 1
        return result

    setup.ha.request = request
    try:
        first = await setup.start("zwave_js", "zwave", 1)
        old_callback = next(d["_callback"] for k, d in setup.ha.calls if k == "zwave_js/add_node")
        stopped = await setup.stop(first["id"])
        assert stopped["status"] == "stopped" and not stopped["radio_open"]
        assert setup.store.get("pairing_active") == ""
        second = await setup.start("zwave_js", "zwave", 1)
        old_callback({"event": "inclusion failed"})
        assert setup.snapshot()["id"] == second["id"]
        assert setup.snapshot()["status"] == "searching"
        assert sum(k == "zwave_js/stop_inclusion" for k, _ in setup.ha.calls) == 1
    finally:
        await setup.close()


@pytest.mark.asyncio
async def test_s2_cancel_error_does_not_prevent_stop(setup):
    original = setup.ha.request

    async def request(kind, **data):
        if kind == "zwave_js/cancel_secure_bootstrap_s2":
            raise HAError("bootstrap_already_finished")
        return await original(kind, **data)

    setup.ha.request = request
    try:
        session = await setup.start("zwave_js", "zwave", 1)
        setup.zwave_event({"event": "validate dsk and enter pin", "dsk": "secret"})
        result = await setup.stop(session["id"])
        assert result["status"] == "stopped" and "dsk" not in result
        assert any(k == "zwave_js/stop_inclusion" for k, _ in setup.ha.calls)
    finally:
        await setup.close()


@pytest.mark.asyncio
async def test_reconcile_interrupted_stop_only_after_connected_idle_status(setup):
    try:
        session = await setup.start("zwave_js", "zwave", 1)
        setup.ha.connected = False
        result = await setup.stop(session["id"])
        assert result["status"] == "needs_stop"
        assert (await setup.status())["radio_open"]
        setup.ha.connected = True
        assert (await setup.status())["radio_open"]  # Still actually including.
        setup.ha.controller_state = 0
        result = await setup.status()
        assert result["status"] == "stopped" and not result["radio_open"]
        assert setup.store.get("pairing_active") == ""
        assert sum(k == "zwave_js/add_node" for k, _ in setup.ha.calls) == 1
        assert not any(k == "zwave_js/stop_inclusion" for k, _ in setup.ha.calls)
        await setup.start("zwave_js", "zwave", 1)
    finally:
        await setup.close()


@pytest.mark.asyncio
async def test_start_reconciles_persisted_stop_and_does_not_close_active_interview(setup):
    try:
        await setup.start("zwave_js", "zwave", 1)
        setup.session["status"] = "interviewing"
        setup.ha.controller_state = 0
        with pytest.raises(HTTPException):
            await setup.start("zwave_js", "zwave", 1)
        setup.session["stop_requested"] = True
        setup.persist()
        restored = DeviceSetup(setup.ha, setup.settings, setup.store)
        try:
            session = await restored.start("zwave_js", "zwave", 1)
            assert session["status"] == "searching"
        finally:
            await restored.close()
    finally:
        await setup.close()
