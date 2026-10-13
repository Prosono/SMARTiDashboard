"""Explicit power bindings and freshness-aware directional energy flows."""

import math
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

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


def energy_flow_router(store, user, ha):
    router = APIRouter(prefix="/api/home/energy-flow", dependencies=[Depends(user)])

    def prefs(current):
        return FlowPreferences.model_validate_json(store.get(f"energy_flow:{current['id']}", "{}"))

    @router.get("/preferences")
    async def get(current=Depends(user)):
        return prefs(current)

    @router.put("/preferences")
    async def save(body: FlowPreferences, current=Depends(user)):
        controls = {c.entity_id: c for c in ha.controls()}

        def validate(id, units):
            c = controls.get(id)
            if id and (not c or c.domain != "sensor" or c.attributes.get("unit_of_measurement") not in units):
                raise HTTPException(422, "invalid_flow_sensor")

        for role in ROLES:
            binding = getattr(body, role)
            validate(binding.source, {"W", "kW"})
            validate(binding.return_source, {"W", "kW"})
            if binding.return_source and (
                role not in {"grid", "battery"}
                or not binding.source
                or binding.source == binding.return_source
            ):
                raise HTTPException(422, "invalid_return_sensor")
        validate(body.battery_level, {"%"})
        store.set(f"energy_flow:{current['id']}", body.model_dump_json())
        return body

    @router.get("/live")
    async def live(current=Depends(user)):
        pref = prefs(current)
        controls = {c.entity_id: c for c in ha.controls()}
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

    return router
