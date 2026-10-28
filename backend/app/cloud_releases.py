"""Central release approvals; candidate reports never grant approval."""

import time
from pathlib import Path
from typing import Literal

from fastapi import Depends, HTTPException, Request, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field


class Release(BaseModel):
    model_config = {"extra": "forbid"}
    component: Literal["core", "os", "supervisor"]
    version: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._+\-]{0,99}$")


class Candidates(BaseModel):
    releases: list[Release] = Field(max_length=10)


class Decision(Release):
    approved: bool
    notes: str = Field(default="", max_length=4000)


def install_releases(app, db, session, is_admin, home_auth):
    with db() as c:
        c.execute("""CREATE TABLE IF NOT EXISTS system_releases(
            component TEXT NOT NULL, version TEXT NOT NULL, approved INTEGER NOT NULL DEFAULT 0,
            notes TEXT NOT NULL DEFAULT '', first_seen REAL NOT NULL, updated REAL NOT NULL,
            actor TEXT, PRIMARY KEY(component,version))""")

    def admin(s=Depends(session)):
        if not is_admin(s["account"]):
            raise HTTPException(403, "portal_admin_required")
        return s

    @app.get("/admin/updates")
    def page(s=Depends(admin)):
        return FileResponse(Path(__file__).with_name("cloud_web") / "admin-updates.html")

    @app.get("/api/admin/releases")
    def releases(s=Depends(admin)):
        with db() as c:
            return [
                dict(r) for r in c.execute("SELECT * FROM system_releases ORDER BY updated DESC LIMIT 500")
            ]

    @app.post("/api/admin/releases")
    def decide(body: Decision, s=Depends(admin)):
        now = time.time()
        with db() as c:
            c.execute(
                """INSERT INTO system_releases VALUES(?,?,?,?,?,?,?)
                ON CONFLICT(component,version) DO UPDATE SET approved=excluded.approved,
                notes=excluded.notes,updated=excluded.updated,actor=excluded.actor""",
                (body.component, body.version, int(body.approved), body.notes, now, now, s["account"]),
            )
            c.execute(
                "INSERT INTO admin_audit(actor,action,target,created) VALUES(?,?,?,?)",
                (
                    s["account"],
                    "approve_release" if body.approved else "withdraw_release",
                    body.component + ":" + body.version,
                    now,
                ),
            )
        return {"saved": True}

    @app.get("/api/releases/approved")
    def approved(response: Response):
        response.headers["Cache-Control"] = "no-store"
        with db() as c:
            return {
                "releases": [
                    dict(r)
                    for r in c.execute("SELECT component,version FROM system_releases WHERE approved=1")
                ]
            }

    @app.post("/api/hubs/{home_id}/update-candidates")
    def candidates(home_id: str, body: Candidates, request: Request):
        home_auth(home_id, request)
        now = time.time()
        with db() as c:
            for r in body.releases:
                c.execute(
                    "INSERT OR IGNORE INTO system_releases(component,version,first_seen,updated) VALUES(?,?,?,?)",
                    (r.component, r.version, now, now),
                )
        return {"accepted": len(body.releases)}
