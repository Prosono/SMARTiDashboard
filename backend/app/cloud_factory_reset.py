"""Owner-preserving reset coordination and home-scoped access revocation."""

import base64
import json
import time
from typing import Literal
from uuid import UUID

from fastapi import HTTPException, Request
from pydantic import BaseModel, Field


class ResetBegin(BaseModel):
    id: UUID
    public_key: str = Field(min_length=44, max_length=44)


class ResetResult(BaseModel):
    name: str = Field(max_length=160)
    status: Literal["done", "manual", "unconfirmed", "pending", "running"]
    reason: str = Field(default="", max_length=120)


class ResetReady(BaseModel):
    id: UUID
    report: list[ResetResult] = Field(default_factory=list, max_length=2000)


def install_factory_reset(app, db, home_auth):
    with db() as c:
        c.execute(
            "CREATE TABLE IF NOT EXISTS hub_resets(home TEXT PRIMARY KEY, id TEXT NOT NULL, public_key TEXT NOT NULL, phase TEXT NOT NULL, created REAL NOT NULL, report TEXT NOT NULL DEFAULT '[]')"
        )

    @app.get("/api/hubs/{home}/factory-reset/capabilities")
    def capabilities(home: str, request: Request):
        home_auth(home, request)
        with db() as c:
            row = c.execute(
                "SELECT h.owner FROM homes h JOIN factory_hubs f ON f.home=h.id WHERE h.id=?", (home,)
            ).fetchone()
            if not row or not row["owner"]:
                raise HTTPException(409, "managed_owner_required")
        return {"version": 1}

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
            if not row or not row["owner"]:
                raise HTTPException(409, "managed_owner_required")
            previous = c.execute("SELECT * FROM hub_resets WHERE home=?", (home,)).fetchone()
            if previous and previous["id"] == str(body.id):
                if previous["public_key"] != body.public_key:
                    raise HTTPException(409, "reset_conflict")
                return {"acknowledged": True}
            if previous and previous["phase"] != "completed":
                raise HTTPException(409, "reset_in_progress")
            c.execute(
                "INSERT OR REPLACE INTO hub_resets(home,id,public_key,phase,created) VALUES(?,?,?,?,?)",
                (home, str(body.id), body.public_key, "erasing", time.time()),
            )
            c.execute("UPDATE homes SET remote_enabled=0 WHERE id=?", (home,))
            for table in (
                "claims",
                "customer_connections",
                "customer_tokens",
                "home_members",
                "onboarding_plans",
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
                (row["owner"], "hub_factory_reset", home, time.time()),
            )
        return {"acknowledged": True}

    @app.post("/api/hubs/{home}/factory-reset/ready")
    def ready(home: str, body: ResetReady, request: Request):
        home_auth(home, request)
        with db() as c:
            changed = c.execute(
                "UPDATE hub_resets SET phase='awaiting_owner',report=? WHERE home=? AND id=? AND phase IN ('erasing','awaiting_owner')",
                (json.dumps([r.model_dump() for r in body.report]), home, str(body.id)),
            ).rowcount
            if not changed:
                raise HTTPException(409, "reset_conflict")
            c.execute("UPDATE factory_hubs SET phase='awaiting_owner' WHERE home=?", (home,))
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
