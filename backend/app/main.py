import asyncio
import contextlib
import json
import secrets
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from .auth import Auth, hasher
from .config import Settings
from .demo import Demo
from .ha import HAError, HomeAssistant
from .models import Command
from .setup import PROVIDERS
from .storage import Store


class Credentials(BaseModel):
    name: str = Field(min_length=1, max_length=80, pattern=r"^[\w.@-]+$")
    password: str = Field(min_length=12, max_length=128)


class Setup(Credentials):
    secret: str = Field(max_length=256)
    home_name: str = Field(default="Mitt hjem", min_length=1, max_length=80)
    language: Literal["nb", "en"] = "nb"
    timezone: str = "Europe/Oslo"


class NewUser(Credentials):
    role: Literal["admin", "user"] = "user"


def create_app(settings=None, adapter=None):
    settings = settings or Settings()
    settings.validate_runtime()
    store = Store(settings.database)
    auth = Auth(store, settings)
    ha = adapter or (Demo() if settings.mode == "demo" else HomeAssistant(settings.ha_url, settings.ha_token))

    @asynccontextmanager
    async def lifespan(app):
        task = asyncio.create_task(ha.run())
        yield
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task

    app = FastAPI(title="SMARTi", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.ha, app.state.auth, app.state.store = ha, auth, store

    @app.middleware("http")
    async def boundary(request, call_next):
        if settings.ingress and (not request.client or request.client.host != settings.ingress_proxy):
            return JSONResponse(
                {"detail": "ingress_rejected"}, status_code=403, headers={"Cache-Control": "no-store"}
            )
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            origin = request.headers.get("origin")
            if origin not in settings.allowed_origins:
                return JSONResponse(
                    {"detail": "origin_rejected"}, status_code=403, headers={"Cache-Control": "no-store"}
                )
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store" if request.url.path.startswith("/api") else "no-cache"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'"
        )
        return response

    def user(request: Request):
        result = auth.session(request.cookies.get("smarti_session"))
        if request.method not in {"GET", "HEAD"} and not secrets.compare_digest(
            request.headers.get("x-csrf-token", ""), result["csrf"]
        ):
            raise HTTPException(403, "csrf_rejected")
        return result

    def admin(current=Depends(user)):
        if current["role"] != "admin":
            raise HTTPException(403, "admin_required")
        return current

    @app.get("/healthz")
    async def health():
        return {"status": "running"}

    @app.get("/api/bootstrap")
    async def bootstrap_status():
        return {"configured": auth.ready(), "mode": settings.mode}

    @app.post("/api/bootstrap")
    async def bootstrap(body: Setup, request: Request):
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

        auth.throttle("setup:" + request.client.host)
        try:
            ZoneInfo(body.timezone)
        except ZoneInfoNotFoundError:
            raise HTTPException(422, "invalid_timezone")
        auth.bootstrap(body.name, body.password, body.secret)
        store.set("home_name", body.home_name)
        store.set("language", body.language)
        store.set("timezone", body.timezone)
        return {"status": "configured"}

    def cookie_path(request):
        # Header only trusted on isolated Supervisor ingress listener.
        prefix = request.headers.get("x-ingress-path", "") if settings.ingress else ""
        return prefix.rstrip("/") + "/"

    @app.post("/api/login")
    async def login(body: Credentials, request: Request, response: Response):
        auth.throttle("login:" + request.client.host)
        token, session = auth.login(body.name, body.password)
        response.set_cookie(
            "smarti_session",
            token,
            httponly=True,
            secure=request.headers.get("origin", "").startswith("https://"),
            samesite="strict",
            path=cookie_path(request),
            max_age=settings.session_hours * 3600,
        )
        return session

    @app.get("/api/session")
    async def session(current=Depends(user)):
        return current

    @app.post("/api/logout")
    async def logout(request: Request, response: Response, current=Depends(user)):
        auth.logout(request.cookies.get("smarti_session"))
        response.delete_cookie("smarti_session", path=cookie_path(request))
        return {"status": "logged_out"}

    @app.post("/api/users")
    async def new_user(body: NewUser, current=Depends(admin)):
        import sqlite3

        try:
            with store.connect() as db:
                db.execute(
                    "INSERT INTO users(name,password,role) VALUES (?,?,?)",
                    (body.name, hasher.hash(body.password), body.role),
                )
        except sqlite3.IntegrityError:
            raise HTTPException(409, "user_exists")
        return {"status": "created"}

    def snapshot(current):
        controls = ha.controls()
        physical = []
        for did, device in ha.devices.items():
            statuses = {c.availability for c in controls if c.device_id == did}
            availability = (
                next(iter(statuses))
                if len(statuses) == 1
                else "partially_available"
                if "available" in statuses
                else "unknown"
            )
            physical.append(
                {
                    "id": did,
                    "name": device.get("name_by_user") or device.get("name"),
                    "availability": availability,
                    "area_id": device.get("area_id"),
                }
            )
        with store.connect() as db:
            favorite_keys = [
                r[0]
                for r in db.execute(
                    "SELECT COALESCE(control_id,entity_id) FROM favorites WHERE user_id=? ORDER BY position,entity_id",
                    (current["id"],),
                )
            ]
        # Upgrade legacy entity-ID favorites when a stable registry ID is available.
        with store.connect() as db:
            for control in controls:
                db.execute(
                    "UPDATE favorites SET control_id=? WHERE user_id=? AND entity_id=? AND control_id IS NULL",
                    (control.id, current["id"], control.entity_id),
                )
        favorites = [c.entity_id for key in favorite_keys for c in controls if key in {c.id, c.entity_id}]
        return {
            "home_name": store.get("home_name", "Mitt hjem"),
            "mode": settings.mode,
            "connected": ha.connected,
            "error": ha.error,
            "ha_version": ha.version,
            "last_sync": ha.last_sync,
            "revision": ha.revision,
            "areas": list(ha.areas.values()),
            "devices": physical,
            "controls": [c.model_dump() for c in controls],
            "favorites": favorites,
        }

    @app.get("/api/home")
    async def home(current=Depends(user)):
        return snapshot(current)

    @app.put("/api/favorites/{entity_id}")
    async def favorite(entity_id: str, current=Depends(user)):
        control = next((c for c in ha.controls() if c.entity_id == entity_id), None)
        if not control:
            raise HTTPException(404, "entity_not_found")
        with store.connect() as db:
            row = db.execute(
                "SELECT 1 FROM favorites WHERE user_id=? AND (control_id=? OR entity_id=?)",
                (current["id"], control.id, entity_id),
            ).fetchone()
            if row:
                db.execute(
                    "DELETE FROM favorites WHERE user_id=? AND (control_id=? OR entity_id=?)",
                    (current["id"], control.id, entity_id),
                )
            else:
                db.execute(
                    "INSERT INTO favorites(user_id,entity_id,control_id) VALUES (?,?,?)",
                    (current["id"], entity_id, control.id),
                )
        return {"favorite": not bool(row)}

    @app.post("/api/controls/{entity_id}/commands")
    async def command(entity_id: str, body: Command, current=Depends(user)):
        control = next((c for c in ha.controls() if c.entity_id == entity_id), None)
        if not control:
            raise HTTPException(404, "entity_not_found")
        if control.domain == "automation" and current["role"] != "admin":
            raise HTTPException(403, "admin_required")
        capability = next((c for c in control.capabilities if body.action in c.actions), None)
        if not capability:
            raise HTTPException(422, "unsupported_action")
        if not ha.connected or control.availability != "available":
            raise HTTPException(409, "device_unavailable")
        if body.action.startswith("set_"):
            value = body.value
            if value is None or not capability.minimum <= value <= capability.maximum:
                raise HTTPException(422, "invalid_value")
            if (
                capability.step
                and abs(
                    (value - capability.minimum) / capability.step
                    - round((value - capability.minimum) / capability.step)
                )
                > 1e-6
            ):
                raise HTTPException(422, "invalid_step")
        elif body.value is not None:
            raise HTTPException(422, "unexpected_value")
        try:
            return await ha.command(entity_id, body.action, body.value)
        except (HAError, TimeoutError):
            raise HTTPException(504, "command_unconfirmed_do_not_retry_automatically")

    @app.get("/api/events")
    async def events(request: Request, current=Depends(user)):
        origin = request.headers.get("origin")
        if origin and origin not in settings.allowed_origins:
            raise HTTPException(403, "origin_rejected")

        async def stream():
            revision = -1
            while not await request.is_disconnected():
                try:
                    auth.session(request.cookies.get("smarti_session"))
                except HTTPException:
                    yield "event: expired\ndata: {}\n\n"
                    return
                if ha.revision != revision:
                    revision = ha.revision
                    yield "data: " + json.dumps({"revision": revision}) + "\n\n"
                else:
                    yield ": heartbeat\n\n"
                await asyncio.sleep(1)

        return StreamingResponse(
            stream(), media_type="text/event-stream", headers={"X-Accel-Buffering": "no"}
        )

    @app.get("/api/setup/providers")
    async def providers(current=Depends(admin)):
        return [provider.support() for provider in PROVIDERS]

    @app.get("/{path:path}")
    async def frontend(path: str):
        if path.startswith("api/"):
            raise HTTPException(404)
        root = settings.static_dir.resolve()
        target = (root / path).resolve()
        if not target.is_relative_to(root):
            raise HTTPException(404)
        if target.is_file():
            return FileResponse(target)
        index = root / "index.html"
        if index.exists():
            return FileResponse(index)
        raise HTTPException(503, "frontend_not_built")

    return app
