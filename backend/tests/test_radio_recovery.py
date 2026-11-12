from types import SimpleNamespace

import pytest

from app.ha import HAError
from app.radio_recovery import RadioRecovery
from app.storage import Store


class Supervisor:
    def __init__(self):
        self.calls = []

    async def request(self, method, path):
        self.calls.append((method, path))
        if path == "/addons":
            return {"addons": [{"slug": "45df7312_zigbee2mqtt"}, {"slug": "a0d7b954_zwavejs2mqtt"}]}
        return {"hostname": "a0d7b954-zwavejs2mqtt", "network": {"3000/tcp": None}}


class HA:
    def __init__(self):
        self.entries, self.posts = [], []
        self.step = "installation_type"

    async def request(self, command):
        if command == "config_entries/get":
            return self.entries
        assert command == "config_entries/flow/progress"
        return [{"flow_id": "mqtt-flow", "handler": "mqtt", "context": {"source": "hassio"}}]

    async def rest(self, method, path, data=None):
        if "mqtt-flow" in path:
            if method == "GET":
                return {"type": "form", "step_id": "hassio_confirm"}
            assert data == {}
            self.entries.append({"domain": "mqtt"})
            return {"type": "create_entry"}
        if method == "POST":
            self.posts.append(data)
            if data == {"next_step_id": "intent_custom"}:
                self.step = "on_supervisor"
            elif data == {"use_addon": False}:
                self.step = "manual"
            elif "url" in data:
                assert data == {"url": "ws://a0d7b954-zwavejs2mqtt:3000"}
                self.entries.append({"domain": "zwave_js"})
                return {"type": "create_entry"}
        return {
            "type": "menu" if self.step == "installation_type" else "form",
            "step_id": self.step,
            "flow_id": "zwave-flow",
        }


class Pairing:
    frontend = None
    ready = False

    async def providers(self):
        return [
            {"id": p, "status": "ready" if self.ready else "unavailable"} for p in ("zigbee2mqtt", "zwave_js")
        ]


@pytest.mark.asyncio
async def test_reconnect_then_wait_for_actual_bridge_and_retry_without_duplicates(tmp_path):
    store = Store(tmp_path / "test.sqlite")
    ha, supervisor, pairing = HA(), Supervisor(), Pairing()
    recovery = RadioRecovery(SimpleNamespace(), ha, store, pairing, supervisor)
    with pytest.raises(HAError, match="radio_connections_not_ready"):
        await recovery.ensure("reset-one")
    assert store.get("reset_radios:reset-one") != "ready"
    posts = list(ha.posts)
    pairing.ready = True
    await recovery.ensure("reset-one")
    assert ha.posts == posts
    assert store.get("reset_radios:reset-one") == "ready"
    calls = list(supervisor.calls)
    await recovery.ensure("reset-one")
    assert supervisor.calls == calls
    assert all(method == "GET" for method, _ in calls)


@pytest.mark.asyncio
async def test_no_discovery_does_not_invent_mqtt_credentials(tmp_path):
    ha = HA()
    original = ha.request

    async def request(command):
        if command == "config_entries/flow/progress":
            return [{"handler": "mqtt", "context": {"source": "user"}, "flow_id": "someone-elses-flow"}]
        return await original(command)

    ha.request = request
    recovery = RadioRecovery(None, ha, Store(tmp_path / "test.sqlite"), Pairing(), Supervisor())
    with pytest.raises(HAError, match="mqtt_discovery_unavailable"):
        await recovery.ensure("reset-one")
    assert not ha.posts


@pytest.mark.asyncio
async def test_existing_integrations_are_not_replaced_even_when_unavailable(tmp_path):
    ha = HA()
    ha.entries = [{"domain": "mqtt"}, {"domain": "zwave_js", "disabled_by": "user"}]
    recovery = RadioRecovery(None, ha, Store(tmp_path / "test.sqlite"), Pairing(), Supervisor())
    with pytest.raises(HAError, match="radio_connections_not_ready"):
        await recovery.ensure("reset-one")
    assert not ha.posts


@pytest.mark.asyncio
async def test_factory_clone_recovers_ignored_mqtt_using_running_mosquitto(tmp_path):
    class CloneSupervisor(Supervisor):
        async def request(self, method, path):
            if path == "/addons/core_mosquitto/info":
                return {"slug": "core_mosquitto", "state": "started"}
            return await super().request(method, path)

    class CloneHA(HA):
        async def request(self, command):
            if command == "config_entries/flow/progress":
                return []
            return await super().request(command)

        async def rest(self, method, path, data=None):
            if method == "DELETE":
                assert path == "config/config_entries/entry/ignored-mqtt"
                self.entries.pop(0)
                return {"require_restart": False}
            self.posts.append(data)
            if path == "config/config_entries/flow" and data == {
                "handler": "mqtt",
                "show_advanced_options": False,
            }:
                return {
                    "type": "menu",
                    "step_id": "user",
                    "flow_id": "mosquitto",
                    "menu_options": ["addon", "broker"],
                }
            assert path == "config/config_entries/flow/mosquitto" and data == {"next_step_id": "addon"}
            self.entries.append({"domain": "mqtt", "source": "user"})
            return {"type": "create_entry"}

    ha, pairing = CloneHA(), Pairing()
    ignored = {"domain": "mqtt", "source": "ignore", "entry_id": "ignored-mqtt"}
    ha.entries = [ignored, {"domain": "zwave_js"}]
    pairing.ready = True
    recovery = RadioRecovery(None, ha, Store(tmp_path / "test.sqlite"), pairing, CloneSupervisor())

    with pytest.raises(HAError, match="mqtt_discovery_ignored"):
        await recovery.ensure("reset-one")
    assert ignored in ha.entries and not ha.posts

    await recovery.ensure("reset-one", factory_image=True)
    assert ignored not in ha.entries
    assert sum(e["domain"] == "mqtt" for e in ha.entries) == 1
    posts = list(ha.posts)
    await recovery.ensure("reset-one", factory_image=True)
    assert ha.posts == posts


@pytest.fixture(autouse=True)
def no_wait(monkeypatch):
    async def sleep(_):
        pass

    monkeypatch.setattr("app.radio_recovery.asyncio.sleep", sleep)
