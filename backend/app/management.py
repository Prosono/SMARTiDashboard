"""Explicit admin operations over HA's config APIs. No generic service/URL proxy."""

import asyncio
import hashlib
import json
import re
import time
import uuid
from typing import Any, Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, field_validator

from .ha import HAError


class NameBody(BaseModel):
    model_config = {"extra": "forbid"}
    name: str = Field(min_length=1, max_length=80)

    @field_validator("name")
    @classmethod
    def trim(cls, value):
        if not value.strip():
            raise ValueError("Name required")
        return value.strip()


class Placement(BaseModel):
    model_config = {"extra": "forbid"}
    area_id: str | None = Field(default=None, max_length=200)


class AutomationBody(BaseModel):
    model_config = {"extra": "forbid"}
    config: dict[str, Any]
    revision: str = Field(default="", max_length=64)

    @field_validator("config")
    @classmethod
    def bounded(cls, value):
        if (
            len(json.dumps(value)) > 100_000
            or not isinstance(value.get("alias"), str)
            or not value["alias"].strip()
        ):
            raise ValueError("Invalid automation")
        return value


class AutomationAction(BaseModel):
    action: Literal["turn_on", "turn_off", "trigger"]


class IntegrationAction(BaseModel):
    action: Literal["enable", "disable", "reload", "rename"]
    name: str = Field(default="", max_length=80)


class InstallBody(BaseModel):
    model_config = {"extra": "forbid"}
    version: str = Field(min_length=1, max_length=200)
    backup: bool = False


def revision(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def brand(value):
    return re.sub(r"home\s+assistant", "SMARTi", str(value or ""), flags=re.IGNORECASE)


class Management:
    def __init__(self, ha, store, settings):
        self.ha, self.store = ha, store
        self.demo = settings.mode == "demo"
        self.lock = asyncio.Lock()
        self.pending_updates = {}
        self.demo_automations = {
            "evening": {
                "id": "evening",
                "alias": "Kveldslys",
                "triggers": [{"trigger": "time", "at": "20:00:00"}],
                "conditions": [],
                "actions": [{"action": "light.turn_on", "target": {"entity_id": "light.living_pendant"}}],
                "mode": "single",
            }
        }
        if self.demo and "automation.evening" in ha.states:
            ha.states["automation.evening"]["attributes"]["id"] = "evening"
        if self.demo:
            for eid, title, installed, latest in [
                ("update.demo_system", "Home Assistant Core", "2026.9.0", "2026.10.0"),
                ("update.demo_lamp", "Lampeprogramvare (demo)", "1.4", "1.4"),
            ]:
                ha.states[eid] = {
                    "entity_id": eid,
                    "state": "on" if installed != latest else "off",
                    "attributes": {
                        "title": title,
                        "installed_version": installed,
                        "latest_version": latest,
                        "supported_features": 9,
                        "in_progress": False,
                        "release_summary": "Demodata. Ingen programvare blir installert.",
                    },
                }
        if self.demo:
            for device in ha.devices.values():
                if any(
                    e.get("device_id") == device["id"] and eid.startswith("light.")
                    for eid, e in ha.entities.items()
                ):
                    device["config_entries"] = ["demo_lights"]
        self.demo_entries = [
            {
                "entry_id": "demo_lights",
                "domain": "hue",
                "title": "Belysning (demo)",
                "state": "loaded",
                "disabled_by": None,
            }
        ]

    def connected(self):
        if not self.ha.connected:
            raise HTTPException(503, "ha_disconnected")

    async def ws(self, kind, **data):
        self.connected()
        try:
            return await self.ha.request(kind, **data)
        except (HAError, TimeoutError):
            raise HTTPException(503, "ha_request_unconfirmed") from None

    async def rest(self, method, path, data=None):
        self.connected()
        try:
            return await self.ha.rest(method, path, data)
        except (HAError, TimeoutError):
            raise HTTPException(503, "ha_request_unconfirmed") from None

    async def rooms(self):
        self.connected()
        if not self.demo:
            try:
                await self.ha.registries()
            except (HAError, TimeoutError):
                raise HTTPException(503, "ha_request_unconfirmed") from None
        return {
            "areas": [{"area_id": a["area_id"], "name": a["name"]} for a in self.ha.areas.values()],
            "devices": [
                {
                    "id": d["id"],
                    "name": d.get("name_by_user") or d.get("name") or d["id"],
                    "area_id": d.get("area_id"),
                    "overrides": sum(
                        1
                        for e in self.ha.entities.values()
                        if e.get("device_id") == d["id"] and e.get("area_id")
                    ),
                }
                for d in self.ha.devices.values()
            ],
            "entities": [
                {
                    "entity_id": e["entity_id"],
                    "name": e.get("name") or e.get("original_name") or e["entity_id"],
                    "area_id": e.get("area_id"),
                    "device_id": e.get("device_id"),
                }
                for e in self.ha.entities.values()
            ],
        }

    async def automation_config(self, id):
        if self.demo:
            if id not in self.demo_automations:
                raise HTTPException(404, "not_found")
            return self.demo_automations[id]
        return await self.rest("GET", "config/automation/config/" + quote(id, safe=""))

    def automations(self):
        self.connected()
        return [
            {
                "entity_id": eid,
                "id": s.get("attributes", {}).get("id"),
                "name": s.get("attributes", {}).get("friendly_name", eid),
                "state": s["state"],
                "last_triggered": s.get("attributes", {}).get("last_triggered"),
            }
            for eid, s in self.ha.states.items()
            if eid.startswith("automation.")
        ]

    async def integrations(self):
        entries = self.demo_entries if self.demo else await self.ws("config_entries/get")
        result = []
        for e in entries:
            devices = [
                {
                    "id": d["id"],
                    "name": d.get("name_by_user") or d.get("name") or d["id"],
                    "model": d.get("model"),
                    "area": self.ha.areas.get(d.get("area_id"), {}).get("name"),
                }
                for d in self.ha.devices.values()
                if e["entry_id"] in (d.get("config_entries") or [])
                or e["entry_id"] == d.get("config_entry_id")
            ]
            result.append(
                {k: e.get(k) for k in ["entry_id", "title", "domain", "state", "disabled_by"]}
                | {"devices": len(devices), "device_items": devices}
            )
        return result

    def updates(self):
        self.connected()
        result = []
        for eid, state in self.ha.states.items():
            if not eid.startswith("update."):
                continue
            a = state.get("attributes", {})
            raw = a.get("title") or a.get("friendly_name") or eid
            progress = a.get("in_progress")
            pending = self.pending_updates.get(eid)
            if pending and (a.get("installed_version") == pending[0] or time.monotonic() - pending[1] > 180):
                self.pending_updates.pop(eid, None)
                pending = None
            result.append(
                {
                    "entity_id": eid,
                    "name": brand(raw),
                    "smarti": bool(re.search(r"home\s+assistant|smarti", raw, re.I)),
                    "installed_version": a.get("installed_version"),
                    "latest_version": a.get("latest_version"),
                    "state": state["state"],
                    "in_progress": progress is not None and progress is not False,
                    "percentage": a.get("update_percentage"),
                    "pending": bool(pending),
                    "can_install": bool(a.get("supported_features", 0) & 1),
                    "can_backup": bool(a.get("supported_features", 0) & 8),
                    "summary": brand(a.get("release_summary"))[:12000],
                }
            )
        return result


def management_router(service, admin):
    m = service
    router = APIRouter(prefix="/api/manage", dependencies=[Depends(admin)])

    @router.get("/rooms")
    async def rooms():
        return await m.rooms()

    @router.post("/rooms")
    async def create_room(body: NameBody):
        if m.demo:
            id = uuid.uuid4().hex
            m.ha.areas[id] = {"area_id": id, "name": body.name}
            m.ha.changed()
        else:
            await m.ws("config/area_registry/create", name=body.name)
        return await m.rooms()

    @router.put("/rooms/{id}")
    async def rename_room(id: str, body: NameBody):
        if id not in m.ha.areas:
            raise HTTPException(404, "not_found")
        if m.demo:
            m.ha.areas[id]["name"] = body.name
            m.ha.changed()
        else:
            await m.ws("config/area_registry/update", area_id=id, name=body.name)
        return await m.rooms()

    @router.delete("/rooms/{id}")
    async def delete_room(id: str):
        if id not in m.ha.areas:
            raise HTTPException(404, "not_found")
        if m.demo:
            del m.ha.areas[id]
            for item in [*m.ha.devices.values(), *m.ha.entities.values()]:
                if item.get("area_id") == id:
                    item["area_id"] = None
            m.ha.changed()
        else:
            await m.ws("config/area_registry/delete", area_id=id)
        return await m.rooms()

    @router.put("/placements/{kind}/{id}")
    async def place(kind: Literal["device", "entity"], id: str, body: Placement):
        registry = m.ha.devices if kind == "device" else m.ha.entities
        if id not in registry or (body.area_id is not None and body.area_id not in m.ha.areas):
            raise HTTPException(404, "not_found")
        if m.demo:
            registry[id]["area_id"] = body.area_id
            m.ha.changed()
        else:
            await m.ws(f"config/{kind}_registry/update", **{f"{kind}_id": id, "area_id": body.area_id})
        return await m.rooms()

    @router.get("/entities")
    async def entities():
        m.connected()
        return [
            {"entity_id": eid, "name": state.get("attributes", {}).get("friendly_name") or eid}
            for eid, state in m.ha.states.items()
        ]

    @router.get("/automations")
    async def automations():
        return m.automations()

    @router.get("/automations/{id}")
    async def config(id: str):
        value = await m.automation_config(id)
        return {"config": value, "revision": revision(value)}

    @router.post("/automations")
    async def create_automation(body: AutomationBody):
        id = uuid.uuid4().hex
        value = body.config | {"id": id}
        if m.demo:
            m.demo_automations[id] = value
            eid = "automation." + id
            m.ha.states[eid] = {
                "entity_id": eid,
                "state": "on",
                "attributes": {"id": id, "friendly_name": value["alias"]},
            }
            m.ha.changed()
        else:
            await m.rest("POST", f"config/automation/config/{id}", value)
        return {"id": id, "config": value, "revision": revision(value)}

    @router.put("/automations/{id}")
    async def save_automation(id: str, body: AutomationBody):
        async with m.lock:
            existing = await m.automation_config(id)
            if revision(existing) != body.revision:
                raise HTTPException(409, "revision_conflict")
            value = body.config | {"id": id}
            if m.demo:
                m.demo_automations[id] = value
                for s in m.ha.states.values():
                    if s.get("attributes", {}).get("id") == id:
                        s["attributes"]["friendly_name"] = value["alias"]
                m.ha.changed()
            else:
                await m.rest("POST", "config/automation/config/" + quote(id, safe=""), value)
            return {"config": value, "revision": revision(value)}

    @router.delete("/automations/{id}")
    async def delete_automation(id: str, expected_revision: str):
        async with m.lock:
            value = await m.automation_config(id)
            if revision(value) != expected_revision:
                raise HTTPException(409, "revision_conflict")
            if m.demo:
                del m.demo_automations[id]
                m.ha.states = {
                    eid: s
                    for eid, s in m.ha.states.items()
                    if not (eid.startswith("automation.") and s.get("attributes", {}).get("id") == id)
                }
                m.ha.changed()
            else:
                await m.rest("DELETE", "config/automation/config/" + quote(id, safe=""))
        return {"status": "deleted"}

    @router.post("/automation-actions/{entity_id}")
    async def automation_action(entity_id: str, body: AutomationAction):
        if not entity_id.startswith("automation.") or entity_id not in m.ha.states:
            raise HTTPException(404, "not_found")
        if m.demo:
            if body.action != "trigger":
                await m.ha.command(entity_id, body.action)
            return {"status": "simulated"}
        await m.ws(
            "call_service",
            domain="automation",
            service=body.action,
            service_data={"entity_id": entity_id}
            | ({"skip_condition": False} if body.action == "trigger" else {}),
        )
        return {"status": "accepted"}

    @router.get("/integrations")
    async def integrations():
        return await m.integrations()

    @router.get("/integration-brands/{domain}")
    async def integration_brand(domain: str):
        if not re.fullmatch(r"[a-z0-9_]{1,100}", domain) or m.demo:
            raise HTTPException(404, "brand_unavailable")
        try:
            content = await m.ha.brand_image(domain)
        except (HAError, TimeoutError):
            raise HTTPException(404, "brand_unavailable") from None
        return Response(content, media_type="image/png", headers={"Cache-Control": "private, max-age=86400"})

    @router.post("/integrations/{id}")
    async def integration_action(id: str, body: IntegrationAction):
        entries = await m.integrations()
        if not any(e["entry_id"] == id for e in entries):
            raise HTTPException(404, "not_found")
        if body.action == "rename" and not body.name.strip():
            raise HTTPException(422, "invalid_name")
        result = {}
        if m.demo:
            entry = next(e for e in m.demo_entries if e["entry_id"] == id)
            if body.action == "rename":
                entry["title"] = body.name.strip()
            elif body.action in {"enable", "disable"}:
                entry["disabled_by"] = "user" if body.action == "disable" else None
                entry["state"] = "not_loaded" if body.action == "disable" else "loaded"
        elif body.action == "reload":
            result = await m.rest("POST", "config/config_entries/entry/" + quote(id, safe="") + "/reload")
        elif body.action == "rename":
            result = await m.ws("config_entries/update", entry_id=id, title=body.name.strip())
        else:
            result = await m.ws(
                "config_entries/disable",
                entry_id=id,
                disabled_by="user" if body.action == "disable" else None,
            )
        return {
            "require_restart": bool((result or {}).get("require_restart")),
            "status": "simulated" if m.demo else "accepted",
        }

    @router.get("/updates")
    async def updates():
        return m.updates()

    @router.post("/updates/{entity_id}/install")
    async def install(entity_id: str, body: InstallBody):
        async with m.lock:
            m.connected()
            if not m.demo:
                states = await m.ws("get_states")
                for s in states:
                    if s["entity_id"].startswith("update."):
                        m.ha.states[s["entity_id"]] = s
            item = next((u for u in m.updates() if u["entity_id"] == entity_id), None)
            if (
                not item
                or not item["can_install"]
                or item["state"] != "on"
                or item["in_progress"]
                or item["pending"]
                or body.version != item["latest_version"]
            ):
                raise HTTPException(409, "update_changed")
            if body.backup and not item["can_backup"]:
                raise HTTPException(422, "backup_unsupported")
            if m.demo:
                return {"status": "simulated"}
            m.pending_updates[entity_id] = (body.version, time.monotonic())
            await m.ws(
                "call_service",
                domain="update",
                service="install",
                service_data={"entity_id": entity_id}
                | ({"backup": body.backup} if item["can_backup"] else {}),
            )
            return {"status": "accepted"}

    return router
