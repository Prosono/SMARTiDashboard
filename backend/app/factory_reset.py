"""Authenticated, journaled best-effort hub cleanup. No automatic replay of
uncertain operations; incomplete results preserve access for manual recovery.
"""

import asyncio
import json
import time
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

from .ha import HAError


def archive_previous_reset(store, state):
    """Hide old journals only after this reset's new owner setup has completed.

    Keep journal rows and idempotency intact. The per-generation marker prevents
    later reset attempts from being hidden by repeated status/heartbeat calls.
    """
    if not state or state.get("phase") != "completed":
        return
    marker = "reset_report_archived:" + state["id"]
    with store.connect() as db:
        db.execute("BEGIN IMMEDIATE")
        if db.execute("SELECT 1 FROM settings WHERE key=?", (marker,)).fetchone():
            return
        if not db.execute("SELECT 1 FROM users LIMIT 1").fetchone():
            return
        checkpoints = db.execute("SELECT value FROM settings WHERE key LIKE 'onboarding:%'").fetchall()
        if not any("completed" in json.loads(row[0]) for row in checkpoints):
            return
        if not db.execute("SELECT 1 FROM sqlite_master WHERE name='factory_resets'").fetchone():
            return
        if db.execute("SELECT 1 FROM factory_resets WHERE status='running'").fetchone():
            return
        cutoff = db.execute("SELECT COALESCE(MAX(rowid),0) FROM factory_resets").fetchone()[0]
        db.execute("INSERT OR REPLACE INTO settings VALUES('factory_reset_report_cutoff',?)", (str(cutoff),))
        db.execute("INSERT INTO settings VALUES(?, '1')", (marker,))


class FactoryResetRequest(BaseModel):
    model_config = {"extra": "forbid"}
    request_id: UUID
    ownership: Literal["keep_owner", "release_owner"] = "keep_owner"
    acknowledge_release: bool = False

    @model_validator(mode="after")
    def release_confirmed(self):
        if self.ownership == "release_owner" and not self.acknowledge_release:
            raise ValueError("ownership_release_confirmation_required")
        if self.confirmation == "RESTORE WIPE" and self.ownership != "release_owner":
            raise ValueError("production_requires_release")
        return self

    acknowledge_manual_cleanup: Literal[True]
    password: str | None = Field(
        default=None, max_length=128, repr=False
    )  # Accepted from older clients; not required.
    confirmation: Literal["RESET HUB", "RESTORE WIPE"]
    acknowledge_data_loss: Literal[True]
    acknowledge_pairing: Literal[True]
    backup_decision: Literal["saved", "skip"]
    delete_backups: bool = False


class FactoryReset:
    def __init__(self, store, provider):
        self.store, self.provider = store, provider
        self.tasks = set()
        with store.connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS factory_resets(id TEXT PRIMARY KEY, owner INTEGER NOT NULL, status TEXT NOT NULL, body TEXT NOT NULL)"
            )

    def active(self):
        with self.store.connect() as db:
            return bool(db.execute("SELECT 1 FROM factory_resets WHERE status='running'").fetchone())

    def read(self, id, owner):
        with self.store.connect() as db:
            row = db.execute("SELECT * FROM factory_resets WHERE id=? AND owner=?", (id, owner)).fetchone()
        if not row:
            raise HTTPException(404, "reset_not_found")
        return json.loads(row["body"])

    def save(self, job):
        with self.store.connect() as db:
            db.execute(
                "UPDATE factory_resets SET status=?,body=? WHERE id=?",
                (job["status"], json.dumps(job), job["id"]),
            )

    def recover(self):
        with self.store.connect() as db:
            rows = db.execute("SELECT body FROM factory_resets WHERE status='running'").fetchall()
        for row in rows:
            job = json.loads(row["body"])
            job.update(status="interrupted", error="reset_interrupted")
            for item in job["results"]:
                if item["status"] == "running":
                    item.update(status="unconfirmed", reason="reset_interrupted")
            self.save(job)

    async def close(self):
        for task in list(self.tasks):
            task.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True)

    async def start(self, id, owner, ownership="keep_owner", production=False, delete_backups=False):
        id = str(id)
        with self.store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            previous = db.execute("SELECT owner,body FROM factory_resets WHERE id=?", (id,)).fetchone()
            if previous:
                existing = json.loads(previous["body"])
                if previous["owner"] != owner or (
                    existing.get("ownership", "keep_owner") != ownership
                    or existing.get("production", False) != production
                    or existing.get("delete_backups", False) != delete_backups
                ):
                    raise HTTPException(409, "reset_conflict")
                return existing
            if db.execute("SELECT 1 FROM factory_resets WHERE status='running'").fetchone():
                raise HTTPException(409, "reset_in_progress")
            account = db.execute("SELECT role FROM users WHERE id=?", (owner,)).fetchone()
            if not account or account["role"] != "admin":
                raise HTTPException(403, "admin_required")
            job = {
                "id": id,
                "status": "running",
                "step": "inventory",
                "ownership": ownership,
                "production": production,
                "delete_backups": delete_backups,
                "created": time.time(),
                "results": [],
                "error": "",
            }
            db.execute("INSERT INTO factory_resets VALUES(?,?,?,?)", (id, owner, "running", json.dumps(job)))
        task = asyncio.create_task(self.run(job))
        self.tasks.add(task)
        task.add_done_callback(self.tasks.discard)
        return job

    async def run(self, job):
        try:
            async with asyncio.timeout(120):
                plan = await self.provider.plan()
            if len(plan) > 2000:
                raise ValueError("reset_inventory_too_large")
            job["results"] = [
                {"kind": op["kind"], "name": op["name"], "status": "pending", "reason": ""} for op in plan
            ]
            self.save(job)
            for op, result in zip(plan, job["results"], strict=True):
                job["step"] = op["kind"]
                result["status"] = "running"
                self.save(job)  # A crash here is uncertain, never replayed automatically.
                if op["kind"] == "full_reset":
                    op["ownership"] = job.get("ownership", "keep_owner")
                    op["production"] = job.get("production", False)
                    op["delete_backups"] = job.get("delete_backups", False)
                    op["report"] = [dict(r) for r in job["results"] if r is not result]
                try:
                    # Full reset now starts and stops HA to provision local recovery access.
                    async with asyncio.timeout(900 if op["kind"] == "full_reset" else 60):
                        result["status"], result["reason"] = await self.provider.execute(op)
                except (HAError, HTTPException, TimeoutError):
                    result.update(status="unconfirmed", reason="operation_unconfirmed")
                self.save(job)
                if op["kind"] in {"pause", "close_zigbee"} and result["status"] != "done":
                    job.update(status="incomplete", error="could_not_pause_home")
                    self.save(job)
                    return
            # The provider explicitly reports all manual follow-up. Do not erase
            # administrator access needed to recover an incomplete installation.
            job.update(
                status="incomplete"
                if any(
                    r["status"] != "done" and r.get("reason") != "pairings_not_removed"
                    for r in job["results"]
                )
                else "completed",
                step="finished",
            )
        except asyncio.CancelledError:
            job.update(status="interrupted", error="reset_interrupted")
            for r in job["results"]:
                if r["status"] == "running":
                    r.update(status="unconfirmed", reason="reset_interrupted")
            raise
        except Exception:
            # Never persist raw exception text, tokens or configuration values.
            job.update(status="incomplete", error="reset_failed")
            for result in job["results"]:
                if result["status"] == "running":
                    result.update(status="unconfirmed", reason="operation_unconfirmed")
        finally:
            self.save(job)


def factory_reset_router(store, auth, admin, engine):
    router = APIRouter(prefix="/api/manage/settings/factory-reset")

    def permitted(current=Depends(admin)):
        if current.get("support"):
            raise HTTPException(403, "factory_reset_support_forbidden")
        preference = json.loads(store.get(f"experience:{current['id']}", "{}"))
        if preference.get("mode", "advanced") != "advanced":
            raise HTTPException(403, "factory_reset_advanced_required")
        return current

    @router.get("")
    async def status(current=Depends(permitted)):
        full = getattr(engine.provider, "full", None)
        archive_previous_reset(store, full.state() if full else None)
        result = await engine.provider.preflight()
        with store.connect() as db:
            row = db.execute(
                "SELECT body FROM factory_resets WHERE owner=? AND rowid>? ORDER BY rowid DESC LIMIT 1",
                (current["id"], int(store.get("factory_reset_report_cutoff", "0"))),
            ).fetchone()
        return result | {"job": json.loads(row["body"]) if row else None}

    @router.get("/{id}")
    def progress(id: UUID, current=Depends(permitted)):
        return engine.read(str(id), current["id"])

    @router.post("", status_code=202)
    async def start(body: FactoryResetRequest, current=Depends(permitted)):
        key = f"factory-reset:{current['id']}"
        auth.throttle(key)
        auth.finish_successful_attempt(key)
        # A retry of the same request reads its job, including after a disconnect.
        try:
            previous = engine.read(str(body.request_id), current["id"])
            if (
                previous.get("ownership", "keep_owner") != body.ownership
                or previous.get("production", False) != (body.confirmation == "RESTORE WIPE")
                or previous.get("delete_backups", False) != body.delete_backups
            ):
                raise HTTPException(409, "reset_conflict")
            return previous
        except HTTPException as e:
            if e.status_code != 404:
                raise
        ready = await engine.provider.preflight()
        if body.confirmation == "RESTORE WIPE" and not ready.get("production_allowed"):
            raise HTTPException(403, "production_access_required")
        if body.delete_backups and not ready.get("full"):
            raise HTTPException(409, "backup_deletion_requires_managed_hub")
        if not ready["ready"]:
            raise HTTPException(409, "factory_reset_unavailable")
        return await engine.start(
            body.request_id,
            current["id"],
            body.ownership,
            delete_backups=body.delete_backups,
            **({"production": True} if body.confirmation == "RESTORE WIPE" else {}),
        )

    return router
