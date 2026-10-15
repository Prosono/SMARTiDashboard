import pytest
from app.models import Command
from pydantic import ValidationError
from test_api import app, client, login  # noqa: F401


def colored(client):  # noqa: F811
    attrs = client.app.state.ha.states["light.living_pendant"]["attributes"]
    attrs.update(
        supported_color_modes=["rgb", "color_temp"], min_color_temp_kelvin=2200, max_color_temp_kelvin=6500
    )


def test_color_commands_validate_and_update_observed_state(client):  # noqa: F811
    login(client)
    colored(client)
    path = "/api/controls/light.living_pendant/commands"
    assert client.post(path, json={"action": "set_rgb_color", "value": [24, 80, 255]}).status_code == 200
    assert list(client.app.state.ha.states["light.living_pendant"]["attributes"]["rgb_color"]) == [
        24,
        80,
        255,
    ]
    for value in ([256, 0, 0], [0, 0], 5):
        assert client.post(path, json={"action": "set_rgb_color", "value": value}).status_code == 422
    assert client.post(path, json={"action": "set_color_temp", "value": 2100}).status_code == 422
    assert client.post(path, json={"action": "set_color_temp", "value": 3000}).status_code == 200
    assert client.post(path, json={"action": "set_brightness", "value": [1, 2, 3]}).status_code == 422
    with pytest.raises(ValidationError):
        Command(action="set_brightness", value=float("nan"))


def test_group_lifecycle_shared_commands_and_permissions(client):  # noqa: F811
    login(client)
    colored(client)
    response = client.post("/api/groups", json={"name": "Stuelamper", "entities": ["light.living_pendant"]})
    assert response.status_code == 200, response.text
    group = response.json()
    path = "/api/groups/" + group["id"]
    assert "set_rgb_color" in group["actions"]
    assert (
        client.post(path + "/commands", json={"action": "turn_off"}).json()["results"][0]["status"]
        == "simulated"
    )
    assert client.post(path + "/commands", json={"action": "unlock", "confirmed": True}).status_code == 422
    assert client.put(path, json={"name": "Ny", "entities": group["entities"]}).status_code == 409
    assert client.post("/api/groups", json={"name": "Tom", "entities": []}).status_code == 422
    assert (
        client.post("/api/groups", json={"name": "Ukjent", "entities": ["light.missing"]}).status_code == 422
    )
    client.post("/api/users", json={"name": "resident", "password": "another long password", "role": "user"})
    client.post("/api/logout")
    login(client, "resident", "another long password")
    assert client.get("/api/groups").json()[0]["id"] == group["id"]
    assert client.post("/api/groups", json={"name": "Ny", "entities": group["entities"]}).status_code == 403
    assert client.delete(path, params={"revision": group["revision"]}).status_code == 403
    client.post("/api/logout")
    login(client)
    assert client.delete(path, params={"revision": group["revision"]}).status_code == 200
    assert "light.living_pendant" in client.app.state.ha.states


def test_room_bank_is_allowlisted_and_retrievable(client, tmp_path):  # noqa: F811
    login(client)
    path = "/api/home/room-image/living"
    from typing import get_args

    from app.home_overview import RoomImageBank
    for choice in get_args(RoomImageBank):
        response = client.put(path, json={"bank": choice})
        assert response.status_code == 200, response.text
        response = client.get(path)
        assert response.status_code == 200, choice
        assert response.headers["content-type"] == "image/webp"
    assert client.put(path, json={"bank": "../secret"}).status_code == 422
    assert client.put(path, json={"bank": "living", "data": "abc"}).status_code == 422
    assert client.put(path, json={"data": ""}).status_code == 200


def test_scene_color_is_saved_without_changing_light(client):  # noqa: F811
    login(client)
    colored(client)
    attrs = dict(client.app.state.ha.states["light.living_pendant"]["attributes"])
    body = {
        "name": "Fargekveld",
        "icon": "mdi:sofa",
        "entities": {"light.living_pendant": {"state": "on", "rgb_color": [120, 30, 255]}},
    }
    result = client.post("/api/scenes", json=body)
    assert result.status_code == 200, result.text
    saved = client.get("/api/scenes/config/" + result.json()["id"]).json()
    assert saved["entities"]["light.living_pendant"]["rgb_color"] == [120, 30, 255]
    assert client.app.state.ha.states["light.living_pendant"]["attributes"] == attrs
    body["entities"]["light.living_pendant"] = {"state": "on", "color_temp_kelvin": 1000}
    assert client.post("/api/scenes", json=body).status_code == 422


def test_group_blocks_unsupported_color_and_offline_members(client):  # noqa: F811
    login(client)
    colored(client)
    group = client.post(
        "/api/groups", json={"name": "Blandet", "entities": ["light.living_pendant", "light.kitchen"]}
    ).json()
    assert "set_rgb_color" not in group["actions"]
    path = "/api/groups/" + group["id"] + "/commands"
    assert client.post(path, json={"action": "set_rgb_color", "value": [20, 30, 40]}).status_code == 422
    client.app.state.ha.states["light.kitchen"]["state"] = "unavailable"
    assert client.post(path, json={"action": "turn_on"}).status_code == 409
