"""Capability-driven home preferences, still images and bounded read-only history."""

import base64
import binascii
import json
import math
from datetime import UTC, datetime, timedelta
from typing import Literal
from urllib.parse import quote, urlencode

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from .ha import HAError


class Preferences(BaseModel):
    model_config = {"extra": "forbid"}
    rooms: list[str] = Field(default_factory=list, max_length=12)
    energy: str | None = Field(default=None, max_length=200)
    cameras: list[str] = Field(default_factory=list, max_length=8)


class RoomViewPreferences(BaseModel):
    model_config = {"extra": "forbid"}
    hidden: list[str] = Field(default_factory=list, max_length=500)


class ModeBinding(BaseModel):
    model_config = {"extra": "forbid"}
    control_id: str | None = Field(default=None, max_length=200)


class Confirmation(BaseModel):
    confirmed: Literal[True]


class RoomImage(BaseModel):
    data: str = Field(max_length=1_400_000)


def home_router(store, user, ha, settings):
    router = APIRouter(prefix="/api/home")

    def admin(current):
        if current["role"] != "admin":
            raise HTTPException(403, "admin_required")

    def control(id):
        found = next((c for c in ha.controls() if c.id == id or c.entity_id == id), None)
        if not found:
            raise HTTPException(404, "entity_not_found")
        return found

    @router.get("/preferences")
    async def preferences(current=Depends(user)):
        with store.connect() as db:
            images = {
                row[0][11:]: bool(row[1])
                for row in db.execute("SELECT key,length(value) FROM settings WHERE key LIKE 'room_image:%'")
            }
        return {
            **Preferences.model_validate_json(
                store.get(f"home_preferences:{current['id']}", "{}")
            ).model_dump(),
            "modes": json.loads(store.get("home_modes", "{}")),
            "images": {id: images.get(id, False) for id in ha.areas},
        }

    @router.put("/preferences")
    async def save_preferences(body: Preferences, current=Depends(user)):
        if any(id not in ha.areas for id in body.rooms):
            raise HTTPException(422, "area_not_found")
        if body.energy:
            c = control(body.energy)
            if c.domain != "sensor" or c.attributes.get("unit_of_measurement") not in {
                "W",
                "kW",
                "Wh",
                "kWh",
            }:
                raise HTTPException(422, "invalid_meter")
        if any(control(id).domain != "camera" for id in body.cameras):
            raise HTTPException(422, "invalid_camera")
        store.set(f"home_preferences:{current['id']}", body.model_dump_json())
        return {"saved": True}

    @router.get("/room-view/{id}")
    async def room_view(id: str, current=Depends(user)):
        if id not in ha.areas:
            raise HTTPException(404, "area_not_found")
        return RoomViewPreferences.model_validate_json(
            store.get(f"room_view:{current['id']}:{id}", "{}")
        ).model_dump()

    @router.put("/room-view/{id}")
    async def save_room_view(id: str, body: RoomViewPreferences, current=Depends(user)):
        if id not in ha.areas:
            raise HTTPException(404, "area_not_found")
        allowed = {c.entity_id for c in ha.controls() if c.area_id == id}
        if any(entity not in allowed for entity in body.hidden):
            raise HTTPException(422, "entity_not_in_room")
        body.hidden = list(dict.fromkeys(body.hidden))
        store.set(f"room_view:{current['id']}:{id}", body.model_dump_json())
        return body.model_dump()

    @router.put("/modes/{mode}")
    async def bind_mode(
        mode: Literal["home", "away", "night", "holiday"], body: ModeBinding, current=Depends(user)
    ):
        admin(current)
        if body.control_id and control(body.control_id).domain not in {"scene", "script", "automation"}:
            raise HTTPException(422, "invalid_mode")
        # Read and write under one transaction to preserve concurrent edits to other modes.
        with store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT value FROM settings WHERE key='home_modes'").fetchone()
            modes = json.loads(row[0]) if row else {}
            modes[mode] = body.control_id
            db.execute("INSERT OR REPLACE INTO settings VALUES ('home_modes',?)", (json.dumps(modes),))
        return {"saved": True}

    @router.post("/modes/{mode}/run")
    async def run_mode(
        mode: Literal["home", "away", "night", "holiday"], body: Confirmation, current=Depends(user)
    ):
        id = json.loads(store.get("home_modes", "{}")).get(mode)
        if not id:
            raise HTTPException(409, "mode_not_configured")
        c = control(id)
        if not ha.connected or c.availability != "available":
            raise HTTPException(409, "device_unavailable")
        if c.domain not in {"scene", "script", "automation"}:
            raise HTTPException(422, "invalid_mode")
        if settings.mode == "demo":
            return {"status": "simulated"}
        try:
            await ha.request(
                "call_service",
                domain=c.domain,
                service="trigger" if c.domain == "automation" else "turn_on",
                target={"entity_id": c.entity_id},
                service_data={"skip_condition": False} if c.domain == "automation" else {},
            )
            return {"status": "accepted_unconfirmed"}
        except (HAError, TimeoutError):
            raise HTTPException(504, "command_unconfirmed_do_not_retry_automatically") from None

    @router.put("/room-image/{id}")
    async def room_image(id: str, body: RoomImage, current=Depends(user)):
        admin(current)
        if id not in ha.areas:
            raise HTTPException(404, "area_not_found")
        if body.data:
            try:
                data = base64.b64decode(body.data, validate=True)
                if len(data) > 1_000_000 or not (
                    data.startswith(b"\xff\xd8\xff") or data.startswith(b"\x89PNG\r\n\x1a\n")
                ):
                    raise ValueError()
            except (ValueError, binascii.Error):
                raise HTTPException(422, "invalid_image") from None
        store.set("room_image:" + id, body.data)
        return {"saved": True}

    @router.get("/room-image/{id}")
    async def image(id: str, current=Depends(user)):
        if id not in ha.areas:
            raise HTTPException(404, "area_not_found")
        data = store.get("room_image:" + id)
        if not data:
            raise HTTPException(404, "image_not_found")
        raw = base64.b64decode(data)
        return Response(
            raw,
            media_type="image/png" if raw.startswith(b"\x89PNG") else "image/jpeg",
            headers={"Cache-Control": "private, no-store"},
        )

    @router.get("/camera/{id}")
    async def camera(id: str, current=Depends(user)):
        c = control(id)
        if c.domain != "camera":
            raise HTTPException(404, "camera_not_found")
        if settings.mode == "demo" or c.availability != "available":
            raise HTTPException(503, "camera_unavailable")
        try:
            data, media_type = await ha.camera_image(c.entity_id)
            return Response(data, media_type=media_type, headers={"Cache-Control": "private, no-store"})
        except HAError:
            raise HTTPException(503, "camera_unavailable") from None

    @router.get("/history/{id}")
    async def history(id: str, current=Depends(user)):
        c = control(id)
        if c.domain != "sensor" or c.attributes.get("unit_of_measurement") not in {"W", "kW", "Wh", "kWh"}:
            raise HTTPException(422, "invalid_meter")
        if settings.mode == "demo":
            return {"points": [], "unit": c.attributes.get("unit_of_measurement")}
        start = datetime.now(UTC) - timedelta(hours=24)
        try:
            rows = await ha.rest(
                "GET",
                "history/period/"
                + quote(start.isoformat(), safe="")
                + "?"
                + urlencode({"filter_entity_id": c.entity_id, "no_attributes": "", "minimal_response": ""}),
            )
        except (HAError, TimeoutError):
            raise HTTPException(503, "history_unavailable") from None
        points = []
        for row in rows[0] if rows else []:
            try:
                value = float(row["state"])
                time = datetime.fromisoformat(row["last_changed"])
                if math.isfinite(value):
                    points.append({"time": time.isoformat(), "value": value})
            except (ValueError, TypeError, KeyError):
                # Explicit gap: never draw a continuous line across an unknown reading.
                points.append({"time": row.get("last_changed"), "value": None})
        # Return a bounded series; history UI never claims daily usage from cumulative totals.
        stride = max(1, math.ceil(len(points) / 300))
        sampled = []
        for index in range(0, len(points), stride):
            bucket = points[index : index + stride]
            sampled.append(next((p for p in bucket if p["value"] is None), bucket[-1]))
        return {"points": sampled, "unit": c.attributes.get("unit_of_measurement")}

    @router.get("/energy-sources")
    async def energy_sources(current=Depends(user)):
        if settings.mode == "demo" or not ha.connected:
            return []
        try:
            config = await ha.request("energy/get_prefs")
        except (HAError, TimeoutError):
            return []
        controls = {c.entity_id: c for c in ha.controls()}
        result = []
        for source in (config or {}).get("energy_sources", []):
            if source.get("type") not in {"solar", "battery"}:
                continue
            for field in ["stat_rate", "stat_soc", "stat_energy_from", "stat_energy_to"]:
                c = controls.get(source.get(field))
                if c:
                    result.append({"id": c.id, "type": source["type"], "measurement": field})
        for source in (config or {}).get("device_consumption", []):
            c = controls.get(source.get("stat_rate") or source.get("stat_consumption"))
            if c:
                result.append({"id": c.id, "type": "consumer", "measurement": "meter"})
        return result[:30]

    @router.get("/activity")
    async def activity(current=Depends(user)):
        controls = {c.entity_id: c for c in ha.controls()}
        return [
            e
            for e in ha.activity
            if e["entity_id"] in controls
            and (
                controls[e["entity_id"]].domain in {"lock", "binary_sensor", "climate", "alarm_control_panel"}
                or e["state"] in {"unavailable", "unknown"}
            )
        ][:20]

    return router
