"""Local administrator enrollment controls. Never expose the hub credential."""

import json
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from .remote_options import configure_remote_identity

CLOUD_ORIGIN = "https://home.smarti.dev"


class ManualIdentity(BaseModel):
    model_config = {"extra": "forbid"}
    installation_id: str = Field(pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
    credential: str = Field(pattern=r"^[A-Za-z0-9_-]{32,256}$", repr=False)


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

    @router.post("/provision")
    async def provision(body: ManualIdentity, request: Request):
        if settings.remote_identity_file or (settings.data_dir / "remote-identity.json").exists():
            raise HTTPException(409, "remote_already_provisioned")
        try:
            async with httpx.AsyncClient(
                timeout=10, trust_env=False, follow_redirects=False, transport=transport
            ) as client:
                response = await client.get(
                    f"{CLOUD_ORIGIN}/api/hubs/{body.installation_id}/status",
                    headers={"Authorization": "Bearer " + body.credential},
                )
            if response.status_code in {401, 403, 404}:
                raise HTTPException(422, "remote_identity_rejected")
            response.raise_for_status()
            result = response.json()
            if (
                not isinstance(result, dict)
                or type(result.get("linked")) is not bool
                or type(result.get("remote_enabled")) is not bool
            ):
                raise ValueError("Invalid status")
            if result["linked"]:
                raise HTTPException(409, "remote_already_linked")
        except (httpx.HTTPError, ValueError):
            raise HTTPException(503, "remote_cloud_unavailable") from None
        try:
            path = configure_remote_identity(
                {"remote_installation_id": body.installation_id, "remote_credential": body.credential},
                settings.data_dir,
                exclusive=True,
            )
        except FileExistsError:
            raise HTTPException(409, "remote_already_provisioned") from None
        except OSError:
            raise HTTPException(503, "remote_identity_save_failed") from None
        settings.remote_identity_file = path
        start = getattr(request.app.state, "start_remote", None)
        if start:
            start()
        return {"provisioned": True, "restart_required": start is None}

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
