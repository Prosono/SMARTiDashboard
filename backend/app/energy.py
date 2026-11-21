"""Personal energy presentation and comparable, recorder-backed completed-hour statistics."""

import math
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from sys import float_info
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from websockets.exceptions import ConnectionClosed

from .access import visible
from .device_energy_history import DeviceEnergyHistory
from .device_energy_sources import device_energy_inventory, source_statistics
from .ha import HAError

PERIOD_HOURS = {"24h": 24, "7d": 168, "30d": 720}
CONSUMER_ROLES = {"consumer", "ev"}
ENERGY_UNITS = {"Wh", "kWh"}
APPLIANCE_DOMAINS = {"climate", "light", "media_player", "switch", "vacuum"}
MAX_DEVICE_METERS = 60


def device_meters(controls, devices, areas, config, preferences):
    meters = {
        c.entity_id: c
        for c in controls
        if c.domain == "sensor"
        and c.attributes.get("unit_of_measurement") in ENERGY_UNITS
        and c.attributes.get("device_class") in {"energy", None}
    }
    aggregate = set(source_statistics(preferences.get("energy_sources", [])))
    if config:
        aggregate.update(meter.entity for meter in config.meters if meter.role not in CONSUMER_ROLES)
        aggregate.update(
            [
                config.power_entity,
                config.power.get("home"),
                config.power.get("solar"),
                config.power.get("battery"),
            ]
        )
    aggregate_devices = {c.device_id for c in controls if c.device_id and c.entity_id in aggregate}
    selected = {}

    def select(entity, name=None):
        meter = meters.get(entity)
        if not meter or entity in aggregate or entity in selected:
            return
        device = devices.get(meter.device_id, {})
        display_name = name.strip() if isinstance(name, str) else ""
        selected[entity] = {
            "id": meter.id,
            "name": display_name or device.get("name_by_user") or device.get("name") or meter.name,
            "room": areas.get(meter.area_id, {}).get("name"),
        }

    if config:
        for meter in config.meters:
            if meter.role in CONSUMER_ROLES:
                select(meter.entity, meter.name)
    sources = preferences.get("device_consumption")
    for source in sources if isinstance(sources, list) else []:
        if isinstance(source, dict) and isinstance(source.get("stat_consumption"), str):
            select(source["stat_consumption"], source.get("name"))

    # A linked controllable appliance with one cumulative energy sensor can be
    # identified without manual setup. Ambiguous devices need an explicit meter.
    appliances = {c.device_id for c in controls if c.domain in APPLIANCE_DOMAINS and not c.diagnostic}
    excluded = aggregate_devices | {meters[entity].device_id for entity in selected}
    linked = defaultdict(list)
    for meter in meters.values():
        if meter.device_id and meter.device_id in appliances and meter.device_id not in excluded:
            linked[meter.device_id].append(meter)
    for group in sorted(linked.values(), key=lambda group: group[0].name.casefold()):
        if len(group) == 1 and group[0].attributes.get("state_class") in {"total", "total_increasing"}:
            select(group[0].entity_id)
    return dict(list(selected.items())[:MAX_DEVICE_METERS])


def device_usage(rows, start, hours):
    first = int(start.timestamp()) * 1000
    end = first + hours * 3_600_000
    values = {}
    for row in rows[: hours + 2]:
        if not isinstance(row, dict):
            continue
        stamp, consumption = row.get("start"), row.get("change")
        if (
            type(stamp) in {int, float}
            and first <= stamp < end
            and (stamp - first) % 3_600_000 == 0
            and type(consumption) in {int, float}
            and 0 <= consumption <= float_info.max
        ):
            values[stamp] = float(consumption)
    total = sum(values.values()) if values else None
    if total is None or not math.isfinite(total):
        return {"kwh": None, "coverage": 0}
    return {"kwh": total, "coverage": round(len(values) / hours * 100, 1)}


class EnergyPreferences(BaseModel):
    model_config = {"extra": "forbid"}
    meters: list[str] = Field(default_factory=list, max_length=6)
    hidden: list[Literal["summary", "chart", "comparison", "meters", "sources"]] = Field(
        default_factory=list, max_length=5
    )
    period: Literal["24h", "7d", "30d"] = "24h"
    chart: Literal["bar", "line"] = "bar"


def summarize(rows, start, end, energy):
    count = int((end - start).total_seconds() / 3600)
    indexed = {}
    field = "change" if energy else "mean"
    for row in rows[:1600]:
        stamp, value = row.get("start"), row.get(field)
        if not isinstance(stamp, (int, float)) or not math.isfinite(stamp):
            continue
        offset = (stamp / 1000 - start.timestamp()) / 3600
        if not offset.is_integer() or not 0 <= offset < count:
            continue
        indexed[int(offset)] = value if isinstance(value, (float, int)) and math.isfinite(value) else None
    values = [indexed.get(i) for i in range(count)]
    valid = [v for v in values if v is not None]
    total = (sum(valid) if energy else sum(valid) / len(valid)) if valid else None
    # Energy totals only represent complete periods; partial readings remain explicitly partial.
    group = 1 if count <= 24 else 24
    points = []
    for i in range(0, count, group):
        bucket = values[i : i + group]
        complete = all(v is not None for v in bucket)
        points.append(
            {
                "time": (start + timedelta(hours=i)).isoformat(),
                "value": (sum(bucket) if energy else sum(bucket) / len(bucket)) if complete else None,
            }
        )
    return {
        "value": total,
        "complete": len(valid) == count,
        "coverage": round(len(valid) / count * 100) if count else 0,
        "points": points,
        "peak": max(valid) if valid else None,
    }


def energy_router(ha, store, user, settings, repo=None, *, platform=None):
    router = APIRouter(prefix="/api/home/energy")
    device_history = DeviceEnergyHistory(ha, repo, platform)

    def meters():
        return {
            c.id: c
            for c in ha.controls()
            if c.domain == "sensor"
            and c.attributes.get("unit_of_measurement") in {"W", "kW", "Wh", "kWh"}
            and c.attributes.get("device_class") in {None, "power", "energy"}
        }

    def preference(current):
        return EnergyPreferences.model_validate_json(store.get(f"energy_preferences:{current['id']}", "{}"))

    @router.get("/preferences")
    async def get_preferences(current=Depends(user)):
        return preference(current)

    @router.put("/preferences")
    async def save_preferences(body: EnergyPreferences, current=Depends(user)):
        if len(set(body.meters)) != len(body.meters) or any(id not in meters() for id in body.meters):
            raise HTTPException(422, "invalid_energy_meters")
        store.set(f"energy_preferences:{current['id']}", body.model_dump_json())
        return body

    @router.get("/statistics")
    async def statistics(
        period: Literal["24h", "7d", "30d"] = "24h", ids: list[str] = Query(default=[]), current=Depends(user)
    ):
        available = meters()
        ids = list(dict.fromkeys(ids or preference(current).meters or list(available)[:4]))
        if len(ids) > 6 or any(id not in available for id in ids):
            raise HTTPException(422, "invalid_energy_meters")
        hours = PERIOD_HOURS[period]
        end = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
        start = end - timedelta(hours=hours)
        previous = start - timedelta(hours=hours)
        selected = [available[id] for id in ids]
        data = {}
        if selected and settings.mode != "demo":
            if not ha.connected:
                raise HTTPException(503, "ha_disconnected")
            try:
                data = await ha.request(
                    "recorder/statistics_during_period",
                    start_time=previous.isoformat(),
                    end_time=end.isoformat(),
                    statistic_ids=[c.entity_id for c in selected],
                    period="hour",
                    units={"energy": "kWh", "power": "kW"},
                    types=["change", "mean"],
                )
            except (HAError, TimeoutError):
                raise HTTPException(503, "energy_statistics_unavailable") from None
        result = []
        for c in selected:
            energy = c.attributes.get("unit_of_measurement") in {"Wh", "kWh"}
            rows = (data or {}).get(c.entity_id, [])
            now = summarize(rows, start, end, energy)
            before = summarize(rows, previous, start, energy)
            comparison = None
            if now["complete"] and before["complete"] and before["value"] and before["value"] > 0:
                comparison = (now["value"] - before["value"]) / before["value"] * 100
            result.append(
                {
                    "id": c.id,
                    "name": c.name,
                    "unit": "kWh" if energy else "kW",
                    "kind": "energy" if energy else "power",
                    "current": now,
                    "previous": before,
                    "change_percent": comparison,
                }
            )
        return {
            "start": start.isoformat(),
            "end": end.isoformat(),
            "previous_start": previous.isoformat(),
            "period": period,
            "series": result,
            "demo": settings.mode == "demo",
        }

    @router.get("/device-consumption")
    async def device_consumption(period: Literal["24h", "7d", "30d"] = "24h", current=Depends(user)):
        hours = PERIOD_HOURS[period]
        end = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
        start = end - timedelta(hours=hours)
        demo = settings.mode == "demo"
        result = {"period": period, "start": start, "end": end, "devices": [], "demo": demo}
        if demo:
            return result
        if not ha.connected:
            raise HTTPException(503, "ha_disconnected")
        try:
            preferences = await ha.request("energy/get_prefs", _timeout=3)
        except (HAError, OSError, ConnectionClosed):
            preferences = None
        if not ha.connected:
            raise HTTPException(503, "ha_disconnected")
        meters = device_meters(
            [c for c in ha.controls() if visible(current, c)],
            getattr(ha, "devices", {}),
            getattr(ha, "areas", {}),
            repo.config() if repo else None,
            preferences if isinstance(preferences, dict) else {},
        )
        if not meters:
            return result
        try:
            data = await ha.request(
                "recorder/statistics_during_period",
                _timeout=9,
                start_time=start.isoformat(),
                end_time=end.isoformat(),
                statistic_ids=list(meters),
                period="hour",
                units={"energy": "kWh"},
                types=["change"],
            )
        except (HAError, OSError, ConnectionClosed):
            raise HTTPException(503, "energy_statistics_unavailable") from None
        if not isinstance(data, dict):
            raise HTTPException(503, "energy_statistics_unavailable")
        devices = []
        for entity, meter in meters.items():
            rows = data.get(entity)
            devices.append({**meter, **device_usage(rows if isinstance(rows, list) else [], start, hours)})
        result["devices"] = sorted(
            devices,
            key=lambda device: (device["kwh"] is None, -(device["kwh"] or 0), device["name"].casefold()),
        )
        return result

    @router.get("/device-consumption/history")
    async def device_consumption_history(period: Literal["24h", "7d", "30d"] = "24h", current=Depends(user)):
        inventory = await device_energy_inventory(ha, store, settings, repo, current)
        return await device_history.read(
            period, PERIOD_HOURS[period], inventory.selected, settings.mode == "demo"
        )

    return router
