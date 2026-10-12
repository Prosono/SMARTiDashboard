import asyncio
import base64
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
from .mobile import MobileAuth
from .models import Command
from .setup import DeviceSetup
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


class MobileClaim(BaseModel):
    model_config = {"extra": "forbid"}
    installation_id: str = Field(min_length=36, max_length=36)
    code: str = Field(min_length=32, max_length=128)
    device_name: str = Field(min_length=1, max_length=80)


class MobileRefresh(BaseModel):
    model_config = {"extra": "forbid"}
    installation_id: str = Field(min_length=36, max_length=36)
    refresh_token: str = Field(min_length=32, max_length=128)


class PairingStart(BaseModel):
    model_config = {"extra": "forbid"}
    provider: Literal["zigbee2mqtt", "zwave_js"]
    entry_id: str | None = Field(default=None, max_length=100)


class DeviceImage(BaseModel):
    device_id: str = Field(min_length=1, max_length=200)
    image: str | None = Field(default=None, max_length=810_000)


class DeviceRemoval(BaseModel):
    provider: Literal["zigbee2mqtt", "zwave_js"]
    device_id: str = Field(min_length=1, max_length=200)


class PairingAnswer(BaseModel):
    model_config = {"extra": "forbid"}
    action: Literal["grant", "pin"]
    pin: str | None = Field(default=None, pattern=r"^\d{5}$", max_length=5)


def create_app(settings=None, adapter=None, *, mobile_only=False):
    settings = settings or Settings()
    settings.validate_runtime()
    store = Store(settings.database)
    auth = Auth(store, settings)
    mobile = MobileAuth(store)
    ha = adapter or (Demo() if settings.mode == "demo" else HomeAssistant(settings.ha_url, settings.ha_token))

    setup = DeviceSetup(ha, settings, store)

    @asynccontextmanager
    async def lifespan(app):
        task = asyncio.create_task(ha.run())
        try:
            yield
        finally:
            try:
                await setup.close()
            finally:
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task

    app = FastAPI(title="SMARTi", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.ha, app.state.auth, app.state.store = ha, auth, store
    app.state.mobile = mobile
    app.state.setup = setup

    @app.middleware("http")
    async def boundary(request, call_next):
        if mobile_only:
            if not settings.mobile_enabled or not request.url.path.startswith("/api/mobile/v1/"):
                return JSONResponse({"detail": "not_found"}, status_code=404)
            if request.url.scheme != "https" or request.headers.get("origin") is not None:
                return JSONResponse(
                    {"detail": "mobile_transport_rejected"},
                    status_code=403,
                    headers={"Cache-Control": "no-store"},
                )
        if (
            not mobile_only
            and settings.ingress
            and (not request.client or request.client.host != settings.ingress_proxy)
        ):
            return JSONResponse(
                {"detail": "ingress_rejected"}, status_code=403, headers={"Cache-Control": "no-store"}
            )
        if not mobile_only and request.method not in {"GET", "HEAD", "OPTIONS"}:
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
            "default-src 'self'; img-src 'self' data: https://www.zigbee2mqtt.io; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'"
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

    @app.get("/api/devices/{provider}")
    async def protocol_devices(provider: Literal["zigbee2mqtt", "zwave_js"], current=Depends(user)):
        return await setup.inventory.list(provider)

    @app.get("/api/devices/{provider}/detail")
    async def device_detail(
        provider: Literal["zigbee2mqtt", "zwave_js"], device_id: str, current=Depends(user)
    ):
        return await setup.inventory.detail(provider, device_id)

    @app.put("/api/devices/{provider}/image")
    async def save_device_image(
        provider: Literal["zigbee2mqtt", "zwave_js"], body: DeviceImage, current=Depends(admin)
    ):
        return await setup.inventory.save_image(provider, body.device_id, body.image)

    @app.get("/api/devices/{provider}/image")
    async def device_image(
        provider: Literal["zigbee2mqtt", "zwave_js"], device_id: str, current=Depends(user)
    ):
        value = store.get(setup.inventory.image_key(provider, device_id))
        if not value:
            raise HTTPException(404, "image_not_found")
        header, data = value.split(",", 1)
        return Response(base64.b64decode(data), media_type=header[5:].split(";")[0])

    @app.post("/api/devices/remove")
    async def remove_device(body: DeviceRemoval, current=Depends(admin)):
        try:
            return await setup.remove(body.provider, body.device_id, current["id"])
        except (HAError, TimeoutError):
            raise HTTPException(503, "removal_unconfirmed")

    @app.get("/api/setup/zigbee")
    async def zigbee_status(u=Depends(admin)):
        return await setup.zigbee_status()

    @app.get("/api/setup/controllers")
    async def radio_controllers(current=Depends(admin)):
        try:
            return await setup.controllers()
        except (HAError, TimeoutError):
            raise HTTPException(503, "controller_disconnected")

    @app.post("/api/setup/controllers/{entry_id}/stop")
    async def recover_controller(entry_id: str, current=Depends(admin)):
        try:
            return await setup.recover_controller(entry_id, current["id"])
        except (HAError, TimeoutError):
            raise HTTPException(503, "controller_disconnected")

    @app.get("/api/setup/providers")
    async def providers(current=Depends(admin)):
        return await setup.providers()

    @app.get("/api/setup/session")
    async def pairing_status(current=Depends(admin)):
        return await setup.status()

    @app.post("/api/setup/sessions")
    async def start_pairing(body: PairingStart, current=Depends(admin)):
        try:
            return await setup.start(body.provider, body.entry_id, current["id"])
        except (HAError, TimeoutError):
            raise HTTPException(503, "pairing_provider_unavailable")

    @app.post("/api/setup/sessions/{session_id}/stop")
    async def stop_pairing(session_id: str, current=Depends(admin)):
        return await setup.stop(session_id)

    @app.post("/api/setup/sessions/{session_id}/answer")
    async def answer_pairing(session_id: str, body: PairingAnswer, current=Depends(admin)):
        if body.pin is not None and int(body.pin) > 65535:
            raise HTTPException(422, "invalid_pin")
        return await setup.answer(session_id, body.action, body.pin)

    def mobile_user(request: Request):
        header = request.headers.get("authorization", "")
        if not header.startswith("Bearer ") or len(header) > 256:
            raise HTTPException(401, "mobile_authentication_required")
        return mobile.session(header[7:])

    if settings.mobile_enabled and not mobile_only:

        @app.post("/api/mobile/pairings")
        async def pairing(current=Depends(admin)):
            auth.throttle("pairing_issue:" + str(current["id"]))
            return mobile.issue_pairing(current["id"]) | {"url": settings.mobile_url}

        @app.delete("/api/mobile/pairings")
        async def cancel_pairing(current=Depends(admin)):
            mobile.cancel_pairing(current["id"])
            return {"status": "cancelled"}

        @app.get("/api/mobile/devices")
        async def devices(current=Depends(admin)):
            return {"installation_id": mobile.installation_id, "devices": mobile.devices(current["id"])}

        @app.delete("/api/mobile/devices/{device_id}")
        async def revoke_device(device_id: str, current=Depends(admin)):
            mobile.revoke(current["id"], device_id)
            return {"status": "revoked"}

    if settings.mobile_enabled and mobile_only:

        @app.post("/api/mobile/v1/pair")
        async def claim(body: MobileClaim, request: Request):
            # Shared budget bounds the table even if clients supply arbitrary identifiers.
            auth.throttle("mobile_pairing")
            return mobile.claim(body.installation_id, body.code, body.device_name)

        @app.post("/api/mobile/v1/refresh")
        async def refresh(body: MobileRefresh):
            return mobile.refresh(body.installation_id, body.refresh_token)

        @app.get("/api/mobile/v1/session")
        async def mobile_session(current=Depends(mobile_user)):
            return current | {"installation_id": mobile.installation_id}

        @app.get("/api/mobile/v1/home")
        async def mobile_home(current=Depends(mobile_user)):
            return snapshot(current)

        @app.post("/api/mobile/v1/controls/{entity_id}/commands")
        async def mobile_command(entity_id: str, body: Command, current=Depends(mobile_user)):
            return await command(entity_id, body, current)

        @app.post("/api/mobile/v1/logout")
        async def mobile_logout(current=Depends(mobile_user)):
            mobile.revoke(current["id"], current["device_id"])
            return {"status": "revoked"}

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
