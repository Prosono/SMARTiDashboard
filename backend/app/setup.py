"""Admin-only radio pairing through HA; never replay a start after interruption."""

import asyncio
import contextlib
import json
import time
import uuid

from fastapi import HTTPException

from .ha import HAError
from .inventory import Inventory
from .radio_status import controller_status
from .zigbee_frontend import ZigbeeFrontend, parse_payload

ACTIVE = {"starting", "searching", "interviewing", "security", "pin", "needs_stop", "stopping"}


class DeviceSetup:
    def __init__(self, ha, settings, store=None):
        self.ha, self.settings, self.store = ha, settings, store
        self.lock = asyncio.Lock()
        self.mqtt_lock = asyncio.Lock()
        self.session = None
        self.subscriptions = []
        self.mqtt_epoch = None
        self.mqtt_online = False
        self.mqtt_info = {}
        self.responses = {}
        self.response_commands = {}
        self.inventory = Inventory(self)
        self.frontend = ZigbeeFrontend(self) if settings.zigbee2mqtt_transport == "frontend" else None
        self.timer = None
        self.zwave_subscription = None
        if store and store.get("pairing_active"):
            saved = json.loads(store.get("pairing_active"))
            self.session = saved | {"status": "needs_stop", "error": "connection_lost", "_finish": False}

    def persist(self):
        if self.store:
            s = self.session
            self.store.set(
                "pairing_active",
                json.dumps(
                    {
                        k: s[k]
                        for k in [
                            "id",
                            "provider",
                            "entry_id",
                            "expires_at",
                            "radio_open",
                            "operation",
                            "device_name",
                            "node_id",
                            "stop_requested",
                        ]
                        if k in s
                    }
                )
                if s and s.get("radio_open")
                else "",
            )

    def snapshot(self):
        if not self.session:
            return None
        return {k: v for k, v in self.session.items() if not k.startswith("_")}

    async def ensure_mqtt(self):
        async with self.mqtt_lock:
            await self._ensure_mqtt()

    async def _ensure_mqtt(self):
        if self.frontend:
            await self.frontend.ensure()
            return
        if not self.ha.connected:
            raise HAError("ha_disconnected")
        if self.mqtt_epoch == self.ha.epoch:
            return
        self.mqtt_online, self.mqtt_info = False, {}
        self.inventory.reset()
        for number in self.subscriptions:
            self.ha.callbacks.pop(number, None)
            with contextlib.suppress(HAError, TimeoutError):
                await self.ha.request("unsubscribe_events", subscription=number)
        self.subscriptions = []
        for suffix in ["state", "info", "event", "response/permit_join", "response/device/remove"]:
            number = await self.ha.request(
                "mqtt/subscribe",
                topic=f"{self.settings.zigbee2mqtt_base_topic}/bridge/{suffix}",
                _callback=self.mqtt_event,
            )
            self.subscriptions.append(number)
        self.subscriptions.append(
            await self.ha.request(
                "mqtt/subscribe",
                topic=f"{self.settings.zigbee2mqtt_base_topic}/bridge/devices",
                _callback=self.inventory.event,
            )
        )
        for _ in range(10):
            if self.inventory.devices is not None:
                break
            await asyncio.sleep(0.1)
        self.subscriptions.append(
            await self.ha.request(
                "mqtt/subscribe",
                topic=f"{self.settings.zigbee2mqtt_base_topic}/#",
                _callback=self.inventory.event,
            )
        )
        self.mqtt_epoch = self.ha.epoch
        # Retained bridge state/info arrive asynchronously after subscription acknowledgement.
        for _ in range(10):
            if self.mqtt_online and self.mqtt_info:
                break
            await asyncio.sleep(0.1)

    def mqtt_event(self, event):
        if event.get("event") == "smarti disconnected":
            self.mqtt_epoch = None
            self.mqtt_online = False
            if self.session and self.session["provider"] == "zigbee2mqtt":
                self.interrupted()
            return
        data = parse_payload(event.get("payload", ""))
        topic = event.get("topic", "")
        prefix = self.settings.zigbee2mqtt_base_topic + "/bridge/"
        if topic not in {
            prefix + part
            for part in ["state", "info", "event", "response/permit_join", "response/device/remove"]
        }:
            return
        if topic.endswith("/bridge/state"):
            self.mqtt_online = data == "online" or isinstance(data, dict) and data.get("state") == "online"
        elif topic.endswith("/bridge/info") and isinstance(data, dict):
            # Never retain or return the complete bridge config (can contain credentials).
            self.mqtt_info = {k: data.get(k) for k in ["version", "permit_join"]}
        elif topic.endswith(
            ("/bridge/response/permit_join", "/bridge/response/device/remove")
        ) and isinstance(data, dict):
            transaction = data.get("transaction")
            if not isinstance(transaction, str):
                return
            future = self.responses.get(transaction)
            if (
                future
                and not future.done()
                and topic == prefix + "response/" + self.response_commands.get(transaction, "")
            ):
                future.set_result(data.get("status") == "ok")
        elif topic.endswith("/bridge/event") and isinstance(data, dict) and not event.get("retain"):
            s = self.session
            if not s or s["provider"] != "zigbee2mqtt" or s["status"] not in ACTIVE:
                return
            detail = data.get("data", {})
            if data.get("type") == "device_joined":
                s["status"] = "interviewing"
            if data.get("type") == "device_interview":
                state = detail.get("status")
                s["status"] = {"started": "interviewing", "successful": "paired", "failed": "failed"}.get(
                    state, s["status"]
                )
                s["device_name"] = str(detail.get("friendly_name") or detail.get("ieee_address") or "")[:120]
                if state in {"successful", "failed"}:
                    self.schedule_stop()

    def interrupted(self):
        if self.session and self.session["status"] in ACTIVE:
            self.session["status"] = "needs_stop"
            self.session["error"] = "connection_lost"
            self.session.pop("dsk", None)
            self.session.pop("grant", None)

    def zwave_callback(self, session_id):
        # Events queued by an old subscription must never mutate a newer session.
        def receive(event):
            if self.session and self.session["id"] == session_id:
                self.zwave_event(event)

        return receive

    def zwave_event(self, event):
        s = self.session
        if not s or s["provider"] != "zwave_js":
            return
        kind = event.get("event")
        if kind == "smarti disconnected":
            self.interrupted()
        elif not s.get("radio_open") or s.get("stop_requested"):
            return
        elif s.get("operation") == "remove":
            if kind == "node removed":
                s["removed_node_id"] = event.get("node", {}).get("node_id")
                s["status"] = "removed" if s["removed_node_id"] == s.get("node_id") else "different_node"
                self.schedule_stop()
            elif kind in {"exclusion failed", "exclusion stopped"} and s["status"] in ACTIVE:
                s["status"] = "failed" if kind == "exclusion failed" else "stopped"
                self.schedule_stop()
        elif s["status"] in ACTIVE:
            if kind == "grant security classes":
                grant = event.get("requested_grant", {})
                classes = grant.get("securityClasses", [])
                if not isinstance(classes, list) or any(c not in [0, 1, 2, 7] for c in classes):
                    s["status"], s["error"] = "needs_stop", "unsupported_security"
                    return
                s["grant"] = {
                    "securityClasses": classes,
                    "clientSideAuth": bool(grant.get("clientSideAuth", False)),
                }
                s["status"] = "security"
            elif kind == "validate dsk and enter pin":
                s["dsk"] = str(event.get("dsk", ""))[:100]
                s["status"] = "pin"
            elif kind in {"node found", "node added", "interview started"}:
                s["status"] = "interviewing"
                if kind == "node added":
                    s["low_security"] = bool(event.get("node", {}).get("low_security"))
            elif kind == "interview completed":
                s["status"] = "paired"
                self.schedule_stop()
            elif kind in {"inclusion failed", "interview failed"}:
                s["status"], s["error"] = "failed", "pairing_failed"
                self.schedule_stop()
            elif kind == "inclusion stopped" and s["status"] in {"starting", "searching"}:
                s["status"], s["_finish"] = "stopped", True
            # device registered is not sufficient proof of a completed interview.

    def schedule_stop(self):
        if self.session:
            self.session["_finish"] = True

    async def providers(self):
        if self.settings.mode == "demo":
            return [
                {"id": p, "status": "demo", "entries": [], "reason": "demo_no_radio"}
                for p in ["zigbee2mqtt", "zwave_js"]
            ]
        if not self.ha.connected and not self.frontend:
            return [
                {"id": p, "status": "unavailable", "entries": [], "reason": "ha_disconnected"}
                for p in ["zigbee2mqtt", "zwave_js"]
            ]
        result = []
        try:
            await self.ensure_mqtt()
            ready = self.mqtt_online and bool(self.mqtt_info)
            result.append(
                {
                    "id": "zigbee2mqtt",
                    "status": "ready" if ready else "unavailable",
                    "entries": [],
                    "reason": "" if ready else "mqtt_bridge_unavailable",
                    "transport": self.settings.zigbee2mqtt_transport,
                }
            )
        except (HAError, TimeoutError):
            result.append(
                {
                    "id": "zigbee2mqtt",
                    "status": "unavailable",
                    "entries": [],
                    "reason": self.frontend.error if self.frontend else "mqtt_api_unavailable",
                    "transport": self.settings.zigbee2mqtt_transport,
                }
            )
        try:
            if not self.ha.connected:
                raise HAError("ha_disconnected")
            entries = await self.ha.request("config_entries/get", domain="zwave_js")
            entries = [
                {"id": e["entry_id"], "name": e.get("title", "Z-Wave JS")}
                for e in entries
                if e.get("domain") == "zwave_js" and e.get("state") == "loaded" and not e.get("disabled_by")
            ]
            result.append(
                {
                    "id": "zwave_js",
                    "status": "ready" if entries else "unavailable",
                    "entries": entries,
                    "reason": "" if entries else "zwave_not_configured",
                }
            )
        except (HAError, TimeoutError):
            result.append(
                {"id": "zwave_js", "status": "unavailable", "entries": [], "reason": "zwave_api_unavailable"}
            )
        return result

    async def zigbee_status(self):
        error = "demo_no_radio" if self.settings.mode == "demo" else ""
        if not error:
            try:
                await self.ensure_mqtt()
            except (HAError, TimeoutError):
                error = self.frontend.error if self.frontend else "mqtt_api_unavailable"
        return {
            "transport": self.settings.zigbee2mqtt_transport,
            "online": self.mqtt_online,
            "info_received": bool(self.mqtt_info),
            "devices_received": self.inventory.devices is not None,
            "device_count": len(self.inventory.devices or {}),
            "version": self.mqtt_info.get("version"),
            "permit_join": self.mqtt_info.get("permit_join"),
            "error": error,
        }

    async def mqtt_command(self, command, payload, timeout=8):
        transaction = str(uuid.uuid4())
        future = asyncio.get_running_loop().create_future()
        self.responses[transaction] = future
        self.response_commands[transaction] = command
        try:
            if self.frontend:
                await self.frontend.send(command, payload | {"transaction": transaction})
            else:
                await self.ha.request(
                    "call_service",
                    domain="mqtt",
                    service="publish",
                    service_data={
                        "topic": f"{self.settings.zigbee2mqtt_base_topic}/bridge/request/{command}",
                        "payload": json.dumps(payload | {"transaction": transaction}),
                        "qos": 0,
                        "retain": False,
                    },
                )
            if not await asyncio.wait_for(future, timeout):
                raise HAError("permit_rejected")
        finally:
            self.responses.pop(transaction, None)
            self.response_commands.pop(transaction, None)

    async def permit(self, seconds):
        await self.mqtt_command("permit_join", {"time": seconds})

    async def remove(self, provider, device_id, user_id):
        async with self.lock:
            await self.reconcile_stop()
            if self.session and (self.session["status"] in ACTIVE or self.session.get("radio_open")):
                raise HTTPException(409, "pairing_already_active")
            device = await self.inventory.require(provider, device_id)
            if provider == "zigbee2mqtt":
                if self.mqtt_info.get("permit_join"):
                    raise HTTPException(409, "controller_busy")
                try:
                    await self.mqtt_command(
                        "device/remove", {"id": device["id"], "force": False, "block": False}, 30
                    )
                except (HAError, TimeoutError):
                    raise HTTPException(503, "removal_unconfirmed")
                return {"status": "removed", "device_name": device["name"]}
            entry_id = device["entry_id"]
            network = await self.ha.request("zwave_js/network_status", entry_id=entry_id)
            self.require_ready(network)
            self.session = {
                "id": str(uuid.uuid4()),
                "provider": provider,
                "operation": "remove",
                "entry_id": entry_id,
                "node_id": device["node_id"],
                "device_name": device["name"],
                "status": "starting",
                "expires_at": time.time() + 120,
                "radio_open": True,
                "_user_id": user_id,
                "_finish": False,
            }
            self.persist()
            self.timer = asyncio.create_task(self.watch(self.session["id"]))
            try:
                self.zwave_subscription = await self.ha.request(
                    "zwave_js/remove_node",
                    entry_id=entry_id,
                    strategy=2,
                    _callback=self.zwave_callback(self.session["id"]),
                )
                if self.session["status"] == "starting":
                    self.session["status"] = "searching"
            except (HAError, TimeoutError):
                self.session["status"], self.session["error"] = "needs_stop", "start_unconfirmed"
            return self.snapshot()

    async def start(self, provider, entry_id, user_id):
        async with self.lock:
            await self.reconcile_stop()
            if self.session and (self.session["status"] in ACTIVE or self.session.get("radio_open")):
                raise HTTPException(409, "pairing_already_active")
            options = await self.providers()
            option = next((p for p in options if p["id"] == provider and p["status"] == "ready"), None)
            if option is None:
                raise HTTPException(409, "pairing_provider_unavailable")
            if provider == "zwave_js":
                if entry_id not in [e["id"] for e in option["entries"]]:
                    raise HTTPException(422, "invalid_entry")
                network = await self.ha.request("zwave_js/network_status", entry_id=entry_id)
                self.require_ready(network)
            elif self.mqtt_info.get("permit_join"):
                raise HTTPException(409, "controller_busy")
            self.session = {
                "id": str(uuid.uuid4()),
                "provider": provider,
                "entry_id": entry_id,
                "status": "starting",
                "expires_at": time.time() + 120,
                "radio_open": True,
                "_user_id": user_id,
                "_finish": False,
            }
            self.persist()
            self.timer = asyncio.create_task(self.watch(self.session["id"]))
            try:
                if provider == "zigbee2mqtt":
                    await self.permit(120)
                else:
                    self.zwave_subscription = await self.ha.request(
                        "zwave_js/add_node",
                        entry_id=entry_id,
                        inclusion_strategy=0,
                        _callback=self.zwave_callback(self.session["id"]),
                    )
                if self.session["status"] == "starting":
                    self.session["status"] = "searching"
            except (HAError, TimeoutError):
                self.session["status"], self.session["error"] = "needs_stop", "start_unconfirmed"
            return self.snapshot()

    def require_ready(self, network):
        state = controller_status(network)
        if not state["connected"]:
            raise HTTPException(409, "controller_disconnected")
        if state["state"] == "unknown":
            raise HTTPException(409, "controller_state_unknown")
        if not state["ready"]:
            raise HTTPException(409, "controller_busy")

    async def controllers(self):
        if self.settings.mode == "demo" or not self.ha.connected:
            return []
        entries = await self.ha.request("config_entries/get", domain="zwave_js")
        result = []
        for entry in entries:
            if entry.get("domain") != "zwave_js" or entry.get("disabled_by"):
                continue
            state = controller_status({})
            if entry.get("state") == "loaded":
                with contextlib.suppress(HAError, TimeoutError):
                    state = controller_status(
                        await self.ha.request("zwave_js/network_status", entry_id=entry["entry_id"])
                    )
            result.append(state | {"id": entry["entry_id"], "name": entry.get("title", "Z-Wave JS")})
        return result

    async def recover_controller(self, entry_id, user_id):
        # Explicit user action: stop an inclusion/exclusion even if SMARTi lost
        # ownership across an app update. Never reset the controller or replay start.
        async with self.lock:
            controllers = await self.controllers()
            controller = next((c for c in controllers if c["id"] == entry_id), None)
            if not controller or not controller["connected"]:
                raise HTTPException(409, "controller_disconnected")
            if controller["state"] == "unknown":
                raise HTTPException(409, "controller_state_unknown")
            s = self.session
            if s and s.get("radio_open") and (s["provider"] != "zwave_js" or s["entry_id"] != entry_id):
                raise HTTPException(409, "pairing_already_active")
            if controller["ready"]:
                if s and s.get("radio_open"):
                    await self.finish_stop(s)
                return controller
            self.session = {
                "id": str(uuid.uuid4()),
                "provider": "zwave_js",
                "entry_id": entry_id,
                "operation": "remove" if controller["state"] == "excluding" else "pair",
                "status": "needs_stop",
                "radio_open": True,
                "stop_requested": True,
                "expires_at": time.time(),
                "_user_id": user_id,
                # Attempt S2 cancellation for an interrupted inclusion too.
                "grant": {} if controller["state"] != "excluding" else None,
            }
            self.persist()
            session_id = self.session["id"]
        await self.stop(session_id)
        return next(c for c in await self.controllers() if c["id"] == entry_id)

    async def zwave_idle(self, s):
        if not self.ha.connected:
            return False
        network = await self.ha.request("zwave_js/network_status", entry_id=s["entry_id"])
        return controller_status(network)["ready"]

    async def finish_stop(self, s):
        s["radio_open"] = False
        if s["status"] in ACTIVE:
            s["status"] = "stopped"
        for key in ["error", "dsk", "grant"]:
            s.pop(key, None)
        self.persist()
        if self.zwave_subscription is not None:
            number = self.zwave_subscription
            self.zwave_subscription = None
            self.ha.callbacks.pop(number, None)
            with contextlib.suppress(HAError, TimeoutError):
                await self.ha.request("unsubscribe_events", subscription=number)

    async def reconcile_stop(self):
        """Read-only reconciliation under lock; never restart or abort another operation."""
        s = self.session
        if (
            not s
            or s["provider"] != "zwave_js"
            or not s.get("radio_open")
            or not (s.get("stop_requested") or s["status"] == "needs_stop" or s.get("_finish"))
        ):
            return
        with contextlib.suppress(HAError, TimeoutError):
            if await self.zwave_idle(s):
                await self.finish_stop(s)

    async def status(self):
        async with self.lock:
            await self.reconcile_stop()
            return self.snapshot()

    async def stop(self, session_id):
        async with self.lock:
            s = self.require(session_id)
            if not s.get("radio_open"):
                return self.snapshot()
            cancel_s2 = s.get("operation") != "remove" and (
                s["status"] in {"pin", "security"} or "dsk" in s or "grant" in s
            )
            s["stop_requested"] = True
            if s["status"] in ACTIVE:
                s["status"] = "stopping"
            self.persist()
            try:
                if not self.ha.connected and not (s["provider"] == "zigbee2mqtt" and self.frontend):
                    raise HAError("disconnected")
                if s["provider"] == "zigbee2mqtt":
                    await self.ensure_mqtt()
                    await self.permit(0)
                else:
                    # Cancellation may race with completion of secure bootstrap.
                    # Its rejection must not prevent stopping inclusion itself.
                    if cancel_s2:
                        with contextlib.suppress(HAError, TimeoutError):
                            await self.ha.request(
                                "zwave_js/cancel_secure_bootstrap_s2", entry_id=s["entry_id"]
                            )
                    with contextlib.suppress(HAError, TimeoutError):
                        await self.ha.request(
                            "zwave_js/stop_exclusion"
                            if s.get("operation") == "remove"
                            else "zwave_js/stop_inclusion",
                            entry_id=s["entry_id"],
                        )
                    # HA's cached controller state can lag the command response.
                    # Poll reads only; do not replay radio commands.
                    async with asyncio.timeout(5):
                        while not await self.zwave_idle(s):
                            await asyncio.sleep(0.25)
                await self.finish_stop(s)
            except (HAError, TimeoutError):
                s["status"], s["error"] = "needs_stop", "stop_unconfirmed"
            self.persist()
            return self.snapshot()

    def require(self, session_id):
        if not self.session or self.session["id"] != session_id:
            raise HTTPException(404, "pairing_not_found")
        return self.session

    async def answer(self, session_id, action, pin):
        async with self.lock:
            s = self.require(session_id)
            if not self.ha.connected or time.time() >= s["expires_at"]:
                raise HTTPException(409, "pairing_expired")
            try:
                if action == "grant" and s["status"] == "security":
                    grant = s["grant"]
                    await self.ha.request("zwave_js/grant_security_classes", entry_id=s["entry_id"], **grant)
                    if s["status"] == "security":
                        s["status"] = "interviewing"
                    s.pop("grant", None)
                elif action == "pin" and s["status"] == "pin" and pin is not None:
                    await self.ha.request(
                        "zwave_js/validate_dsk_and_enter_pin", entry_id=s["entry_id"], pin=pin
                    )
                    if s["status"] == "pin":
                        s["status"] = "interviewing"
                    s.pop("dsk", None)
                else:
                    raise HTTPException(409, "unexpected_pairing_step")
            except (HAError, TimeoutError):
                s["status"], s["error"] = "needs_stop", "answer_unconfirmed"
            return self.snapshot()

    async def watch(self, session_id):
        while self.session and self.session["id"] == session_id:
            await asyncio.sleep(0.5)
            s = self.session
            if not s or s["id"] != session_id:
                return
            if s.get("_finish") or time.time() >= s["expires_at"]:
                await self.stop(session_id)
                return
            if not s["radio_open"]:
                return

    async def close(self):
        if self.timer:
            self.timer.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self.timer
        if self.session and self.session.get("radio_open"):
            await self.stop(self.session["id"])

        if self.frontend:
            await self.frontend.close()
