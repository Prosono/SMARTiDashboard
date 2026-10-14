"""Bounded Supervisor writes, with idempotent requests and explicit uncertain results."""

import asyncio
import hashlib
import ipaddress
import json
import os
import time
from typing import Literal
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator


class BackupRequest(BaseModel):
    model_config = {"extra": "forbid"}
    request_id: UUID
    name: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=12, max_length=128, repr=False)


class IPv4Settings(BaseModel):
    model_config = {"extra": "forbid"}
    method: Literal["auto", "static"]
    address: list[str] = Field(default_factory=list, max_length=8)
    gateway: str = ""
    nameservers: list[str] = Field(default_factory=list, max_length=8)

    @model_validator(mode="after")
    def valid(self):
        for a in self.address:
            if "/" not in a:
                raise ValueError("CIDR required")
            ipaddress.IPv4Interface(a)
        for a in self.nameservers:
            ipaddress.IPv4Address(a)
        if self.gateway:
            ipaddress.IPv4Address(self.gateway)
        if self.method == "static" and not self.address:
            raise ValueError("Static address required")
        return self


class WifiSettings(BaseModel):
    model_config = {"extra": "forbid"}
    ssid: str = Field(min_length=1, max_length=32)
    auth: Literal["open", "wpa-psk"] = "wpa-psk"
    psk: str = Field(default="", max_length=64, repr=False)

    @model_validator(mode="after")
    def valid(self):
        if self.auth == "wpa-psk" and len(self.psk) < 8:
            raise ValueError("Wi-Fi password required")
        return self


class NetworkRequest(BaseModel):
    model_config = {"extra": "forbid"}
    request_id: UUID
    revision: str = Field(min_length=64, max_length=64)
    ipv4: IPv4Settings
    wifi: WifiSettings | None = None


class Supervisor:
    def __init__(self, settings):
        self.settings = settings

    async def request(self, method, path, data=None):
        token = os.environ.get("SUPERVISOR_TOKEN")
        if self.settings.mode == "demo" or not self.settings.ingress or not token:
            raise HTTPException(503, "supervisor_unavailable")
        try:
            async with httpx.AsyncClient(timeout=25, trust_env=False, follow_redirects=False) as client:
                response = await client.request(
                    method,
                    "http://supervisor" + path,
                    json=data,
                    headers={"Authorization": "Bearer " + token},
                )
                response.raise_for_status()
                result = response.json()
                if result.get("result") != "ok":
                    raise HTTPException(502, "supervisor_request_unconfirmed")
                return result.get("data") or {}
        except (httpx.HTTPError, ValueError):
            raise HTTPException(502, "supervisor_request_unconfirmed") from None


def system_operations_router(m, admin, settings):
    router = APIRouter(prefix="/api/manage/settings", dependencies=[Depends(admin)])
    supervisor = Supervisor(settings)
    lock = asyncio.Lock()

    def network_view(item):
        data = {
            "interface": item["interface"],
            "type": item.get("type"),
            "ipv4": {
                k: (item.get("ipv4") or {}).get(k) for k in ["method", "address", "gateway", "nameservers"]
            },
            "ssid": (item.get("wifi") or {}).get("ssid"),
        }
        data["revision"] = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()
        return data

    async def interface(name):
        data = await supervisor.request("GET", "/network/info")
        item = next(
            (
                i
                for i in data.get("interfaces", [])
                if i.get("interface") == name and i.get("type") in {"ethernet", "wireless"}
            ),
            None,
        )
        if not item:
            raise HTTPException(404, "network_interface_not_found")
        return item

    async def operation(id, current, kind, call):
        key = "system_operation:" + str(id)
        async with lock:
            existing = json.loads(m.store.get(key, "null"))
            if existing:
                if existing["owner"] != current["id"] or existing["kind"] != kind:
                    raise HTTPException(409, "operation_conflict")
                return existing
            state = {"owner": current["id"], "kind": kind, "status": "unconfirmed", "created": time.time()}
            # Record before dispatch: a lost response must never repeat a network change or backup.
            m.store.set(key, json.dumps(state))
            try:
                result = await call()
                state.update(status="accepted", job_id=result.get("job_id"), slug=result.get("slug"))
            except HTTPException:
                pass
            m.store.set(key, json.dumps(state))
            return state

    @router.post("/backups")
    async def backup(body: BackupRequest, current=Depends(admin)):
        return await operation(
            body.request_id,
            current,
            "backup",
            lambda: supervisor.request(
                "POST",
                "/backups/new/full",
                {"name": body.name, "password": body.password, "background": True, "compressed": True},
            ),
        )

    @router.get("/operations/{id}")
    async def status(id: UUID, current=Depends(admin)):
        key = "system_operation:" + str(id)
        state = json.loads(m.store.get(key, "null"))
        if not state or state["owner"] != current["id"]:
            raise HTTPException(404, "operation_not_found")
        if state.get("job_id") and state["status"] == "accepted":
            result = await supervisor.request("GET", "/jobs/info")

            def find(jobs):
                for job in jobs:
                    if job.get("uuid") == state["job_id"]:
                        return job
                    child = find(job.get("child_jobs", []))
                    if child:
                        return child
                return None

            job = find(result.get("jobs", []))
            if job:
                state["progress"] = job.get("progress")
                if job.get("done"):
                    state["status"] = "failed" if job.get("errors") else "completed"
                    m.store.set(key, json.dumps(state))
        return state

    @router.get("/network/{name}")
    async def network(name: str):
        return network_view(await interface(name))

    @router.put("/network/{name}")
    async def change_network(name: str, body: NetworkRequest, current=Depends(admin)):
        item = await interface(name)
        if network_view(item)["revision"] != body.revision:
            raise HTTPException(409, "network_changed")
        if body.wifi and item.get("type") != "wireless":
            raise HTTPException(422, "not_wireless")
        # The name is matched against the controller's interfaces, never accepted as a proxy path.
        from urllib.parse import quote

        payload = {"ipv4": {"method": "auto"} if body.ipv4.method == "auto" else body.ipv4.model_dump()}
        if body.wifi:
            payload["wifi"] = body.wifi.model_dump() | {"mode": "infrastructure"}
        return await operation(
            body.request_id,
            current,
            "network:" + name,
            lambda: supervisor.request(
                "POST", "/network/interface/" + quote(name, safe="") + "/update", payload
            ),
        )

    return router
