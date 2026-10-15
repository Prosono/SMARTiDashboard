"""Shared SMARTi control groups. Native HA entities are not changed or deleted."""

import asyncio
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from .models import Command

SAFE_ACTIONS = {"turn_on", "turn_off", "set_brightness", "set_rgb_color"}
DOMAINS = {"light", "switch", "climate", "sensor", "binary_sensor", "media_player", "cover"}


class GroupDraft(BaseModel):
    model_config = {"extra": "forbid"}
    name: str = Field(min_length=1, max_length=80)
    entities: list[str] = Field(min_length=1, max_length=50)
    revision: str = Field(default="", max_length=40)

    @field_validator("name")
    @classmethod
    def named(cls, value):
        if not value.strip():
            raise ValueError("Name required")
        return value.strip()

    @field_validator("entities")
    @classmethod
    def unique(cls, value):
        if len(set(value)) != len(value):
            raise ValueError("Duplicate members")
        return value


def groups_router(store, ha, user, admin, execute):
    router = APIRouter(prefix="/api/groups")
    lock = asyncio.Lock()

    def groups():
        return json.loads(store.get("control_groups", "{}"))

    def native_groups():
        result = {}
        for eid, state in ha.states.items():
            attrs = state.get("attributes", {})
            registry = ha.entities.get(eid, {})
            members = attrs.get("entity_id", [])
            domain = eid.split(".", 1)[0]
            if registry.get("disabled_by") or not (
                domain == "group"
                or registry.get("platform") == "group"
                or (domain in DOMAINS and isinstance(members, list) and members)
            ):
                continue
            result["ha:" + eid] = {
                "name": attrs.get("friendly_name") or registry.get("name") or eid,
                "entities": list(dict.fromkeys(e for e in members if isinstance(e, str)))
                if isinstance(members, list)
                else [],
                "revision": "",
                "source": "home_assistant",
                "entity_id": eid,
            }
        return result

    def get(id):
        value = native_groups().get(id) if id.startswith("ha:") else groups().get(id)
        if not value:
            raise HTTPException(404, "group_not_found")
        return value

    def targets(value):
        eid = value.get("entity_id")
        if eid and not eid.startswith("group."):
            return [eid]
        # Legacy groups may contain other groups. Expand without duplicate
        # commands and reject cycles rather than executing a partial group.
        native = native_groups()

        def expand(members, visited):
            result = []
            for member in members:
                if member in visited:
                    return None
                nested = native.get("ha:" + member) if member.startswith("group.") else None
                expanded = expand(nested["entities"], visited | {member}) if nested else [member]
                if expanded is None:
                    return None
                result.extend(expanded)
            return list(dict.fromkeys(result))

        return expand(value["entities"], {eid} if eid else set()) or []

    def describe(id, value):
        controls = {c.entity_id: c for c in ha.controls()}
        members = [controls.get(eid) for eid in targets(value)]
        common = set(SAFE_ACTIONS) if members else set()
        for c in members:
            common &= {action for cap in c.capabilities for action in cap.actions} if c else set()
        return {
            "id": id,
            **value,
            "source": value.get("source", "smarti"),
            "actions": sorted(common),
            "available": bool(members)
            and ha.connected
            and all(c and c.availability == "available" for c in members),
        }

    @router.get("")
    async def listing(current=Depends(user)):
        return [describe(id, value) for id, value in {**groups(), **native_groups()}.items()]

    async def save(id, body):
        controls = {c.entity_id: c for c in ha.controls()}
        if any(
            eid not in controls or controls[eid].domain not in DOMAINS or controls[eid].diagnostic
            for eid in body.entities
        ):
            raise HTTPException(422, "invalid_members")
        async with lock:
            saved = groups()
            if id is not None:
                if id not in saved:
                    raise HTTPException(404, "group_not_found")
                if body.revision != saved[id]["revision"]:
                    raise HTTPException(409, "group_changed")
            elif len(saved) >= 100:
                raise HTTPException(409, "group_limit")
            id = id or uuid.uuid4().hex
            value = {"name": body.name, "entities": body.entities, "revision": uuid.uuid4().hex}
            saved[id] = value
            store.set("control_groups", json.dumps(saved))
            return describe(id, value)

    @router.post("")
    async def create(body: GroupDraft, current=Depends(admin)):
        return await save(None, body)

    @router.put("/{id}")
    async def update(id: str, body: GroupDraft, current=Depends(admin)):
        if id.startswith("ha:"):
            raise HTTPException(409, "native_group_managed_externally")
        return await save(id, body)

    @router.delete("/{id}")
    async def delete(id: str, revision: str, current=Depends(admin)):
        if id.startswith("ha:"):
            raise HTTPException(409, "native_group_managed_externally")
        async with lock:
            saved = groups()
            value = get(id)
            if revision != value["revision"]:
                raise HTTPException(409, "group_changed")
            del saved[id]
            store.set("control_groups", json.dumps(saved))
        return {"deleted": True}

    @router.post("/{id}/commands")
    async def command(id: str, body: Command, current=Depends(user)):
        value = get(id)
        description = describe(id, value)
        if body.action not in description["actions"]:
            raise HTTPException(422, "unsupported_group_action")
        if not description["available"]:
            raise HTTPException(409, "group_unavailable")
        # Bounded parallel execution; preserve each outcome and never retry a
        # partially applied command automatically.
        semaphore = asyncio.Semaphore(5)

        async def send(eid):
            async with semaphore:
                try:
                    result = await execute(eid, body, current)
                    return {"entity_id": eid, **result}
                except HTTPException as exc:
                    return {"entity_id": eid, "status": "failed", "code": exc.status_code}

        return {"results": await asyncio.gather(*(send(eid) for eid in targets(value)))}

    return router
