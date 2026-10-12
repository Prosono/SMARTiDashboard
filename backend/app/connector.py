"""Outbound-only home connector. Its destination is fixed by installer configuration."""

import asyncio
import os
import random
import ssl
from pathlib import Path
from urllib.parse import urlparse

from websockets.asyncio.client import connect
from websockets.exceptions import WebSocketException

from .tunnel import CHUNK, Tunnel


async def connect_once(url, home_id, token, target, tls):
    if urlparse(url).scheme != "wss" or len(token) < 32:
        raise ValueError("Connector requires verified WSS and a provisioned token")
    async with connect(
        url,
        ssl=tls,
        proxy=None,
        compression=None,
        max_size=CHUNK + 17,
        max_queue=8,
        open_timeout=10,
        close_timeout=3,
        additional_headers={"Authorization": "Bearer " + token, "X-SMARTi-Home": home_id},
    ) as ws:
        await Tunnel(ws, target).receive()


async def main():
    url = os.environ["CONNECTOR_URL"]
    if urlparse(url).scheme != "wss":
        raise SystemExit("CONNECTOR_URL must use wss://")
    home_id = (
        os.environ.get("CONNECTOR_HOME_ID") or Path(os.environ["CONNECTOR_HOME_ID_FILE"]).read_text().strip()
    )
    token = Path(os.environ["CONNECTOR_TOKEN_FILE"]).read_text().strip()
    if len(token) < 32:
        raise SystemExit("Connector token must contain at least 32 random characters")
    tls = ssl.create_default_context(cafile=os.environ.get("CONNECTOR_CA_FILE"))
    target = (
        os.environ.get("CONNECTOR_TARGET_HOST", "127.0.0.1"),
        int(os.environ.get("CONNECTOR_TARGET_PORT", "8444")),
    )
    delay = 1
    while True:
        try:
            await connect_once(url, home_id, token, target, tls)
        except (OSError, TimeoutError, WebSocketException):
            # Never log headers, token values, or forward/queue prior commands.
            pass
        await asyncio.sleep(delay + random.random())
        delay = min(delay * 2, 30)


if __name__ == "__main__":
    asyncio.run(main())
