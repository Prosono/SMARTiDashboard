"""Portal-authenticated customer sessions, checked against current home membership."""

import hashlib
import secrets
import time
from pathlib import Path

import httpx
from fastapi import HTTPException, Response
from fastapi.responses import FileResponse, HTMLResponse

from .certificate_hook import read_identity
from .cloud_accounts import Token
from .remote_access import CLOUD_ORIGIN

COOKIE = "__Host-smarti_customer"


class CustomerAccess:
    def __init__(self, identity, store, transport=None):
        self.identity, self.store, self.transport = identity, store, transport
        self.checks = {}

    async def cloud(self, action, token):
        key = hashlib.sha256(token.encode()).hexdigest()
        now = time.monotonic()
        self.checks = {k: v for k, v in self.checks.items() if v[0] > now and v[1]["expires"] > time.time()}
        if action == "check" and key in self.checks:
            return self.checks[key][1]
        try:
            home, credential = read_identity(self.identity)
            async with httpx.AsyncClient(timeout=8, trust_env=False, transport=self.transport) as client:
                response = await client.post(
                    f"{CLOUD_ORIGIN}/api/hubs/{home}/customer/{action}",
                    headers={"Authorization": "Bearer " + credential},
                    json={"token": token},
                )
                if response.status_code != 200:
                    raise HTTPException(401, "customer_session_expired")
                data = response.json()
                if action == "check" and len(self.checks) < 128:
                    self.checks[key] = (time.monotonic() + 5, data)
                return data
        except (OSError, ValueError, httpx.HTTPError):
            raise HTTPException(503, "customer_validation_unavailable") from None

    async def console_admin(self, token):
        from types import SimpleNamespace

        current = await self.user(SimpleNamespace(method="GET", cookies={COOKIE: token}, headers={}))
        if current["role"] != "admin":
            raise HTTPException(403, "admin_required")

    async def user(self, request):
        info = await self.cloud("check", request.cookies.get(COOKIE, ""))
        if request.method not in {"GET", "HEAD"} and not secrets.compare_digest(
            request.headers.get("x-csrf-token", ""), info["csrf"]
        ):
            raise HTTPException(403, "csrf_rejected")
        with self.store.connect() as c:
            c.execute("BEGIN IMMEDIATE")
            key = "cloud_account:" + info["account"]
            mapped = c.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
            if not mapped:
                # The cloud verifies current ownership/membership on every check.
                # Legacy owners receive a distinct account, never a same-named local user.
                if info["role"] not in {"admin", "user"}:
                    raise HTTPException(403, "customer_role_invalid")
                from .auth import hasher

                name = "cloud_" + info["account"]
                row = c.execute(
                    "INSERT INTO users(name,password,role) VALUES(?,?,?)",
                    (name, hasher.hash(secrets.token_urlsafe(48)), info["role"]),
                )
                local_id = row.lastrowid
                c.execute("INSERT INTO settings VALUES(?,?)", (key, str(local_id)))
            else:
                local_id = int(mapped[0])
            if info.get("profile"):
                import json

                p = info["profile"]
                old = c.execute(
                    "SELECT value FROM settings WHERE key=?", ("account:" + str(local_id),)
                ).fetchone()
                account_info = json.loads(old[0]) if old else {}
                account_info["display_name"] = p["full_name"]
                if not old or json.loads(old[0]) != account_info:
                    c.execute(
                        "INSERT OR REPLACE INTO settings VALUES(?,?)",
                        ("account:" + str(local_id), json.dumps(account_info)),
                    )
                photo = p["photo"].split(",", 1)[1] if p["photo"] else ""
                old_photo = c.execute(
                    "SELECT value FROM settings WHERE key=?", ("account_photo:" + str(local_id),)
                ).fetchone()
                if not old_photo or old_photo[0] != photo:
                    c.execute(
                        "INSERT OR REPLACE INTO settings VALUES(?,?)",
                        ("account_photo:" + str(local_id), photo),
                    )
            local = c.execute("SELECT id,name,role FROM users WHERE id=?", (local_id,)).fetchone()
            if not local:
                raise HTTPException(401, "customer_session_expired")
        return {
            "id": local["id"],
            "name": info["name"],
            "role": local["role"] if info["role"] == "admin" else "user",
            "csrf": info["csrf"],
            "customer": True,
        }


def install_customer_access(app, customer):
    @app.get("/_account", response_class=HTMLResponse)
    def launch():
        return """<!doctype html><html lang="nb"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
        <title>Velkommen hjem · SMARTi</title><link rel="stylesheet" href="/_account/launch.css"></head><body><main>
        <img class="logo" src="/_account/logo.png" alt=""><div class="wordmark">SMARTi</div>
        <h1>Velkommen hjem</h1><p id="status" role="status">Vi bekrefter tilgangen og åpner hjemmet ditt.</p><div class="loader" aria-hidden="true"></div>
        <a href="https://home.smarti.dev/" id="return" hidden>Tilbake til Mine hjem</a></main>
        <script src="/_account/launch.js"></script></body></html>"""

    @app.get("/_account/launch.css")
    def launch_style():
        return FileResponse(Path(__file__).parent / "cloud_web" / "launch.css", media_type="text/css")

    @app.get("/_account/logo.png")
    def launch_logo():
        return FileResponse(Path(__file__).parent / "cloud_web" / "smarti-logo.png", media_type="image/png")

    @app.get("/_account/launch.js")
    def script():
        return Response(
            """(async()=>{const token=location.hash.slice(1);history.replaceState(null,'','/_account');
        try{const r=await fetch('/api/customer-access/redeem',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});
        if(!r.ok)throw Error();location.replace('/');}catch{document.body.classList.add('failed');document.getElementById('return').hidden=false;document.getElementById('status').textContent='Kunne ikke bekrefte tilgangen. Åpne hjemmet på nytt fra Mine hjem i SMARTi.'}})();""",
            media_type="application/javascript",
        )

    @app.post("/api/customer-access/redeem")
    async def redeem(body: Token, response: Response):
        data = await customer.cloud("redeem", body.token)
        response.set_cookie(
            COOKIE,
            data["token"],
            secure=True,
            httponly=True,
            samesite="strict",
            path="/",
            max_age=max(0, int(data["expires"] - time.time())),
        )
        return {"ready": True}
