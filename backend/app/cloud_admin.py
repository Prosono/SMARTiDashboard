"""Operator support surface. Home ownership and hub permissions are never bypassed."""

import os
import json
import time
from pathlib import Path

import httpx
from fastapi import Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .relay_traffic import traffic_report


class SupportNote(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    password: str = Field(min_length=12, max_length=256)
    password_confirmation: str = Field(min_length=12, max_length=256)


def install_admin(app, db, session, relay_status_url, throttle):
    with db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS portal_admins(
            account TEXT PRIMARY KEY REFERENCES accounts(id));
        CREATE TABLE IF NOT EXISTS support_notes(
            id INTEGER PRIMARY KEY, account TEXT NOT NULL REFERENCES accounts(id),
            author TEXT NOT NULL REFERENCES accounts(id), text TEXT NOT NULL, created REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS admin_audit(
            id INTEGER PRIMARY KEY, actor TEXT NOT NULL REFERENCES accounts(id),
            action TEXT NOT NULL, target TEXT, created REAL NOT NULL);
        """)

    def is_admin(account):
        with db() as c:
            return c.execute("SELECT 1 FROM portal_admins WHERE account=?", (account,)).fetchone() is not None

    def admin(s=Depends(session)):
        if not is_admin(s["account"]):
            raise HTTPException(403, "portal_admin_required")
        return s

    def audit(c, s, action, target=None):
        c.execute(
            "INSERT INTO admin_audit(actor,action,target,created) VALUES(?,?,?,?)",
            (s["account"], action, target, time.time()),
        )

    def connectivity():
        if relay_status_url:
            try:
                with httpx.Client(timeout=2, trust_env=False, follow_redirects=False) as client:
                    response = client.get(relay_status_url)
                    response.raise_for_status()
                    connected = response.json()["connected"]
                    if isinstance(connected, list) and all(isinstance(x, str) for x in connected):
                        return set(connected)
            except (httpx.HTTPError, ValueError, KeyError, TypeError):
                pass
        return None

    def home_view(row, connected):
        home = dict(row)
        home["status"] = (
            "disabled"
            if not home["remote_enabled"]
            else "unknown"
            if connected is None
            else "online"
            if home["id"] in connected
            else "offline"
        )
        return home

    @app.get("/admin/users")
    @app.get("/admin")
    def admin_page():
        return FileResponse(Path(__file__).with_name("cloud_web") / "admin.html")

    @app.get("/admin/account")
    def account_page(s=Depends(admin)):
        return FileResponse(Path(__file__).with_name("cloud_web") / "admin-account.html")

    @app.get("/api/admin/account")
    def own_account(s=Depends(admin)):
        with db() as c:
            row = c.execute("SELECT username FROM accounts WHERE id=?", (s["account"],)).fetchone()
        return {"username": row["username"]}

    @app.post("/api/admin/account/password")
    def change_password(body: PasswordChange, s=Depends(admin)):
        from .cloud import PASSWORDS, PASSWORD_WORKERS

        if body.password != body.password_confirmation:
            raise HTTPException(422, "password_confirmation_mismatch")
        if body.password == body.current_password:
            raise HTTPException(422, "password_unchanged")
        key = "admin-password:" + s["account"]
        throttle(key)
        with db() as c:
            row = c.execute("SELECT password FROM accounts WHERE id=?", (s["account"],)).fetchone()
        with PASSWORD_WORKERS:
            if not PASSWORDS.verify(body.current_password, row["password"]):
                raise HTTPException(400, "current_password_incorrect")
            hashed = PASSWORDS.hash(body.password)
        with db() as c:
            c.execute("BEGIN IMMEDIATE")
            # Recheck the role and old hash in the same transaction as the update.
            result = c.execute(
                "UPDATE accounts SET password=? WHERE id=? AND password=? "
                "AND EXISTS(SELECT 1 FROM portal_admins WHERE account=accounts.id)",
                (hashed, s["account"], row["password"]),
            )
            if result.rowcount != 1:
                raise HTTPException(409, "account_changed")
            c.execute("DELETE FROM sessions WHERE account=? AND token<>?", (s["account"], s["token"]))
            c.execute("DELETE FROM attempts WHERE key=?", (key,))
            audit(c, s, "change_own_password", s["account"])
        return {"changed": True}

    @app.get("/admin/architecture")
    def architecture_page(s=Depends(admin)):
        return FileResponse(Path(__file__).with_name("cloud_web") / "architecture.html", headers={"Cache-Control": "no-store"})

    @app.get("/api/admin/architecture")
    def architecture(s=Depends(admin)):
        return json.loads(Path(__file__).with_name("architecture.json").read_text())

    @app.get("/api/admin/traffic")
    def traffic(days: int = Query(30, ge=1, le=90), s=Depends(admin)):
        return traffic_report(os.environ.get("RELAY_TRAFFIC_DATABASE"), days)

    @app.get("/api/admin/overview")
    def overview(q: str = Query("", max_length=80), offset: int = Query(0, ge=0), s=Depends(admin)):
        connected = connectivity()
        with db() as c:
            all_homes = c.execute("SELECT id,name,owner,remote_enabled FROM homes ORDER BY name").fetchall()
            homes = [home_view(h, connected) for h in all_homes]
            # Literal substring search, including usernames containing '_' or '%'.
            match = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
            where = " WHERE username LIKE ? ESCAPE '\\'"
            total = c.execute("SELECT count(*) FROM accounts" + where, (match,)).fetchone()[0]
            accounts = c.execute(
                "SELECT id,username FROM accounts" + where + " ORDER BY username LIMIT 50 OFFSET ?",
                (match, offset),
            ).fetchall()
            customers = [{**dict(a), "homes": [h for h in homes if h["owner"] == a["id"]]} for a in accounts]
            audit(c, s, "overview")
            summary = {
                "accounts": c.execute("SELECT count(*) FROM accounts").fetchone()[0],
                "customers": len({h["owner"] for h in homes if h["owner"]}),
                "homes": len(homes),
                "online": sum(h["status"] == "online" for h in homes),
                "offline": sum(h["status"] == "offline" and bool(h["owner"]) for h in homes),
                "unclaimed": sum(not h["owner"] for h in homes),
            }
        return {
            "summary": summary,
            "customers": customers,
            "total": total,
            "unclaimed": [h for h in homes if not h["owner"]][:50],
            "relay_available": connected is not None,
            "checked_at": time.time(),
        }

    @app.get("/api/admin/accounts/{account_id}")
    def detail(account_id: str, s=Depends(admin)):
        connected = connectivity()
        with db() as c:
            account = c.execute("SELECT id,username FROM accounts WHERE id=?", (account_id,)).fetchone()
            if not account:
                raise HTTPException(404, "account_not_found")
            homes = [
                home_view(h, connected)
                for h in c.execute(
                    "SELECT id,name,owner,remote_enabled FROM homes WHERE owner=? ORDER BY name",
                    (account_id,),
                )
            ]
            notes = [
                dict(n)
                for n in c.execute(
                    "SELECT n.id,n.text,n.created,a.username AS author FROM support_notes n "
                    "JOIN accounts a ON a.id=n.author WHERE n.account=? ORDER BY n.id DESC LIMIT 100",
                    (account_id,),
                )
            ]
            profile = c.execute(
                "SELECT email,full_name,phone,address,postal_code,city,country,verified,deadline FROM customer_profiles WHERE account=?",
                (account_id,),
            ).fetchone()
            audit(c, s, "view_customer", account_id)
        return {
            **dict(account),
            "profile": dict(profile) if profile else None,
            "homes": homes,
            "notes": notes,
            "checked_at": time.time(),
        }

    @app.post("/api/admin/accounts/{account_id}/notes")
    def add_note(account_id: str, body: SupportNote, s=Depends(admin)):
        text = body.text.strip()
        if not text:
            raise HTTPException(422, "empty_note")
        with db() as c:
            if not c.execute("SELECT 1 FROM accounts WHERE id=?", (account_id,)).fetchone():
                raise HTTPException(404, "account_not_found")
            c.execute(
                "INSERT INTO support_notes(account,author,text,created) VALUES(?,?,?,?)",
                (account_id, s["account"], text, time.time()),
            )
            audit(c, s, "add_note", account_id)
        return {"saved": True}

    @app.get("/api/admin/audit")
    def history(s=Depends(admin)):
        with db() as c:
            return [
                dict(row)
                for row in c.execute(
                    "SELECT h.action,h.target,h.created,a.username AS actor FROM admin_audit h "
                    "JOIN accounts a ON a.id=h.actor UNION ALL "
                    "SELECT d.action,d.target,d.created,COALESCE(a.username, 'Slettet konto') AS actor "
                    "FROM deleted_account_audit d LEFT JOIN accounts a ON a.id=d.actor "
                    "ORDER BY created DESC LIMIT 100"
                )
            ]

    return is_admin
