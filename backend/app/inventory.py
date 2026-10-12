"""Physical radio inventory. Only retain public diagnostics from MQTT payloads."""

import json
import time

from fastapi import HTTPException

from .ha import HAError


class Inventory:
    def __init__(self, setup):
        self.setup = setup
        self.devices = None
        self.telemetry = {}

    def reset(self):
        self.devices = None
        self.telemetry.clear()

    def event(self, event):
        base = self.setup.settings.zigbee2mqtt_base_topic + "/"
        topic = event.get("topic", "")
        if not topic.startswith(base):
            return
        topic = topic[len(base) :]
        try:
            data = json.loads(event.get("payload", ""))
        except (ValueError, TypeError):
            return
        if topic == "bridge/devices" and isinstance(data, list):
            self.devices = {
                d["ieee_address"]: {
                    "id": d["ieee_address"],
                    "name": d.get("friendly_name") or d["ieee_address"],
                    "model": (d.get("definition") or {}).get("model") or d.get("model_id"),
                    "manufacturer": (d.get("definition") or {}).get("vendor"),
                    "controller": d.get("type") == "Coordinator",
                    "disabled": bool(d.get("disabled")),
                }
                for d in data
                if isinstance(d, dict) and isinstance(d.get("ieee_address"), str)
            }
            self.telemetry = {k: v for k, v in self.telemetry.items() if k in self.devices}
        elif self.devices:
            for key, device in self.devices.items():
                if topic not in [device["name"], device["name"] + "/availability"]:
                    continue
                values = self.telemetry.setdefault(key, {})
                if topic.endswith("/availability"):
                    state = data.get("state") if isinstance(data, dict) else data
                    values["status"] = state if state in ["online", "offline"] else "unknown"
                elif isinstance(data, dict):
                    lqi = data.get("linkquality")
                    if type(lqi) in (int, float) and 0 <= lqi <= 255:
                        values["lqi"] = lqi
                        values["sample_at"] = None if event.get("retain") else time.time()
                break

    async def list(self, provider):
        s, ha = self.setup, self.setup.ha
        if s.settings.mode == "demo":
            return {"status": "demo", "devices": []}
        if not ha.connected:
            return {"status": "unavailable", "devices": []}
        try:
            if provider == "zigbee2mqtt":
                await s.ensure_mqtt()
                ready = s.mqtt_online and self.devices is not None
                return {
                    "status": "ready" if ready else "unavailable",
                    "devices": [
                        d
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
                    connected = network.get("client", {}).get("state") == "connected"
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
                                and ["zwave_js", identifier] in [list(i) for i in d.get("identifiers", [])]
                            ),
                            {},
                        )
                        devices.append(
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
                            }
                        )
                except (HAError, TimeoutError):
                    unavailable = True
            return {"status": "unavailable" if unavailable or not entries else "ready", "devices": devices}
        except (HAError, TimeoutError):
            return {"status": "unavailable", "devices": []}

    async def require(self, provider, device_id):
        result = await self.list(provider)
        device = next((d for d in result["devices"] if d["id"] == device_id), None)
        if not device or not device.get("removable"):
            raise HTTPException(409, "device_unavailable")
        return device
