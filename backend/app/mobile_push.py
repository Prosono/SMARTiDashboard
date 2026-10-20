"""HA's local notify webhook, scoped to one active paired phone."""

import json
import secrets
import time
from typing import Literal

import httpx
from fastapi import HTTPException, Request
from pydantic import BaseModel, Field

from .certificate_hook import read_identity
from .remote_access import CLOUD_ORIGIN


class PushRegistration(BaseModel):
    model_config = {"extra": "forbid"}
    token: str = Field(pattern=r"^[a-f0-9]{64,200}$")
    environment: Literal["production", "development"] = "production"


class HANotification(BaseModel):
    push_token: str = Field(min_length=32, max_length=200)
    message: str = Field(min_length=1, max_length=1500)
    title: str = Field(default="SMARTi", max_length=200)


class MobilePush:
    def __init__(self, companion, identity):
        self.c = companion
        self.identity = identity

    async def cloud(self, method, path, body=None):
        try:
            home, credential = read_identity(self.identity)
            async with httpx.AsyncClient(timeout=9, trust_env=False) as client:
                response = await client.request(
                    method,
                    f"{CLOUD_ORIGIN}/api/hubs/{home}/{path}",
                    headers={"Authorization": "Bearer " + credential},
                    json=body,
                )
            if response.status_code != 200:
                raise HTTPException(
                    response.status_code if response.status_code in {410, 429} else 503,
                    "push_service_unavailable",
                )
            return response.json()
        except (TypeError, OSError, ValueError, httpx.HTTPError):
            raise HTTPException(503, "push_service_unavailable") from None

    async def enable(self, current, body):
        if not (await self.cloud("GET", "push-status")).get("ready"):
            raise HTTPException(503, "push_not_configured")
        async with self.c.lock:
            record = self.c.read(current["device_id"])
            if not record.get("webhook_id"):
                raise HTTPException(409, "mobile_registration_required")
            metadata = record.get("registration")
            if not metadata:
                raise HTTPException(409, "mobile_registration_required")
            # Stable ASCII name avoids collisions with the HA companion app on the same phone.
            notify_name = "smarti_" + current["device_id"].replace("-", "")
            metadata = {**metadata, "device_name": notify_name}
            capability = record.get("push_capability") or secrets.token_urlsafe(32)
            # HAOS Core and SMARTi both use host networking; this endpoint is loopback-only.
            response = await self.c.m.ws(
                "webhook/handle",
                webhook_id=record["webhook_id"],
                method="POST",
                body=json.dumps(
                    {
                        "type": "update_registration",
                        "data": {
                            **metadata,
                            "app_data": {
                                "push_url": "http://127.0.0.1:8099/api/mobile/ha-notify",
                                "push_token": capability,
                            }
                        },
                    }
                ),
                headers={"Content-Type": "application/json"},
            )
            if not isinstance(response, dict) or response.get("status") != 200:
                raise HTTPException(502, "notification_registration_unconfirmed")
            try:
                confirmed = json.loads(response.get("body", "{}"))
            except (TypeError, ValueError):
                confirmed = {}
            app_data = confirmed.get("app_data", {}) if isinstance(confirmed, dict) else {}
            if (not isinstance(app_data, dict)
                or app_data.get("push_token") != capability
                or app_data.get("push_url") != "http://127.0.0.1:8099/api/mobile/ha-notify"):
                raise HTTPException(502, "notification_registration_unconfirmed")
            record.update(
                push_capability=capability, push_token=body.token, push_environment=body.environment,
                notify_service="notify.mobile_app_" + notify_name,
            )
            self.c.save(current["device_id"], record)
        return {"status": "registered"}

    def disable(self, device):
        record = self.c.read(device)
        for key in ("push_capability", "push_token", "push_environment"):
            record.pop(key, None)
        self.c.save(device, record)
        return {"status": "disabled"}

    async def deliver(self, device, title, message):
        with self.c.m.store.connect() as db:
            active = db.execute(
                "SELECT d.id FROM mobile_devices d JOIN users u ON u.id=d.user_id WHERE d.id=? AND d.revoked=0 AND d.expires>?",
                (device, time.time()),
            ).fetchone()
        record = self.c.read(device)
        if not active or not record.get("push_token"):
            raise HTTPException(410, "notification_device_inactive")
        try:
            return await self.cloud(
                "POST",
                "push",
                {
                    "token": record["push_token"],
                    "environment": record["push_environment"],
                    "title": title,
                    "message": message,
                },
            )
        except HTTPException as error:
            if error.status_code == 410:
                self.disable(device)
            raise

    async def notify(self, body):
        with self.c.m.store.connect() as db:
            rows = db.execute(
                "SELECT id FROM mobile_devices WHERE revoked=0 AND expires>?", (time.time(),)
            ).fetchall()
        for row in rows:
            record = self.c.read(row[0])
            if secrets.compare_digest(record.get("push_capability", ""), body.push_token):
                return await self.deliver(row[0], body.title, body.message)
        raise HTTPException(410, "notification_device_inactive")


def install_local_push(app, management, identity):
    from .mobile_companion import Companion

    push = MobilePush(Companion(management), identity)

    @app.post("/api/mobile/ha-notify")
    async def notify(body: HANotification, request: Request):
        if (
            not request.client
            or request.client.host not in {"127.0.0.1", "::1"}
            or request.headers.get("origin")
        ):
            raise HTTPException(403, "local_notification_required")
        return await push.notify(body)
