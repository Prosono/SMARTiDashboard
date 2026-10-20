"""APNs gateway: only authenticated hubs may submit alerts; never log payloads/tokens."""

import base64
import json
import os
import time
from pathlib import Path
from typing import Literal

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from fastapi import HTTPException, Request
from pydantic import BaseModel, Field


class PushAlert(BaseModel):
    model_config = {"extra": "forbid"}
    token: str = Field(pattern=r"^[a-f0-9]{64,200}$")
    environment: Literal["production", "development"] = "production"
    title: str = Field(default="SMARTi", max_length=200)
    message: str = Field(min_length=1, max_length=1500)


class APNs:
    def __init__(self):
        self.cached_jwt = None
        self.jwt_time = 0

    def ready(self):
        return all(
            os.environ.get(k) for k in ("SMARTI_APNS_KEY_FILE", "SMARTI_APNS_KEY_ID", "SMARTI_APNS_TEAM_ID")
        )

    def jwt(self):
        if self.cached_jwt and time.time() - self.jwt_time < 3000:
            return self.cached_jwt

        def b64(data):
            return base64.urlsafe_b64encode(data).rstrip(b"=")

        header = b64(json.dumps({"alg": "ES256", "kid": os.environ["SMARTI_APNS_KEY_ID"]}).encode())
        claims = b64(json.dumps({"iss": os.environ["SMARTI_APNS_TEAM_ID"], "iat": int(time.time())}).encode())
        content = header + b"." + claims
        key = serialization.load_pem_private_key(
            Path(os.environ["SMARTI_APNS_KEY_FILE"]).read_bytes(), password=None
        )
        r, s = decode_dss_signature(key.sign(content, ec.ECDSA(hashes.SHA256())))
        self.cached_jwt = (content + b"." + b64(r.to_bytes(32, "big") + s.to_bytes(32, "big"))).decode()
        self.jwt_time = time.time()
        return self.cached_jwt

    async def send(self, alert):
        if not self.ready():
            raise HTTPException(503, "push_not_configured")
        payload = {"aps": {"alert": {"title": alert.title, "body": alert.message}, "sound": "default"}}
        body = json.dumps(payload, ensure_ascii=False).encode()
        if len(body) > 4096:
            raise HTTPException(413, "notification_too_large")
        hostname = "api.push.apple.com" if alert.environment == "production" else "api.sandbox.push.apple.com"
        try:
            async with httpx.AsyncClient(http2=True, timeout=7, trust_env=False) as client:
                result = await client.post(
                    f"https://{hostname}/3/device/{alert.token}",
                    content=body,
                    headers={
                        "authorization": "bearer " + self.jwt(),
                        "apns-topic": "dev.smarti.home",
                        "apns-push-type": "alert",
                        "apns-priority": "10",
                        "apns-expiration": str(int(time.time()) + 3600),
                    },
                )
        except (httpx.HTTPError, OSError, ValueError):
            raise HTTPException(503, "push_temporarily_unavailable") from None
        if result.status_code == 200:
            return {"status": "accepted_by_apple"}
        reason = result.json().get("reason", "")
        if result.status_code == 410 or reason in {
            "BadDeviceToken",
            "DeviceTokenNotForTopic",
            "Unregistered",
        }:
            raise HTTPException(410, "push_registration_expired")
        raise HTTPException(503, "push_delivery_failed")


def install_push(app, home_auth, db):
    provider = APNs()
    with db() as c:
        c.execute(
            "CREATE TABLE IF NOT EXISTS push_limits (home TEXT, target TEXT, day INTEGER, count INTEGER, PRIMARY KEY(home,target,day))"
        )

    @app.get("/api/hubs/{home_id}/push-status")
    def status(home_id: str, request: Request):
        home_auth(home_id, request)
        return {"ready": provider.ready()}

    @app.post("/api/hubs/{home_id}/push")
    async def send(home_id: str, body: PushAlert, request: Request):
        from .cloud import digest

        home = home_auth(home_id, request)
        if not home["owner"] or not home["remote_enabled"]:
            raise HTTPException(403, "home_inactive")
        day = int(time.time() // 86400)
        with db() as c:
            c.execute("BEGIN IMMEDIATE")
            c.execute("DELETE FROM push_limits WHERE day < ?", (day,))
            target = digest(body.token)
            c.execute("INSERT OR IGNORE INTO push_limits VALUES(?,?,?,0)", (home_id, target, day))
            count = c.execute(
                "SELECT count FROM push_limits WHERE home=? AND target=? AND day=?", (home_id, target, day)
            ).fetchone()[0]
            if count >= 500:
                raise HTTPException(429, "daily_notification_limit")
            c.execute(
                "UPDATE push_limits SET count=count+1 WHERE home=? AND target=? AND day=?",
                (home_id, target, day),
            )
        return await provider.send(body)
