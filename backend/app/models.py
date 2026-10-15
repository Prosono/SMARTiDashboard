from typing import Any, Literal

from pydantic import BaseModel, Field


class Capability(BaseModel):
    kind: str
    actions: list[str] = []
    unit: str | None = None
    minimum: float | None = None
    maximum: float | None = None
    step: float | None = None


class Control(BaseModel):
    id: str
    entity_id: str
    device_id: str | None = None
    area_id: str | None = None
    name: str
    domain: str
    state: str
    attributes: dict[str, Any]
    capabilities: list[Capability]
    availability: Literal["available", "unavailable", "unknown"]
    updated_at: str | None
    integration: str | None = None
    connectivity: str = "unknown"
    diagnostic: bool = False


class Command(BaseModel):
    model_config = {"extra": "forbid"}
    action: Literal[
        "turn_on",
        "turn_off",
        "set_temperature",
        "set_brightness",
        "activate",
        "lock",
        "unlock",
        "open_cover",
        "close_cover",
        "stop_cover",
        "media_play", "media_pause", "media_stop", "media_next_track", "media_previous_track",
        "set_volume", "set_mute",
    ]
    value: float | None = Field(default=None, allow_inf_nan=False)
    confirmed: bool = False


def normalize(states, entities, devices):
    result = []
    for entity_id, state in states.items():
        registry = entities.get(entity_id, {})
        if registry.get("disabled_by"):
            continue
        domain = entity_id.split(".")[0]  # HA domain selects schema, never physical identity.
        if domain not in {
            "light",
            "switch",
            "climate",
            "sensor",
            "binary_sensor",
            "automation",
            "lock",
            "cover",
            "camera",
            "weather",
            "alarm_control_panel",
            "scene",
            "script",
            "person",
            "media_player",
        }:
            continue
        a = state.get("attributes", {})
        caps = []
        if domain in {"light", "switch", "automation"}:
            caps.append(Capability(kind="power", actions=["turn_on", "turn_off"]))
        if domain == "light" and set(a.get("supported_color_modes", [])) - {"onoff", "unknown"}:
            caps.append(
                Capability(
                    kind="brightness", actions=["set_brightness"], minimum=0, maximum=100, step=1, unit="%"
                )
            )
        if (
            domain == "climate"
            and a.get("supported_features", 0) & 1
            and all(isinstance(a.get(k), (int, float)) for k in ("min_temp", "max_temp", "target_temp_step"))
            and a["min_temp"] <= a["max_temp"]
            and a["target_temp_step"] > 0
        ):
            caps.append(
                Capability(
                    kind="temperature",
                    actions=["set_temperature"],
                    minimum=a["min_temp"],
                    maximum=a["max_temp"],
                    step=a["target_temp_step"],
                    unit=a.get("temperature_unit"),
                )
            )
        if domain in {"sensor", "binary_sensor", "lock"}:
            caps.append(Capability(kind=a.get("device_class", domain), unit=a.get("unit_of_measurement")))
        if domain in {"scene", "script"}:
            caps.append(Capability(kind="scene", actions=["activate"]))
        if domain == "lock":
            caps.append(Capability(kind="lock", actions=["lock", "unlock"]))
        if domain == "cover":
            features = a.get("supported_features", 0)
            caps.append(
                Capability(
                    kind="cover",
                    actions=[
                        action
                        for bit, action in [(1, "open_cover"), (2, "close_cover"), (8, "stop_cover")]
                        if features & bit
                    ],
                )
            )
        if domain == "media_player":
            features = a.get("supported_features", 0)
            features = features if isinstance(features, int) else 0
            actions = [action for bit, action in [
                (1, "media_pause"), (16, "media_previous_track"), (32, "media_next_track"),
                (128, "turn_on"), (256, "turn_off"), (4096, "media_stop"), (16384, "media_play"),
            ] if features & bit]
            caps.append(Capability(kind="media", actions=actions))
            if features & 4:
                caps.append(Capability(kind="volume", actions=["set_volume"], minimum=0, maximum=100, step=1, unit="%"))
            if features & 8:
                caps.append(Capability(kind="mute", actions=["set_mute"], minimum=0, maximum=1, step=1))
        device_id = registry.get("device_id")
        device = devices.get(device_id, {})
        raw = state.get("state", "unknown")
        result.append(
            Control(
                id=registry.get("id") or entity_id,
                entity_id=entity_id,
                device_id=device_id,
                area_id=registry.get("area_id") or device.get("area_id"),
                name=registry.get("name") or a.get("friendly_name") or entity_id,
                domain=domain,
                state=raw,
                # Presence needs only the name and state, never location/user/tracker metadata.
                attributes={}
                if domain == "person"
                else {k: v for k, v in a.items() if k not in {"access_token", "entity_picture"}},
                capabilities=caps,
                availability=raw
                if raw in {"unknown", "unavailable"} and not (domain == "scene" and raw == "unknown")
                else "available",
                updated_at=state.get("last_updated"),
                integration=registry.get("platform"),
                diagnostic=registry.get("entity_category") in {"diagnostic", "config"},
            )
        )
    return result
