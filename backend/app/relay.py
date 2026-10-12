"""Single-home pilot relay. Inner TLS terminates at home, never on this server."""

import asyncio
import os
import secrets
import ssl
from pathlib import Path

from websockets.asyncio.server import serve

from .tunnel import CHUNK, Tunnel


class Relay:
    def __init__(self, home_id, token):
        if len(token) < 32 or not home_id:
            raise ValueError("A provisioned home ID and random connector token are required")
        self.home_id, self.token = home_id, token
        self.tunnel = None

    def authenticate(self, connection, request):
        if (
            request.path != "/connector"
            or request.headers.get("origin") is not None
            or request.headers.get("x-smarti-home") != self.home_id
            or not secrets.compare_digest(request.headers.get("authorization", ""), "Bearer " + self.token)
        ):
            return connection.respond(403, "Forbidden\n")

    async def connector(self, websocket):
        if self.tunnel is not None:
            await websocket.close(1008, "Connector already active")
            return
        tunnel = Tunnel(websocket)
        self.tunnel = tunnel
        try:
            await tunnel.receive()
        finally:
            self.tunnel = None

    async def client(self, reader, writer):
        tunnel = self.tunnel
        if tunnel is None:
            writer.close()
            return
        try:
            await tunnel.add(reader, writer)
        except Exception:
            writer.close()


async def main():
    relay = Relay(
        (os.environ.get("RELAY_HOME_ID") or Path(os.environ["RELAY_HOME_ID_FILE"]).read_text().strip()),
        Path(os.environ["RELAY_TOKEN_FILE"]).read_text().strip(),
    )
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
        # Deliberately no ssl= here: raw TLS bytes are forwarded to the home listener.
        server = await asyncio.start_server(
            relay.client, "0.0.0.0", int(os.environ.get("RELAY_PUBLIC_PORT", "8443"))
        )
        async with server:
            await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
