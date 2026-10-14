"""Explicit administrator settings for the home, people and controller health."""

import asyncio
import os
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator


class HomeSettings(BaseModel):
    model_config = {"extra": "forbid"}
    location_name: str = Field(min_length=1, max_length=80)
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    elevation: int = Field(ge=-500, le=9000)
    time_zone: str = Field(max_length=100)

    @field_validator("location_name")
    @classmethod
    def name(cls, value):
        if not value.strip():
            raise ValueError("Name required")
        return value.strip()

    @field_validator("time_zone")
    @classmethod
    def timezone(cls, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("Invalid time zone") from None
        return value


class PersonSettings(BaseModel):
    model_config = {"extra": "forbid"}
    name: str = Field(min_length=1, max_length=80)
    device_trackers: list[str] = Field(default_factory=list, max_length=50)

    @field_validator("name")
    @classmethod
    def name_valid(cls, value):
        if not value.strip():
            raise ValueError("Name required")
        return value.strip()


def system_settings_router(m, admin, settings):
    router = APIRouter(prefix="/api/manage/settings", dependencies=[Depends(admin)])

    def live():
        if m.demo:
            raise HTTPException(503, "live_settings_required")
        m.connected()

    async def supervisor(path):
        if m.demo or not settings.ingress:
            return None
        token = os.environ.get("SUPERVISOR_TOKEN")
        if not token:
            return None
        try:
            async with httpx.AsyncClient(timeout=10, follow_redirects=False, trust_env=False) as client:
                r = await client.get("http://supervisor" + path, headers={"Authorization": "Bearer " + token})
                r.raise_for_status()
                result = r.json()
                return result.get("data") if result.get("result") == "ok" else None
        except (httpx.HTTPError, ValueError):
            return None

    @router.get("/system")
    async def system():
        host, core, network, backups = await asyncio.gather(
            *(supervisor(p) for p in ["/host/info", "/core/stats", "/network/info", "/backups/info"])
        )

        def pick(value, keys):
            return {k: (value or {}).get(k) for k in keys}

        return {
            "demo": m.demo,
            "host": pick(
                host, ["hostname", "operating_system", "kernel", "disk_total", "disk_used", "disk_free"]
            ),
            "core": pick(core, ["cpu_percent", "memory_usage", "memory_limit", "memory_percent"]),
            "network": None
            if network is None
            else [
                {
                    **pick(i, ["interface", "type", "connected", "primary"]),
                    "addresses": (i.get("ipv4") or {}).get("address", []),
                }
                for i in network.get("interfaces", [])
            ],
            "backups": None
            if backups is None
            else [
                pick(b, ["slug", "name", "date", "size", "type", "protected"])
                for b in backups.get("backups", [])
            ],
            "unavailable": [
                name
                for name, data in [("host", host), ("core", core), ("network", network), ("backups", backups)]
                if data is None
            ],
        }

    @router.get("/home")
    async def home():
        live()
        config = await m.rest("GET", "config")
        return {k: config.get(k) for k in HomeSettings.model_fields}

    @router.put("/home")
    async def save_home(body: HomeSettings):
        live()
        await m.ws("config/core/update", **body.model_dump())
        m.store.set("home_name", body.location_name)
        m.store.set("timezone", body.time_zone)
        return {"saved": True}

    @router.get("/people")
    async def people():
        live()
        result = await m.ws("person/list")
        return {
            "people": [
                {
                    "id": p["id"],
                    "name": p["name"],
                    "device_trackers": p.get("device_trackers", []),
                    "editable": editable,
                }
                for group, editable in [("storage", True), ("config", False)]
                for p in result.get(group, [])
            ],
            "trackers": [
                {"id": id, "name": state.get("attributes", {}).get("friendly_name", id)}
                for id, state in m.ha.states.items()
                if id.startswith("device_tracker.")
            ],
        }

    async def validate_person(body):
        live()
        if any(id not in m.ha.states or not id.startswith("device_tracker.") for id in body.device_trackers):
            raise HTTPException(422, "invalid_tracker")

    async def editable(id):
        live()
        result = await m.ws("person/list")
        if not any(p["id"] == id for p in result.get("storage", [])):
            raise HTTPException(404, "person_not_editable")

    @router.post("/people")
    async def create_person(body: PersonSettings):
        await validate_person(body)
        result = await m.ws("person/create", **body.model_dump())
        return {"id": result["id"]}

    @router.put("/people/{id}")
    async def update_person(id: str, body: PersonSettings):
        await editable(id)
        await validate_person(body)
        await m.ws("person/update", person_id=id, **body.model_dump())
        return {"saved": True}

    @router.delete("/people/{id}")
    async def delete_person(id: str):
        await editable(id)
        await m.ws("person/delete", person_id=id)
        return {"deleted": True}

    return router
