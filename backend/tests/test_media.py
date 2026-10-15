from unittest.mock import AsyncMock

import pytest
from app.ha import HomeAssistant
from app.models import normalize
from test_management import client  # noqa: F401


def player(features, state="playing"):
    return {"state": state, "attributes": {"supported_features": features, "volume_level": 0.4}}


def test_media_features_do_not_confuse_play_with_play_media():
    controls = normalize({"media_player.test": player(512 | 4 | 8 | 1)}, {}, {})
    actions = [a for cap in controls[0].capabilities for a in cap.actions]
    assert "media_play" not in actions
    assert set(actions) == {"set_volume", "set_mute", "media_pause"}
    assert normalize({"media_player.test": player(0)}, {}, {})[0].capabilities[0].actions == []


def test_media_command_validation(client):  # noqa: F811
    ha = client.app.state.ha
    ha.states["media_player.test"] = player(4 | 8 | 1 | 16384)
    path = "/api/controls/media_player.test/commands"
    assert client.post(path, json={"action": "set_volume", "value": 101}).status_code == 422
    assert client.post(path, json={"action": "set_mute", "value": 0.5}).status_code == 422
    assert client.post(path, json={"action": "media_next_track"}).status_code == 422
    assert client.post(path, json={"action": "set_volume", "value": 25}).status_code == 200
    assert ha.states["media_player.test"]["attributes"]["volume_level"] == 0.25
    assert client.post(path, json={"action": "media_pause"}).status_code == 200
    assert ha.states["media_player.test"]["state"] == "paused"
    ha.states["media_player.test"]["state"] = "unavailable"
    assert client.post(path, json={"action": "media_play"}).status_code == 409


@pytest.mark.asyncio
@pytest.mark.parametrize("action,value,service,data", [
    ("set_volume", 25, "volume_set", {"volume_level": 0.25}),
    ("set_mute", 1, "volume_mute", {"is_volume_muted": True}),
    ("media_play", None, "media_play", {}),
])
async def test_media_service_mapping(action, value, service, data):
    # Exercise the real adapter without a live controller.
    ha = object.__new__(HomeAssistant)
    ha.connected = True
    ha.states = {"media_player.test": {"context": {"id": "confirmed"}}}
    ha.request = AsyncMock(return_value={"context": {"id": "confirmed"}})
    await ha.command("media_player.test", action, value)
    ha.request.assert_awaited_once_with("call_service", domain="media_player", service=service,
                                      target={"entity_id": "media_player.test"}, service_data=data)
