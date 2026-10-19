"""Local administrator enrollment controls. Never expose the hub credential."""

import json
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException

CLOUD_ORIGIN = "https://home.smarti.dev"


def remote_router(settings, admin, transport=None):
    router = APIRouter(prefix="/api/remote", dependencies=[Depends(admin)])

    def identity():
        path = settings.remote_identity_file
        if path is None:
            return None
        try:
            value = json.loads(path.read_text())
            home_id, credential = value["installation_id"], value["credential"]
            if str(uuid.UUID(home_id)) != home_id or not isinstance(credential, str) or len(credential) < 32:
                raise ValueError("Invalid identity")
            return home_id, credential
        except (OSError, ValueError, KeyError, TypeError):
            raise HTTPException(503, "remote_identity_unavailable") from None

    async def cloud(action, method="GET"):
        value = identity()
        if value is None:
            raise HTTPException(409, "remote_not_provisioned")
        home_id, credential = value
        try:
            async with httpx.AsyncClient(
                timeout=10, trust_env=False, follow_redirects=False, transport=transport
            ) as client:
                response = await client.request(
                    method,
                    f"{CLOUD_ORIGIN}/api/hubs/{home_id}/{action}",
                    headers={"Authorization": "Bearer " + credential},
                )
            if response.status_code == 409:
                raise HTTPException(409, "remote_already_linked")
            response.raise_for_status()
            result = response.json()
            if not isinstance(result, dict):
                raise ValueError("Invalid response")
            return result
        except (httpx.HTTPError, ValueError):
            raise HTTPException(503, "remote_cloud_unavailable") from None

    @router.get("")
    async def status():
        if identity() is None:
            return {"provisioned": False, "portal": CLOUD_ORIGIN}
        result = await cloud("status")
        return {
            "provisioned": True,
            "portal": CLOUD_ORIGIN,
            "linked": result.get("linked") is True,
            "remote_enabled": result.get("remote_enabled") is True,
        }

    @router.post("/claim-code")
    async def claim_code():
        result = await cloud("claim-code", "POST")
        code, expires = result.get("code"), result.get("expires_at")
        if not isinstance(code, str) or not 32 <= len(code) <= 128 or not isinstance(expires, (int, float)):
            raise HTTPException(503, "remote_cloud_unavailable")
        return {"code": code, "expires_at": expires, "portal": CLOUD_ORIGIN}

    @router.delete("/claim-code")
    async def cancel():
        await cloud("claim-code", "DELETE")
        return {"cancelled": True}

    @router.put("")
    async def enable():
        await cloud("remote", "PUT")
        return {"enabled": True}

    @router.delete("")
    async def disable():
        await cloud("remote", "DELETE")
        return {"disabled": True}

    return router
