"""Home-scoped credential changes issued exclusively by central administrators."""

import time
import uuid

from fastapi import Depends, HTTPException, Request
from pwdlib import PasswordHash
from pydantic import BaseModel

from .hub_credentials import HubCredentials


def install_hub_credentials(app, db, session, is_admin, home_auth):
    with db() as c:
        c.execute("""CREATE TABLE IF NOT EXISTS hub_credential_changes (
            home TEXT PRIMARY KEY REFERENCES homes(id), id TEXT NOT NULL,
            account TEXT NOT NULL, plan TEXT NOT NULL, username TEXT NOT NULL,
            password_hash TEXT NOT NULL, status TEXT NOT NULL, created REAL NOT NULL)""")

    def admin(s=Depends(session)):
        if not is_admin(s["account"]):
            raise HTTPException(403, "portal_admin_required")
        return s

    @app.post("/api/admin/homes/{home}/credentials")
    def change(home: str, body: HubCredentials, s=Depends(admin)):
        hashed = PasswordHash.recommended().hash(body.password)
        with db() as c:
            c.execute("BEGIN IMMEDIATE")
            h = c.execute("SELECT owner FROM homes WHERE id=?", (home,)).fetchone()
            p = c.execute("SELECT id,status FROM onboarding_plans WHERE home=?", (home,)).fetchone()
            reset = c.execute(
                "SELECT 1 FROM hub_resets WHERE home=? AND phase!='completed'", (home,)
            ).fetchone()
            if not h or not h["owner"]:
                raise HTTPException(404, "home_not_found")
            if not p or p["status"] != "completed" or reset:
                raise HTTPException(409, "home_not_ready")
            pending = c.execute(
                "SELECT 1 FROM hub_credential_changes WHERE home=? AND status='pending' AND created>?",
                (home, time.time() - 3600),
            ).fetchone()
            if pending:
                raise HTTPException(409, "credential_change_pending")
            job = uuid.uuid4().hex
            c.execute(
                "INSERT OR REPLACE INTO hub_credential_changes VALUES(?,?,?,?,?,?,?,?)",
                (home, job, h["owner"], p["id"], body.username, hashed, "pending", time.time()),
            )
            c.execute(
                "INSERT INTO admin_audit(actor,action,target,created) VALUES(?,?,?,?)",
                (s["account"], "change_hub_credentials", home, time.time()),
            )
        return {"id": job, "status": "pending"}

    @app.get("/api/admin/homes/{home}/credentials")
    def status(home: str, s=Depends(admin)):
        with db() as c:
            c.execute(
                "UPDATE hub_credential_changes SET status='expired',password_hash='' WHERE home=? AND status='pending' AND created<=?",
                (home, time.time() - 3600),
            )
            r = c.execute(
                "SELECT id,username,status,created FROM hub_credential_changes WHERE home=?", (home,)
            ).fetchone()
        return dict(r) if r else {"status": "none"}

    def valid(c, home):
        return c.execute(
            """SELECT q.* FROM hub_credential_changes q
            JOIN homes h ON h.id=q.home AND h.owner=q.account
            JOIN onboarding_plans p ON p.home=q.home AND p.id=q.plan AND p.status='completed'
            WHERE q.home=? AND q.status='pending' AND q.created>?
            AND NOT EXISTS (SELECT 1 FROM hub_resets r WHERE r.home=q.home AND r.phase!='completed')""",
            (home, time.time() - 3600),
        ).fetchone()

    @app.post("/api/hubs/{home}/onboarding/credentials")
    def pull(home: str, request: Request):
        home_auth(home, request)
        with db() as c:
            r = valid(c, home)
        return {"change": dict(r) if r else None}

    class Receipt(BaseModel):
        id: str
        success: bool

    @app.post("/api/hubs/{home}/onboarding/credentials-result")
    def receipt(home: str, body: Receipt, request: Request):
        home_auth(home, request)
        with db() as c:
            c.execute(
                "UPDATE hub_credential_changes SET status=?,password_hash='' WHERE home=? AND id=? AND status='pending'",
                ("applied" if body.success else "failed", home, body.id),
            )
        return {"saved": True}
