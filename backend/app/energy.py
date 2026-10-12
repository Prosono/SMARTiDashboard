"""Personal energy presentation and comparable, recorder-backed completed-hour statistics."""

import math
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from .ha import HAError


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


def energy_router(ha, store, user, settings):
    router = APIRouter(prefix="/api/home/energy")

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
        hours = {"24h": 24, "7d": 168, "30d": 720}[period]
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

    return router
