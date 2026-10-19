import uuid
from urllib.parse import urlsplit

import httpx
import pytest
from fastapi.testclient import TestClient

from app.auth import Auth
from app.config import Settings
from app.multihome_relay import MultiHomeRelay
from app.remote_console import RemoteConsole
from app.storage import Store


@pytest.fixture
def console(tmp_path):
    settings = Settings(
        _env_file=None, mode="demo", data_dir=tmp_path, bootstrap_secret="test-bootstrap-secret-123456"
    )
    auth = Auth(Store(settings.database), settings)
    auth.bootstrap("owner", "test-password-only", settings.bootstrap_secret)
    token, _ = auth.login("owner", "test-password-only")
    calls = []

    def upstream(request):
        calls.append(request)
        return httpx.Response(
            200,
            stream=httpx.ByteStream(b"HA content"),
            headers={
                "Content-Type": "text/html",
                "X-Frame-Options": "SAMEORIGIN",
                "Set-Cookie": "ingress_session=test; Path=/; HttpOnly",
            },
        )

    bridge = RemoteConsole(
        f"https://{uuid.uuid4()}.home.smarti.dev", auth, transport=httpx.MockTransport(upstream)
    )
    client = TestClient(bridge, base_url=bridge.origin, headers={"Origin": bridge.origin})
    return bridge, client, token, calls


def enter(bridge, client, token):
    url = bridge.launch(token, "/config/dashboard")
    ticket = urlsplit(url).fragment
    response = client.post("/_smarti/session", json={"ticket": ticket})
    assert response.status_code == 200
    return ticket, response


def test_console_requires_single_use_admin_handoff_and_revokes_on_logout(console):
    bridge, client, token, calls = console
    assert client.get("/api/config").status_code == 401
    assert not calls
    url = bridge.launch(token, "/config/dashboard")
    ticket = urlsplit(url).fragment
    assert ticket not in client.get("/_smarti/launch").text
    assert (
        client.post(
            "/_smarti/session", json={"ticket": ticket}, headers={"Origin": "https://evil.example"}
        ).status_code
        == 403
    )
    response = client.post("/_smarti/session", json={"ticket": ticket})
    assert response.json()["path"] == "/config/dashboard"
    assert "Secure" in response.headers["set-cookie"]
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "Domain=" not in response.headers["set-cookie"]
    assert client.post("/_smarti/session", json={"ticket": ticket}).status_code == 401
    assert client.get("/").text == "HA content"
    bridge.auth.logout(token)
    assert client.get("/api/config").status_code == 401
    assert len(calls) == 1


def test_proxy_preserves_browser_ha_auth_not_smarti_or_forwarded_identity(console):
    bridge, client, token, calls = console
    enter(bridge, client, token)
    client.cookies.set("smarti_session", "must-not-leak")
    response = client.post(
        "/auth/token?test=1",
        content="grant_type=test",
        headers={
            "Authorization": "Bearer browser-ha-token",
            "X-Forwarded-For": "evil",
            "X-Ingress-Path": "/evil",
        },
    )
    assert response.status_code == 200
    upstream = calls[-1]
    assert str(upstream.url) == "http://homeassistant:8123/auth/token?test=1"
    assert upstream.headers["authorization"] == "Bearer browser-ha-token"
    assert "cookie" not in upstream.headers
    assert "x-forwarded-for" not in upstream.headers
    assert "x-ingress-path" not in upstream.headers
    assert "x-frame-options" not in response.headers
    assert bridge.home_origin in response.headers["content-security-policy"]
    assert "Secure" in response.headers["set-cookie"]
    assert client.get("/", headers={"Host": "wrong.home.smarti.dev"}).status_code == 403
    assert client.post("/api/services", headers={"Origin": "https://evil.example"}).status_code == 403
    assert len(calls) == 1


def test_expired_or_nonadmin_tickets_cannot_enter(console):
    bridge, client, token, calls = console
    url = bridge.launch(token, "/config/dashboard")
    ticket = urlsplit(url).fragment
    bridge.tickets[ticket] = (0, token, "/config/dashboard")
    assert client.post("/_smarti/session", json={"ticket": ticket}).status_code == 401
    with bridge.auth.store.connect() as db:
        db.execute("UPDATE users SET role='user'")
    with pytest.raises(Exception) as error:
        bridge.launch(token, "/config/dashboard")
    assert error.value.status_code == 403
    assert not calls


def test_console_hostname_maps_only_to_own_home():
    home = str(uuid.uuid4())
    relay = MultiHomeRelay(None)
    assert relay.home_for_name(home + ".home.smarti.dev") == home
    assert relay.home_for_name("ha-" + home + ".home.smarti.dev") == home
    for hostname in [
        "evil-" + home + ".home.smarti.dev",
        "ha-" + home + ".evil.dev",
        "ha-ha-" + home + ".home.smarti.dev",
    ]:
        with pytest.raises(ValueError):
            relay.home_for_name(hostname)


def test_websocket_requires_console_session_and_exact_origin(console):
    from starlette.websockets import WebSocketDisconnect

    bridge, client, token, _ = console
    ws_url = bridge.origin.replace("https:", "wss:") + "/api/websocket"
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(ws_url):
            pass
    enter(bridge, client, token)
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(ws_url, headers={"Origin": "https://evil.example"}):
            pass


def test_websocket_relays_both_directions_and_closes_on_logout(console, monkeypatch):
    import asyncio
    from contextlib import asynccontextmanager

    from starlette.websockets import WebSocketDisconnect

    import app.remote_console as module

    bridge, client, token, _ = console
    enter(bridge, client, token)

    class Upstream:
        subprotocol = None

        def __init__(self):
            self.queue = asyncio.Queue()

        async def send(self, message):
            await self.queue.put(message)

        def __aiter__(self):
            return self

        async def __anext__(self):
            return await self.queue.get()

    @asynccontextmanager
    async def fake_connect(url, **kwargs):
        assert url == "ws://homeassistant:8123/api/websocket"
        assert kwargs["origin"] == bridge.origin
        assert not any(k.lower() == "cookie" for k, _ in kwargs["additional_headers"])
        yield Upstream()

    monkeypatch.setattr(module, "connect", fake_connect)
    with client.websocket_connect(bridge.origin.replace("https:", "wss:") + "/api/websocket") as ws:
        ws.send_text("hello")
        assert ws.receive_text() == "hello"
        ws.send_bytes(b"binary")
        assert ws.receive_bytes() == b"binary"
        bridge.auth.logout(token)
        ws.send_text("revoked")
        with pytest.raises(WebSocketDisconnect):
            ws.receive_text()
