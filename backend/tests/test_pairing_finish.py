import pytest
from test_management import client  # noqa: F401


@pytest.mark.parametrize("provider,radio_id", [("zigbee2mqtt", "0x123"), ("zwave_js", "entry:7")])
def test_finish_requires_registered_device_and_saves_name_and_area_together(client, provider, radio_id):  # noqa: F811
    setup = client.app.state.setup
    m = client.app.state.management
    setup.session = {"id": "pair", "provider": provider, "status": "paired", "device_id": radio_id}
    registered = {"ha_device_id": None}
    calls = []

    async def detail(p, id):
        assert (p, id) == (provider, radio_id)
        return registered

    async def ws(kind, **data):
        calls.append((kind, data))
        return {}

    setup.inventory.detail = detail
    m.ws = ws
    payload = {"name": "  Taklys  ", "area_id": "living"}
    path = "/api/setup/sessions/pair/finish"
    assert client.post(path, json=payload).status_code == 409
    assert not calls
    registered["ha_device_id"] = "d1"
    assert client.post(path, json=payload | {"name": " "}).status_code == 422
    assert client.post(path, json=payload | {"area_id": "missing"}).status_code == 422
    assert client.post(path, json=payload, headers={"x-csrf-token": "bad"}).status_code == 403
    response = client.post(path, json=payload)
    assert response.status_code == 200
    assert response.json() == {"id": radio_id, "name": "Taklys", "provider": provider}
    assert calls == [
        ("config/device_registry/update", {"device_id": "d1", "name_by_user": "Taklys", "area_id": "living"})
    ]
    assert setup.session["setup_completed"]
    setup.session["operation"] = "remove"
    assert client.post(path, json=payload).status_code == 409
