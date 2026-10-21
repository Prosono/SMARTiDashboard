"""Owner-retaining or owner-releasing reset coordination and home-scoped access revocation."""

import base64
import json
import time
from typing import Literal
from uuid import UUID

from fastapi import HTTPException, Request
from pydantic import BaseModel, Field


class ResetBegin(BaseModel):
    id: UUID
    ownership: Literal["keep_owner", "release_owner"] = "keep_owner"
    public_key: str = Field(min_length=44, max_length=44)


class ResetResult(BaseModel):
    name: str = Field(max_length=160)
    status: Literal["done", "manual", "unconfirmed", "pending", "running"]
    reason: str = Field(default="", max_length=120)


class ResetReady(BaseModel):
    phase: Literal["rebooting", "awaiting_owner"] = "awaiting_owner"
    id: UUID
    report: list[ResetResult] = Field(default_factory=list, max_length=2000)


def install_factory_reset(app, db, home_auth):
    with db() as c:
        c.execute(
            "CREATE TABLE IF NOT EXISTS hub_resets(home TEXT PRIMARY KEY, id TEXT NOT NULL, public_key TEXT NOT NULL, phase TEXT NOT NULL, created REAL NOT NULL, report TEXT NOT NULL DEFAULT '[]')"
        )

        columns = {r[1] for r in c.execute("PRAGMA table_info(hub_resets)")}
        for name in ("qr_required", "qr_verified"):
            if name not in columns:
                c.execute(f"ALTER TABLE hub_resets ADD COLUMN {name} INTEGER NOT NULL DEFAULT 0")

        if "ownership" not in columns:
            c.execute("ALTER TABLE hub_resets ADD COLUMN ownership TEXT NOT NULL DEFAULT 'keep_owner'")
        if "released" not in columns:
            c.execute("ALTER TABLE hub_resets ADD COLUMN released INTEGER NOT NULL DEFAULT 0")

    @app.get("/api/hubs/{home}/factory-reset/capabilities")
    def capabilities(home: str, request: Request):
        home_auth(home, request)
        with db() as c:
            row = c.execute(
                "SELECT h.owner FROM homes h JOIN factory_hubs f ON f.home=h.id WHERE h.id=?", (home,)
            ).fetchone()
            if not row or not row["owner"]:
                raise HTTPException(409, "managed_owner_required")
        return {"version": 3}

    @app.post("/api/hubs/{home}/factory-reset/begin")
    def begin(home: str, body: ResetBegin, request: Request):
        home_auth(home, request)
        try:
            if len(base64.b64decode(body.public_key, validate=True)) != 32:
                raise ValueError()
        except ValueError:
            raise HTTPException(422, "invalid_reset_key") from None
        with db() as c:
            c.execute("BEGIN IMMEDIATE")
            row = c.execute(
                "SELECT h.owner FROM homes h JOIN factory_hubs f ON f.home=h.id WHERE h.id=?", (home,)
            ).fetchone()
            if not row:
                raise HTTPException(409, "managed_owner_required")
            previous = c.execute("SELECT * FROM hub_resets WHERE home=?", (home,)).fetchone()
            if previous and previous["id"] == str(body.id):
                if previous["public_key"] != body.public_key or previous["ownership"] != body.ownership:
                    raise HTTPException(409, "reset_conflict")
                return {"acknowledged": True}
            if not row["owner"]:
                raise HTTPException(409, "managed_owner_required")
            if previous and previous["phase"] != "completed":
                raise HTTPException(409, "reset_in_progress")
            c.execute(
                "INSERT OR REPLACE INTO hub_resets(home,id,public_key,phase,created,qr_required,qr_verified,ownership) VALUES(?,?,?,?,?,1,0,?)",
                (home, str(body.id), body.public_key, "erasing", time.time(), body.ownership),
            )
            c.execute("UPDATE homes SET remote_enabled=0 WHERE id=?", (home,))
            for table in (
                "claims",
                "customer_connections",
                "customer_tokens",
                "home_members",
                "onboarding_plans",
                "hub_credential_changes",
            ):
                c.execute("DELETE FROM " + table + " WHERE home=?", (home,))
            for table in ("support_codes", "support_connections"):
                c.execute(
                    "DELETE FROM "
                    + table
                    + " WHERE grant_id IN (SELECT id FROM support_grants WHERE home=?)",
                    (home,),
                )
            c.execute(
                "UPDATE support_grants SET decision='revoked',expires=? WHERE home=?", (time.time(), home)
            )
            c.execute("UPDATE factory_hubs SET phase='resetting' WHERE home=?", (home,))
            c.execute(
                "INSERT INTO admin_audit(actor,action,target,created) VALUES(?,?,?,?)",
                (row["owner"], "hub_factory_reset_" + body.ownership, home, time.time()),
            )
        return {"acknowledged": True}

    @app.post("/api/hubs/{home}/factory-reset/ready")
    def ready(home: str, body: ResetReady, request: Request):
        home_auth(home, request)
        with db() as c:
            c.execute("BEGIN IMMEDIATE")
            changed = c.execute(
                "UPDATE hub_resets SET phase=?,report=? WHERE home=? AND id=? AND phase IN ('erasing','rebooting','awaiting_owner')",
                (body.phase, json.dumps([r.model_dump() for r in body.report]), home, str(body.id)),
            ).rowcount
            if not changed:
                raise HTTPException(409, "reset_conflict")
            c.execute("UPDATE factory_hubs SET phase=? WHERE home=?", (body.phase, home))
            # Release only after local erasure and reboot. Retried ready callbacks must
            # never detach a new owner who has subsequently claimed the same QR label.
            reset = c.execute("SELECT ownership,released FROM hub_resets WHERE home=?", (home,)).fetchone()
            if (
                body.phase == "awaiting_owner"
                and reset["ownership"] == "release_owner"
                and not reset["released"]
            ):
                c.execute("UPDATE homes SET owner=NULL,name='Mitt hjem',remote_enabled=0 WHERE id=?", (home,))
                c.execute("UPDATE hub_resets SET released=1 WHERE home=?", (home,))
        return {"acknowledged": True}

    @app.post("/api/hubs/{home}/factory-reset/failed")
    def failed(home: str, body: ResetReady, request: Request):
        home_auth(home, request)
        with db() as c:
            changed = c.execute(
                "UPDATE hub_resets SET phase='failed' WHERE home=? AND id=? AND phase!='completed'",
                (home, str(body.id)),
            ).rowcount
            if not changed:
                raise HTTPException(409, "reset_conflict")
        return {"acknowledged": True}
