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

    def get(id):
        value = groups().get(id)
        if not value:
            raise HTTPException(404, "group_not_found")
        return value

    def describe(id, value):
        controls = {c.entity_id: c for c in ha.controls()}
        members = [controls.get(eid) for eid in value["entities"]]
        common = set(SAFE_ACTIONS)
        for c in members:
            common &= {action for cap in c.capabilities for action in cap.actions} if c else set()
        return {
            "id": id,
            **value,
            "actions": sorted(common),
            "available": ha.connected and all(c and c.availability == "available" for c in members),
        }

    @router.get("")
    async def listing(current=Depends(user)):
        return [describe(id, value) for id, value in groups().items()]

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
        return await save(id, body)

    @router.delete("/{id}")
    async def delete(id: str, revision: str, current=Depends(admin)):
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

        return {"results": await asyncio.gather(*(send(eid) for eid in value["entities"]))}

    return router
