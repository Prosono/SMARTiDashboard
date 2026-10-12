import json
import time

import pytest
from app.config import Settings
from app.setup import DeviceSetup
from app.storage import Store
from fastapi import HTTPException
from test_setup import Radio


class InventoryRadio(Radio):
    def __init__(self):
        super().__init__()
        self.devices = {
            "ha-device": {
                "name_by_user": "Hall sensor",
                "config_entries": ["zwave"],
                "identifiers": [["zwave_js", "123-2"]],
            }
        }
        self.reject_remove = False

    async def request(self, kind, **data):
        if kind == "mqtt/subscribe" and data["topic"].endswith("/bridge/devices"):
            result = await super().request(kind, **data)
            data["_callback"](
                {
                    "topic": data["topic"],
                    "retain": True,
                    "payload": json.dumps(
                        [
                            {"ieee_address": "coordinator", "type": "Coordinator"},
                            {
                                "ieee_address": "lamp",
                                "friendly_name": "room/lamp",
                                "type": "Router",
                                "definition": None,
                            },
                        ]
                    ),
                }
            )
            return result
        if kind == "zwave_js/network_status":
            self.calls.append((kind, data))
            return {
                "client": {"state": "connected"},
                "controller": {
                    "home_id": 123,
                    "inclusion_state": self.controller_state,
                    "nodes": [
                        {"node_id": 1, "status": 4, "is_controller_node": True},
                        {"node_id": 2, "status": 1, "is_controller_node": False},
                    ],
                },
            }
        if kind == "call_service" and data["service_data"]["topic"].endswith("/device/remove"):
            self.calls.append((kind, data))
            payload = json.loads(data["service_data"]["payload"])
            self.event(
                "mqtt/subscribe",
                {
                    "topic": "zigbee2mqtt/bridge/response/device/remove",
                    "payload": json.dumps(
                        {
                            "transaction": payload["transaction"],
                            "status": "error" if self.reject_remove else "ok",
                        }
                    ),
                },
            )
            return None
        if kind == "zwave_js/remove_node":
            self.calls.append((kind, data))
            self.controller_state = 2
            self.callbacks[len(self.calls)] = data["_callback"]
            return len(self.calls)
        if kind == "zwave_js/stop_exclusion":
            self.controller_state = 0
        return await super().request(kind, **data)


@pytest.fixture
def setup(tmp_path):
    return DeviceSetup(
        InventoryRadio(), Settings(_env_file=None, mode="live", data_dir=tmp_path), Store(tmp_path / "db")
    )


@pytest.mark.asyncio
async def test_inventory_physical_nodes_unknown_availability_and_retained_quality(setup):
    result = await setup.inventory.list("zigbee2mqtt")
    assert len(result["devices"]) == 2
    assert result["devices"][1]["status"] == "unknown"
    setup.inventory.event(
        {
            "topic": "zigbee2mqtt/room/lamp",
            "retain": True,
            "payload": '{"linkquality": 180,"secret":"do-not-store"}',
        }
    )
    setup.inventory.event({"topic": "zigbee2mqtt/room/lamp/availability", "payload": '{"state":"online"}'})
    lamp = (await setup.inventory.list("zigbee2mqtt"))["devices"][1]
    assert lamp["lqi"] == 180 and lamp["sample_at"] is None and lamp["status"] == "online"
    assert "secret" not in json.dumps(lamp)
    result = await setup.inventory.list("zwave_js")
    assert result["devices"][1]["name"] == "Hall sensor"
    assert result["devices"][1]["status"] == "asleep"
    assert not result["devices"][0]["removable"]
    setup.ha.connected = False
    assert (await setup.inventory.list("zigbee2mqtt"))["status"] == "unavailable"


@pytest.mark.asyncio
async def test_zigbee_removal_verified_and_never_forced(setup):
    result = await setup.remove("zigbee2mqtt", "lamp", 1)
    assert result["status"] == "removed"
    publish = next(d for k, d in setup.ha.calls if k == "call_service")
    payload = json.loads(publish["service_data"]["payload"])
    assert payload["id"] == "lamp" and payload["force"] is False
    assert publish["service_data"]["retain"] is False
    setup.ha.reject_remove = True
    with pytest.raises(HTTPException) as error:
        await setup.remove("zigbee2mqtt", "lamp", 1)
    assert error.value.detail == "removal_unconfirmed"
    for device in ["coordinator", "injected"]:
        with pytest.raises(HTTPException):
            await setup.remove("zigbee2mqtt", device, 1)


@pytest.mark.asyncio
@pytest.mark.parametrize("removed, expected", [(2, "removed"), (9, "different_node")])
async def test_exclusion_identity_stop_and_persistence(setup, removed, expected):
    try:
        session = await setup.remove("zwave_js", "zwave:2", 1)
        assert session["status"] == "searching" and session["operation"] == "remove"
        restored = DeviceSetup(setup.ha, setup.settings, setup.store)
        assert restored.snapshot()["operation"] == "remove"
        assert restored.snapshot()["status"] == "needs_stop"
        with pytest.raises(HTTPException):
            await setup.start("zwave_js", "zwave", 1)
        setup.zwave_event({"event": "node removed", "node": {"node_id": removed}})
        assert setup.snapshot()["status"] == expected
        await setup.stop(session["id"])
        assert not setup.snapshot()["radio_open"]
        assert any(k == "zwave_js/stop_exclusion" for k, d in setup.ha.calls)
        assert not any(k == "zwave_js/stop_inclusion" for k, d in setup.ha.calls)
        assert setup.store.get("pairing_active") == ""
    finally:
        await setup.close()


@pytest.mark.asyncio
async def test_exclusion_timeout_and_disconnect_are_not_success(setup):
    try:
        await setup.remove("zwave_js", "zwave:2", 1)
        setup.session["expires_at"] = time.time() - 1
        await setup.timer
        assert setup.snapshot()["status"] == "stopped"
        await setup.remove("zwave_js", "zwave:2", 1)
        setup.zwave_event({"event": "smarti disconnected"})
        assert setup.snapshot()["status"] == "needs_stop"
        assert setup.snapshot()["radio_open"]
    finally:
        await setup.close()


@pytest.mark.asyncio
async def test_detail_exact_identity_controls_and_model_image(setup):
    await setup.inventory.list("zigbee2mqtt")
    setup.inventory.devices["lamp"]["image_model"] = "Model: 1/2"
    setup.ha.devices["lamp-ha"] = {"id": "lamp-ha", "identifiers": [["mqtt", "zigbee2mqtt_lamp"]]}
    setup.ha.entities["light.fixture"] = {"device_id": "lamp-ha", "platform": "mqtt"}
    setup.ha.states["light.fixture"] = {
        "entity_id": "light.fixture",
        "state": "off",
        "attributes": {"friendly_name": "Fixture"},
    }
    detail = await setup.inventory.detail("zigbee2mqtt", "lamp")
    assert detail["ha_device_id"] == "lamp-ha"
    assert [c["entity_id"] for c in detail["controls"]] == ["light.fixture"]
    assert detail["image_url"] == "https://www.zigbee2mqtt.io/images/devices/Model--1-2.png"
    assert not (await setup.inventory.detail("zigbee2mqtt", "coordinator"))["controls"]


@pytest.mark.asyncio
async def test_custom_images_persist_with_validation(setup):
    import base64

    value = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\nfixture").decode()
    await setup.inventory.save_image("zwave_js", "zwave:2", value)
    detail = await setup.inventory.detail("zwave_js", "zwave:2")
    assert detail["custom_image"] and detail["image_url"].startswith("api/devices/zwave_js/image?")
    for invalid in [
        "data:image/svg+xml;base64,PHN2Zz4=",
        "https://example.com/image.png",
        "data:image/png;base64,YWJj",
    ]:
        with pytest.raises(HTTPException):
            await setup.inventory.save_image("zwave_js", "zwave:2", invalid)
    await setup.inventory.save_image("zwave_js", "zwave:2", None)
    assert not (await setup.inventory.detail("zwave_js", "zwave:2"))["custom_image"]


@pytest.mark.asyncio
async def test_extended_zwave_registry_identifier_matches_device(setup):
    setup.ha.devices["ha-device"]["id"] = "ha-device"
    setup.ha.devices["ha-device"]["identifiers"] = [["zwave_js", "123-2-271:2048:4097"]]
    detail = await setup.inventory.detail("zwave_js", "zwave:2")
    assert detail["ha_device_id"] == "ha-device" and detail["name"] == "Hall sensor"
