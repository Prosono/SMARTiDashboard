"""Explicit power bindings and freshness-aware directional energy flows."""

import json
import math
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .access import visible
from .ha import HAError

ROLES = ("solar", "grid", "battery", "home", "ev")


class Binding(BaseModel):
    model_config = {"extra": "forbid"}
    visible: bool = True
    source: str | None = Field(default=None, max_length=200)
    return_source: str | None = Field(default=None, max_length=200)
    positive: Literal["supply", "consume"] = "supply"


class FlowPreferences(BaseModel):
    model_config = {"extra": "forbid"}
    solar: Binding = Field(default_factory=Binding)
    grid: Binding = Field(default_factory=Binding)
    battery: Binding = Field(default_factory=lambda: Binding(positive="consume"))
    home: Binding = Field(default_factory=Binding)
    ev: Binding = Field(default_factory=Binding)
    battery_level: str | None = Field(default=None, max_length=200)
    max_age: Literal[60, 300, 900, 3600] = 300
    animation: bool = True


def power_reading(c, states, connected, now, max_age, units=("W", "kW")):
    if not c:
        return None, "unconfigured", None
    raw = states.get(c.entity_id, {})
    stamp = raw.get("last_reported") or raw.get("last_updated") or c.updated_at
    if not connected or c.availability != "available":
        return None, "unavailable", stamp
    try:
        age = (now - datetime.fromisoformat(stamp)).total_seconds()
        if age > max_age or age < -60:
            return None, "stale", stamp
        try:
            value = float(c.state)
        except (TypeError, ValueError):
            return None, "invalid", stamp
        if not c.state.strip() or not math.isfinite(value):
            return None, "invalid", stamp
        unit = c.attributes.get("unit_of_measurement")
        if unit not in units:
            return None, "invalid", stamp
        return value * (1000 if unit == "kW" else 1), "ok", stamp
    except (TypeError, ValueError):
        return None, "stale", stamp


def energy_flow_router(store, user, ha, settings):
    router = APIRouter(prefix="/api/home/energy-flow", dependencies=[Depends(user)])

    def prefs(current):
        pref = FlowPreferences.model_validate_json(store.get(f"energy_flow:{current['id']}", "{}"))
        shared = json.loads(store.get("energy_platform_config", "{}"))
        for role, entity in dict(shared.get("power", {}), grid=shared.get("power_entity")).items():
            if role in ROLES and entity and not getattr(pref, role).source:
                getattr(pref, role).source = entity
        if not pref.battery_level:
            pref.battery_level = shared.get("battery_level")
        # Explicit setup choices define equipment, even without a live sensor.
        # Old configurations retain their previous per-user preferences.
        equipment = shared.get("equipment")
        if equipment is None and shared and not store.get(f"energy_flow:{current['id']}"):
            roles = {m["role"] for m in shared.get("meters", [])}
            power = shared.get("power", {})
            equipment = {
                "solar": bool(power.get("solar") or roles & {"solar", "export"}),
                "ev": bool(power.get("ev") or "ev" in roles),
                "battery": bool(
                    power.get("battery")
                    or shared.get("battery_level")
                    or roles & {"battery_charge", "battery_discharge"}
                ),
            }
        if equipment is not None:
            for role in ("solar", "ev", "battery"):
                binding = getattr(pref, role)
                binding.visible = bool(equipment.get(role, False))
                if not binding.visible:
                    binding.source = None
                    binding.return_source = None
            if not pref.battery.visible:
                pref.battery_level = None

        return pref

    @router.get("/preferences")
    async def get(current=Depends(user)):
        return prefs(current)

    @router.put("/preferences")
    async def save(body: FlowPreferences, current=Depends(user)):
        controls = {c.entity_id: c for c in ha.controls() if visible(current, c)}

        def validate(id, units):
            c = controls.get(id)
            if id and (not c or c.domain != "sensor" or c.attributes.get("unit_of_measurement") not in units):
                raise HTTPException(422, "invalid_flow_sensor")

        for role in ROLES:
            binding = getattr(body, role)
            if binding.visible:
                validate(binding.source, {"W", "kW"})
                validate(binding.return_source, {"W", "kW"})
            if binding.return_source and (
                role not in {"grid", "battery"}
                or not binding.source
                or binding.source == binding.return_source
            ):
                raise HTTPException(422, "invalid_return_sensor")
        if body.battery.visible:
            validate(body.battery_level, {"%"})
        store.set(f"energy_flow:{current['id']}", body.model_dump_json())
        return body

    @router.get("/live")
    async def live(current=Depends(user)):
        pref = prefs(current)
        controls = {c.entity_id: c for c in ha.controls() if visible(current, c)}
        now = datetime.now(UTC)
        result = {}
        for role in ROLES:
            binding = getattr(pref, role)
            value, status, stamp = power_reading(
                controls.get(binding.source), ha.states, ha.connected, now, pref.max_age
            )
            if binding.source and binding.source not in controls:
                status = "unavailable"
            if binding.return_source:
                other, other_status, other_stamp = power_reading(
                    controls.get(binding.return_source), ha.states, ha.connected, now, pref.max_age
                )
                if status != "ok" or other_status != "ok":
                    value, status = (
                        None,
                        status
                        if status != "ok"
                        else ("unavailable" if other_status == "unconfigured" else other_status),
                    )
                elif value < 0 or other < 0:
                    value, status = None, "invalid"
                else:
                    value -= other
                    stamp = min(stamp, other_stamp, key=lambda s: datetime.fromisoformat(s))
            if value is not None and role in {"grid", "battery"} and binding.positive == "consume":
                value = -value
            if value is not None and role in {"solar", "home", "ev"} and value < 0:
                value, status = None, "invalid"
            result[role] = {
                "watts": value,
                "status": status,
                "measured_at": stamp,
                "visible": binding.visible,
            }
        level, level_status, _ = power_reading(
            controls.get(pref.battery_level), ha.states, ha.connected, now, pref.max_age, units=("%",)
        )
        if level is not None and not 0 <= level <= 100:
            level, level_status = None, "invalid"
        return {
            "flows": result,
            "battery_level": level,
            "battery_status": level_status,
            "connected": ha.connected,
            "sampled_at": now.isoformat(),
        }

    @router.get("/history")
    async def history(period: Literal["24h", "7d"] = "24h", current=Depends(user)):
        pref = prefs(current)
        controls = {c.entity_id: c for c in ha.controls() if visible(current, c)}
        bindings = {role: getattr(pref, role) for role in ROLES}
        ids = sorted(
            {
                id
                for binding in bindings.values()
                if binding.visible
                for id in (binding.source, binding.return_source)
                if id in controls and controls[id].attributes.get("unit_of_measurement") in {"W", "kW"}
            }
        )
        if not ha.connected:
            raise HTTPException(503, "flow_history_unavailable")
        end = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
        start = end - timedelta(hours=24 if period == "24h" else 168)
        data = {}
        if ids and settings.mode != "demo":
            try:
                data = await ha.request(
                    "recorder/statistics_during_period",
                    start_time=start.isoformat(),
                    end_time=end.isoformat(),
                    statistic_ids=ids,
                    period="hour",
                    units={"power": "kW"},
                    types=["mean"],
                )
            except (HAError, TimeoutError):
                raise HTTPException(503, "flow_history_unavailable") from None
        return {
            "period": period,
            "start": start.isoformat(),
            "end": end.isoformat(),
            "series": flow_history(bindings, data or {}, start, end),
        }

    return router


def flow_history(bindings, data, start, end):
    """Align completed hours before netting split meters; gaps never become zero."""
    count = int((end - start).total_seconds() / 3600)
    indexed = {}
    for id, rows in data.items():
        hours = {}
        for row in rows[: count + 2]:
            stamp, mean = row.get("start"), row.get("mean")
            if not isinstance(stamp, (int, float)) or not math.isfinite(stamp):
                continue
            offset = (stamp / 1000 - start.timestamp()) / 3600
            if offset.is_integer() and 0 <= offset < count:
                hours[int(offset)] = (
                    mean * 1000 if isinstance(mean, (int, float)) and math.isfinite(mean) else None
                )
        indexed[id] = hours
    series = {}
    for role, binding in bindings.items():
        if not binding.visible or not binding.source:
            continue
        points = []
        for i in range(count):
            value = indexed.get(binding.source, {}).get(i)
            if binding.return_source:
                other = indexed.get(binding.return_source, {}).get(i)
                value = (
                    value - other
                    if value is not None and other is not None and value >= 0 and other >= 0
                    else None
                )
            if value is not None and role in {"grid", "battery"} and binding.positive == "consume":
                value = -value
            if value is not None and role in {"solar", "home", "ev"} and value < 0:
                value = None
            points.append({"time": (start + timedelta(hours=i)).isoformat(), "value": value})
        series[role] = points
    return series
