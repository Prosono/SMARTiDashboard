import asyncio
import base64
import contextlib
import json
import math
import secrets
import time
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from .access import access_router, controllable, feature, policy, require, route_access, visible
from .accounts import accounts_router
from .apps import apps_router
from .auth import Auth, hasher
from .calendar import calendar_router
from .camera_stream import camera_router
from .config import Settings
from .demo import Demo
from .energy import energy_router
from .energy_flow import energy_flow_router
from .groups import groups_router
from .ha import HAError, HomeAssistant
from .history import history_router
from .home_extras import extras_router
from .home_overview import home_router
from .integration_setup import integration_setup_router
from .management import Management, management_router
from .mobile import MobileAuth
from .models import Command
from .origins import OriginPolicy
from .remote_access import remote_router
from .scenes import scenes_router
from .setup import DeviceSetup
from .storage import Store
from .system_operations import system_operations_router
from .system_settings import system_settings_router
from .vehicle import vehicle_router
from .wireless_setup import WirelessSetup


class Credentials(BaseModel):
    name: str = Field(min_length=1, max_length=254, pattern=r"^[\w.@+\-]+$")
    password: str = Field(min_length=12, max_length=256)


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


class PairingFinish(BaseModel):
    model_config = {"extra": "forbid"}
    name: str = Field(min_length=1, max_length=80)
    area_id: str = Field(min_length=1, max_length=200)


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


class ConsoleTarget(BaseModel):
    model_config = {"extra": "forbid"}
    slug: str | None = Field(default=None, pattern=r"^[a-zA-Z0-9_-]{1,100}$")


def create_app(
    settings=None,
    adapter=None,
    *,
    mobile_only=False,
    remote_surface=False,
    console_settings=None,
    support_identity=None,
):
    settings = settings or Settings()
    settings.validate_runtime()
    if remote_surface and (
        mobile_only or settings.ingress or settings.auto_local_origins or settings.additional_origins
    ):
        raise ValueError("Remote surface requires isolated exact-origin settings")
    session_cookie = "__Host-smarti_remote" if remote_surface else "smarti_session"
    store = Store(settings.database)
    auth = Auth(store, settings)
    from .support_access import COOKIE as support_cookie
    from .support_access import SupportAccess, install_support_access

    support = SupportAccess(support_identity) if remote_surface and support_identity else None
    mobile = MobileAuth(store)
    ha = adapter or (Demo() if settings.mode == "demo" else HomeAssistant(settings.ha_url, settings.ha_token))

    setup = DeviceSetup(ha, settings, store)
    origins = OriginPolicy(settings)

    @asynccontextmanager
    async def lifespan(app):
        task = asyncio.create_task(ha.run())
        discovery = None
        remote_task = None
        onboarding_task = None

        def start_remote():
            nonlocal remote_task
            if settings.remote_identity_file and not mobile_only and not remote_surface:
                if remote_task is None or remote_task.done():
                    from .remote_runtime import run_remote

                    remote_task = asyncio.create_task(run_remote(settings, ha, app.state.remote))

        app.state.start_remote = start_remote
        try:
            if not mobile_only and origins.enabled:
                await origins.refresh()
                discovery = asyncio.create_task(origins.run())
            start_remote()
            if not mobile_only and not remote_surface:
                from .hub_onboarding import HubOnboarding

                onboarding_task = asyncio.create_task(
                    HubOnboarding(settings, ha, store, app.state.remote, start_remote=start_remote).run()
                )
            yield
        finally:
            if onboarding_task:
                onboarding_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await onboarding_task
            if remote_task:
                remote_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await remote_task
            if discovery:
                discovery.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await discovery
            try:
                await wireless.close()
                await setup.close()
            finally:
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task

    app = FastAPI(title="SMARTi", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        # Never echo submitted passwords, Wi-Fi keys or image payloads in validation errors.
        return JSONResponse(
            status_code=422,
            content={
                "detail": [{"loc": e["loc"], "type": e["type"], "msg": "Invalid field"} for e in exc.errors()]
            },
        )

    app.state.ha, app.state.auth, app.state.store = ha, auth, store
    app.state.remote = {"ready": False}
    app.state.mobile = mobile
    from .customer_access import COOKIE as customer_cookie
    from .customer_access import CustomerAccess, install_customer_access

    customer = CustomerAccess(support_identity, store) if remote_surface and support_identity else None
    if customer:
        install_customer_access(app, customer)
    app.state.customer = customer
    app.state.support = support
    app.state.setup = setup
    app.state.origins = origins

    @app.middleware("http")
    async def boundary(request, call_next):
        if (
            settings.ingress
            and request.url.path == "/api/mobile/ha-notify"
            and request.method == "POST"
            and request.client
            and request.client.host in {"127.0.0.1", "::1"}
            and not request.headers.get("origin")
        ):
            return await call_next(request)
        if remote_surface:
            from urllib.parse import urlsplit

            expected_host = urlsplit(settings.origin).netloc
            if request.url.scheme != "https" or request.headers.getlist("host") != [expected_host]:
                return JSONResponse({"detail": "remote_transport_rejected"}, status_code=403)
            # The login screen reads setup status before rendering its form.
            # Only this read is public; provisioning remains local-only.
            setup_status_read = request.method == "GET" and request.url.path == "/api/bootstrap"
            if not setup_status_read and request.url.path.startswith(("/api/bootstrap", "/api/remote")):
                return JSONResponse({"detail": "local_access_required"}, status_code=403)
        native_request = mobile_only or (
            remote_surface and settings.mobile_enabled and request.url.path.startswith("/api/mobile/v1/")
        )
        if native_request:
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
        if not native_request and request.method not in {"GET", "HEAD", "OPTIONS"}:
            origin = request.headers.get("origin")
            if len(request.headers.getlist("origin")) != 1 or not origins.accepts(origin):
                return JSONResponse(
                    {"detail": "origin_rejected"}, status_code=403, headers={"Cache-Control": "no-store"}
                )
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store" if request.url.path.startswith("/api") else "no-cache"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; img-src 'self' data: https://www.zigbee2mqtt.io https://brands.home-assistant.io https://tile.openstreetmap.org; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'"
        )
        console = getattr(app.state, "console", None)
        if console is not None:
            response.headers["Content-Security-Policy"] += f"; frame-src 'self' {console.origin}"
        return response

    async def user(request: Request):
        if support and request.cookies.get(support_cookie):
            return await support.user(request)
        result = (
            await customer.user(request)
            if customer and request.cookies.get(customer_cookie)
            else auth.session(request.cookies.get(session_cookie))
        )
        if request.method not in {"GET", "HEAD"} and not secrets.compare_digest(
            request.headers.get("x-csrf-token", ""), result["csrf"]
        ):
            raise HTTPException(403, "csrf_rejected")
        result.update(policy(store, result))
        route_access(request, result, ha)
        return result

    def admin(current=Depends(user)):
        if current["role"] != "admin":
            raise HTTPException(403, "admin_required")
        return current

    if support:
        install_support_access(app, support)
    app.include_router(access_router(store, admin))
    if not mobile_only:
        app.include_router(remote_router(settings, admin))
    management = Management(ha, store, settings)
    app.state.management = management
    if settings.ingress and settings.remote_identity_file:
        from .mobile_push import install_local_push

        install_local_push(app, management, settings.remote_identity_file)
    wireless = WirelessSetup(management, settings)
    app.state.wireless = wireless
    app.include_router(wireless.router(admin))
    app.include_router(management_router(management, admin))
    app.include_router(system_settings_router(management, admin, settings))
    app.include_router(system_operations_router(management, admin, settings))
    app.include_router(apps_router(management, admin, console_settings or settings))
    app.include_router(accounts_router(management, admin, user))
    app.include_router(integration_setup_router(management, admin))
    app.include_router(home_router(store, user, ha, settings))
    app.include_router(extras_router(store, user, ha, settings))
    app.include_router(history_router(ha, user, settings))
    app.include_router(calendar_router(store, user, ha, settings))
    app.include_router(vehicle_router(store, user, ha))
    app.include_router(camera_router(ha, user, settings))
    app.include_router(scenes_router(ha, store, user, settings))
    app.include_router(energy_router(ha, store, user, settings))
    app.include_router(energy_flow_router(store, user, ha, settings))

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
        key = "login:" + request.client.host
        auth.throttle(key)
        token, session = auth.login(body.name, body.password)
        if support:
            response.delete_cookie(support_cookie, path="/", secure=True, httponly=True, samesite="strict")
        if customer:
            response.delete_cookie(customer_cookie, path="/", secure=True, httponly=True, samesite="strict")
        auth.finish_successful_attempt(key)
        response.set_cookie(
            session_cookie,
            token,
            httponly=True,
            secure=request.headers.get("origin", "").startswith("https://"),
            samesite="strict",
            path=cookie_path(request),
            max_age=settings.session_hours * 3600,
        )
        return session

    @app.get("/api/manage/debugging/target")
    async def debugging_target(current=Depends(admin)):
        # Local ingress keeps the existing HA origin. Remote access uses an
        # isolated console origin; no Supervisor credentials reach the browser.
        console = getattr(app.state, "console", None)
        available = (settings.ingress or console is not None) and settings.mode == "live"
        return {
            "available": available,
            "remote": console is not None,
            "path": "/config/dashboard" if available else None,
        }

    @app.post("/api/manage/console/open")
    async def console_open(body: ConsoleTarget, request: Request, current=Depends(admin)):
        console = getattr(app.state, "console", None)
        if console is None:
            raise HTTPException(503, "console_unavailable")
        slug = body.slug
        path = "/config/dashboard"
        if slug is not None:
            import re

            from .system_operations import Supervisor

            if not isinstance(slug, str) or not re.fullmatch(r"[a-zA-Z0-9_-]{1,100}", slug):
                raise HTTPException(422, "invalid_app")
            info = await Supervisor(console_settings).request("GET", f"/addons/{slug}/info")
            normalized = re.sub(r"[^a-z0-9]", "", slug.lower())
            if (
                not any(name in normalized for name in ("zigbee2mqtt", "zwavejs"))
                or not info.get("ingress")
                or info.get("state") != "started"
            ):
                raise HTTPException(404, "app_not_available")
            # HA owns ingress session creation and renewal through its app panel.
            path = "/app/" + slug
        if current.get("customer"):
            console.customer_validator = customer.console_admin
            return {"url": await console.launch_customer(request.cookies.get(customer_cookie), path)}
        return {"url": console.launch(request.cookies.get(session_cookie), path)}

    @app.get("/api/session")
    async def session(current=Depends(user)):
        return current

    @app.post("/api/logout")
    async def logout(request: Request, response: Response, current=Depends(user)):
        auth.logout(request.cookies.get(session_cookie))
        if customer:
            response.delete_cookie(customer_cookie, path="/", secure=True, httponly=True, samesite="strict")
        if support:
            response.delete_cookie(support_cookie, path="/", secure=True, httponly=True, samesite="strict")
        response.delete_cookie(
            session_cookie, path=cookie_path(request), secure=remote_surface, httponly=True, samesite="strict"
        )
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
        current = current | policy(store, current)
        controls = [c for c in ha.controls() if visible(current, c)]
        physical = []
        for did, device in ha.devices.items():
            if not any(c.device_id == did for c in controls):
                continue
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
            "permissions": current["permissions"],
            "access_profile": current["profile"],
            "controls": [
                c.model_dump()
                | {"capabilities": c.model_dump()["capabilities"] if controllable(current, c) else []}
                for c in controls
            ],
            "favorites": favorites,
        }

    @app.api_route("/api/dashboards", methods=["GET", "POST", "PUT", "DELETE"], include_in_schema=False)
    @app.api_route(
        "/api/dashboards/{retired_path:path}",
        methods=["GET", "POST", "PUT", "DELETE"],
        include_in_schema=False,
    )
    async def retired_dashboards(current=Depends(user)):
        raise HTTPException(410, "dashboard_builder_removed")

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
        current = current | policy(store, current)
        require(current, feature(control) + ".view")
        require(current, feature(control) + ".control")
        if control.domain in {"scene", "script", "automation"} and current["role"] != "admin":
            from .access import ALL

            if not ALL.issubset(set(current["permissions"])):
                raise HTTPException(403, "permission_denied")
        if control.domain == "automation" and current["role"] != "admin":
            raise HTTPException(403, "admin_required")
        if body.action in {"activate", "lock", "unlock", "open_cover", "close_cover"} and not body.confirmed:
            raise HTTPException(422, "confirmation_required")
        capability = next((c for c in control.capabilities if body.action in c.actions), None)
        if not capability:
            raise HTTPException(422, "unsupported_action")
        if not ha.connected or control.availability != "available":
            raise HTTPException(409, "device_unavailable")
        if body.action != "set_fan_speed" and body.fan_speed is not None:
            raise HTTPException(422, "unexpected_fan_speed")
        if body.action != "clean_area" and body.area_ids:
            raise HTTPException(422, "unexpected_area_ids")
        command_value = body.value
        if body.action == "set_fan_speed":
            if (
                body.value is not None
                or not body.fan_speed
                or body.fan_speed not in control.attributes.get("fan_speed_list", [])
            ):
                raise HTTPException(422, "invalid_fan_speed")
            command_value = body.fan_speed
        elif body.action == "clean_area":
            if (
                body.value is not None
                or not body.area_ids
                or not set(body.area_ids).issubset(
                    set(control.attributes.get("smarti_cleaning_areas", [])) & set(ha.areas)
                )
            ):
                raise HTTPException(422, "invalid_cleaning_areas")
            command_value = list(dict.fromkeys(body.area_ids))
        elif body.action == "set_rgb_color":
            if not isinstance(body.value, tuple) or any(not 0 <= v <= 255 for v in body.value):
                raise HTTPException(422, "invalid_color")
        elif body.action.startswith("set_"):
            value = body.value
            if (
                not isinstance(value, (int, float))
                or not math.isfinite(value)
                or not capability.minimum <= value <= capability.maximum
            ):
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
            return await ha.command(entity_id, body.action, command_value)
        except (HAError, TimeoutError):
            raise HTTPException(504, "command_unconfirmed_do_not_retry_automatically")

    app.include_router(groups_router(store, ha, user, admin, command))

    @app.get("/api/events")
    async def events(request: Request, poll: bool = False, current=Depends(user)):
        origin = request.headers.get("origin")
        if len(request.headers.getlist("origin")) > 1 or (origin and not origins.accepts(origin)):
            raise HTTPException(403, "origin_rejected")

        # Short responses survive ingress service workers that cannot forward SSE.
        # The same authentication and origin checks apply to both transports.
        if poll:
            return {"revision": ha.revision, "radio_revision": setup.inventory.revision}

        async def stream():
            revision = (-1, -1)
            support_checked = 0.0
            while not await request.is_disconnected():
                try:
                    if current.get("support"):
                        if current["support"]["expires"] <= time.time():
                            raise HTTPException(401, "support_access_expired")
                        if time.monotonic() - support_checked >= 5:
                            await support.user(request)
                            support_checked = time.monotonic()
                    elif current.get("customer"):
                        if time.monotonic() - support_checked >= 5:
                            await customer.user(request)
                            support_checked = time.monotonic()
                    else:
                        auth.session(request.cookies.get(session_cookie))
                except HTTPException:
                    yield "event: expired\ndata: {}\n\n"
                    return
                current_revision = (ha.revision, setup.inventory.revision)
                if current_revision != revision:
                    revision = current_revision
                    yield (
                        "data: "
                        + json.dumps({"revision": revision[0], "radio_revision": revision[1]})
                        + "\n\n"
                    )
                else:
                    yield "event: heartbeat\ndata: {}\n\n"
                await asyncio.sleep(0.5)

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

    @app.post("/api/setup/sessions/{session_id}/finish")
    async def finish_pairing(session_id: str, body: PairingFinish, current=Depends(admin)):
        async with setup.lock:
            s = setup.session
            if not s or s["id"] != session_id or s["status"] != "paired" or s.get("operation") == "remove":
                raise HTTPException(409, "pairing_not_complete")
            if not body.name.strip() or body.area_id not in ha.areas:
                raise HTTPException(422, "invalid_device_details")
            if not s.get("device_id"):
                raise HTTPException(409, "device_registration_pending")
            device = await setup.inventory.detail(s["provider"], s["device_id"])
            device_id = device.get("ha_device_id")
            if not device_id or device_id not in ha.devices or device.get("controller"):
                raise HTTPException(409, "device_registration_pending")
            await management.ws(
                "config/device_registry/update",
                device_id=device_id,
                name_by_user=body.name.strip(),
                area_id=body.area_id,
            )
            s["setup_completed"] = True
            s["device_name"] = body.name.strip()
            return {"id": s["device_id"], "name": body.name.strip(), "provider": s["provider"]}

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
        result = mobile.session(header[7:])
        return result | policy(store, result)

    if settings.mobile_enabled and not mobile_only:

        @app.post("/api/mobile/pairings")
        async def pairing(current=Depends(user)):
            auth.throttle("pairing_issue:" + str(current["id"]))
            return mobile.issue_pairing(current["id"]) | {"url": settings.mobile_url}

        @app.delete("/api/mobile/pairings")
        async def cancel_pairing(current=Depends(user)):
            mobile.cancel_pairing(current["id"])
            return {"status": "cancelled"}

        @app.get("/api/mobile/devices")
        async def devices(current=Depends(user)):
            return {"installation_id": mobile.installation_id, "devices": mobile.devices(current["id"])}

        @app.delete("/api/mobile/devices/{device_id}")
        async def revoke_device(device_id: str, current=Depends(user)):
            mobile.revoke(current["id"], device_id)
            return {"status": "revoked"}

    if settings.mobile_enabled and (mobile_only or remote_surface):
        from .mobile_companion import companion_router

        app.include_router(
            companion_router(management, mobile_user, support_identity or settings.remote_identity_file)
        )

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
