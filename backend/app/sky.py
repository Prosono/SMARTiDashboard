"""Read-only local astronomy. Home coordinates and HA configuration stay on the server."""

import asyncio
import math
import time
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from astral import Observer
from astral import moon as lunar
from astral import sun as solar
from fastapi import APIRouter, Depends, Response

from .ha import HAError


def valid_zone(value):
    if not isinstance(value, str) or not value or len(value) > 100:
        return None
    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError):
        return None
    return value


def location_from_config(config, fallback_zone=None):
    config = config if isinstance(config, dict) else {}
    zone = valid_zone(config.get("time_zone")) or valid_zone(fallback_zone)
    lat, lon = config.get("latitude"), config.get("longitude")
    if not all(
        isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in [lat, lon]
    ):
        return zone, None
    if abs(lat) > 90 or abs(lon) > 180 or not zone:
        return zone, None
    return zone, (lat, lon)


def position(observer, moment, body):
    azimuth, altitude = body.azimuth(observer, moment), body.elevation(observer, moment)
    if not math.isfinite(azimuth) or not math.isfinite(altitude):
        raise ValueError("position_unavailable")
    return {"azimuth": round(azimuth % 360, 3), "altitude": round(altitude, 3)}


def event(function, observer, day, zone):
    try:
        value = function(observer, date=day, tzinfo=zone)
        return value.astimezone(UTC) if value else None
    except (ValueError, ArithmeticError):
        return None


def calculate_sky(latitude, longitude, timezone, now):
    zone = ZoneInfo(timezone)
    day = now.astimezone(zone).date()
    start = datetime.combine(day, datetime.min.time(), zone).astimezone(UTC)
    end = datetime.combine(day + timedelta(days=1), datetime.min.time(), zone).astimezone(UTC)
    observer = Observer(latitude, longitude)
    # Fixed half-hour samples cover the actual local day, including 23/25-hour DST days.
    steps = round((end - start).total_seconds() / 1800)
    path = []
    for step in range(steps + 1):
        moment = start + (end - start) * step / steps
        path.append(
            {
                "time": moment.isoformat(),
                "sun": position(observer, moment, solar),
                "moon": position(observer, moment, lunar),
            }
        )
    sunrise, sunset = (event(fn, observer, day, zone) for fn in [solar.sunrise, solar.sunset])
    noon = event(solar.noon, observer, day, zone)
    moonrise, moonset = (event(fn, observer, day, zone) for fn in [lunar.moonrise, lunar.moonset])
    sun_state = "normal"
    if sunrise is None and sunset is None:
        sun_state = (
            "always_up" if solar.elevation(observer, noon or start + (end - start) / 2) > 0 else "always_down"
        )
    elif sunrise is None or sunset is None:
        sun_state = "partial"
    if sunrise and sunset:
        daylight = (sunset - sunrise).total_seconds()
        if daylight < 0:
            daylight += (end - start).total_seconds()
    elif sun_state == "always_up":
        daylight = (end - start).total_seconds()
    elif sun_state == "always_down":
        daylight = 0
    elif sunset:
        daylight = (sunset - start).total_seconds()
    else:
        daylight = (end - sunrise).total_seconds()
    moon_state = "normal"
    if moonrise is None and moonset is None:
        altitudes = [point["moon"]["altitude"] for point in path]
        moon_state = (
            "always_up" if min(altitudes) >= 0 else "always_down" if max(altitudes) < 0 else "partial"
        )
    elif moonrise is None or moonset is None:
        moon_state = "partial"
    phase = lunar.phase(now.astimezone(UTC).date()) / 28

    def iso(value):
        return value.isoformat() if value else None

    return {
        "generated_at": now.isoformat(),
        "timezone": timezone,
        "available": True,
        "day": {"date": day.isoformat(), "start": start.isoformat(), "end": end.isoformat()},
        "sun": {
            **position(observer, now, solar),
            "rise": iso(sunrise),
            "set": iso(sunset),
            "noon": iso(noon),
            "state": sun_state,
            "daylight_seconds": round(max(0, min((end - start).total_seconds(), daylight))),
        },
        "moon": {
            **position(observer, now, lunar),
            "rise": iso(moonrise),
            "set": iso(moonset),
            "state": moon_state,
            "phase": phase,
            "fraction": (1 - math.cos(phase * 2 * math.pi)) / 2,
        },
        "path": path,
    }


def sky_router(store, user, ha, settings):
    router = APIRouter(prefix="/api/home", dependencies=[Depends(user)])
    lock = asyncio.Lock()
    metadata, attempted, epoch = None, -math.inf, None
    cached_key, cached = None, None

    @router.get("/sky")
    async def sky(response: Response):
        nonlocal metadata, attempted, epoch, cached_key, cached
        response.headers["Cache-Control"] = "private, no-store"
        async with lock:
            demo = settings.mode == "demo"
            if demo:
                config = {"latitude": 59.9139, "longitude": 10.7522, "time_zone": "Europe/Oslo"}
            else:
                current_epoch = getattr(ha, "epoch", 0)
                if ha.connected and (
                    time.monotonic() - attempted >= (300 if metadata else 30) or epoch != current_epoch
                ):
                    attempted, epoch = time.monotonic(), current_epoch
                    try:
                        value = await ha.request("get_config")
                        if isinstance(value, dict):
                            metadata = {key: value.get(key) for key in ["latitude", "longitude", "time_zone"]}
                    except (HAError, TimeoutError):
                        pass
                config = metadata or {}
            timezone, location = location_from_config(config, store.get("timezone"))
            now = datetime.now(UTC)
            status = (
                "demo"
                if demo
                else "configured"
                if location and ha.connected
                else "cached"
                if location
                else "missing"
                if ha.connected
                else "unavailable"
            )
            key = (int(now.timestamp()) // 60, timezone, location)
            if key != cached_key:
                if location:
                    cached = calculate_sky(*location, timezone, now)
                else:
                    phase = lunar.phase(now.date()) / 28
                    cached = {
                        "generated_at": now.isoformat(),
                        "timezone": timezone,
                        "available": False,
                        "day": None,
                        "sun": None,
                        "moon": {"phase": phase, "fraction": (1 - math.cos(phase * 2 * math.pi)) / 2},
                        "path": [],
                    }
                cached_key = key
            return {**cached, "demo": demo, "location_status": status}

    return router
