"""Admin-only, session-owned integration setup over HA's config flow API."""

import asyncio
import json
import re
import time
from urllib.parse import quote, urlsplit

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field


class StartIntegration(BaseModel):
    model_config = {"extra": "forbid"}
    domain: str = Field(pattern=r"^[a-z0-9_]{1,100}$")
    language: str = Field(default="nb", pattern=r"^(nb|en)$")


def integration_setup_router(m, admin):
    router = APIRouter(prefix="/api/manage/integration-setup", dependencies=[Depends(admin)])
    flows = {}
    lock = asyncio.Lock()
    prefix = "config/config_entries/flow"

    def live():
        if m.demo:
            raise HTTPException(503, "integration_setup_requires_live")
        m.connected()

    def owned(id, user):
        item = flows.get(id)
        if not item or item["owner"] != (user["id"], user["csrf"]):
            raise HTTPException(404, "flow_not_found")
        return item

    async def present(result, item):
        # Completion contains config-entry data; only return the UI fields we need.
        allowed = {
            "type",
            "flow_id",
            "step_id",
            "data_schema",
            "errors",
            "description_placeholders",
            "menu_options",
            "reason",
            "url",
            "title",
            "progress_action",
        }
        output = {k: v for k, v in result.items() if k in allowed}
        output["translations"] = item["translations"]
        output["domain"] = item["domain"]
        item["terminal"] = result.get("type") in {"create_entry", "abort"}
        item["used"] = time.monotonic()
        item["result"] = output
        return output

    @router.get("/catalog")
    async def catalog(language: str = "nb"):
        live()
        domains = await m.rest("GET", prefix + "_handlers?type=integration")
        try:
            resources = (
                await m.ws(
                    "frontend/get_translations",
                    language="en" if language == "en" else "nb",
                    category="title",
                    config_flow=True,
                )
            )["resources"]
        except HTTPException:
            resources = {}
        return [
            {"domain": d, "name": resources.get(f"component.{d}.title", d.replace("_", " "))}
            for d in domains
            if isinstance(d, str) and re.fullmatch(r"[a-z0-9_]{1,100}", d)
        ]

    @router.post("/flows")
    async def start(body: StartIntegration, request: Request, current=Depends(admin)):
        live()
        async with lock:
            # Clean abandoned flows without exposing or modifying another HA user's flows.
            for id, item in list(flows.items()):
                if time.monotonic() - item["used"] > 1800:
                    if not item["terminal"] and not item.get("discovered"):
                        try:
                            await m.rest("DELETE", prefix + "/" + quote(id, safe=""))
                        except HTTPException:
                            continue
                    del flows[id]
            if len(flows) >= 32:
                raise HTTPException(429, "flow_limit")
            domains = await m.rest("GET", prefix + "_handlers?type=integration")
            if body.domain not in domains:
                raise HTTPException(422, "unknown_integration")
            try:
                translations = (
                    await m.ws(
                        "frontend/get_translations",
                        language=body.language,
                        category="config",
                        integration=[body.domain],
                    )
                )["resources"]
            except HTTPException:
                translations = {}
            origin = request.headers.get("origin", "")
            parsed = urlsplit(origin)
            frontend_base = (
                origin
                if parsed.scheme in {"http", "https"}
                and parsed.netloc
                and parsed.path in {"", "/"}
                and not parsed.username
                and not parsed.query
                and not parsed.fragment
                else None
            )
            result = await m.rest("POST", prefix, {"handler": body.domain}, frontend_base=frontend_base)
            item = {
                "frontend_base": frontend_base,
                "owner": (current["id"], current["csrf"]),
                "domain": body.domain,
                "translations": translations,
                "terminal": False,
                "used": time.monotonic(),
            }
            if result.get("flow_id"):
                flows[result["flow_id"]] = item
            return await present(result, item)

    # Match Home Assistant DISCOVERY_SOURCES, including integration and hardware discovery.
    discovery_sources = {
        "integration_discovery",
        "hardware",
        "import",
        "system",
        "esphome",
        "bluetooth",
        "dhcp",
        "zeroconf",
        "ssdp",
        "usb",
        "homekit",
        "hassio",
        "discovery",
        "mqtt",
    }

    @router.get("/discoveries")
    async def discoveries():
        if m.demo:
            return []
        live()
        progress = await m.ws("config_entries/flow/progress")
        return [
            {
                "id": f["flow_id"],
                "domain": f["handler"],
                "name": f.get("context", {}).get("title_placeholders", {}).get("name") or f["handler"],
                "source": f["context"]["source"],
            }
            for f in progress
            if f.get("context", {}).get("source") in discovery_sources
            and isinstance(f.get("handler"), str)
            and f.get("flow_id")
        ]

    @router.get("/attention")
    async def attention():
        if m.demo:
            return []
        live()
        progress = await m.ws("config_entries/flow/progress")
        pending = [
            f
            for f in progress
            if f.get("context", {}).get("source") == "reauth"
            and isinstance(f.get("handler"), str)
            and f.get("flow_id")
        ]
        if not pending:
            return []
        entries = await m.ws("config_entries/get")
        names = {entry["entry_id"]: entry.get("title") for entry in entries}
        return [
            {
                "id": f["flow_id"],
                "domain": f["handler"],
                "source": "reauth",
                "name": names.get(f.get("context", {}).get("entry_id"))
                or f.get("context", {}).get("title_placeholders", {}).get("name")
                or f["handler"],
            }
            for f in pending
        ]

    @router.get("/bluetooth")
    async def bluetooth():
        live()
        config = await m.rest("GET", "config")
        progress = await m.ws("config_entries/flow/progress")
        return {
            "loaded": "bluetooth" in config.get("components", []),
            "discoveries": [
                {
                    "id": f["flow_id"],
                    "domain": f["handler"],
                    "name": f.get("context", {}).get("title_placeholders", {}).get("name", f["handler"]),
                }
                for f in progress
                if f.get("context", {}).get("source") == "bluetooth" and isinstance(f.get("handler"), str)
            ],
        }

    @router.post("/attention/{id}/claim")
    @router.post("/discoveries/{id}/claim")
    @router.post("/bluetooth/{id}/claim")
    async def claim_bluetooth(id: str, body: StartIntegration, request: Request, current=Depends(admin)):
        live()
        async with lock:
            existing = flows.get(id)
            if not existing and len(flows) >= 32:
                raise HTTPException(429, "flow_limit")
            if existing and existing["owner"] != (current["id"], current["csrf"]):
                raise HTTPException(409, "flow_owned")
            progress = await m.ws("config_entries/flow/progress")
            found = next(
                (
                    f
                    for f in progress
                    if f.get("flow_id") == id
                    and f.get("handler") == body.domain
                    and f.get("context", {}).get("source")
                    in (
                        {"reauth"}
                        if "/attention/" in request.url.path
                        else {"bluetooth"}
                        if "/bluetooth/" in request.url.path
                        else discovery_sources
                    )
                ),
                None,
            )
            if not found:
                raise HTTPException(404, "bluetooth_discovery_missing")
            try:
                translations = (
                    await m.ws(
                        "frontend/get_translations",
                        language=body.language,
                        category="config",
                        integration=[body.domain],
                    )
                )["resources"]
            except HTTPException:
                translations = {}
            item = {
                "frontend_base": None,
                "owner": (current["id"], current["csrf"]),
                "domain": body.domain,
                "translations": translations,
                "terminal": False,
                "used": time.monotonic(),
                "discovered": True,
            }
            result = await m.rest("GET", prefix + "/" + quote(id, safe=""))
            flows[id] = item
            return await present(result, item)

    @router.get("/flows/{id}")
    async def poll(id: str, current=Depends(admin)):
        async with lock:
            item = owned(id, current)
            if item["terminal"]:
                return item["result"]
            return await present(
                await m.rest("GET", prefix + "/" + quote(id, safe=""), frontend_base=item["frontend_base"]),
                item,
            )

    @router.post("/flows/{id}")
    async def submit(id: str, body: dict, current=Depends(admin)):
        if len(json.dumps(body)) > 64_000:
            raise HTTPException(422, "flow_input_too_large")
        async with lock:
            item = owned(id, current)
            if item["terminal"]:
                raise HTTPException(409, "flow_finished")
            return await present(
                await m.rest(
                    "POST", prefix + "/" + quote(id, safe=""), body, frontend_base=item["frontend_base"]
                ),
                item,
            )

    @router.delete("/flows/{id}")
    async def cancel(id: str, current=Depends(admin)):
        async with lock:
            item = owned(id, current)
            if not item["terminal"] and not item.get("discovered"):
                try:
                    await m.rest("DELETE", prefix + "/" + quote(id, safe=""))
                except HTTPException as exc:
                    if exc.status_code != 404:
                        raise
            del flows[id]
            return {"cancelled": True}

    return router
