"""Optional outbound remote runtime, sharing the hub's existing HA connection."""

import asyncio
import contextlib
import logging
import random
import socket
import ssl

import httpx
import uvicorn
from websockets.exceptions import WebSocketException

from .certificate_hook import read_identity
from .certificates import Certificates
from .connector import connect_once
from .remote_access import CLOUD_ORIGIN

log = logging.getLogger(__name__)
CONNECTOR_URL = "wss://home.smarti.dev/relay/connect"


class RemoteServer(uvicorn.Server):
    @contextlib.contextmanager
    def capture_signals(self):
        # The primary ingress server owns process signal handlers.
        yield


async def serve_home(settings, adapter, certificates, state):
    from .main import create_app

    remote = settings.model_copy(
        update={
            "ingress": False,
            "development": False,
            "auto_local_origins": False,
            "origin": "https://" + certificates.hostname,
            "additional_origins": [],
            "mobile_enabled": False,
            "bootstrap_secret": "",
            "remote_identity_file": None,
        }
    )
    app = create_app(remote, adapter, remote_surface=True)
    config = uvicorn.Config(
        app,
        host="127.0.0.1",
        port=0,
        proxy_headers=False,
        access_log=False,
        lifespan="off",
        ssl_certfile=str(certificates.cert),
        ssl_keyfile=str(certificates.key),
        limit_concurrency=32,
        timeout_keep_alive=5,
    )
    config.load()
    server = RemoteServer(config)
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.bind(("127.0.0.1", 0))
    listener.listen(32)
    target = listener.getsockname()
    task = asyncio.create_task(server.serve(sockets=[listener]))
    home, credential = read_identity(settings.remote_identity_file)

    async def renew():
        delay = 12 * 3600
        while True:
            await asyncio.sleep(delay + random.uniform(0, 300))
            try:
                await certificates.ensure()
                config.ssl.load_cert_chain(certificates.cert, certificates.key)
                delay = 12 * 3600
            except (OSError, RuntimeError, TimeoutError, ssl.SSLError):
                log.warning("Remote certificate renewal failed; will retry")
                delay = 3600

    renewal = None
    try:
        async with asyncio.timeout(10):
            while not server.started:
                if task.done():
                    await task
                    raise RuntimeError("Remote listener stopped")
                await asyncio.sleep(0.05)
        renewal = asyncio.create_task(renew())
        delay = 1
        while not task.done():
            state.update(ready=True, url=remote.origin)
            started = asyncio.get_running_loop().time()
            try:
                # TLS is terminated by the listener above; relay carries opaque bytes.
                await connect_once(CONNECTOR_URL, home, credential, target, ssl.create_default_context())
            except (OSError, TimeoutError, WebSocketException):
                pass
            if asyncio.get_running_loop().time() - started > 30:
                delay = 1
            await asyncio.sleep(delay + random.random())
            delay = min(delay * 2, 30)
    finally:
        state["ready"] = False
        if renewal:
            renewal.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await renewal
        server.should_exit = True
        try:
            await asyncio.wait_for(task, 10)
        except (TimeoutError, asyncio.CancelledError):
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
        listener.close()
        await app.state.wireless.close()
        await app.state.setup.close()


async def run_remote(settings, adapter, state):
    while True:
        try:
            home, credential = read_identity(settings.remote_identity_file)
            async with httpx.AsyncClient(timeout=10, trust_env=False, follow_redirects=False) as client:
                response = await client.get(
                    f"{CLOUD_ORIGIN}/api/hubs/{home}/status",
                    headers={"Authorization": "Bearer " + credential},
                )
                response.raise_for_status()
                result = response.json()
            if result.get("linked") is True and result.get("remote_enabled") is True:
                certificates = Certificates(
                    settings.remote_identity_file, settings.data_dir / "remote-certificates"
                )
                await certificates.ensure()
                await serve_home(settings, adapter, certificates, state)
        except (OSError, ValueError, RuntimeError, TimeoutError, httpx.HTTPError):
            state["ready"] = False
            log.warning("Remote access unavailable; local access remains active")
        await asyncio.sleep(60 + random.random() * 10)
