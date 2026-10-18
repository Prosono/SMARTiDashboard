"""Persistent native HA scenes, with a capability-scoped editor and separate activation."""

import asyncio
import json
import math
import re
import uuid
from typing import Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from .ha import HAError
from .management import revision

EDITABLE = {"light", "switch", "climate", "cover", "media_player"}
FIELDS = {"state", "brightness", "temperature", "rgb_color", "color_temp_kelvin", "volume_level"}


class SceneState(BaseModel):
    model_config = {"extra": "forbid"}
    state: str = Field(min_length=1, max_length=80)
    volume_level: float | None = Field(default=None, ge=0, le=1)
    brightness: int | None = Field(default=None, ge=0, le=255)
    temperature: float | None = None
    rgb_color: tuple[int, int, int] | None = None
    color_temp_kelvin: int | None = Field(default=None, ge=1000, le=40000)

    @field_validator("temperature")
    @classmethod
    def finite(cls, v):
        if v is not None and not math.isfinite(v):
            raise ValueError("Nonfinite temperature")
        return v

    @field_validator("rgb_color")
    @classmethod
    def rgb(cls, v):
        if v is not None and any(x < 0 or x > 255 for x in v):
            raise ValueError("Invalid RGB")
        return v


class SceneDraft(BaseModel):
    model_config = {"extra": "forbid"}
    name: str = Field(min_length=1, max_length=80)
    icon: str = Field(default="mdi:sofa", pattern=r"^mdi:[a-z0-9-]{1,60}$")
    entities: dict[str, SceneState] = Field(max_length=50)
    revision: str = Field(default="", max_length=64)

    @field_validator("name")
    @classmethod
    def name_required(cls, v):
        if not v.strip():
            raise ValueError("Name required")
        return v.strip()


class Activation(BaseModel):
    confirmed: Literal[True]


def scenes_router(ha, store, user, settings):
    router = APIRouter(prefix="/api/scenes")
    lock = asyncio.Lock()
    demo = settings.mode == "demo"

    def admin(current):
        if current["role"] != "admin":
            raise HTTPException(403, "admin_required")

    def configs():
        return json.loads(store.get("demo_scenes", "{}"))

    def hydrate():
        if demo:
            for id, config in configs().items():
                eid = "scene." + id
                ha.states[eid] = {
                    "entity_id": eid,
                    "state": ha.states.get(eid, {}).get("state", "unknown"),
                    "attributes": {
                        "id": id,
                        "friendly_name": config["name"],
                        "icon": config.get("icon"),
                        "entity_id": list(config["entities"]),
                    },
                }

    async def config(id):
        if not re.fullmatch(r"[\w-]{1,200}", id):
            raise HTTPException(404, "scene_not_found")
        if demo:
            value = configs().get(id)
            if not value:
                raise HTTPException(404, "scene_not_found")
            return value
        if not ha.connected:
            raise HTTPException(503, "ha_disconnected")
        try:
            return await ha.rest("GET", "config/scene/config/" + quote(id, safe=""))
        except (HAError, TimeoutError):
            raise HTTPException(503, "scene_config_unavailable") from None

    def editable(eid):
        return eid.split(".")[0] in EDITABLE and eid in ha.states

    def project(value):
        entities, preserved = {}, []
        for eid, raw in value.get("entities", {}).items():
            if not editable(eid):
                preserved.append(ha.states.get(eid, {}).get("attributes", {}).get("friendly_name", eid))
                continue
            raw = (
                raw
                if isinstance(raw, dict)
                else {"state": "on" if raw is True else "off" if raw is False else raw}
            )
            state = raw.get("state")
            if isinstance(state, bool):
                raw = raw | {"state": "on" if state else "off"}
            entities[eid] = {k: v for k, v in raw.items() if k in FIELDS and v is not None}
        return {
            "name": value["name"],
            "icon": value.get("icon", "mdi:sofa"),
            "entities": entities,
            "preserved": preserved,
            "revision": revision(value),
        }

    def assemble(body, existing=None):
        old = (existing or {}).get("entities", {})
        entities = {eid: v for eid, v in old.items() if not editable(eid)}
        controls = {c.entity_id: c for c in ha.controls()}
        for eid, draft in body.entities.items():
            c = controls.get(eid)
            if not c or c.domain not in EDITABLE:
                raise HTTPException(422, "scene_entity_not_supported")
            value = draft.model_dump(exclude_none=True)
            actions = {a for cap in c.capabilities for a in cap.actions}
            if c.domain == "cover":
                action = {"open": "open_cover", "closed": "close_cover"}.get(draft.state)
                if not action or action not in actions:
                    raise HTTPException(422, "unsupported_cover_scene_state")
            if c.domain == "media_player":
                action = {
                    "on": "turn_on",
                    "off": "turn_off",
                    "playing": "media_play",
                    "paused": "media_pause",
                    "idle": "media_stop",
                }.get(draft.state)
                if not action or action not in actions:
                    raise HTTPException(422, "unsupported_media_scene_state")
            if draft.volume_level is not None and (c.domain != "media_player" or "set_volume" not in actions):
                raise HTTPException(422, "unsupported_scene_volume")
            if c.domain in {"light", "switch"} and draft.state not in {"on", "off"}:
                raise HTTPException(422, "invalid_scene_state")
            if c.domain != "light" and any(
                k in value for k in ("brightness", "rgb_color", "color_temp_kelvin")
            ):
                raise HTTPException(422, "invalid_scene_state")
            if c.domain == "light":
                modes = c.attributes.get("supported_color_modes", [])
                if draft.brightness is not None and not any(
                    cap.kind == "brightness" for cap in c.capabilities
                ):
                    raise HTTPException(422, "brightness_not_supported")
                if draft.rgb_color is not None and not set(modes) & {"hs", "xy", "rgb", "rgbw", "rgbww"}:
                    raise HTTPException(422, "color_not_supported")
                if draft.color_temp_kelvin is not None:
                    cap = next((v for v in c.capabilities if v.kind == "color_temperature"), None)
                    if not cap or not cap.minimum <= draft.color_temp_kelvin <= cap.maximum:
                        raise HTTPException(422, "invalid_color_temperature")
                    if draft.rgb_color is not None:
                        raise HTTPException(422, "choose_one_color_mode")
            if c.domain == "climate":
                if draft.state not in c.attributes.get("hvac_modes", []):
                    raise HTTPException(422, "hvac_mode_not_supported")
                if draft.temperature is not None:
                    cap = next((v for v in c.capabilities if v.kind == "temperature"), None)
                    if not cap or not cap.minimum <= draft.temperature <= cap.maximum:
                        raise HTTPException(422, "invalid_scene_temperature")
            elif draft.temperature is not None:
                raise HTTPException(422, "invalid_scene_temperature")
            # Preserve advanced fields in the original native scene, including colors not edited here.
            previous = old.get(eid, {})
            if c.domain == "cover" and isinstance(previous, dict) and previous.get("state") != draft.state:
                previous = {
                    k: v
                    for k, v in previous.items()
                    if k not in {"current_position", "current_tilt_position"}
                }
            entities[eid] = (
                {k: v for k, v in previous.items() if k not in FIELDS} if isinstance(previous, dict) else {}
            ) | value
        if not entities:
            raise HTTPException(422, "empty_scene")
        return (existing or {}) | {"name": body.name, "icon": body.icon, "entities": entities}

    async def save(id, value):
        if demo:
            values = configs() | {id: value}
            store.set("demo_scenes", json.dumps(values))
            hydrate()
            ha.changed()
        else:
            try:
                await ha.rest("POST", "config/scene/config/" + quote(id, safe=""), value)
            except (HAError, TimeoutError):
                raise HTTPException(503, "scene_save_unconfirmed") from None

    @router.get("")
    async def listing(current=Depends(user)):
        hydrate()
        return [
            {
                "entity_id": eid,
                "id": s.get("attributes", {}).get("id"),
                "name": s.get("attributes", {}).get("friendly_name", eid),
                "icon": s.get("attributes", {}).get("icon"),
                "available": ha.connected and s.get("state") != "unavailable",
                "entities": s.get("attributes", {}).get("entity_id", []),
                "last_activated": s.get("state") if str(s.get("state", "")).startswith("20") else None,
            }
            for eid, s in ha.states.items()
            if eid.startswith("scene.")
        ]

    @router.post("")
    async def create(body: SceneDraft, current=Depends(user)):
        admin(current)
        async with lock:
            if not ha.connected:
                raise HTTPException(503, "ha_disconnected")
            id = "smarti_" + uuid.uuid4().hex
            value = assemble(body) | {"id": id}
            await save(id, value)
            return {"id": id, **project(value)}

    @router.get("/config/{id}")
    async def get(id: str, current=Depends(user)):
        admin(current)
        return project(await config(id))

    @router.put("/config/{id}")
    async def edit(id: str, body: SceneDraft, current=Depends(user)):
        admin(current)
        async with lock:
            existing = await config(id)
            if body.revision != revision(existing):
                raise HTTPException(409, "revision_conflict")
            value = assemble(body, existing)
            await save(id, value)
            return {"id": id, **project(value)}

    @router.delete("/config/{id}")
    async def delete(id: str, expected_revision: str, current=Depends(user)):
        admin(current)
        async with lock:
            existing = await config(id)
            if revision(existing) != expected_revision:
                raise HTTPException(409, "revision_conflict")
            if demo:
                values = configs()
                values.pop(id)
                store.set("demo_scenes", json.dumps(values))
                ha.states.pop("scene." + id, None)
                ha.changed()
            else:
                try:
                    await ha.rest("DELETE", "config/scene/config/" + quote(id, safe=""))
                except (HAError, TimeoutError):
                    raise HTTPException(503, "scene_delete_unconfirmed") from None
        return {"deleted": True}

    @router.post("/activate/{entity_id}")
    async def activate(entity_id: str, body: Activation, current=Depends(user)):
        if not entity_id.startswith("scene.") or entity_id not in ha.states:
            raise HTTPException(404, "scene_not_found")
        if not ha.connected or ha.states[entity_id].get("state") == "unavailable":
            raise HTTPException(409, "scene_unavailable")
        if demo:
            return {"status": "simulated"}
        try:
            await ha.request(
                "call_service",
                domain="scene",
                service="turn_on",
                target={"entity_id": entity_id},
                service_data={},
            )
            return {"status": "accepted_unconfirmed"}
        except (HAError, TimeoutError):
            raise HTTPException(504, "scene_activation_unconfirmed") from None

    return router
