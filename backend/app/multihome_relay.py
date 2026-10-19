"""Bounded SNI router for opaque home TLS, over authenticated outbound WSS.

Only ClientHello routing metadata is parsed. Home keys and application credentials
never enter this service. Requires unique home certificates and L4 ingress.
"""

import asyncio
import contextlib
import hashlib
import json
import os
import secrets
import sqlite3
import ssl
import uuid
from pathlib import Path

from websockets.asyncio.server import serve

from .tunnel import CHUNK, Tunnel

MAX_HELLO = 65536


def server_name(hello: bytes) -> str:
    """Parse a complete TLS ClientHello body, rejecting malformed/ambiguous SNI."""
    position = 0

    def take(length):
        nonlocal position
        if position + length > len(hello):
            raise ValueError("Truncated ClientHello")
        result = hello[position : position + length]
        position += length
        return result

    def vector(width):
        return take(int.from_bytes(take(width), "big"))

    take(34)  # legacy version and random
    vector(1)  # session id
    vector(2)  # cipher suites
    vector(1)  # compression methods
    extensions = vector(2)
    if position != len(hello):
        raise ValueError("Trailing ClientHello bytes")
    offset, names = 0, []
    seen = set()
    while offset < len(extensions):
        if offset + 4 > len(extensions):
            raise ValueError("Truncated extension")
        kind = int.from_bytes(extensions[offset : offset + 2], "big")
        size = int.from_bytes(extensions[offset + 2 : offset + 4], "big")
        offset += 4
        value = extensions[offset : offset + size]
        offset += size
        if len(value) != size or kind in seen:
            raise ValueError("Invalid extension")
        seen.add(kind)
        if kind != 0:
            continue
        if len(value) < 5 or int.from_bytes(value[:2], "big") != len(value) - 2:
            raise ValueError("Invalid SNI")
        if value[2] != 0 or int.from_bytes(value[3:5], "big") != len(value) - 5:
            raise ValueError("Ambiguous SNI")
        names.append(value[5:].decode("ascii").lower())
    if len(names) != 1 or not 1 <= len(names[0]) <= 253:
        raise ValueError("SNI required")
    return names[0]


async def read_hello(reader):
    """Retain ALL consumed bytes, including any coalesced handshake payload."""
    wire, handshake = bytearray(), bytearray()
    async with asyncio.timeout(5):
        while len(wire) < MAX_HELLO:
            header = await reader.readexactly(5)
            size = int.from_bytes(header[3:], "big")
            if header[0] != 22 or header[1] != 3 or not 1 <= size <= 18432:
                raise ValueError("TLS handshake required")
            if len(wire) + 5 + size > MAX_HELLO:
                raise ValueError("ClientHello too large")
            payload = await reader.readexactly(size)
            wire.extend(header + payload)
            handshake.extend(payload)
            if len(handshake) < 4:
                continue
            size = int.from_bytes(handshake[1:4], "big")
            if handshake[0] != 1 or size > MAX_HELLO - 4:
                raise ValueError("ClientHello required")
            if len(handshake) >= size + 4:
                return server_name(bytes(handshake[4 : size + 4])), bytes(wire)
    raise ValueError("ClientHello too large")


class HomeRegistry:
    def __init__(self, database):
        self.database = Path(database).resolve().as_uri() + "?mode=ro"

    def credential(self, home_id):
        with sqlite3.connect(self.database, uri=True, timeout=1) as db:
            row = db.execute(
                "SELECT credential FROM homes WHERE id=? AND owner IS NOT NULL AND remote_enabled=1",
                (home_id,),
            ).fetchone()
        return row[0] if row else None


class MultiHomeRelay:
    def __init__(self, registry, suffix="home.smarti.dev"):
        self.registry, self.suffix = registry, suffix
        self.connections = {}
        self.credentials = {}
        self.pending = 0

    def home_for_name(self, name):
        home_id, separator, suffix = name.partition(".")
        if not separator or suffix != self.suffix or str(uuid.UUID(home_id)) != home_id:
            raise ValueError("Unknown home hostname")
        return home_id

    def identity(self, request):
        if request.path != "/connector" or request.headers.get_all("origin"):
            return None
        homes = request.headers.get_all("x-smarti-home")
        credentials = request.headers.get_all("authorization")
        if len(homes) != 1 or len(credentials) != 1 or not credentials[0].startswith("Bearer "):
            return None
        try:
            expected = self.registry.credential(homes[0])
        except sqlite3.Error:
            return None
        supplied = hashlib.sha256(credentials[0][7:].encode()).hexdigest()
        if not expected or not secrets.compare_digest(expected, supplied):
            return None
        return homes[0], expected

    def authenticate(self, connection, request):
        if request.path == "/status":
            # Internal Docker endpoint; the public Caddy route always rewrites to /connector.
            active = [
                home
                for home in self.connections
                if self.registry.credential(home) == self.credentials.get(home)
            ]
            return connection.respond(200, json.dumps({"connected": active}))
        identity = self.identity(request)
        if identity is None:
            return connection.respond(403, "Forbidden\n")
        if identity[0] in self.connections:
            return connection.respond(409, "Connector already active\n")

    async def connector(self, websocket):
        identity = self.identity(websocket.request)
        if identity is None or identity[0] in self.connections:
            await websocket.close(1008, "Connector rejected")
            return
        home_id, credential = identity
        tunnel = Tunnel(websocket)
        self.connections[home_id] = tunnel
        self.credentials[home_id] = credential

        async def monitor():
            while True:
                await asyncio.sleep(1)
                try:
                    valid = self.registry.credential(home_id) == credential
                except sqlite3.Error:
                    valid = False
                if not valid:
                    await websocket.close(1008, "Access revoked")
                    return

        watcher = asyncio.create_task(monitor())
        try:
            await tunnel.receive()
        finally:
            watcher.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await watcher
            if self.connections.get(home_id) is tunnel:
                self.connections.pop(home_id)
                self.credentials.pop(home_id, None)

    async def client(self, reader, writer):
        if self.pending >= 64:
            writer.close()
            return
        self.pending += 1
        try:
            name, initial = await read_hello(reader)
            home_id = self.home_for_name(name)
            tunnel = self.connections.get(home_id)
            if tunnel is None or self.registry.credential(home_id) != self.credentials.get(home_id):
                raise ValueError("Home unavailable")
            await tunnel.add(reader, writer, initial_data=initial)
        except (ValueError, UnicodeError, OSError, TimeoutError, asyncio.IncompleteReadError, sqlite3.Error):
            writer.close()
        finally:
            self.pending -= 1


async def main():
    relay = MultiHomeRelay(HomeRegistry(os.environ["CLOUD_DATABASE"]))
    tls = None
    if os.environ.get("RELAY_BEHIND_TLS_PROXY") != "true":
        tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        tls.minimum_version = ssl.TLSVersion.TLSv1_2
        tls.load_cert_chain(os.environ["RELAY_TLS_CERT"], os.environ["RELAY_TLS_KEY"])
    async with serve(
        relay.connector,
        "0.0.0.0",
        int(os.environ.get("RELAY_CONNECTOR_PORT", "9443")),
        ssl=tls,
        process_request=relay.authenticate,
        origins=[None],
        compression=None,
        max_size=CHUNK + 17,
        max_queue=8,
        open_timeout=5,
        close_timeout=3,
    ):
        server = await asyncio.start_server(
            relay.client,
            "0.0.0.0",
            int(os.environ.get("RELAY_PUBLIC_PORT", "8443")),
            limit=MAX_HELLO,
        )
        async with server:
            await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
