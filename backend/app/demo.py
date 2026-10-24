import asyncio
from datetime import UTC, datetime

from .ha import HomeAssistant


class Demo(HomeAssistant):
    def __init__(self):
        super().__init__("", "")
        self.temperature_unit = "°C"
        self.connected = True
        self.error = None
        self.version = "demo"
        self.last_sync = datetime.now(UTC).isoformat()
        self.areas = {
            key: {"area_id": key, "name": name}
            for key, name in [
                ("living", "Stue"),
                ("kitchen", "Kjøkken"),
                ("bedroom", "Soverom"),
                ("hall", "Entré"),
            ]
        }
        rows = [
            (
                "light.living_pendant",
                "Pendellampe",
                "living",
                "on",
                {
                    "brightness": 184,
                    "supported_color_modes": ["rgb", "color_temp"],
                    "color_mode": "rgb",
                    "rgb_color": [255, 180, 90],
                    "min_color_temp_kelvin": 2200,
                    "max_color_temp_kelvin": 6500,
                    "color_temp_kelvin": 3000,
                },
                "d1",
            ),
            (
                "light.living_floor",
                "Gulvlampe",
                "living",
                "off",
                {"brightness": 0, "supported_color_modes": ["brightness"]},
                "d2",
            ),
            (
                "climate.living",
                "Gulvvarme",
                "living",
                "heat",
                {
                    "temperature": 22,
                    "current_temperature": 21.4,
                    "min_temp": 10,
                    "max_temp": 30,
                    "target_temp_step": 0.5,
                    "hvac_modes": ["off", "heat", "auto"],
                    "supported_features": 1,
                },
                "d3",
            ),
            (
                "light.kitchen",
                "Kjøkkenbenk",
                "kitchen",
                "on",
                {"brightness": 255, "supported_color_modes": ["brightness"]},
                "d4",
            ),
            ("switch.kitchen", "Stikkontakt", "kitchen", "off", {}, "d4"),
            (
                "sensor.bedroom_temperature",
                "Temperatur",
                "bedroom",
                "19.8",
                {"device_class": "temperature", "unit_of_measurement": "°C"},
                "d5",
            ),
            (
                "sensor.bedroom_battery",
                "Batteri",
                "bedroom",
                "unknown",
                {"device_class": "battery", "unit_of_measurement": "%"},
                "d5",
            ),
            ("binary_sensor.front_door", "Ytterdør", "hall", "off", {"device_class": "door"}, "d6"),
            (
                "sensor.hall_battery",
                "Batteri",
                "hall",
                "unavailable",
                {"device_class": "battery", "unit_of_measurement": "%"},
                "d6",
            ),
            (
                "light.bedroom",
                "Nattbord",
                "bedroom",
                "unavailable",
                {"supported_color_modes": ["onoff"]},
                "d7",
            ),
            ("automation.evening", "Kveldslys", None, "on", {}, None),
        ]
        for eid, name, area, state, attributes, device in rows:
            self.states[eid] = {
                "entity_id": eid,
                "state": state,
                "attributes": {"friendly_name": name, **attributes},
                "last_updated": self.last_sync,
            }
            self.entities[eid] = {
                "id": "demo-" + eid,
                "entity_id": eid,
                "device_id": device,
                "area_id": area,
                "platform": "demo",
                "entity_category": "diagnostic" if "battery" in eid else None,
            }
            if device:
                self.devices[device] = {"id": device, "area_id": area, "name": name}

    async def run(self):
        await asyncio.Event().wait()

    async def command(self, entity_id, action, value=None):
        await asyncio.sleep(0.2)
        state = self.states[entity_id]
        if entity_id.startswith("vacuum."):
            if action in {"start", "clean_area", "clean_spot", "turn_on"}:
                state["state"] = "cleaning"
            elif action in {"pause", "stop", "return_to_base", "turn_off"}:
                state["state"] = {
                    "pause": "paused",
                    "stop": "idle",
                    "return_to_base": "returning",
                    "turn_off": "idle",
                }[action]
            elif action == "set_fan_speed":
                state["attributes"]["fan_speed"] = value
        elif action in {"turn_on", "turn_off"}:
            state["state"] = "on" if action == "turn_on" else "off"
        elif action == "set_brightness":
            state["attributes"]["brightness"] = round(value * 255 / 100)
            state["state"] = "on" if value else "off"
        elif action == "set_rgb_color":
            state["attributes"].update(rgb_color=list(value), color_mode="rgb")
            state["state"] = "on"
        elif action == "set_color_temp":
            state["attributes"].update(color_temp_kelvin=int(value), color_mode="color_temp")
            state["state"] = "on"
        elif action == "set_volume":
            state["attributes"]["volume_level"] = value / 100
        elif action == "set_mute":
            state["attributes"]["is_volume_muted"] = bool(value)
        elif action in {"media_play", "media_pause", "media_stop"}:
            state["state"] = {"media_play": "playing", "media_pause": "paused", "media_stop": "idle"}[action]
        elif action == "set_hvac_mode":
            state["state"] = value
        elif action == "set_temperature":
            state["attributes"]["temperature"] = value
        state["last_updated"] = datetime.now(UTC).isoformat()
        self.changed()
        return {"status": "simulated", "physical_execution_verified": False}
