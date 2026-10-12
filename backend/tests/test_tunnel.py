"""Real nested TLS: remote client -> opaque relay -> outbound connector -> home API."""

import asyncio
import contextlib
import socket
import ssl
import subprocess
import sys

import httpx
import pytest
from app.auth import Auth
from app.config import Settings
from app.connector import connect_once
from app.mobile import MobileAuth
from app.relay import Relay
from app.storage import Store
from app.tunnel import CHUNK
from websockets.asyncio.client import connect
from websockets.asyncio.server import serve
from websockets.exceptions import InvalidStatus


def certificate(tmp_path, name):
    cert, key = tmp_path / (name + ".crt"), tmp_path / (name + ".key")
    subprocess.run(
        [
            "openssl",
            "req",
            "-x509",
            "-newkey",
            "rsa:2048",
            "-nodes",
            "-days",
            "1",
            "-keyout",
            str(key),
            "-out",
            str(cert),
            "-subj",
            "/CN=localhost",
            "-addext",
            "subjectAltName=DNS:localhost",
        ],
        check=True,
        capture_output=True,
    )
    tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    tls.load_cert_chain(cert, key)
    return cert, key, tls


@pytest.mark.asyncio
async def test_remote_tls_pair_control_revoke_and_local_during_outage(tmp_path):
    home_cert, home_key, _ = certificate(tmp_path, "home")
    relay_cert, _, relay_tls = certificate(tmp_path, "relay")
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        home_port = sock.getsockname()[1]
    settings = Settings(
        _env_file=None,
        mode="demo",
        data_dir=tmp_path / "db",
        mobile_enabled=True,
        bootstrap_secret="tunnel-test-bootstrap-at-least-24",
    )
    store = Store(settings.database)
    Auth(store, settings).bootstrap("owner", "tunnel test password", settings.bootstrap_secret)
    mobile = MobileAuth(store)
    invitation = mobile.issue_pairing(1)
    config = {"mode": "demo", "data_dir": str(tmp_path / "db"), "mobile_enabled": True}
    code = (
        "import uvicorn; from app.config import Settings; from app.main import create_app;"
        f"s = Settings(_env_file=None, **{config!r});"
        f'uvicorn.run(create_app(s, mobile_only=True), host="127.0.0.1", port={home_port},'
        f"ssl_certfile={str(home_cert)!r}, ssl_keyfile={str(home_key)!r}, access_log=False)"
    )
    process = subprocess.Popen(
        [sys.executable, "-c", code], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    home_trust = ssl.create_default_context(cafile=str(home_cert))
    relay_trust = ssl.create_default_context(cafile=str(relay_cert))
    relay = Relay(mobile.installation_id, "test-connector-token-at-least-32-characters")
    connector = None
    try:
        async with httpx.AsyncClient(verify=home_trust, trust_env=False) as client:
            for _ in range(80):
                try:
                    assert (
                        await client.get(f"https://localhost:{home_port}/api/mobile/v1/session")
                    ).status_code == 401
                    break
                except httpx.ConnectError:
                    await asyncio.sleep(0.05)
            else:
                pytest.fail("Home API did not start")
            async with serve(
                relay.connector,
                "127.0.0.1",
                0,
                ssl=relay_tls,
                process_request=relay.authenticate,
                compression=None,
                max_size=CHUNK + 17,
            ) as ws_server:
                ws_port = ws_server.sockets[0].getsockname()[1]
                ws_url = f"wss://localhost:{ws_port}/connector"
                with pytest.raises(InvalidStatus) as denied:
                    async with connect(
                        ws_url,
                        ssl=relay_trust,
                        proxy=None,
                        additional_headers={
                            "Authorization": "Bearer wrong",
                            "X-SMARTi-Home": mobile.installation_id,
                        },
                    ):
                        pass
                assert denied.value.response.status_code == 403
                connector = asyncio.create_task(
                    connect_once(
                        ws_url, mobile.installation_id, relay.token, ("127.0.0.1", home_port), relay_trust
                    )
                )
                for _ in range(80):
                    if relay.tunnel:
                        break
                    await asyncio.sleep(0.025)
                assert relay.tunnel is not None
                frames = []
                send = relay.tunnel.send

                async def capture(frame):
                    frames.append(frame)
                    await send(frame)

                relay.tunnel.send = capture
                server = await asyncio.start_server(relay.client, "127.0.0.1", 0)
                async with server:
                    remote = f"https://localhost:{server.sockets[0].getsockname()[1]}"
                    tokens_response = await client.post(
                        remote + "/api/mobile/v1/pair",
                        json={
                            "installation_id": invitation["installation_id"],
                            "code": invitation["code"],
                            "device_name": "Pilot phone",
                        },
                    )
                    assert tokens_response.status_code == 200
                    tokens = tokens_response.json()
                    headers = {"authorization": "Bearer " + tokens["access_token"]}
                    assert (
                        await client.get(remote + "/api/mobile/v1/home", headers=headers)
                    ).status_code == 200
                    result = await client.post(
                        remote + "/api/mobile/v1/controls/light.living_pendant/commands",
                        headers=headers,
                        json={"action": "turn_off"},
                    )
                    assert result.json()["status"] == "simulated"
                    assert (
                        await client.get(f"https://localhost:{home_port}/api/mobile/v1/home", headers=headers)
                    ).status_code == 200
                    # Relay cannot read native credentials or HTTP paths in the TLS payload.
                    ciphertext = b"".join(frames)
                    for sensitive in [tokens["access_token"], invitation["code"], "/api/mobile/v1/controls"]:
                        assert sensitive.encode() not in ciphertext
                    async with httpx.AsyncClient(verify=relay_trust, trust_env=False) as wrong_trust:
                        with pytest.raises(httpx.ConnectError):
                            await wrong_trust.get(remote + "/api/mobile/v1/home")
                    await relay.tunnel.websocket.close()
                    await asyncio.wait_for(connector, 5)
                    assert (
                        await client.get(f"https://localhost:{home_port}/api/mobile/v1/home", headers=headers)
                    ).status_code == 200
                    async with httpx.AsyncClient(verify=home_trust, trust_env=False, timeout=2) as offline:
                        with pytest.raises(httpx.TransportError):
                            await offline.get(remote + "/api/mobile/v1/home", headers=headers)
                    mobile.revoke(1, tokens["device_id"])
                    assert (
                        await client.get(f"https://localhost:{home_port}/api/mobile/v1/home", headers=headers)
                    ).status_code == 401
    finally:
        if connector:
            connector.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await connector
        process.terminate()
        process.wait(timeout=10)
