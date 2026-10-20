"""Restricted mobile_app bridge. HA webhook credentials never leave the hub."""

import asyncio
import json
import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field


class Registration(BaseModel):
    model_config = {"extra": "forbid"}
    name: str = Field(min_length=1, max_length=80)
    model: str = Field(default="iPhone", min_length=1, max_length=80)
    os_version: str = Field(min_length=1, max_length=40)
    app_version: str = Field(min_length=1, max_length=40)


class LocationConsent(BaseModel):
    model_config = {"extra": "forbid"}
    enabled: bool


class LocationUpdate(BaseModel):
    model_config = {"extra": "forbid", "allow_inf_nan": False}
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    accuracy: float = Field(ge=0, le=10000)
    timestamp: float = Field(gt=0)
    battery: int | None = Field(default=None, ge=0, le=100)


class Companion:
    def __init__(self, management):
        self.m = management
        self.lock = asyncio.Lock()

    def read(self, device_id):
        return json.loads(self.m.store.get("companion:" + device_id, "{}"))

    def save(self, device_id, value):
        self.m.store.set("companion:" + device_id, json.dumps(value))

    def status(self, device_id):
        record = self.read(device_id)
        return {
            "registered": bool(record.get("webhook_id")),
            "location_enabled": record.get("location_enabled", False),
            "last_location_at": record.get("last_location_at"),
            "notifications_ready": bool(record.get("push_token")),
            "tracker_help": "Velg telefonen under Innstillinger → Hjem og personer → Sporingsenheter.",
        }

    async def register(self, current, body):
        async with self.lock:
            record = self.read(current["device_id"])
            metadata = {
                "device_name": body.name.strip(), "manufacturer": "Apple",
                "model": body.model, "os_version": body.os_version,
                "app_version": body.app_version,
            }
            if record.get("webhook_id"):
                record["registration"] = metadata
                self.save(current["device_id"], record)
                return self.status(current["device_id"])
            if self.m.demo:
                raise HTTPException(409, "mobile_registration_requires_live_home")
            config = await self.m.rest("GET", "config")
            if "mobile_app" not in config.get("components", []):
                raise HTTPException(409, "home_assistant_mobile_app_required")
            result = await self.m.rest(
                "POST",
                "mobile_app/registrations",
                {
                    "device_id": current["device_id"],
                    "app_id": "dev.smarti.home",
                    "app_name": "SMARTi Home",
                    "app_version": body.app_version,
                    "device_name": body.name.strip(),
                    "manufacturer": "Apple",
                    "model": body.model,
                    "os_name": "iOS",
                    "os_version": body.os_version,
                    "supports_encryption": False,
                    "app_data": {},
                },
            )
            if not isinstance(result, dict) or not result.get("webhook_id"):
                raise HTTPException(502, "mobile_registration_unconfirmed")
            # A capability belonging to this registration only, persisted with 0600 DB permissions.
            self.save(current["device_id"], {"webhook_id": result["webhook_id"], "location_enabled": False, "registration": metadata})
            return self.status(current["device_id"])

    async def consent(self, current, enabled):
        async with self.lock:
            record = self.read(current["device_id"])
            if not record.get("webhook_id"):
                raise HTTPException(409, "mobile_registration_required")
            record["location_enabled"] = enabled
            self.save(current["device_id"], record)
            return self.status(current["device_id"])

    async def location(self, current, body):
        async with self.lock:
            record = self.read(current["device_id"])
            if not record.get("webhook_id") or not record.get("location_enabled"):
                raise HTTPException(403, "location_sharing_disabled")
            now = time.time()
            if body.timestamp > now + 60 or body.timestamp < now - 600:
                raise HTTPException(422, "location_not_current")
            if body.timestamp <= record.get("last_location_at", 0):
                return {"status": "ignored_older_location"}
            data = {"gps": [body.latitude, body.longitude], "gps_accuracy": body.accuracy}
            if body.battery is not None:
                data["battery"] = body.battery
            # Only update_location is exposed. Never forward an arbitrary webhook command;
            # the HA mobile_app protocol also permits service calls with registrar privileges.
            response = await self.m.ws(
                "webhook/handle",
                webhook_id=record["webhook_id"],
                method="POST",
                body=json.dumps({"type": "update_location", "data": data}),
                headers={"Content-Type": "application/json"},
            )
            if not isinstance(response, dict) or response.get("status") != 200:
                raise HTTPException(502, "location_delivery_unconfirmed")
            record["last_location_at"] = body.timestamp
            self.save(current["device_id"], record)
            return {"status": "delivered", "timestamp": body.timestamp}


def companion_router(management, mobile_user, identity=None):
    router = APIRouter(prefix="/api/mobile/v1")
    companion = Companion(management)
    from .mobile_push import MobilePush, PushRegistration

    push = MobilePush(companion, identity)

    @router.put("/notifications")
    async def notifications(body: PushRegistration, current=Depends(mobile_user)):
        return await push.enable(current, body)

    @router.delete("/notifications")
    async def disable_notifications(current=Depends(mobile_user)):
        return push.disable(current["device_id"])

    @router.post("/notifications/test")
    async def test_notification(current=Depends(mobile_user)):
        return await push.deliver(
            current["device_id"], "SMARTi", "Varsler fungerer! Dette er en test fra hjemmet ditt."
        )

    @router.get("/companion")
    async def status(current=Depends(mobile_user)):
        return companion.status(current["device_id"])

    @router.post("/companion")
    async def register(body: Registration, current=Depends(mobile_user)):
        return await companion.register(current, body)

    @router.put("/location-consent")
    async def consent(body: LocationConsent, current=Depends(mobile_user)):
        return await companion.consent(current, body.enabled)

    @router.post("/location")
    async def location(body: LocationUpdate, current=Depends(mobile_user)):
        return await companion.location(current, body)

    return router
