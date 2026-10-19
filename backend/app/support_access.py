"""Temporary support principal: no local user/password/session is ever created."""

import re
import secrets
import time

import httpx
from fastapi import HTTPException
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel, Field

from .access import ALL
from .certificate_hook import read_identity
from .remote_access import CLOUD_ORIGIN

COOKIE = "__Host-smarti_support"
SCOPE = (
    "Support kan se informasjon i SMARTi, inkludert enhets- og personstatus, styre enheter "
    "(også låser), og endre rom, scener og automasjoner. Kamera/video, Home Assistant-konsoll, "
    "brukere, telefonregistrering og systemadministrasjon er ikke tilgjengelig. "
    "Endringer som blir utført, beholdes etter at tilgangen utløper."
)


class SupportCode(BaseModel):
    code: str = Field(min_length=32, max_length=128)


def permitted(path, method):
    if path in {"/api/session", "/api/home", "/api/events", "/api/logout"}:
        return True
    if re.fullmatch(r"/api/controls/[^/]+/(history|commands)", path):
        return True
    if path.startswith(("/api/scenes", "/api/groups")):
        return True
    if re.fullmatch(
        r"/api/manage/(rooms|rooms/[^/]+|placements/[^/]+/[^/]+|automations|automations/[^/]+|automation-appearance/[^/]+|automation-preview/[^/]+|automation-actions/[^/]+)",
        path,
    ):
        return True
    if method == "GET":
        return (
            path in {"/api/manage/entities", "/api/manage/integrations", "/api/manage/updates"}
            or bool(re.fullmatch(r"/api/manage/device/[^/]+(?:/history)?", path))
            or (path.startswith("/api/home/") and not any(x in path for x in ("camera", "vehicle")))
        )
    return False


class SupportAccess:
    def __init__(self, identity, transport=None):
        self.identity, self.transport = identity, transport

    async def cloud(self, action, body):
        try:
            home, credential = read_identity(self.identity)
            async with httpx.AsyncClient(
                timeout=5, trust_env=False, follow_redirects=False, transport=self.transport
            ) as client:
                r = await client.post(
                    f"{CLOUD_ORIGIN}/api/hubs/{home}/support/{action}",
                    headers={"Authorization": "Bearer " + credential},
                    json=body,
                )
                if r.status_code != 200:
                    raise HTTPException(401, "support_access_expired")
                return r.json()
        except (OSError, ValueError, KeyError, httpx.HTTPError):
            raise HTTPException(503, "support_validation_unavailable") from None

    async def user(self, request):
        token = request.cookies.get(COOKIE)
        info = await self.cloud(
            "check",
            {
                "token": token,
                "operation": (request.method + " " + request.url.path)[:400]
                if request.method not in {"GET", "HEAD"}
                else None,
            },
        )
        if info["expires"] <= time.time():
            raise HTTPException(401, "support_access_expired")
        if not permitted(request.url.path, request.method):
            raise HTTPException(403, "outside_support_scope")
        if request.method not in {"GET", "HEAD"} and not secrets.compare_digest(
            request.headers.get("x-csrf-token", ""), info["csrf"]
        ):
            raise HTTPException(403, "csrf_rejected")
        return {
            "id": 0,
            "name": "SMARTi support · " + info["name"],
            "role": "admin",
            "csrf": info["csrf"],
            "permissions": sorted(ALL),
            "profile": "admin",
            "support": {"expires": info["expires"], "ticket": info["ticket"]},
        }


def install_support_access(app, support):
    @app.get("/_support", response_class=HTMLResponse)
    def launch():
        return """<!doctype html><html lang="nb"><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>SMARTi fjernhjelp</title><h1>Starter godkjent fjernhjelp</h1>
        <p id="status" role="status">Kontrollerer engangslenken…</p>
        <script src="/_support/launch.js"></script></html>"""

    @app.get("/_support/launch.js")
    def script():
        return Response(
            """(async()=>{const code=location.hash.slice(1);history.replaceState(null,'','/_support');
        try{const r=await fetch('/api/support-access/redeem',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({code})});if(!r.ok)throw Error();location.replace('/');}
        catch{document.getElementById('status').textContent='Tilgangen er utløpt, trukket tilbake, eller huben kan ikke bekrefte godkjenningen. Hent en ny lenke fra saken.'}})();""",
            media_type="application/javascript",
        )

    @app.post("/api/support-access/redeem")
    async def redeem(body: SupportCode, response: Response):
        data = await support.cloud("redeem", {"code": body.code})
        response.set_cookie(
            COOKIE,
            data["token"],
            httponly=True,
            secure=True,
            samesite="strict",
            path="/",
            max_age=max(0, int(data["expires"] - time.time())),
        )
        return {"ready": True}
