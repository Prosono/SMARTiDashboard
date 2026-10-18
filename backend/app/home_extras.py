"""Authenticated people photos/preferences, daily forecasts and registry device inspection."""

import base64
import binascii
import math
import re
import time
from datetime import UTC, datetime, timedelta
from typing import Literal
from urllib.parse import quote, urlencode
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from .ha import HAError


class PeoplePreferences(BaseModel):
    model_config = {"extra": "forbid"}
    people: list[str] | None = Field(default=None, max_length=100)
    only_home: bool = False


class PersonPhoto(BaseModel):
    model_config = {"extra": "forbid"}
    data: str = Field(max_length=800_000)


def image_type(raw):
    if raw.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if raw.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if raw.startswith(b"RIFF") and raw[8:12] == b"WEBP":
        return "image/webp"
    raise HTTPException(422, "invalid_image")


def person_image_path(value):
    # Only local image endpoints from the person entity; never arbitrary URLs/redirects.
    if (
        not isinstance(value, str)
        or not re.fullmatch(
            r"/(?:api/image/serve/[a-fA-F0-9]+/[A-Za-z0-9_.-]+|local/[A-Za-z0-9_./-]+)", value
        )
        or ".." in value
    ):
        raise HTTPException(404, "image_unavailable")
    return value


def forecast_days(rows, timezone, now):
    """Keep at most five local calendar days, without filling gaps with invented data."""
    zone = ZoneInfo(timezone)
    today = now.astimezone(zone).date()
    result = {}
    for row in rows[:40]:
        if not isinstance(row, dict):
            continue
        try:
            date = datetime.fromisoformat(row["datetime"])
            date = (date.replace(tzinfo=zone) if date.tzinfo is None else date.astimezone(zone)).date()
        except (ValueError, TypeError, KeyError):
            continue
        if not today <= date <= today + timedelta(days=4) or date in result:
            continue
        item = {"date": date.isoformat(), "condition": str(row.get("condition") or "unknown")[:80]}
        for key in ["temperature", "templow", "precipitation", "precipitation_probability", "wind_speed"]:
            value = row.get(key)
            item[key] = (
                value
                if isinstance(value, (float, int)) and not isinstance(value, bool) and math.isfinite(value)
                else None
            )
        result[date] = item
    return [result[date] for date in sorted(result)]


def daily_forecasts(rows, timezone, now):
    today = now.astimezone(ZoneInfo(timezone)).date()
    dates = {today.isoformat(): "today", (today + timedelta(days=1)).isoformat(): "tomorrow"}
    return {dates[day["date"]]: day for day in forecast_days(rows, timezone, now) if day["date"] in dates}


def extras_router(store, user, ha, settings):
    router = APIRouter(prefix="/api", dependencies=[Depends(user)])
    cache = {}

    def admin(current):
        if current["role"] != "admin":
            raise HTTPException(403, "admin_required")

    def person(id):
        if not any(c.entity_id == id and c.domain == "person" for c in ha.controls()):
            raise HTTPException(404, "person_not_found")

    def device(id, current):
        admin(current)
        if id not in ha.devices:
            raise HTTPException(404, "device_not_found")
        return ha.devices[id]

    @router.get("/home/people")
    async def people(current=Depends(user)):
        prefs = PeoplePreferences.model_validate_json(store.get(f"people:{current['id']}", "{}"))
        return {
            **prefs.model_dump(),
            "photos": {
                c.entity_id: {
                    "custom": bool(store.get("person_photo:" + c.entity_id)),
                    "available": bool(
                        store.get("person_photo:" + c.entity_id)
                        or ha.states.get(c.entity_id, {}).get("attributes", {}).get("entity_picture")
                    ),
                }
                for c in ha.controls()
                if c.domain == "person"
            },
        }

    @router.put("/home/people")
    async def save_people(body: PeoplePreferences, current=Depends(user)):
        for id in body.people or []:
            person(id)
        store.set(f"people:{current['id']}", body.model_dump_json())
        return {"saved": True}

    @router.put("/home/people/{id}/photo")
    async def save_photo(id: str, body: PersonPhoto, current=Depends(user)):
        admin(current)
        person(id)
        if body.data:
            try:
                raw = base64.b64decode(body.data, validate=True)
            except (ValueError, binascii.Error):
                raise HTTPException(422, "invalid_image") from None
            if len(raw) > 600_000:
                raise HTTPException(413, "image_too_large")
            image_type(raw)
        store.set("person_photo:" + id, body.data)
        return {"saved": True}

    @router.get("/home/people/{id}/photo")
    async def photo(id: str):
        person(id)
        custom = store.get("person_photo:" + id)
        if custom:
            raw = base64.b64decode(custom)
        else:
            path = person_image_path(ha.states.get(id, {}).get("attributes", {}).get("entity_picture"))
            if settings.mode == "demo" or not ha.connected:
                raise HTTPException(404, "image_unavailable")
            base = ha.http_url.removesuffix("api/").rstrip("/")
            try:
                async with httpx.AsyncClient(timeout=10, follow_redirects=False, trust_env=False) as client:
                    async with client.stream(
                        "GET",
                        base + path,
                        headers={"Authorization": "Bearer " + ha.token},
                    ) as response:
                        if response.status_code != 200:
                            raise HTTPException(404, "image_unavailable")
                        raw = b""
                        async for part in response.aiter_bytes():
                            raw += part
                            if len(raw) > 600_000:
                                raise HTTPException(413, "image_too_large")
            except httpx.HTTPError:
                raise HTTPException(503, "image_unavailable") from None
        return Response(
            raw,
            media_type=image_type(raw),
            headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
        )

    @router.get("/home/weather/{id}")
    async def weather(id: str):
        c = next((c for c in ha.controls() if c.id == id and c.domain == "weather"), None)
        if not c:
            raise HTTPException(404, "weather_not_found")
        if not ha.connected or c.availability != "available":
            raise HTTPException(503, "weather_unavailable")
        zone = store.get("timezone", "Europe/Oslo")
        try:
            ZoneInfo(zone)
        except ZoneInfoNotFoundError:
            zone = "Europe/Oslo"
        now = datetime.now(UTC)
        if settings.mode == "demo":
            rows = []
        elif id in cache and time.monotonic() - cache[id][0] < 300:
            rows = cache[id][1]
        else:
            try:
                response = await ha.request(
                    "call_service",
                    domain="weather",
                    service="get_forecasts",
                    target={"entity_id": c.entity_id},
                    service_data={"type": "daily"},
                    return_response=True,
                )
                rows = (response or {}).get("response", {}).get(c.entity_id, {}).get("forecast", [])
                if not isinstance(rows, list):
                    raise HAError("invalid_forecast")
            except (HAError, TimeoutError):
                raise HTTPException(503, "forecast_unavailable") from None
            if len(cache) > 30:
                cache.clear()
            cache[id] = (time.monotonic(), rows[:40])
        return {
            "timezone": zone,
            "days": daily_forecasts(rows, zone, now),
            "forecast": forecast_days(rows, zone, now),
            "temperature_unit": c.attributes.get("temperature_unit"),
            "precipitation_unit": c.attributes.get("precipitation_unit"),
            "wind_speed_unit": c.attributes.get("wind_speed_unit"),
        }

    @router.get("/manage/device/{id}")
    async def device_detail(id: str, current=Depends(user)):
        d = device(id, current)
        controls = [c.model_dump() for c in ha.controls() if c.device_id == id]
        return {
            "id": id,
            "name": d.get("name_by_user") or d.get("name") or id,
            "manufacturer": d.get("manufacturer"),
            "model": d.get("model"),
            "firmware": d.get("sw_version"),
            "hardware": d.get("hw_version"),
            "area": ha.areas.get(d.get("area_id"), {}).get("name"),
            "connected": ha.connected,
            "controls": controls,
        }

    @router.get("/controls/{entity_id}/history")
    async def control_history(entity_id: str, hours: Literal["6", "24", "168"] = "24", current=Depends(user)):
        c = next((c for c in ha.controls() if c.entity_id == entity_id), None)
        if not c:
            raise HTTPException(404, "control_not_found")
        return await read_history(c, hours)

    @router.get("/manage/device/{id}/history")
    async def device_history(
        id: str, entity_id: str, hours: Literal["24", "168"] = "24", current=Depends(user)
    ):
        device(id, current)
        c = next(
            (
                c
                for c in ha.controls()
                if c.device_id == id and c.entity_id == entity_id and c.domain in {"sensor", "binary_sensor"}
            ),
            None,
        )
        if not c:
            raise HTTPException(404, "sensor_not_found")
        return await read_history(c, hours)

    async def read_history(c, hours):
        entity_id = c.entity_id
        if settings.mode != "demo" and not ha.connected:
            raise HTTPException(503, "history_unavailable")
        start = datetime.now(UTC) - timedelta(hours=int(hours))
        if settings.mode == "demo":
            rows = []
        else:
            try:
                data = await ha.rest(
                    "GET",
                    "history/period/"
                    + quote(start.isoformat(), safe="")
                    + "?"
                    + urlencode({"filter_entity_id": entity_id, "no_attributes": "", "minimal_response": ""}),
                )
                rows = data[0] if data else []
            except (HAError, TimeoutError):
                raise HTTPException(503, "history_unavailable") from None
        points = []
        for row in rows:
            stamp = row.get("last_changed") or row.get("last_updated")
            try:
                datetime.fromisoformat(stamp)
            except (TypeError, ValueError):
                continue
            try:
                v = float(row.get("state"))
                v = v if math.isfinite(v) else None
            except (ValueError, TypeError):
                v = None
            points.append({"time": stamp, "value": v, "state": str(row.get("state", "unknown"))[:80]})
        values = [p["value"] for p in points if p["value"] is not None]
        stride = max(1, math.ceil(len(points) / 300))
        sampled = []
        for i in range(0, len(points), stride):
            bucket = points[i : i + stride]
            sampled.append(next((p for p in bucket if p["value"] is None), bucket[-1]))
        return {
            "unit": c.attributes.get("unit_of_measurement"),
            "points": sampled,
            "minimum": min(values) if values else None,
            "maximum": max(values) if values else None,
            "samples": len(points),
            "start": start.isoformat(),
            "end": datetime.now(UTC).isoformat(),
        }

    return router
