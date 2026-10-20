"""Customer cases and explicitly consented, revocable support access."""

import hashlib
import json
import secrets
import time
import uuid
from pathlib import Path
from typing import Literal

from fastapi import Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

STATES = Literal["new", "reviewing", "in_progress", "waiting_customer", "resolved", "closed"]
CATEGORIES = Literal["connection", "devices", "automation", "billing", "other"]
DEFAULT_PRICING = {
    "version": "2026-10-19-1",
    "vat_percent": 25,
    "hourly": 499,
    "simple": 299,
    "complex": 499,
    "advanced": 799,
    "terms": "Timearbeid faktureres etter medgått tid. Fastpris og omfang avtales i saken før arbeidet starter. Avansert automasjon prises fra oppgitt beløp; endelig pris avtales før oppstart. Innsending alene faktureres ikke.",
}


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


class CaseDraft(BaseModel):
    subject: str = Field(min_length=3, max_length=160)
    category: CATEGORIES
    text: str = Field(min_length=10, max_length=12000)
    home_id: str | None = None
    billing_accepted: bool
    pricing_version: str


class Message(BaseModel):
    text: str = Field(min_length=1, max_length=12000)


class CaseUpdate(BaseModel):
    status: STATES
    take: bool = False


class AccessRequest(BaseModel):
    reason: str = Field(min_length=10, max_length=2000)


class Consent(BaseModel):
    approve: bool


class Code(BaseModel):
    code: str = Field(min_length=32, max_length=128)


class Token(BaseModel):
    token: str = Field(min_length=32, max_length=128)
    operation: str | None = Field(default=None, max_length=400)


class Pricing(BaseModel):
    hourly: int = Field(ge=0, le=100000)
    simple: int = Field(ge=0, le=100000)
    complex: int = Field(ge=0, le=100000)
    advanced: int = Field(ge=0, le=100000)
    terms: str = Field(min_length=20, max_length=3000)


def install_support(app, db, session, is_admin, home_auth, origin):
    with db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS support_pricing(version TEXT PRIMARY KEY, data TEXT NOT NULL, created REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS support_cases(
          id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES accounts(id), home TEXT REFERENCES homes(id),
          subject TEXT NOT NULL, category TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new',
          assigned TEXT REFERENCES accounts(id), created REAL NOT NULL, updated REAL NOT NULL,
          billing_accepted REAL NOT NULL, pricing TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS case_messages(
          id INTEGER PRIMARY KEY, ticket TEXT NOT NULL REFERENCES support_cases(id),
          author TEXT NOT NULL REFERENCES accounts(id), staff INTEGER NOT NULL, text TEXT NOT NULL, created REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS support_grants(
          id TEXT PRIMARY KEY, ticket TEXT NOT NULL REFERENCES support_cases(id),
          admin TEXT NOT NULL REFERENCES accounts(id), owner TEXT NOT NULL REFERENCES accounts(id),
          home TEXT NOT NULL REFERENCES homes(id), reason TEXT NOT NULL, requested REAL NOT NULL,
          decision TEXT NOT NULL DEFAULT 'pending', expires REAL, decided REAL);
        CREATE TABLE IF NOT EXISTS support_codes(
          hash TEXT PRIMARY KEY, grant_id TEXT NOT NULL REFERENCES support_grants(id),
          admin_session TEXT NOT NULL, expires REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS support_connections(
          hash TEXT PRIMARY KEY, grant_id TEXT NOT NULL REFERENCES support_grants(id),
          admin_session TEXT NOT NULL, csrf TEXT NOT NULL);
        """)
        columns = {r[1] for r in c.execute("PRAGMA table_info(support_cases)")}
        for column, default in (("staff_unread", 1), ("customer_unread", 0)):
            if column not in columns:
                c.execute(f"ALTER TABLE support_cases ADD COLUMN {column} INTEGER NOT NULL DEFAULT {default}")
        c.execute(
            "INSERT OR IGNORE INTO support_pricing VALUES(?,?,?)",
            (DEFAULT_PRICING["version"], json.dumps(DEFAULT_PRICING), 0),
        )

    def audit(c, actor, action, target):
        c.execute(
            "INSERT INTO admin_audit(actor,action,target,created) VALUES(?,?,?,?)",
            (actor, action, target, time.time()),
        )

    def admin(s=Depends(session)):
        if not is_admin(s["account"]):
            raise HTTPException(403, "portal_admin_required")
        return s

    def pricing(c):
        return json.loads(
            c.execute("SELECT data FROM support_pricing ORDER BY created DESC LIMIT 1").fetchone()[0]
        )

    def case(c, id, s, staff=False):
        row = c.execute(
            "SELECT t.*,a.username AS customer,b.username AS assignee,h.name AS home_name "
            "FROM support_cases t JOIN accounts a ON a.id=t.owner "
            "LEFT JOIN accounts b ON b.id=t.assigned LEFT JOIN homes h ON h.id=t.home WHERE t.id=?",
            (id,),
        ).fetchone()
        if not row or (not staff and row["owner"] != s["account"]):
            raise HTTPException(404, "case_not_found")
        return row

    def grant_active(c, id, home=None):
        row = c.execute(
            "SELECT g.*,a.username AS admin_name FROM support_grants g "
            "JOIN support_cases t ON t.id=g.ticket JOIN homes h ON h.id=g.home "
            "JOIN accounts a ON a.id=g.admin JOIN portal_admins p ON p.account=g.admin "
            "WHERE g.id=? AND g.decision='approved' AND g.expires>? "
            "AND h.owner=g.owner AND h.remote_enabled=1 AND t.status NOT IN ('resolved','closed')",
            (id, time.time()),
        ).fetchone()
        if not row or (home and row["home"] != home):
            raise HTTPException(403, "support_access_expired")
        return row

    @app.get("/admin/support/prices")
    @app.get("/admin/support")
    @app.get("/support")
    @app.get("/support/prices")
    def support_page():
        return FileResponse(Path(__file__).with_name("cloud_web") / "support.html")

    @app.get("/api/support/pricing")
    def get_pricing():
        with db() as c:
            return pricing(c)

    @app.put("/api/admin/support/pricing")
    def set_pricing(body: Pricing, s=Depends(admin)):
        data = {**body.model_dump(), "vat_percent": 25, "version": str(uuid.uuid4())}
        with db() as c:
            c.execute(
                "INSERT INTO support_pricing VALUES(?,?,?)", (data["version"], json.dumps(data), time.time())
            )
            audit(c, s["account"], "pricing_changed", data["version"])
        return data

    @app.get("/api/support/cases")
    def list_cases(s=Depends(session)):
        with db() as c:
            return [
                dict(r)
                for r in c.execute(
                    "SELECT id,subject,category,status,created,updated,customer_unread AS unread FROM support_cases WHERE owner=? ORDER BY updated DESC LIMIT 200",
                    (s["account"],),
                )
            ]

    @app.post("/api/support/cases")
    def create_case(body: CaseDraft, s=Depends(session)):
        with db() as c:
            prices = pricing(c)
            if not body.billing_accepted or body.pricing_version != prices["version"]:
                raise HTTPException(409, "billing_confirmation_required")
            if not body.subject.strip() or not body.text.strip():
                raise HTTPException(422, "empty_case")
            if (
                body.home_id
                and not c.execute(
                    "SELECT 1 FROM homes WHERE id=? AND owner=?", (body.home_id, s["account"])
                ).fetchone()
            ):
                raise HTTPException(403, "home_owner_required")
            id, now = uuid.uuid4().hex, time.time()
            c.execute(
                "INSERT INTO support_cases(id,owner,home,subject,category,created,updated,billing_accepted,pricing) "
                "VALUES(?,?,?,?,?,?,?,?,?)",
                (
                    id,
                    s["account"],
                    body.home_id,
                    body.subject.strip(),
                    body.category,
                    now,
                    now,
                    now,
                    json.dumps(prices),
                ),
            )
            c.execute(
                "INSERT INTO case_messages(ticket,author,staff,text,created) VALUES(?,?,0,?,?)",
                (id, s["account"], body.text.strip(), now),
            )
            audit(c, s["account"], "case_created", id)
        return {"id": id}

    @app.get("/api/admin/support/cases")
    def queue(s=Depends(admin)):
        with db() as c:
            return [
                dict(r)
                for r in c.execute(
                    "SELECT t.id,t.subject,t.category,t.status,t.updated,t.staff_unread AS unread,a.username AS customer,b.username AS assignee "
                    "FROM support_cases t JOIN accounts a ON a.id=t.owner LEFT JOIN accounts b ON b.id=t.assigned "
                    "ORDER BY CASE WHEN t.status IN ('resolved','closed') THEN 1 ELSE 0 END,t.updated DESC LIMIT 500"
                )
            ]

    def detail(id, s, staff):
        with db() as c:
            t = dict(case(c, id, s, staff))
            column = "staff_unread" if staff else "customer_unread"
            c.execute(f"UPDATE support_cases SET {column}=0 WHERE id=?", (id,))
            t["pricing"] = json.loads(t["pricing"])
            t["messages"] = [
                dict(r)
                for r in c.execute(
                    "SELECT m.text,m.staff,m.created,a.username AS author FROM case_messages m JOIN accounts a ON a.id=m.author "
                    "WHERE ticket=? ORDER BY m.id",
                    (id,),
                )
            ]
            t["grants"] = [
                dict(r)
                for r in c.execute(
                    "SELECT g.id,g.reason,g.requested,g.decision,g.expires,g.decided,a.username AS admin_name FROM support_grants g "
                    "JOIN accounts a ON a.id=g.admin WHERE ticket=? ORDER BY requested DESC",
                    (id,),
                )
            ]
            t["owner_can_approve"] = bool(
                t["home"]
                and c.execute(
                    "SELECT 1 FROM homes WHERE id=? AND owner=?", (t["home"], t["owner"])
                ).fetchone()
            )
            if staff:
                audit(c, s["account"], "view_case", id)
            return t

    @app.get("/api/support/cases/{id}")
    def customer_detail(id: str, s=Depends(session)):
        return detail(id, s, False)

    @app.get("/api/admin/support/cases/{id}")
    def staff_detail(id: str, s=Depends(admin)):
        return detail(id, s, True)

    def reply(id, body, s, staff):
        with db() as c:
            t = case(c, id, s, staff)
            if t["status"] == "closed" or not body.text.strip():
                raise HTTPException(409, "case_closed_or_empty")
            now = time.time()
            c.execute(
                "INSERT INTO case_messages(ticket,author,staff,text,created) VALUES(?,?,?,?,?)",
                (id, s["account"], int(staff), body.text.strip(), now),
            )
            c.execute("UPDATE support_cases SET updated=? WHERE id=?", (now, id))
            column = "customer_unread" if staff else "staff_unread"
            c.execute(f"UPDATE support_cases SET {column}=1 WHERE id=?", (id,))
            if not staff and t["status"] == "waiting_customer":
                c.execute("UPDATE support_cases SET status='reviewing' WHERE id=?", (id,))
            audit(c, s["account"], "case_reply", id)
        return {"saved": True}

    @app.post("/api/support/cases/{id}/messages")
    def customer_reply(id: str, body: Message, s=Depends(session)):
        return reply(id, body, s, False)

    @app.post("/api/admin/support/cases/{id}/messages")
    def staff_reply(id: str, body: Message, s=Depends(admin)):
        return reply(id, body, s, True)

    @app.patch("/api/admin/support/cases/{id}")
    def update(id: str, body: CaseUpdate, s=Depends(admin)):
        with db() as c:
            t = case(c, id, s, True)
            c.execute(
                "UPDATE support_cases SET status=?,assigned=?,updated=? WHERE id=?",
                (body.status, s["account"] if body.take else t["assigned"], time.time(), id),
            )
            if body.status in {"resolved", "closed"}:
                c.execute(
                    "UPDATE support_grants SET decision='revoked' WHERE ticket=? AND decision IN ('pending','approved')",
                    (id,),
                )
            c.execute("UPDATE support_cases SET customer_unread=1 WHERE id=?", (id,))
            audit(c, s["account"], "case_status_" + body.status, id)
        return {"saved": True}

    @app.post("/api/admin/support/cases/{id}/access")
    def request_access(id: str, body: AccessRequest, s=Depends(admin)):
        with db() as c:
            t = case(c, id, s, True)
            if not t["home"] or t["status"] in {"resolved", "closed"}:
                raise HTTPException(409, "active_home_case_required")
            if not c.execute(
                "SELECT 1 FROM homes WHERE id=? AND owner=?", (t["home"], t["owner"])
            ).fetchone():
                raise HTTPException(409, "home_owner_changed")
            # One active request per case; a new request invalidates previous access.
            c.execute(
                "UPDATE support_grants SET decision='revoked' WHERE ticket=? AND decision IN ('pending','approved')",
                (id,),
            )
            grant = uuid.uuid4().hex
            c.execute(
                "INSERT INTO support_grants(id,ticket,admin,owner,home,reason,requested) VALUES(?,?,?,?,?,?,?)",
                (grant, id, s["account"], t["owner"], t["home"], body.reason.strip(), time.time()),
            )
            c.execute("UPDATE support_cases SET updated=? WHERE id=?", (time.time(), id))
            c.execute("UPDATE support_cases SET customer_unread=1 WHERE id=?", (id,))
            audit(c, s["account"], "support_access_requested", id)
        return {"id": grant}

    @app.post("/api/support/access/{id}/decision")
    def decide(id: str, body: Consent, s=Depends(session)):
        with db() as c:
            c.execute("BEGIN IMMEDIATE")
            g = c.execute(
                "SELECT g.* FROM support_grants g JOIN homes h ON h.id=g.home JOIN support_cases t ON t.id=g.ticket "
                "WHERE g.id=? AND g.owner=? AND h.owner=g.owner AND t.status NOT IN ('resolved','closed')",
                (id, s["account"]),
            ).fetchone()
            if not g:
                raise HTTPException(404, "request_not_found")
            if body.approve and (g["decision"] != "pending" or g["requested"] < time.time() - 86400):
                raise HTTPException(409, "request_expired")
            decision = "approved" if body.approve else "revoked"
            now = time.time()
            c.execute(
                "UPDATE support_grants SET decision=?,expires=?,decided=? WHERE id=?",
                (decision, now + 1800 if body.approve else now, now, id),
            )
            c.execute("UPDATE support_cases SET staff_unread=1,updated=? WHERE id=?", (now, g["ticket"]))
            audit(c, s["account"], "support_access_" + decision, g["ticket"])
        return {"saved": True}

    @app.post("/api/admin/support/access/{id}/link")
    def access_link(id: str, s=Depends(admin)):
        with db() as c:
            c.execute("BEGIN IMMEDIATE")
            g = grant_active(c, id)
            if g["admin"] != s["account"]:
                raise HTTPException(403, "requesting_admin_required")
            code = secrets.token_urlsafe(48)
            c.execute("DELETE FROM support_codes WHERE grant_id=? OR expires<?", (id, time.time()))
            c.execute(
                "INSERT INTO support_codes VALUES(?,?,?,?)", (digest(code), id, s["token"], time.time() + 120)
            )
            audit(c, s["account"], "support_link_created", g["ticket"])
        return {"url": "https://" + g["home"] + ".home.smarti.dev/_support#" + code, "expires": g["expires"]}

    @app.post("/api/hubs/{home_id}/support/redeem")
    def redeem(home_id: str, body: Code, request: Request):
        home_auth(home_id, request)
        with db() as c:
            c.execute("BEGIN IMMEDIATE")
            row = c.execute(
                "SELECT * FROM support_codes WHERE hash=? AND expires>?", (digest(body.code), time.time())
            ).fetchone()
            if not row:
                raise HTTPException(403, "code_expired")
            g = grant_active(c, row["grant_id"], home_id)
            if not c.execute(
                "SELECT 1 FROM sessions WHERE token=? AND account=? AND expires>?",
                (row["admin_session"], g["admin"], time.time()),
            ).fetchone():
                raise HTTPException(403, "admin_session_expired")
            token, csrf = secrets.token_urlsafe(48), secrets.token_urlsafe(32)
            c.execute("DELETE FROM support_codes WHERE hash=?", (row["hash"],))
            c.execute(
                "INSERT INTO support_connections VALUES(?,?,?,?)",
                (digest(token), g["id"], row["admin_session"], csrf),
            )
            audit(c, g["admin"], "support_access_started", g["ticket"])
        return {"token": token, "expires": g["expires"]}

    @app.post("/api/hubs/{home_id}/support/check")
    def check(home_id: str, body: Token, request: Request):
        home_auth(home_id, request)
        with db() as c:
            row = c.execute(
                "SELECT * FROM support_connections WHERE hash=?", (digest(body.token),)
            ).fetchone()
            if not row:
                raise HTTPException(403, "support_session_expired")
            g = grant_active(c, row["grant_id"], home_id)
            if not c.execute(
                "SELECT 1 FROM sessions WHERE token=? AND account=? AND expires>?",
                (row["admin_session"], g["admin"], time.time()),
            ).fetchone():
                raise HTTPException(403, "admin_session_expired")
        if body.operation:
            with db() as c:
                audit(c, g["admin"], "support_request:" + body.operation, g["ticket"])
        return {"name": g["admin_name"], "csrf": row["csrf"], "expires": g["expires"], "ticket": g["ticket"]}
