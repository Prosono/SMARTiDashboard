"""Network Matter commissioning, with no phone-Bluetooth emulation or code persistence."""

import asyncio
import json
import time
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from .ha import HAError


class MatterStart(BaseModel):
    model_config = {"extra": "forbid"}
    request_id: UUID
    code: str = Field(min_length=11, max_length=128, repr=False)

    @field_validator("code")
    @classmethod
    def valid_code(cls, value):
        import re

        value = value.strip()
        if value.startswith("MT:") and re.fullmatch(r"MT:[A-Z0-9.\-]+", value):
            return value
        value = value.replace("-", "").replace(" ", "")
        if not re.fullmatch(r"(?:[0-9]{11}|[0-9]{21})", value):
            raise ValueError("Use a Matter setup code")
        return value


class WirelessSetup:
    def __init__(self, m, settings):
        self.m, self.settings = m, settings
        self.tasks = set()
        self.lock = asyncio.Lock()
        with m.store.connect() as db:
            rows = db.execute("SELECT key,value FROM settings WHERE key LIKE 'matter_setup:%'").fetchall()
        for row in rows:
            state = json.loads(row["value"])
            if state["status"] == "starting":
                state["status"] = "unconfirmed"
                m.store.set(row["key"], json.dumps(state))

    def live(self):
        if self.settings.mode == "demo":
            raise HTTPException(503, "live_setup_required")
        self.m.connected()

    async def ready(self):
        self.live()
        entries = await self.m.ws("config_entries/get", domain="matter")
        return any(
            e.get("domain") == "matter" and e.get("state") == "loaded" and not e.get("disabled_by")
            for e in entries
        )

    async def close(self):
        for task in list(self.tasks):
            task.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True)

    async def commission(self, key, state, code):
        try:
            await self.m.ha.request("matter/commission", code=code, network_only=True, _timeout=180)
            state["status"] = "paired"
        except (HAError, TimeoutError, asyncio.CancelledError):
            state["status"] = "unconfirmed"
        except Exception:
            state["status"] = "unconfirmed"
        finally:
            self.m.store.set(key, json.dumps(state))

    def router(self, admin):
        router = APIRouter(prefix="/api/setup/matter", dependencies=[Depends(admin)])

        @router.get("")
        async def status(current=Depends(admin)):
            ready = await self.ready()
            with self.m.store.connect() as db:
                rows = db.execute("SELECT value FROM settings WHERE key LIKE 'matter_setup:%'").fetchall()
            items = [json.loads(r["value"]) for r in rows]
            items = [s for s in items if s["owner"] == current["id"]]
            return {"ready": ready, "session": max(items, key=lambda s: s["created"], default=None)}

        @router.post("")
        async def start(body: MatterStart, current=Depends(admin)):
            async with self.lock:
                self.live()
                key = "matter_setup:" + str(body.request_id)
                previous = json.loads(self.m.store.get(key, "null"))
                if previous:
                    if previous["owner"] != current["id"]:
                        raise HTTPException(409, "pairing_owned")
                    return previous
                if self.tasks:
                    raise HTTPException(409, "pairing_active")
                if not await self.ready():
                    raise HTTPException(503, "matter_unavailable")
                state = {
                    "id": str(body.request_id),
                    "owner": current["id"],
                    "status": "starting",
                    "created": time.time(),
                }
                self.m.store.set(key, json.dumps(state))
                task = asyncio.create_task(self.commission(key, state, body.code))
                self.tasks.add(task)
                task.add_done_callback(self.tasks.discard)
                return state

        return router
