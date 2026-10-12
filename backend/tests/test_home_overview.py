import base64

import pytest
from app.models import normalize
from test_management import client as home_client  # noqa: F401


@pytest.fixture
def client(home_client):  # noqa: F811
    return home_client


def test_preferences_and_mode_configuration(client):
    assert client.get("/api/home/preferences").json()["rooms"] == []
    assert client.put("/api/home/preferences", json={"rooms": ["living"]}).status_code == 200
    assert client.get("/api/home/preferences").json()["rooms"] == ["living"]
    assert client.put("/api/home/preferences", json={"rooms": ["missing"]}).status_code == 422
    assert client.post("/api/home/modes/away/run", json={"confirmed": True}).status_code == 409
    assert client.post("/api/home/modes/away/run", json={"confirmed": False}).status_code == 422
    assert client.put("/api/home/modes/away", json={"control_id": "light.living_pendant"}).status_code == 422
    ha = client.app.state.ha
    ha.states["scene.away"] = {"state": "ready", "attributes": {"friendly_name": "Away"}}
    assert client.put("/api/home/modes/away", json={"control_id": "scene.away"}).status_code == 200
    assert client.post("/api/home/modes/away/run", json={"confirmed": True}).json()["status"] == "simulated"


def test_room_images_are_bounded_authenticated_raster_only(client):
    assert (
        client.put(
            "/api/home/room-image/living", json={"data": base64.b64encode(b"<svg/>").decode()}
        ).status_code
        == 422
    )
    png = base64.b64encode(b"\x89PNG\r\n\x1a\ntest").decode()
    assert client.put("/api/home/room-image/living", json={"data": png}).status_code == 200
    response = client.get("/api/home/room-image/living")
    assert response.headers["content-type"] == "image/png"
    assert "no-store" in response.headers["cache-control"]
    client.post("/api/logout")
    assert client.get("/api/home/room-image/living").status_code == 401


def test_extended_capabilities_and_camera_secrets():
    rows = normalize(
        {
            "camera.front": {
                "state": "idle",
                "attributes": {"access_token": "secret", "entity_picture": "/api/camera?token=secret"},
            },
            "cover.blinds": {"state": "open", "attributes": {"supported_features": 3}},
            "lock.door": {"state": "locked", "attributes": {}},
            "weather.house": {"state": "sunny", "attributes": {"temperature": 15}},
        },
        {},
        {},
    )
    assert len(rows) == 4
    assert rows[0].attributes == {}
    assert rows[1].capabilities[0].actions == ["open_cover", "close_cover"]
    assert rows[2].capabilities[-1].actions == ["lock", "unlock"]


def test_camera_snapshot_is_explicit_and_commands_require_confirmation(client):
    ha = client.app.state.ha
    ha.states["camera.front"] = {"state": "idle", "attributes": {}}
    assert client.get("/api/home/camera/camera.front").status_code == 503  # no fake demo imagery
    assert client.get("/api/home/camera/light.living_pendant").status_code == 404
    ha.states["lock.door"] = {"state": "locked", "attributes": {}}
    assert client.post("/api/controls/lock.door/commands", json={"action": "unlock"}).status_code == 422
    assert (
        client.post(
            "/api/controls/lock.door/commands", json={"action": "unlock", "confirmed": True}
        ).status_code
        == 200
    )


def test_activity_contains_only_observed_transitions(client):
    ha = client.app.state.ha
    assert client.get("/api/home/activity").json() == []
    ha.states["lock.door"] = {
        "state": "locked",
        "attributes": {},
        "last_updated": "2026-10-12T10:00:00+00:00",
    }
    ha.apply_state(
        {
            "entity_id": "lock.door",
            "new_state": {"state": "unlocked", "attributes": {}, "last_updated": "2026-10-12T10:01:00+00:00"},
        }
    )
    assert client.get("/api/home/activity").json()[0]["state"] == "unlocked"


@pytest.mark.asyncio
async def test_camera_transport_is_bounded_and_keeps_tokens_server_side(monkeypatch):
    import httpx
    from app.ha import HAError, HomeAssistant

    original = httpx.AsyncClient
    observed = []
    body = b"\xff\xd8\xffimage"

    def reply(request):
        observed.append(request)
        return httpx.Response(200, content=body)

    monkeypatch.setattr(
        httpx, "AsyncClient", lambda **kw: original(transport=httpx.MockTransport(reply), **kw)
    )
    ha = HomeAssistant("http://ha.local:8123", "private-token")
    ha.connected = True
    assert await ha.camera_image("camera.front") == (body, "image/jpeg")
    assert observed[0].url.path == "/api/camera_proxy/camera.front"
    assert observed[0].headers["authorization"] == "Bearer private-token"
    with pytest.raises(HAError):
        await ha.camera_image("camera.front/../../secrets")
    assert len(observed) == 1
    body = b"\xff\xd8\xff" + b"x" * 5_000_000
    with pytest.raises(HAError):
        await ha.camera_image("camera.front")


def test_personal_preferences_are_isolated_and_mode_setup_is_admin_only(client):
    from test_api import login

    client.put("/api/home/preferences", json={"rooms": ["living"]})
    assert (
        client.post(
            "/api/users", json={"name": "resident", "password": "another long password", "role": "user"}
        ).status_code
        == 200
    )
    client.post("/api/logout")
    login(client, "resident", "another long password")
    assert client.get("/api/home/preferences").json()["rooms"] == []
    assert client.put("/api/home/modes/night", json={"control_id": None}).status_code == 403
    assert client.put("/api/home/room-image/living", json={"data": ""}).status_code == 403
