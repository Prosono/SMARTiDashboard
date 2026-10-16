from unittest.mock import AsyncMock

import pytest
from test_api import login
from test_management import client  # noqa: F401

from app.ha import HomeAssistant
from app.models import normalize


def robot(features=8192 | 4 | 8 | 16 | 32 | 512 | 16384):
    return {
        "state": "docked",
        "attributes": {
            "friendly_name": "Robot",
            "supported_features": features,
            "fan_speed_list": ["Quiet", "Turbo"],
            "fan_speed": "Quiet",
            "battery_level": 81,
        },
    }


def add_robot(client):  # noqa: F811
    ha = client.app.state.ha
    ha.states["vacuum.test"] = robot()
    ha.entities["vacuum.test"] = {"options": {"vacuum": {"area_mapping": {"kitchen": ["1"]}}}}
    return ha


def test_vacuum_capabilities_and_mapping():
    assert normalize({"vacuum.any_brand": robot(0)}, {}, {})[0].capabilities[0].actions == []
    assert normalize({"vacuum.any_brand": robot("bad")}, {}, {})[0].capabilities[0].actions == []
    c = normalize({"vacuum.test": robot()}, {}, {})[0]
    assert "start" in c.capabilities[0].actions
    assert "clean_area" not in c.capabilities[0].actions
    assert "clean_spot" not in c.capabilities[0].actions
    assert "set_fan_speed" in c.capabilities[0].actions
    legacy = normalize({"vacuum.legacy": robot(1 | 2)}, {}, {})[0]
    assert set(legacy.capabilities[0].actions) == {"turn_on", "turn_off"}


def test_vacuum_commands_validate_supported_actions_values_and_availability(client):  # noqa: F811
    ha = add_robot(client)
    path = "/api/controls/vacuum.test/commands"
    for body in [
        {"action": "clean_spot"},
        {"action": "send_command"},
        {"action": "set_fan_speed", "fan_speed": "invalid"},
        {"action": "start", "fan_speed": "Quiet"},
        {"action": "clean_area", "area_ids": ["bedroom"]},
        {"action": "clean_area"},
        {"action": "start", "area_ids": ["kitchen"]},
    ]:
        assert client.post(path, json=body).status_code == 422, body
    for body in [
        {"action": "start"},
        {"action": "pause"},
        {"action": "return_to_base"},
        {"action": "set_fan_speed", "fan_speed": "Turbo"},
        {"action": "clean_area", "area_ids": ["kitchen"]},
    ]:
        assert client.post(path, json=body).status_code == 200, body
    assert ha.states["vacuum.test"]["attributes"]["fan_speed"] == "Turbo"
    ha.states["vacuum.test"]["state"] = "unavailable"
    assert client.post(path, json={"action": "start"}).status_code == 409


def test_vacuum_view_and_control_permissions(client):  # noqa: F811
    add_robot(client)
    client.post("/api/users", json={"name": "reader", "password": "another long password", "role": "user"})
    id = next(a["id"] for a in client.get("/api/manage/accounts").json() if a["name"] == "reader")
    client.put(
        f"/api/manage/accounts/{id}/access", json={"profile": "custom", "permissions": ["cleaning.view"]}
    )
    client.post("/api/logout")
    login(client, "reader", "another long password")
    home = client.get("/api/home").json()
    assert len(home["controls"]) == 1
    assert home["controls"][0]["domain"] == "vacuum"
    assert home["controls"][0]["capabilities"] == []
    assert client.post("/api/controls/vacuum.test/commands", json={"action": "start"}).status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "action,value,data",
    [
        ("start", None, {}),
        ("pause", None, {}),
        ("return_to_base", None, {}),
        ("set_fan_speed", "Quiet", {"fan_speed": "Quiet"}),
        ("clean_area", ["kitchen"], {"cleaning_area_id": ["kitchen"]}),
    ],
)
async def test_vacuum_service_mapping(action, value, data):
    ha = object.__new__(HomeAssistant)
    ha.connected = True
    ha.states = {"vacuum.test": {"context": {"id": "confirmed"}}}
    ha.request = AsyncMock(return_value={"context": {"id": "confirmed"}})
    await ha.command("vacuum.test", action, value)
    ha.request.assert_awaited_once_with(
        "call_service",
        domain="vacuum",
        service=action,
        target={"entity_id": "vacuum.test"},
        service_data=data,
    )


@pytest.mark.asyncio
async def test_area_mapping_enrichment_and_older_ha_fallback():
    from app.ha import HAError

    ha = HomeAssistant("http://localhost", "test")
    ha.request = AsyncMock(return_value={"options": {"vacuum": {"area_mapping": {"kitchen": ["1"]}}}})
    entries = [{"entity_id": "vacuum.test"}, {"entity_id": "light.test"}]
    await ha.vacuum_options(entries)
    assert entries[0]["options"]["vacuum"]["area_mapping"] == {"kitchen": ["1"]}
    assert ha.request.await_count == 1
    c = normalize({"vacuum.test": robot()}, {"vacuum.test": entries[0]}, {})[0]
    assert "clean_area" in c.capabilities[0].actions
    ha.request = AsyncMock(side_effect=HAError("unsupported"))
    entries = [{"entity_id": "vacuum.test"}]
    await ha.vacuum_options(entries)
    assert "options" not in entries[0]
    assert (
        "clean_area"
        not in normalize({"vacuum.test": robot()}, {"vacuum.test": entries[0]}, {})[0].capabilities[0].actions
    )
