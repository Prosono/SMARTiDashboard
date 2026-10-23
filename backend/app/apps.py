"""Administrator app management. Fixed Supervisor routes; self-management is update-only."""

import asyncio
import hashlib
import json
import os
import re
import time
from typing import Literal
from urllib.parse import urlsplit
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, field_validator

from .ha import HAError
from .system_operations import Supervisor


class AppAction(BaseModel):
    model_config = {"extra": "forbid"}
    request_id: UUID
    action: Literal["install", "start", "stop", "restart", "update", "uninstall"]
    backup: bool = True
    confirm_slug: str


class AppOptions(BaseModel):
    model_config = {"extra": "forbid"}
    revision: str = Field(min_length=64, max_length=64)
    options: dict
    boot: Literal["auto", "manual"]
    watchdog: bool
    auto_update: bool

    @field_validator("options")
    @classmethod
    def bounded(cls, value):
        if len(json.dumps(value)) > 100000:
            raise ValueError("Configuration too large")
        return value


class Repository(BaseModel):
    model_config = {"extra": "forbid"}
    repository: str = Field(max_length=500)

    @field_validator("repository")
    @classmethod
    def valid(cls, value):
        p = urlsplit(value)
        if p.scheme != "https" or not p.hostname or p.username or p.password or p.query or p.fragment:
            raise ValueError("Use an HTTPS repository URL without credentials")
        return value


def apps_router(m, admin, settings):
    router = APIRouter(prefix="/api/manage/apps", dependencies=[Depends(admin)])
    supervisor = Supervisor(settings)
    lock = asyncio.Lock()
    catalog_lock = asyncio.Lock()
    last_catalog_attempt = None
    catalog_checked_at = None
    catalog_check_error = False

    async def refresh_catalog(force=False):
        nonlocal last_catalog_attempt, catalog_checked_at, catalog_check_error
        async with catalog_lock:
            if (
                not force
                and last_catalog_attempt is not None
                and time.monotonic() - last_catalog_attempt < 60
            ):
                return
            last_catalog_attempt = time.monotonic()
            try:
                await supervisor.request("POST", "/store/reload")
            except HTTPException:
                catalog_check_error = True
                return
            catalog_checked_at = time.time()
            catalog_check_error = False

    def valid_slug(slug):
        if (
            not re.fullmatch(r"[a-zA-Z0-9_-]{1,100}", slug)
            or slug.lower() in {"self", "smarti"}
            or slug.lower().endswith("_smarti")
        ):
            raise HTTPException(404, "app_not_available")

    async def own_slug():
        # Fail closed if Supervisor cannot identify this installation.
        info = await supervisor.request("GET", "/addons/self/info")
        if not info.get("slug"):
            raise HTTPException(503, "app_identity_unavailable")
        return info["slug"]

    def protected(item, own):
        slug = item.get("slug", "").lower()
        return (
            slug in {"self", "smarti", own.lower()}
            or slug.endswith("_smarti")
            or item.get("name", "").strip().lower() == "smarti"
        )

    def view(item, installed=False):
        return {
            **{
                k: item.get(k)
                for k in [
                    "slug",
                    "name",
                    "description",
                    "version",
                    "version_latest",
                    "state",
                    "repository",
                    "available",
                    "update_available",
                    "system_managed",
                    "stage",
                    "icon",
                    "logo",
                ]
            },
            "installed": installed,
        }

    async def target(slug, store=False):
        valid_slug(slug)
        own = await own_slug()
        if slug == own:
            raise HTTPException(404, "app_not_available")
        info = await supervisor.request("GET", f"/store/addons/{slug}" if store else f"/addons/{slug}/info")
        if info.get("slug") != slug or protected(info, own):
            raise HTTPException(404, "app_not_available")
        return info

    @router.get("")
    async def inventory():
        own = await own_slug()
        installed, catalog = await asyncio.gather(
            supervisor.request("GET", "/addons"), supervisor.request("GET", "/store/addons")
        )
        installed = {a["slug"]: a for a in installed.get("addons", [])}
        catalog = catalog if isinstance(catalog, list) else catalog.get("addons", [])
        merged = {a["slug"]: a for a in catalog}
        for slug, item in installed.items():
            merged[slug] = {**merged.get(slug, {}), **item}
        return [view(a, slug in installed) for slug, a in merged.items() if not protected(a, own)]

    @router.get("/self-update")
    async def self_update_info():
        info = await supervisor.request("GET", "/addons/self/info")
        if not info.get("slug"):
            raise HTTPException(503, "app_identity_unavailable")
        for operation in rows():
            if (
                operation.get("via_ha")
                and operation["slug"] == info["slug"]
                and operation.get("target_version") == info.get("version")
                and info.get("state") == "started"
            ):
                operation["status"] = "completed"
                m.store.set("app_operation:" + operation["request_id"], json.dumps(operation))
        return view(info, True)

    @router.post("/self-update/check")
    async def self_update_check():
        await own_slug()
        await refresh_catalog()
        info = await self_update_info()
        return {**info, "checked_at": catalog_checked_at, "check_error": catalog_check_error}

    @router.post("/self-update")
    async def self_update(body: AppAction, current=Depends(admin)):
        slug = await own_slug()
        if body.action != "update":
            raise HTTPException(422, "self_update_only")
        return await execute(slug, body, current, self_update=True)

    @router.get("/radio-ui/{provider}")
    async def radio_ui(provider: Literal["zigbee2mqtt", "zwave_js"]):
        own = await own_slug()
        installed = await supervisor.request("GET", "/addons")
        candidates = []
        for item in installed.get("addons", []):
            slug = item.get("slug", "")
            if protected(item, own):
                continue
            valid_slug(slug)
            normalized = re.sub(r"[^a-z0-9]", "", slug.lower())
            matches = (
                "zigbee2mqtt" in normalized
                if provider == "zigbee2mqtt"
                else any(name in normalized for name in ("zwavejsui", "zwavejs2mqtt", "zwavejs"))
            )
            if not matches:
                continue
            info = await supervisor.request("GET", f"/addons/{slug}/info")
            url = info.get("ingress_url", "")
            available = (
                bool(info.get("ingress"))
                and info.get("state") == "started"
                and bool(isinstance(url, str) and re.fullmatch(r"/api/hassio_ingress/[A-Za-z0-9_-]+/?", url))
            )
            candidates.append(
                {
                    "slug": slug,
                    "name": info.get("name", slug),
                    "available": available,
                    "url": url if available else None,
                    "state": info.get("state", "unknown"),
                }
            )
        return candidates

    @router.get("/repositories")
    async def repositories():
        await own_slug()
        result = await supervisor.request("GET", "/store/repositories")
        result = result if isinstance(result, list) else result.get("repositories", [])
        return [{k: r.get(k) for k in ["slug", "name", "source", "maintainer"]} for r in result]

    @router.post("/repositories")
    async def add_repository(body: Repository):
        await own_slug()
        await supervisor.request("POST", "/store/repositories", body.model_dump())
        return {"saved": True}

    @router.post("/reload")
    async def reload_store():
        await own_slug()
        await refresh_catalog(force=True)
        if catalog_check_error:
            raise HTTPException(502, "app_catalog_check_failed")
        return {"saved": True}

    def rows(current=None):
        with m.store.connect() as db:
            values = db.execute("SELECT key,value FROM settings WHERE key LIKE 'app_operation:%'").fetchall()
        return sorted(
            [
                dict(json.loads(r["value"]), request_id=r["key"].split(":", 1)[1])
                for r in values
                if current is None or json.loads(r["value"])["owner"] == current["id"]
            ],
            key=lambda r: r["created"],
            reverse=True,
        )

    @router.get("/operations")
    async def operations(current=Depends(admin)):
        items = rows()
        if not any(i["status"] == "accepted" and i.get("job_id") for i in items):
            return [i for i in items if i["owner"] == current["id"]][:20]
        jobs = await supervisor.request("GET", "/jobs/info")

        def find(items, id):
            for job in items:
                if job.get("uuid") == id:
                    return job
                child = find(job.get("child_jobs", []), id)
                if child:
                    return child
            return None

        for item in items:
            if item["status"] != "accepted" or not item.get("job_id"):
                continue
            job = find(jobs.get("jobs", []), item["job_id"])
            if not job and time.time() - item["created"] > 300:
                item["status"] = "unconfirmed"
                m.store.set("app_operation:" + item["request_id"], json.dumps(item))
            if job:
                item["progress"] = job.get("progress")
                if job.get("done"):
                    item["status"] = "failed" if job.get("errors") else "completed"
                m.store.set("app_operation:" + item["request_id"], json.dumps(item))
        return [i for i in items if i["owner"] == current["id"]][:20]

    @router.post("/{slug}/actions")
    async def action(slug: str, body: AppAction, current=Depends(admin)):
        return await execute(slug, body, current)

    async def execute(slug, body, current, self_update=False):
        if not self_update:
            valid_slug(slug)
        if body.confirm_slug != slug:
            raise HTTPException(422, "confirmation_required")
        key = "app_operation:" + str(body.request_id)
        async with lock:
            old = json.loads(m.store.get(key, "null"))
            if old:
                if old["owner"] != current["id"] or old["slug"] != slug or old["action"] != body.action:
                    raise HTTPException(409, "operation_conflict")
                return old
            info = (
                (await supervisor.request("GET", "/addons/self/info"))
                if self_update
                else await target(slug, body.action == "install")
            )
            if self_update and info.get("slug") != slug:
                raise HTTPException(409, "app_identity_changed")
            if body.action == "install" and info.get("installed"):
                raise HTTPException(409, "already_installed")
            if body.action == "uninstall" and info.get("system_managed"):
                raise HTTPException(409, "system_managed_app")
            if body.action == "update" and not info.get("update_available"):
                raise HTTPException(409, "no_update")
            if body.action in {"install", "update"}:
                await supervisor.request("GET", f"/store/addons/{slug}/availability")
            if any(i["slug"] == slug and i["status"] == "accepted" for i in rows()):
                raise HTTPException(409, "app_operation_active")
            update_entity = None
            if self_update:
                m.connected()
                registry = await m.ws("config/entity_registry/list")
                candidates = [
                    r["entity_id"]
                    for r in registry
                    if r.get("platform") == "hassio"
                    and r.get("unique_id") == f"{slug}_version_latest"
                    and r.get("entity_id", "").startswith("update.")
                    and not r.get("disabled_by")
                ]
                if len(candidates) != 1:
                    raise HTTPException(409, "self_update_entity_unavailable")
                update_entity = candidates[0]
            state = {
                "owner": current["id"],
                "slug": slug,
                "name": info.get("name", slug),
                "action": body.action,
                "created": time.time(),
                "status": "unconfirmed",
            }
            if self_update:
                state.update(via_ha=True, target_version=info.get("version_latest"))
            m.store.set(key, json.dumps(state))
            if self_update:
                # Supervisor rejects a direct self-update. HA owns the update entity
                # and runs the installation independently of this app's lifetime.
                try:
                    await m.ha.request(
                        "call_service",
                        domain="update",
                        service="install",
                        target={"entity_id": update_entity},
                        service_data={"backup": body.backup},
                    )
                    state["status"] = "accepted"
                except HAError as error:
                    if str(error) == "ha_request_rejected":
                        state["status"] = "failed"
                except (TimeoutError, OSError):
                    # A disconnect during installation is not proof of failure.
                    pass
                m.store.set(key, json.dumps(state))
                return state
            path = (
                f"/store/addons/{slug}/{body.action}"
                if body.action in {"install", "update"}
                else f"/addons/{slug}/{body.action}"
            )
            payload = {"background": True} if body.action in {"install", "update"} else {}
            if body.action == "update":
                payload["backup"] = body.backup
            if body.action == "uninstall":
                payload["remove_config"] = False
            try:
                result = await supervisor.request("POST", path, payload)
                state.update(
                    status="accepted" if result.get("job_id") else "completed", job_id=result.get("job_id")
                )
            except HTTPException:
                # Timeout is not proof of failure; do not automatically dispatch again.
                pass
            m.store.set(key, json.dumps(state))
            return state

    def config(info):
        value = {k: info.get(k) for k in ["options", "boot", "watchdog", "auto_update"]}
        value["revision"] = hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()
        return value

    @router.get("/{slug}/image")
    async def image(slug: str, source: Literal["installed", "store"], kind: Literal["icon", "logo"] = "icon"):
        info = await target(slug, source == "store")
        if not info.get(kind):
            raise HTTPException(404, "app_image_unavailable")
        token = os.environ.get("SUPERVISOR_TOKEN")
        if settings.mode == "demo" or not settings.ingress or not token:
            raise HTTPException(503, "supervisor_unavailable")
        path = f"/store/addons/{slug}/{kind}" if source == "store" else f"/addons/{slug}/{kind}"
        try:
            async with httpx.AsyncClient(timeout=15, trust_env=False, follow_redirects=False) as client:
                async with client.stream(
                    "GET", "http://supervisor" + path, headers={"Authorization": "Bearer " + token}
                ) as response:
                    response.raise_for_status()
                    data = bytearray()
                    async for chunk in response.aiter_bytes():
                        data.extend(chunk)
                        if len(data) > 2_000_000:
                            raise HTTPException(502, "app_image_unavailable")
        except httpx.HTTPError:
            raise HTTPException(502, "app_image_unavailable") from None
        # Serve only raster images, never upstream HTML/SVG or response headers.
        content = bytes(data)
        if content.startswith(b"\x89PNG\r\n\x1a\n"):
            mime = "image/png"
        elif content.startswith(b"\xff\xd8\xff"):
            mime = "image/jpeg"
        elif content.startswith(b"RIFF") and content[8:12] == b"WEBP":
            mime = "image/webp"
        else:
            raise HTTPException(502, "app_image_unavailable")
        return Response(
            content,
            media_type=mime,
            headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
        )

    @router.get("/{slug}/configuration")
    async def configuration(slug: str):
        info = await target(slug)
        return {
            **config(info),
            "boot_config": info.get("boot_config"),
            "schema": info.get("schema"),
            "name": info.get("name"),
        }

    @router.put("/{slug}/configuration")
    async def save_configuration(slug: str, body: AppOptions):
        async with lock:
            return await write_configuration(slug, body)

    async def write_configuration(slug, body):
        info = await target(slug)
        if any(i["slug"] == slug and i["status"] == "accepted" for i in rows()):
            raise HTTPException(409, "app_operation_active")
        if body.boot == "auto" and info.get("boot_config") == "manual_only":
            raise HTTPException(422, "manual_start_required")
        if body.revision != config(info)["revision"]:
            raise HTTPException(409, "app_configuration_changed")
        validation = await supervisor.request("POST", f"/addons/{slug}/options/validate", body.options)
        if not validation.get("valid"):
            raise HTTPException(422, "app_configuration_invalid")
        await supervisor.request("POST", f"/addons/{slug}/options", body.model_dump(exclude={"revision"}))
        return {"saved": True, "restart_required": True}

    return router
