"""Backend-only Zigbee2MQTT frontend transport; commands are never replayed."""

import asyncio
import contextlib
import json
from urllib.parse import urlencode, urlsplit, urlunsplit

from websockets.asyncio.client import connect
from websockets.exceptions import WebSocketException

from .ha import HAError


def parse_payload(payload):
    try:
        return json.loads(payload)
    except (ValueError, TypeError):
        return payload if payload in ("online", "offline") else None


class ZigbeeFrontend:
    def __init__(self, setup):
        self.setup = setup
        self.task = None
        self.socket = None
        self.changed = asyncio.Event()
        self.error = "frontend_disconnected"

    async def ensure(self):
        if self.task is None:
            self.task = asyncio.create_task(self.run())
        if not self.changed.is_set():
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(self.changed.wait(), 5)
        if not self.socket:
            raise HAError(self.error)

    async def run(self):
        settings = self.setup.settings
        parts = urlsplit(settings.zigbee2mqtt_server)
        url = urlunsplit(
            (
                "wss" if parts.scheme == "https" else "ws",
                parts.netloc,
                parts.path.rstrip("/") + "/api",
                urlencode({"token": settings.zigbee2mqtt_auth_token})
                if settings.zigbee2mqtt_auth_token
                else "",
                "",
            )
        )
        while True:
            try:
                async with connect(url, proxy=None, open_timeout=4, max_size=16 * 1024 * 1024) as socket:
                    self.socket = socket
                    self.setup.mqtt_online = False
                    self.setup.mqtt_info = {}
                    self.setup.inventory.reset()
                    async for raw in socket:
                        try:
                            message = json.loads(raw)
                        except (ValueError, TypeError):
                            continue
                        if not isinstance(message, dict) or not isinstance(message.get("topic"), str):
                            continue
                        topic = message["topic"]
                        event = {
                            "topic": settings.zigbee2mqtt_base_topic + "/" + topic,
                            "payload": json.dumps(message.get("payload")),
                            # The frontend stream doesn't identify cached device samples.
                            "retain": topic != "bridge/event",
                        }
                        self.setup.mqtt_event(event)
                        self.setup.inventory.event(event)
                        if self.setup.mqtt_info and self.setup.inventory.devices is not None:
                            self.error = ""
                            self.changed.set()
            except (OSError, WebSocketException, TimeoutError, ValueError) as exc:
                code = getattr(getattr(exc, "rcvd", None), "code", None)
                self.error = "frontend_auth_failed" if code == 4401 else "frontend_disconnected"
            finally:
                if not self.error:
                    self.error = "frontend_disconnected"
                self.socket = None
                self.setup.mqtt_online = False
                if self.setup.session and self.setup.session["provider"] == "zigbee2mqtt":
                    self.setup.interrupted()
                for future in self.setup.responses.values():
                    if not future.done():
                        future.set_result(False)
                self.changed.set()
            await asyncio.sleep(3)
            self.changed.clear()

    async def send(self, command, payload):
        if not self.socket:
            raise HAError("frontend_disconnected")
        try:
            await self.socket.send(json.dumps({"topic": f"bridge/request/{command}", "payload": payload}))
        except (OSError, WebSocketException):
            raise HAError("frontend_disconnected") from None

    async def close(self):
        if self.task:
            self.task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self.task
