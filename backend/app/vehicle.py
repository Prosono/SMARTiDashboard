"""Personal, explicit bindings for existing EV/charger entities."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field


class VehiclePreferences(BaseModel):
    model_config = {"extra": "forbid"}
    name: str = Field(default="Elbil & lader", max_length=80)
    battery: str | None = None
    range: str | None = None
    power: str | None = None
    energy: str | None = None
    status: str | None = None
    switch: str | None = None


def vehicle_router(store, user, ha):
    router = APIRouter(prefix="/api/home/vehicle", dependencies=[Depends(user)])

    @router.get("")
    async def get(current=Depends(user)):
        return VehiclePreferences.model_validate_json(store.get(f"vehicle:{current['id']}", "{}"))

    @router.put("")
    async def save(body: VehiclePreferences, current=Depends(user)):
        controls = {c.entity_id: c for c in ha.controls()}
        units = {"battery": {"%"}, "range": {"km", "mi"}, "power": {"W", "kW"}, "energy": {"Wh", "kWh"}}
        for kind in ["battery", "range", "power", "energy", "status", "switch"]:
            id = getattr(body, kind)
            if not id:
                continue
            c = controls.get(id)
            if not c:
                raise HTTPException(422, "entity_not_found")
            if kind in units and (
                c.domain != "sensor" or c.attributes.get("unit_of_measurement") not in units[kind]
            ):
                raise HTTPException(422, "invalid_vehicle_sensor")
            if kind == "status" and c.domain not in {"sensor", "binary_sensor"}:
                raise HTTPException(422, "invalid_vehicle_status")
            if kind == "switch" and (
                c.domain != "switch"
                or not any({"turn_on", "turn_off"} <= set(cap.actions) for cap in c.capabilities)
            ):
                raise HTTPException(422, "invalid_vehicle_switch")
        store.set(f"vehicle:{current['id']}", body.model_dump_json())
        return {"saved": True}

    return router
