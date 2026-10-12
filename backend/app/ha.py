"""Single-owner HA websocket. No command retries, no persisted control queue."""

import asyncio
import contextlib
import json
import re
import random
from datetime import UTC, datetime

import httpx
import websockets

from .models import normalize

REGISTRY_OPERATIONS = {
    "areas": "config/area_registry/list",
    "devices": "config/device_registry/list",
    "entities": "config/entity_registry/list",
}
REGISTRY_EVENTS = {"area_registry_updated", "device_registry_updated", "entity_registry_updated"}


class HAError(Exception):
    pass


class HomeAssistant:
    def __init__(self, url, token):
        self.url = (
            url.rstrip("/").replace("https://", "wss://").replace("http://", "ws://") + "/api/websocket"
        )
        self.http_url = url.rstrip("/") + "/api/"
        self.token = token
        self.ws = None
        self.pending = {}
        self.callbacks = {}
        self.epoch = 0
        self.next_id = 0
        self.states, self.entities, self.devices, self.areas = {}, {}, {}, {}
        self.connected = False
        self.error = "not_connected"
        self.version = None
        self.revision = 0
        self.registry_generation = 0
        self.syncing = False
        self.buffer = []
        self.refresh_task = None
        self.last_sync = None

    def changed(self):
        self.revision += 1

    def controls(self):
        return normalize(self.states, self.entities, self.devices)

    async def request(self, kind, _callback=None, **data):
        if self.ws is None:
            raise HAError("disconnected")
        self.next_id += 1
        number = self.next_id
        future = asyncio.get_running_loop().create_future()
        self.pending[number] = future
        if _callback:
            self.callbacks[number] = _callback
        try:
            await self.ws.send(json.dumps({"id": number, "type": kind, **data}))
            result = await asyncio.wait_for(future, 12)
            if _callback and result is False:
                raise HAError("ha_request_rejected")
            return number if _callback else result
        except BaseException:
            self.callbacks.pop(number, None)
            raise
        finally:
            self.pending.pop(number, None)

    async def rest(self, method, path, data=None):
        """Paths are built by dedicated backend handlers, never a browser-supplied proxy URL."""
        if not self.connected:
            raise HAError("disconnected")
        try:
            async with httpx.AsyncClient(timeout=30, follow_redirects=False, trust_env=False) as client:
                response = await client.request(
                    method, self.http_url + path, headers={"Authorization": "Bearer " + self.token}, json=data
                )
            if response.status_code == 404:
                from fastapi import HTTPException

                raise HTTPException(404, "ha_config_not_editable")
            if not response.is_success:
                raise HAError("ha_request_rejected")
            return response.json() if response.content else None
        except (httpx.HTTPError, ValueError):
            raise HAError("ha_request_unconfirmed") from None

    async def brand_image(self, domain):
        """Fetch a bounded PNG from the configured HA only; no token reaches the browser."""
        if not re.fullmatch(r"[a-z0-9_]{1,100}", domain):
            raise HAError("brand_unavailable")
        try:
            async with httpx.AsyncClient(timeout=10, follow_redirects=False, trust_env=False) as client:
                async with client.stream(
                    "GET",
                    self.http_url + f"brands/integration/{domain}/icon.png?placeholder=no",
                    headers={"Authorization": "Bearer " + self.token},
                ) as response:
                    if response.status_code != 200:
                        raise HAError("brand_unavailable")
                    data = bytearray()
                    async for chunk in response.aiter_bytes():
                        data.extend(chunk)
                        if len(data) > 2_000_000:
                            raise HAError("brand_unavailable")
            if not data.startswith(b"\x89PNG\r\n\x1a\n"):
                raise HAError("brand_unavailable")
            return bytes(data)
        except httpx.HTTPError:
            raise HAError("brand_unavailable") from None

    def apply_state(self, data):
        entity_id, state = data["entity_id"], data.get("new_state")
        current = self.states.get(entity_id)

        def timestamp(value):
            try:
                return datetime.fromisoformat(value).timestamp()
            except (TypeError, ValueError):
                return float("-inf")

        current_time = timestamp((current or {}).get("last_updated"))
        if state is None:
            # A buffered removal must not erase a later recreated snapshot state.
            removed_at = data.get("event_time") or (data.get("old_state") or {}).get("last_updated")
            if not current or timestamp(removed_at) >= current_time:
                self.states.pop(entity_id, None)
        elif not current or timestamp(state.get("last_updated")) >= current_time:
            self.states[entity_id] = state
        self.changed()

    async def receive(self):
        async for raw in self.ws:
            msg = json.loads(raw)
            if msg.get("type") == "result":
                future = self.pending.get(msg["id"])
                if future and not future.done():
                    if msg.get("success"):
                        future.set_result(msg.get("result"))
                    else:
                        future.set_exception(HAError("ha_request_rejected"))
            elif msg.get("type") == "event":
                event = msg["event"]
                callback = self.callbacks.get(msg.get("id"))
                if callback:
                    callback(event)
                    continue
                if event.get("event_type") == "state_changed":
                    event["data"]["event_time"] = event.get("time_fired")
                    if self.syncing:
                        self.buffer.append(event["data"])
                    else:
                        self.apply_state(event["data"])
                elif event.get("event_type") in REGISTRY_EVENTS:
                    self.registry_generation += 1
                    if not self.syncing and (not self.refresh_task or self.refresh_task.done()):
                        self.refresh_task = asyncio.create_task(self.refresh_registries())
        raise HAError("disconnected")

    async def registries(self):
        while True:
            generation = self.registry_generation
            areas, devices, entities = await asyncio.gather(
                *(self.request(op) for op in REGISTRY_OPERATIONS.values())
            )
            if generation == self.registry_generation:
                self.areas = {v["area_id"]: v for v in areas}
                self.devices = {v["id"]: v for v in devices}
                self.entities = {v["entity_id"]: v for v in entities}
                self.changed()
                return

    async def refresh_registries(self):
        try:
            await self.registries()
        except Exception:
            # Registry failure invalidates the whole connection; retain prior cache.
            await self.ws.close()

    async def synchronize(self):
        self.syncing = True
        self.buffer = []
        for event in ["state_changed", *sorted(REGISTRY_EVENTS)]:
            await self.request("subscribe_events", event_type=event)
        states = await self.request("get_states")
        await self.registries()
        self.states = {s["entity_id"]: s for s in states}
        for event in self.buffer:
            self.apply_state(event)
        self.buffer = []
        self.syncing = False
        self.connected = True
        self.error = None
        self.last_sync = datetime.now(UTC).isoformat()
        self.changed()

    async def run(self):
        backoff = 1
        while True:
            reader = None
            try:
                if not self.token or not self.url.startswith(("ws://", "wss://")):
                    self.error = "configuration_required"
                    await asyncio.sleep(30)
                    continue
                async with websockets.connect(
                    self.url, open_timeout=10, ping_interval=20, ping_timeout=20, max_size=16 * 1024 * 1024
                ) as ws:
                    self.ws = ws
                    hello = json.loads(await asyncio.wait_for(ws.recv(), 10))
                    if hello.get("type") != "auth_required":
                        raise HAError("unexpected_handshake")
                    await ws.send(json.dumps({"type": "auth", "access_token": self.token}))
                    auth = json.loads(await asyncio.wait_for(ws.recv(), 10))
                    if auth.get("type") != "auth_ok":
                        raise HAError("authentication_rejected")
                    self.epoch += 1
                    self.version = auth.get("ha_version")
                    reader = asyncio.create_task(self.receive())
                    await self.synchronize()
                    backoff = 1
                    await reader
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                self.error = str(exc) if isinstance(exc, HAError) else "connection_lost"
            finally:
                self.connected = False
                self.ws = None
                for callback in list(self.callbacks.values()):
                    callback({"event": "smarti disconnected"})
                self.callbacks.clear()
                for task in (reader, self.refresh_task):
                    if task:
                        task.cancel()
                        with contextlib.suppress(asyncio.CancelledError, Exception):
                            await task
                for future in self.pending.values():
                    if not future.done():
                        future.set_exception(HAError("disconnected"))
                self.changed()
            await asyncio.sleep(backoff + random.random())
            backoff = min(backoff * 2, 30)

    async def command(self, entity_id, action, value=None):
        if not self.connected:
            raise HAError("disconnected")
        domain = entity_id.split(".")[0]
        data = {}
        service = action
        if action == "set_brightness":
            service, data = "turn_on", {"brightness_pct": value}
        elif action == "set_temperature":
            data = {"temperature": value}
        response = await self.request(
            "call_service", domain=domain, service=service, target={"entity_id": entity_id}, service_data=data
        )
        context_id = (response or {}).get("context", {}).get("id")
        # Observe HA confirmation, never claim physical execution based on acknowledgment.
        for _ in range(30):
            state = self.states.get(entity_id, {})
            if context_id and state.get("context", {}).get("id") == context_id:
                return {"status": "state_updated", "physical_execution_verified": False}
            if not self.connected:
                break
            await asyncio.sleep(0.1)
        return {"status": "accepted_unconfirmed", "physical_execution_verified": False}
