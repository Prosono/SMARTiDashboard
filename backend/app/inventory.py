"""Physical radio inventory. Only retain public diagnostics from MQTT payloads."""

import base64
import hashlib
import re
import time
from urllib.parse import quote

from fastapi import HTTPException

from .ha import HAError
from .radio_status import controller_status
from .zigbee_frontend import parse_payload


class Inventory:
    def __init__(self, setup):
        self.setup = setup
        self.devices = None
        self.telemetry = {}
        self.pending = {}
        self.revision = 0

    def changed(self):
        self.revision += 1

    def reset(self):
        self.devices = None
        self.telemetry.clear()
        self.pending.clear()
        self.changed()

    def event(self, event):
        base = self.setup.settings.zigbee2mqtt_base_topic + "/"
        topic = event.get("topic", "")
        if not topic.startswith(base):
            return
        topic = topic[len(base) :]
        data = parse_payload(event.get("payload", ""))
        if topic == "bridge/devices" and isinstance(data, list):
            self.devices = {
                d["ieee_address"]: {
                    "id": d["ieee_address"],
                    "name": d.get("friendly_name") or d["ieee_address"],
                    "model": (d.get("definition") or {}).get("model") or d.get("model_id"),
                    "manufacturer": (d.get("definition") or {}).get("vendor"),
                    "controller": d.get("type") == "Coordinator",
                    "disabled": bool(d.get("disabled")),
                    "description": (d.get("definition") or {}).get("description"),
                    "image_model": (d.get("definition") or {}).get("model"),
                    "power_source": d.get("power_source"),
                    "firmware": d.get("software_build_id"),
                    "network_address": d.get("network_address"),
                    "interview_state": d.get("interview_state"),
                    "supported": d.get("supported"),
                }
                for d in data
                if isinstance(d, dict) and isinstance(d.get("ieee_address"), str)
            }
            self.telemetry = {k: v for k, v in self.telemetry.items() if k in self.devices}
            for key, device in self.devices.items():
                values = self.pending.pop(device["name"], {})
                self.telemetry.setdefault(key, {}).update(values)
            self.changed()
        elif not topic.startswith("bridge/"):
            name = topic.removesuffix("/availability")
            values = {}
            if topic.endswith("/availability"):
                state = data.get("state") if isinstance(data, dict) else data
                if state in ("online", "offline"):
                    values["status"] = state
            elif isinstance(data, dict):
                lqi = data.get("linkquality")
                if type(lqi) in (int, float) and 0 <= lqi <= 255:
                    values = {"lqi": lqi, "sample_at": None if event.get("retain") else time.time()}
            if not values:
                return
            for key, device in (self.devices or {}).items():
                if name == device["name"]:
                    current = self.telemetry.setdefault(key, {})
                    if any(current.get(k) != v for k, v in values.items()):
                        current.update(values)
                        self.changed()
                    return
            # Retained delivery order is unspecified. Cache only bounded, safe diagnostics.
            if len(name) <= 200:
                if name not in self.pending and len(self.pending) >= 512:
                    self.pending.pop(next(iter(self.pending)))
                self.pending.setdefault(name, {}).update(values)

    async def list(self, provider):
        s, ha = self.setup, self.setup.ha
        if s.settings.mode == "demo":
            return {"status": "demo", "devices": []}
        if not ha.connected and not (provider == "zigbee2mqtt" and s.frontend):
            return {"status": "unavailable", "devices": []}
        try:
            if provider == "zigbee2mqtt":
                await s.ensure_mqtt()
                ready = s.mqtt_online and self.devices is not None
                return {
                    "status": "ready" if ready else "unavailable",
                    "devices": [
                        self.enrich(
                            provider,
                            d,
                            next(
                                (
                                    v
                                    for v in ha.devices.values()
                                    if ["mqtt", f"zigbee2mqtt_{k}"]
                                    in [list(i) for i in v.get("identifiers", [])]
                                ),
                                {},
                            ),
                        )
                        | self.telemetry.get(k, {})
                        | {
                            "status": self.telemetry.get(k, {}).get("status", "unknown")
                            if ready
                            else "unknown",
                            "removable": ready and not d["controller"] and not d["disabled"],
                        }
                        for k, d in (self.devices or {}).items()
                    ],
                }
            entries = await ha.request("config_entries/get", domain="zwave_js")
            devices, unavailable = [], False
            for entry in entries:
                if entry.get("domain") != "zwave_js" or entry.get("disabled_by"):
                    continue
                if entry.get("state") != "loaded":
                    unavailable = True
                    continue
                try:
                    network = await ha.request("zwave_js/network_status", entry_id=entry["entry_id"])
                    connected = controller_status(network)["connected"]
                    unavailable |= not connected
                    controller = network.get("controller", {})
                    for node in controller.get("nodes", []):
                        node_id = node["node_id"]
                        identifier = f"{controller.get('home_id')}-{node_id}"
                        registered = next(
                            (
                                d
                                for d in ha.devices.values()
                                if entry["entry_id"] in d.get("config_entries", [])
                                and any(
                                    i[0] == "zwave_js"
                                    and (i[1] == identifier or i[1].startswith(identifier + "-"))
                                    for i in d.get("identifiers", [])
                                )
                            ),
                            {},
                        )
                        devices.append(
                            self.enrich(
                                provider,
                                {
                                    "id": f"{entry['entry_id']}:{node_id}",
                                    "entry_id": entry["entry_id"],
                                    "node_id": node_id,
                                    "controller_name": entry.get("title", "Z-Wave JS"),
                                    "name": registered.get("name_by_user")
                                    or registered.get("name")
                                    or f"Node {node_id}",
                                    "model": registered.get("model"),
                                    "manufacturer": registered.get("manufacturer"),
                                    "status": {1: "asleep", 2: "awake", 3: "offline", 4: "online"}.get(
                                        node.get("status"), "unknown"
                                    )
                                    if connected
                                    else "unknown",
                                    "controller": bool(node.get("is_controller_node")),
                                    "removable": connected and not node.get("is_controller_node"),
                                    "secure": node.get("is_secure"),
                                    "ready": node.get("ready"),
                                },
                                registered,
                            )
                        )
                except (HAError, TimeoutError):
                    unavailable = True
            return {"status": "unavailable" if unavailable or not entries else "ready", "devices": devices}
        except (HAError, TimeoutError):
            return {"status": "unavailable", "devices": []}

    def image_key(self, provider, device_id):
        return f"device_image:{provider}:{device_id}"

    def enrich(self, provider, device, registered):
        store = self.setup.store
        custom = store and store.get(self.image_key(provider, device["id"]))
        model = device.get("image_model")
        image = None
        if custom:
            image = f"api/devices/{provider}/image?device_id={quote(device['id'], safe='')}&v={hashlib.sha256(custom.encode()).hexdigest()[:12]}"
        elif provider == "zigbee2mqtt" and model:
            image = (
                "https://www.zigbee2mqtt.io/images/devices/"
                + quote(re.sub(r"[:\s/]", "-", model), safe="")
                + ".png"
            )
        area = self.setup.ha.areas.get(registered.get("area_id"), {})
        return device | {
            "ha_device_id": registered.get("id"),
            "name": registered.get("name_by_user") or device["name"],
            "area_id": registered.get("area_id"),
            "area": area.get("name"),
            "firmware": device.get("firmware") or registered.get("sw_version"),
            "hardware": registered.get("hw_version"),
            "image_url": image,
            "custom_image": bool(custom),
        }

    async def detail(self, provider, device_id):
        inventory = await self.list(provider)
        device = next((d for d in inventory["devices"] if d["id"] == device_id), None)
        if not device:
            raise HTTPException(404, "device_unavailable")
        controls = [
            c.model_dump()
            for c in self.setup.ha.controls()
            if device.get("ha_device_id") and c.device_id == device["ha_device_id"]
        ]
        return device | {"controls": controls, "network_status": inventory["status"]}

    async def save_image(self, provider, device_id, image):
        await self.detail(provider, device_id)
        if image:
            match = re.fullmatch(r"data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)", image)
            if not match:
                raise HTTPException(422, "invalid_image")
            try:
                content = base64.b64decode(match[2], validate=True)
            except ValueError:
                raise HTTPException(422, "invalid_image")
            kind = match[1]
            valid = (
                kind == "png"
                and content.startswith(b"\x89PNG\r\n\x1a\n")
                or kind == "jpeg"
                and content.startswith(b"\xff\xd8\xff")
                or kind == "webp"
                and content.startswith(b"RIFF")
                and content[8:12] == b"WEBP"
            )
            if not valid or len(content) > 600_000:
                raise HTTPException(422, "invalid_image")
        self.setup.store.set(self.image_key(provider, device_id), image or "")
        return {"saved": True}

    async def require(self, provider, device_id):
        result = await self.list(provider)
        device = next((d for d in result["devices"] if d["id"] == device_id), None)
        if not device or not device.get("removable"):
            raise HTTPException(409, "device_unavailable")
        return device
