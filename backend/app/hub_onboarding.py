"""Outbound factory heartbeat and checkpointed customer setup. LAN discovery carries no credentials and exposes no configuration endpoint."""

import asyncio
import hashlib
import json
import logging
import secrets
import sqlite3
import uuid

import httpx
from fastapi import HTTPException

from .certificate_hook import read_identity
from .factory_image import enrollment_bootstrap
from .factory_reset import archive_previous_reset
from .full_reset import FullReset
from .ha import HAError
from .ha_auth_reset import AuthResetError
from .remote_access import CLOUD_ORIGIN

log = logging.getLogger(__name__)


class HubOnboarding:
    def __init__(self, settings, ha, store, remote, transport=None, start_remote=None, setup=None):
        self.settings, self.ha, self.store, self.remote = settings, ha, store, remote
        from .radio_recovery import RadioRecovery

        self.radios = RadioRecovery(settings, ha, store, setup) if setup else None
        self.transport = transport
        self.start_remote = start_remote
        self.boot = uuid.uuid4().hex
        from .lan_discovery import HubAdvertisement

        self.advertisement = HubAdvertisement()
        # Stable installation identity, bound on the factory server at its first heartbeat.
        marker = settings.data_dir / "factory-device-id"
        if not marker.exists():
            with marker.open("x") as f:
                f.write(uuid.uuid4().hex)
            marker.chmod(0o600)
        self.fingerprint = hashlib.sha256(marker.read_bytes()).hexdigest()
        enrollment_key = settings.data_dir / "enrollment-secret"
        if not enrollment_key.exists():
            import os

            fd = os.open(enrollment_key, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "w") as f:
                f.write(secrets.token_urlsafe(48))
        self.enrollment_secret = enrollment_key.read_text().strip()
        self.device = str(
            uuid.UUID(bytes=hashlib.sha256(self.enrollment_secret.encode()).digest()[:16], version=4)
        )

    def unconfigured_discovery(self):
        if not self.settings.ingress or self.settings.mode != "live" or self.settings.remote_identity_file:
            return None
        with self.store.connect() as c:
            if c.execute("SELECT 1 FROM users LIMIT 1").fetchone():
                return None
        return {"id": self.device, "state": "unconfigured", "model": "SMARTi Hub", "serial": self.device[-8:]}

    async def enroll(self):
        # Rendezvous is outbound HTTPS. Discovery is already running even if internet is unavailable.
        if not self.unconfigured_discovery():
            return
        async with httpx.AsyncClient(timeout=15, trust_env=False, transport=self.transport) as client:
            response = await client.post(
                CLOUD_ORIGIN + "/api/enrollment/poll",
                json={
                    "device": self.device,
                    "secret": self.enrollment_secret,
                    "fingerprint": self.fingerprint,
                    "version": "1.35.51",
                    "users": 0,
                    "ha_connected": bool(self.ha.connected),
                    "bootstrap": enrollment_bootstrap(self.settings.data_dir),
                },
            )
            response.raise_for_status()
            identity = response.json().get("identity")
        if identity:
            from .remote_options import configure_remote_identity

            self.settings.remote_identity_file = configure_remote_identity(
                {
                    "remote_installation_id": identity["installation_id"],
                    "remote_credential": identity["credential"],
                },
                self.settings.data_dir,
                exclusive=True,
            )
            await self.advertisement.update(None)
            if self.start_remote:
                self.start_remote()

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
        with self.store.connect() as db:
            if (
                db.execute("SELECT 1 FROM sqlite_master WHERE name='factory_resets'").fetchone()
                and db.execute("SELECT 1 FROM factory_resets WHERE status='running'").fetchone()
            ):
                return
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
        full = FullReset(self.settings, self.store)
        if full.state() and full.state()["phase"] != "completed":
            try:
                await self.progress(plan, "working", "checking")
                await full.bootstrap(plan)
                async with asyncio.timeout(120):
                    while not self.ha.connected:
                        await asyncio.sleep(2)
            except (AuthResetError, HTTPException, httpx.HTTPError, OSError, ValueError, TimeoutError):
                await self.progress(plan, "failed", "checking", "setup_failed")
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
                        "DELETE FROM settings WHERE key LIKE 'access:%' OR key LIKE 'account_%' OR key LIKE 'experience:%' OR key LIKE 'language:%' OR key LIKE 'cloud_account:%' OR key LIKE 'customer_profile:%'"
                    )
                    # Commit deletion and reset checkpoint together; never delete the new owner on retry.
                    c.execute(
                        "INSERT OR REPLACE INTO settings VALUES(?,?)",
                        (key, json.dumps(sorted(done | {"resetting"}))),
                    )

            if plan["mode"] == "reset":
                await stage("resetting", reset)

            if full.state() and self.radios:
                await stage("radios", lambda: self.radios.ensure(full.state()["id"]))

            async def location():
                await self.ha.request(
                    "config/core/update",
                    location_name=plan["name"],
                    latitude=plan["latitude"],
                    longitude=plan["longitude"],
                    time_zone=plan["timezone"],
                    country=plan.get("country", "NO"),
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
                    if plan.get("cloud_account"):
                        c.execute(
                            "INSERT OR REPLACE INTO settings VALUES(?,?)",
                            ("cloud_account:" + plan["cloud_account"], str(row.lastrowid)),
                        )
                    if plan.get("profile"):
                        c.execute(
                            "INSERT OR REPLACE INTO settings VALUES(?,?)",
                            ("customer_profile:" + str(row.lastrowid), json.dumps(plan["profile"])),
                        )
                        c.execute(
                            "INSERT OR REPLACE INTO settings VALUES(?,?)",
                            (
                                "account:" + str(row.lastrowid),
                                json.dumps({"display_name": plan["profile"]["full_name"]}),
                            ),
                        )
                        if plan["profile"].get("photo"):
                            c.execute(
                                "INSERT OR REPLACE INTO settings VALUES(?,?)",
                                (
                                    "account_photo:" + str(row.lastrowid),
                                    plan["profile"]["photo"].split(",", 1)[1],
                                ),
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
            archive_previous_reset(self.store, full.state())
            await self.progress(plan, "completed", "completed")
        except (HAError, HTTPException, TimeoutError, ValueError, KeyError, sqlite3.Error) as e:
            # No raw HA errors or personal setup data in cloud-facing error text.
            log.warning("Hub setup step failed (%s)", type(e).__name__)
            await self.progress(
                plan,
                "failed",
                current_step,
                "radios_unavailable" if current_step == "radios" else "setup_failed",
            )

    async def update_credentials(self):
        try:
            result = await self.call("credentials", {})
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                return  # Older cloud release.
            raise
        change = result.get("change")
        if not change:
            return
        success = False
        with self.store.connect() as c:
            c.execute("BEGIN IMMEDIATE")
            marker = "hub_credentials:" + change["id"]
            if c.execute("SELECT 1 FROM settings WHERE key=?", (marker,)).fetchone():
                success = True
            else:
                plan = c.execute(
                    "SELECT value FROM settings WHERE key=?", ("onboarding:" + change["plan"],)
                ).fetchone()
                user = c.execute(
                    "SELECT u.id FROM users u JOIN settings s ON s.value=CAST(u.id AS TEXT) WHERE s.key=? AND u.role='admin'",
                    ("cloud_account:" + change["account"],),
                ).fetchone()
                conflict = c.execute("SELECT id FROM users WHERE name=?", (change["username"],)).fetchone()
                if (
                    plan
                    and "completed" in json.loads(plan[0])
                    and user
                    and (not conflict or conflict[0] == user[0])
                ):
                    c.execute(
                        "UPDATE users SET name=?,password=? WHERE id=?",
                        (change["username"], change["password_hash"], user[0]),
                    )
                    c.execute("DELETE FROM sessions WHERE user_id=?", (user[0],))
                    c.execute("DELETE FROM mobile_pairings WHERE user_id=?", (user[0],))
                    c.execute("UPDATE mobile_devices SET revoked=1 WHERE user_id=?", (user[0],))
                    c.execute("INSERT INTO settings VALUES(?,?)", (marker, "applied"))
                    success = True
        await self.call("credentials-result", {"id": change["id"], "success": success})

    async def tick(self):
        full = FullReset(self.settings, self.store)
        await full.resume_reboot()
        reset_state = full.state()
        archive_previous_reset(self.store, reset_state)
        if reset_state and reset_state["phase"] == "failed":
            try:
                await full.cloud("failed", {"id": reset_state["id"]})
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code != 409:
                    raise
        if reset_state and reset_state["phase"] == "awaiting_owner":
            await full.cloud("ready", {"id": reset_state["id"], "report": reset_state.get("report", [])})
        with self.store.connect() as c:
            users = c.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        result = await self.call(
            "heartbeat",
            {
                "boot_id": self.boot,
                "fingerprint": self.fingerprint,
                "version": "1.35.51",
                "users": users,
                "ha_connected": bool(self.ha.connected),
                "remote_ready": bool(self.remote.get("ready")),
            },
        )
        if not reset_state or reset_state["phase"] == "completed":
            await self.update_credentials()
        discovery = result.get("discovery")
        if reset_state and reset_state["phase"] == "awaiting_owner":
            discovery = {
                "id": self.device,
                "state": "unconfigured",
                "model": "SMARTi Hub",
                "serial": self.device[-8:],
            }
        await self.advertisement.update(discovery)
        # Repair completed resets from older builds, whose setup omitted radio integrations.
        if (
            reset_state
            and reset_state["phase"] == "completed"
            and users
            and self.ha.connected
            and self.radios
        ):
            try:
                await self.radios.ensure(reset_state["id"])
                self.store.set("radio_recovery_error", "")
            except (HAError, HTTPException, TimeoutError):
                self.store.set("radio_recovery_error", "radio_connections_not_ready")
        if result.get("plan"):
            await self.apply(result["plan"])

    async def run(self):
        try:
            while True:
                # Advertise immediately, before any cloud request or HA connection is required.
                local = self.unconfigured_discovery()
                if local:
                    await self.advertisement.update(local)
                try:
                    if self.settings.remote_identity_file:
                        await self.tick()
                    elif local:
                        await self.enroll()
                    else:
                        await self.advertisement.update(None)
                except (httpx.HTTPError, OSError, ValueError, HAError, sqlite3.Error, KeyError):
                    # Losing internet must not hide an otherwise unconfigured hub from the LAN.
                    if not local:
                        await self.advertisement.update(None)
                    log.warning(
                        "Hub activation service unavailable; local discovery continues when unconfigured"
                    )
                await asyncio.sleep(20)
        finally:
            await self.advertisement.close()
