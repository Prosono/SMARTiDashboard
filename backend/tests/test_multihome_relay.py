import asyncio
import contextlib
import hashlib
import ssl
import subprocess
import uuid

import pytest
from app.connector import connect_once
from app.multihome_relay import MultiHomeRelay, read_hello
from app.tunnel import CHUNK
from test_tunnel import certificate
from websockets.asyncio.client import connect
from websockets.asyncio.server import serve
from websockets.exceptions import InvalidStatus


class Registry:
    def __init__(self, homes):
        self.homes = homes

    def credential(self, home_id):
        return self.homes.get(home_id)


def hello(name):
    incoming, outgoing = ssl.MemoryBIO(), ssl.MemoryBIO()
    client = ssl.create_default_context().wrap_bio(incoming, outgoing, server_hostname=name)
    with contextlib.suppress(ssl.SSLWantReadError):
        client.do_handshake()
    return outgoing.read()


@pytest.mark.asyncio
async def test_fragmented_hello_retains_exact_wire_bytes():
    hostname = str(uuid.uuid4()) + ".home.smarti.dev"
    wire = hello(hostname)
    body = wire[5:]
    fragmented = b"".join(
        b"\x16\x03\x01" + len(part).to_bytes(2, "big") + part for part in [body[:2], body[2:50], body[50:]]
    )
    reader = asyncio.StreamReader()
    reader.feed_data(fragmented)
    reader.feed_eof()
    assert await read_hello(reader) == (hostname, fragmented)


@pytest.mark.asyncio
@pytest.mark.parametrize("wire", [b"GET / HTTP/1.1\r\n", b"\x16\x03\x01\xff\xff", b"\x16\x03\x01\x00\x00"])
async def test_non_tls_and_oversized_records_rejected(wire):
    reader = asyncio.StreamReader()
    reader.feed_data(wire)
    reader.feed_eof()
    with pytest.raises((ValueError, asyncio.IncompleteReadError)):
        await read_hello(reader)


def home_certificate(path, home_id):
    cert, key = path / (home_id + ".crt"), path / (home_id + ".key")
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
            "/CN=" + home_id,
            "-addext",
            "subjectAltName=DNS:" + home_id + ".home.smarti.dev",
        ],
        check=True,
        capture_output=True,
    )
    server = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    server.load_cert_chain(cert, key)
    return server, ssl.create_default_context(cafile=str(cert))


@pytest.mark.asyncio
async def test_two_homes_tls_isolation_wrong_identity_revocation_and_reconnect(tmp_path):
    ids = [str(uuid.uuid4()), str(uuid.uuid4())]
    tokens = ["first-home-credential-at-least-32-characters", "second-home-credential-at-least-32-characters"]
    registry = Registry({i: hashlib.sha256(t.encode()).hexdigest() for i, t in zip(ids, tokens)})
    relay = MultiHomeRelay(registry)
    relay_cert, _, relay_tls = certificate(tmp_path, "relay")
    relay_trust = ssl.create_default_context(cafile=str(relay_cert))
    tasks, trusts, home_ports = [], [], []
    writers = []
    async with contextlib.AsyncExitStack() as stack:
        for home_id in ids:
            server_tls, trust = home_certificate(tmp_path, home_id)
            trusts.append(trust)

            async def response(reader, writer, identity=home_id):
                writers.append(writer)
                try:
                    request = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), 5)
                    # Local authentication remains mandatory even on the routed connection.
                    body = (
                        identity.encode()
                        if b"Authorization: test-local-session\r\n" in request
                        else b"unauthorized"
                    )
                    writer.write(body + b"\n")
                    await writer.drain()
                finally:
                    writer.close()

            server = await asyncio.start_server(response, "127.0.0.1", 0, ssl=server_tls)
            await stack.enter_async_context(server)
            home_ports.append(server.sockets[0].getsockname()[1])
        ws = await stack.enter_async_context(
            serve(
                relay.connector,
                "127.0.0.1",
                0,
                ssl=relay_tls,
                process_request=relay.authenticate,
                compression=None,
                max_size=CHUNK + 17,
                close_timeout=1,
            )
        )
        ws_url = f"wss://localhost:{ws.sockets[0].getsockname()[1]}/connector"
        tcp = await asyncio.start_server(relay.client, "127.0.0.1", 0)
        await stack.enter_async_context(tcp)
        tcp_port = tcp.sockets[0].getsockname()[1]
        try:
            with pytest.raises(InvalidStatus):
                async with connect(
                    ws_url,
                    ssl=relay_trust,
                    additional_headers={
                        "X-SMARTi-Home": ids[0],
                        "Authorization": "Bearer " + tokens[1],
                    },
                ):
                    pass
            for home_id, token, port in zip(ids, tokens, home_ports):
                tasks.append(
                    asyncio.create_task(
                        connect_once(ws_url, home_id, token, ("127.0.0.1", port), relay_trust)
                    )
                )
            async with asyncio.timeout(5):
                while len(relay.connections) != 2:
                    await asyncio.sleep(0.01)

            async def fetch(index, authorization=True, trust=None):
                reader, writer = await asyncio.wait_for(
                    asyncio.open_connection(
                        "127.0.0.1",
                        tcp_port,
                        ssl=trust or trusts[index],
                        server_hostname=ids[index] + ".home.smarti.dev",
                    ),
                    3,
                )
                writer.write(
                    b"GET / HTTP/1.1\r\n"
                    + (b"Authorization: test-local-session\r\n" if authorization else b"")
                    + b"\r\n"
                )
                await writer.drain()
                try:
                    return (await asyncio.wait_for(reader.readline(), 3)).decode().strip()
                finally:
                    writer.close()
                    await writer.wait_closed()

            assert await asyncio.gather(fetch(0), fetch(1)) == ids
            assert await fetch(0, False) == "unauthorized"
            with pytest.raises(ssl.SSLCertVerificationError):
                await fetch(0, trust=trusts[1])
            registry.homes.pop(ids[0])
            async with asyncio.timeout(5):
                while ids[0] in relay.connections:
                    await asyncio.sleep(0.02)
            with pytest.raises((OSError, TimeoutError)):
                await fetch(0)
            assert await fetch(1) == ids[1]
            tasks[1].cancel()
            await asyncio.gather(tasks[1], return_exceptions=True)
            async with asyncio.timeout(5):
                while ids[1] in relay.connections:
                    await asyncio.sleep(0.01)
            tasks.append(
                asyncio.create_task(
                    connect_once(ws_url, ids[1], tokens[1], ("127.0.0.1", home_ports[1]), relay_trust)
                )
            )
            async with asyncio.timeout(5):
                while ids[1] not in relay.connections:
                    await asyncio.sleep(0.01)
            assert await fetch(1) == ids[1]
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            for writer in writers:
                writer.close()
