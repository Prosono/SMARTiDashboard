"""Outbound factory heartbeat and checkpointed customer setup. No inbound LAN exposure."""

import asyncio
import hashlib
import json
import logging
import sqlite3
import uuid

import httpx

from .certificate_hook import read_identity
from .ha import HAError
from .remote_access import CLOUD_ORIGIN

log = logging.getLogger(__name__)


class HubOnboarding:
    def __init__(self, settings, ha, store, remote, transport=None):
        self.settings, self.ha, self.store, self.remote = settings, ha, store, remote
        self.transport = transport
        self.boot = uuid.uuid4().hex
        # Stable installation identity, bound on the factory server at its first heartbeat.
        marker = settings.data_dir / "factory-device-id"
        if not marker.exists():
            with marker.open("x") as f:
                f.write(uuid.uuid4().hex)
            marker.chmod(0o600)
        self.fingerprint = hashlib.sha256(marker.read_bytes()).hexdigest()

    async def call(self, action, body):
        home, credential = read_identity(self.settings.remote_identity_file)
        async with httpx.AsyncClient(timeout=20, trust_env=False, transport=self.transport) as client:
            r = await client.post(
                f"{CLOUD_ORIGIN}/api/hubs/{home}/onboarding/{action}",
                headers={"Authorization": "Bearer " + credential},
                json=body,
            )
            r.raise_for_status()
            return r.json()

    async def progress(self, plan, status, step, error=""):
        await self.call("progress", {"id": plan["id"], "status": status, "step": step, "error": error})

    async def apply(self, plan):
        key = "onboarding:" + plan["id"]
        done = set(json.loads(self.store.get(key, "[]")))
        current_step = "checking"

        async def stage(name, operation):
            nonlocal current_step
            current_step = name
            if name in done:
                return
            await self.progress(plan, "working", name)
            await operation()
            done.add(name)
            self.store.set(key, json.dumps(sorted(done)))

        if "completed" in done:
            await self.progress(plan, "completed", "completed")
            return
        if not self.ha.connected:
            await self.progress(plan, "failed", "checking", "ha_unavailable")
            return
        with self.store.connect() as c:
            users = c.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        if plan["mode"] == "new" and users and "user" not in done:
            # An interrupted user transaction writes its checkpoint atomically below.
            await self.progress(plan, "failed", "checking", "existing_users")
            return
        if plan["mode"] == "existing":
            if not users:
                await self.progress(plan, "failed", "checking", "existing_users")
                return
            await self.progress(plan, "completed", "completed")
            return
        try:

            async def reset():
                # Explicit owner reset. Radios, devices, automations and HA service accounts survive.
                # Request history removal before deleting SMARTi users so a rejected HA call fails safely.
                ids = await self.ha.request("recorder/list_statistic_ids")
                if ids:
                    await self.ha.request(
                        "recorder/clear_statistics", statistic_ids=[x["statistic_id"] for x in ids]
                    )
                await self.ha.request(
                    "call_service",
                    domain="recorder",
                    service="purge",
                    service_data={"keep_days": 0, "repack": True},
                )
                with self.store.connect() as c:
                    c.execute("BEGIN IMMEDIATE")
                    for table in [
                        "sessions",
                        "favorites",
                        "dashboards",
                        "mobile_access",
                        "mobile_refresh",
                        "mobile_pairings",
                        "mobile_devices",
                        "mobile_audit",
                        "users",
                        "attempts",
                    ]:
                        c.execute("DELETE FROM " + table)
                    c.execute(
                        "DELETE FROM settings WHERE key LIKE 'access:%' OR key LIKE 'account_%' OR key LIKE 'experience:%' OR key LIKE 'language:%'"
                    )
                    # Commit deletion and reset checkpoint together; never delete the new owner on retry.
                    c.execute(
                        "INSERT OR REPLACE INTO settings VALUES(?,?)",
                        (key, json.dumps(sorted(done | {"resetting"}))),
                    )

            if plan["mode"] == "reset":
                await stage("resetting", reset)

            async def location():
                await self.ha.request(
                    "config/core/update",
                    location_name=plan["name"],
                    latitude=plan["latitude"],
                    longitude=plan["longitude"],
                    time_zone=plan["timezone"],
                )
                self.store.set("home_name", plan["name"])
                self.store.set("timezone", plan["timezone"])

            await stage("location", location)

            async def rooms():
                # Reconcile by name after interruption rather than replaying creation blindly.
                floors = await self.ha.request("config/floor_registry/list")
                areas = await self.ha.request("config/area_registry/list")
                floor_ids = {f["name"].casefold(): f["floor_id"] for f in floors}
                area_ids = {a["name"].casefold(): a["area_id"] for a in areas}
                for r in plan["rooms"]:
                    floor = r["floor"].strip()
                    name = r["name"].strip()
                    if floor.casefold() not in floor_ids:
                        f = await self.ha.request("config/floor_registry/create", name=floor)
                        floor_ids[floor.casefold()] = f["floor_id"]
                    if name.casefold() in area_ids:
                        await self.ha.request(
                            "config/area_registry/update",
                            area_id=area_ids[name.casefold()],
                            floor_id=floor_ids[floor.casefold()],
                        )
                    else:
                        a = await self.ha.request(
                            "config/area_registry/create", name=name, floor_id=floor_ids[floor.casefold()]
                        )
                        area_ids[name.casefold()] = a["area_id"]

            await stage("rooms", rooms)

            async def user():
                with self.store.connect() as c:
                    c.execute("BEGIN IMMEDIATE")
                    if c.execute("SELECT 1 FROM users LIMIT 1").fetchone():
                        raise HAError("existing_users")
                    row = c.execute(
                        "INSERT INTO users(name,password,role) VALUES(?,?,'admin')",
                        (plan["username"], plan["password_hash"]),
                    )
                    c.execute(
                        "INSERT OR REPLACE INTO settings VALUES(?,?)",
                        ("experience:" + str(row.lastrowid), json.dumps({"mode": plan["experience"]})),
                    )
                    c.execute(
                        "INSERT OR REPLACE INTO settings VALUES(?,?)",
                        (key, json.dumps(sorted(done | {"user"}))),
                    )

            await stage("user", user)
            done.add("completed")
            self.store.set(key, json.dumps(sorted(done)))
            await self.progress(plan, "completed", "completed")
        except (HAError, TimeoutError, ValueError, KeyError, sqlite3.Error) as e:
            # No raw HA errors or personal setup data in cloud-facing error text.
            log.warning("Hub setup step failed (%s)", type(e).__name__)
            await self.progress(plan, "failed", current_step, "setup_failed")

    async def tick(self):
        with self.store.connect() as c:
            users = c.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        result = await self.call(
            "heartbeat",
            {
                "boot_id": self.boot,
                "fingerprint": self.fingerprint,
                "version": "1.35.47",
                "users": users,
                "ha_connected": bool(self.ha.connected),
                "remote_ready": bool(self.remote.get("ready")),
            },
        )
        if result.get("plan"):
            await self.apply(result["plan"])

    async def run(self):
        while True:
            if self.settings.remote_identity_file:
                try:
                    await self.tick()
                except (httpx.HTTPError, OSError, ValueError, HAError, sqlite3.Error, KeyError):
                    log.warning("Hub activation service unavailable; will retry")
            await asyncio.sleep(20)
