"""Admin-only radio pairing through HA; never replay a start after interruption."""

import asyncio
import contextlib
import json
import time
import uuid

from fastapi import HTTPException

from .ha import HAError

ACTIVE = {"starting", "searching", "interviewing", "security", "pin", "needs_stop"}


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
                json.dumps({k: s[k] for k in ["id", "provider", "entry_id", "expires_at", "radio_open"]})
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
        if self.mqtt_epoch == self.ha.epoch:
            return
        self.mqtt_online, self.mqtt_info = False, {}
        for number in self.subscriptions:
            self.ha.callbacks.pop(number, None)
            with contextlib.suppress(HAError, TimeoutError):
                await self.ha.request("unsubscribe_events", subscription=number)
        self.subscriptions = []
        for suffix in ["state", "info", "event", "response/permit_join"]:
            number = await self.ha.request(
                "mqtt/subscribe",
                topic=f"{self.settings.zigbee2mqtt_base_topic}/bridge/{suffix}",
                _callback=self.mqtt_event,
            )
            self.subscriptions.append(number)
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
            self.interrupted()
            return
        try:
            data = json.loads(event.get("payload", ""))
        except (TypeError, ValueError):
            return
        topic = event.get("topic", "")
        if topic.endswith("/bridge/state"):
            self.mqtt_online = data == "online" or isinstance(data, dict) and data.get("state") == "online"
        elif topic.endswith("/bridge/info") and isinstance(data, dict):
            # Never retain or return the complete bridge config (can contain credentials).
            self.mqtt_info = {k: data.get(k) for k in ["version", "permit_join"]}
        elif topic.endswith("/bridge/response/permit_join") and isinstance(data, dict):
            future = self.responses.get(data.get("transaction"))
            if future and not future.done():
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

    def zwave_event(self, event):
        s = self.session
        if not s or s["provider"] != "zwave_js":
            return
        kind = event.get("event")
        if kind == "smarti disconnected":
            self.interrupted()
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
        if not self.ha.connected:
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
                }
            )
        except (HAError, TimeoutError):
            result.append(
                {
                    "id": "zigbee2mqtt",
                    "status": "unavailable",
                    "entries": [],
                    "reason": "mqtt_api_unavailable",
                }
            )
        try:
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

    async def permit(self, seconds):
        transaction = str(uuid.uuid4())
        future = asyncio.get_running_loop().create_future()
        self.responses[transaction] = future
        try:
            await self.ha.request(
                "call_service",
                domain="mqtt",
                service="publish",
                service_data={
                    "topic": f"{self.settings.zigbee2mqtt_base_topic}/bridge/request/permit_join",
                    "payload": json.dumps({"time": seconds, "transaction": transaction}),
                    "qos": 0,
                    "retain": False,
                },
            )
            if not await asyncio.wait_for(future, 8):
                raise HAError("permit_rejected")
        finally:
            self.responses.pop(transaction, None)

    async def start(self, provider, entry_id, user_id):
        async with self.lock:
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
                if network.get("client", {}).get("state") != "connected" or network.get("controller", {}).get(
                    "inclusion_state"
                ) not in [0, 4]:
                    raise HTTPException(409, "controller_busy")
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
                        _callback=self.zwave_event,
                    )
                if self.session["status"] == "starting":
                    self.session["status"] = "searching"
            except (HAError, TimeoutError):
                self.session["status"], self.session["error"] = "needs_stop", "start_unconfirmed"
            return self.snapshot()

    async def stop(self, session_id):
        async with self.lock:
            s = self.require(session_id)
            if not s.get("radio_open"):
                return self.snapshot()
            try:
                if not self.ha.connected:
                    raise HAError("disconnected")
                if s["provider"] == "zigbee2mqtt":
                    await self.ensure_mqtt()
                    await self.permit(0)
                else:
                    if s["status"] in {"pin", "security"}:
                        await self.ha.request("zwave_js/cancel_secure_bootstrap_s2", entry_id=s["entry_id"])
                    await self.ha.request("zwave_js/stop_inclusion", entry_id=s["entry_id"])
                    network = await self.ha.request("zwave_js/network_status", entry_id=s["entry_id"])
                    if network.get("controller", {}).get("inclusion_state") not in [0, 4]:
                        raise HAError("stop_unconfirmed")
                s["radio_open"] = False
                if s["status"] in ACTIVE:
                    s["status"] = "stopped"
                s.pop("error", None)
                s.pop("dsk", None)
                s.pop("grant", None)
                if self.zwave_subscription is not None:
                    number = self.zwave_subscription
                    self.zwave_subscription = None
                    self.ha.callbacks.pop(number, None)
                    with contextlib.suppress(HAError, TimeoutError):
                        await self.ha.request("unsubscribe_events", subscription=number)
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
