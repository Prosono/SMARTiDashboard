"""Private and shared dashboards, revision checked and isolated by owner."""

import json
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator


class Cell(BaseModel):
    model_config = {"extra": "forbid"}
    x: int = Field(ge=0, le=11)
    y: int = Field(ge=0, le=1000)
    w: int = Field(ge=1, le=12)
    h: int = Field(ge=1, le=8)


class Tile(BaseModel):
    model_config = {"extra": "forbid"}
    id: str = Field(min_length=1, max_length=80)
    kind: Literal["control", "heading", "text"]
    control_id: str | None = Field(default=None, max_length=200)
    title: str = Field(default="", max_length=100)
    text: str = Field(default="", max_length=2000)
    layouts: dict[Literal["phone", "tablet", "desktop"], Cell]

    @model_validator(mode="after")
    def valid(self):
        for breakpoint, columns in [("phone", 2), ("tablet", 6), ("desktop", 12)]:
            cell = self.layouts.get(breakpoint)
            if not cell or cell.x + cell.w > columns:
                raise ValueError("Invalid layout")
        if self.kind == "control" and not self.control_id:
            raise ValueError("Control required")
        return self


class DashboardBody(BaseModel):
    model_config = {"extra": "forbid"}
    name: str = Field(min_length=1, max_length=80)
    scope: Literal["private", "shared"] = "private"
    revision: int = Field(default=0, ge=0)
    tiles: list[Tile] = Field(default_factory=list, max_length=60)

    @model_validator(mode="after")
    def valid(self):
        if not self.name.strip() or len({t.id for t in self.tiles}) != len(self.tiles):
            raise ValueError("Invalid dashboard")
        for breakpoint in ["phone", "tablet", "desktop"]:
            cells = [t.layouts[breakpoint] for t in self.tiles]
            for i, a in enumerate(cells):
                for b in cells[i + 1 :]:
                    if a.x < b.x + b.w and b.x < a.x + a.w and a.y < b.y + b.h and b.y < a.y + a.h:
                        raise ValueError("Overlapping tiles")
        return self


def dashboard_router(store, user):
    router = APIRouter(prefix="/api/dashboards")

    def visible(row, current):
        return row["scope"] == "shared" or row["owner_id"] == current["id"]

    def editable(row, current):
        return current["role"] == "admin" if row["scope"] == "shared" else row["owner_id"] == current["id"]

    def output(row, current):
        return {
            "id": row["id"],
            "name": row["name"],
            "scope": row["scope"],
            "revision": row["revision"],
            "tiles": json.loads(row["tiles"]),
            "editable": editable(row, current),
        }

    @router.get("")
    async def listing(current=Depends(user)):
        with store.connect() as db:
            rows = db.execute(
                "SELECT * FROM dashboards WHERE scope='shared' OR owner_id=? ORDER BY name,id",
                (current["id"],),
            ).fetchall()
            return [output(row, current) for row in rows]

    @router.post("")
    async def create(body: DashboardBody, current=Depends(user)):
        if body.scope == "shared" and current["role"] != "admin":
            raise HTTPException(403, "admin_required")
        id = str(uuid.uuid4())
        with store.connect() as db:
            db.execute(
                "INSERT INTO dashboards VALUES (?,?,?,?,?,1)",
                (
                    id,
                    current["id"],
                    body.scope,
                    body.name.strip(),
                    json.dumps([t.model_dump() for t in body.tiles]),
                ),
            )
            return output(db.execute("SELECT * FROM dashboards WHERE id=?", (id,)).fetchone(), current)

    @router.put("/{id}")
    async def save(id: str, body: DashboardBody, current=Depends(user)):
        with store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM dashboards WHERE id=?", (id,)).fetchone()
            if not row or not visible(row, current):
                raise HTTPException(404, "not_found")
            if not editable(row, current) or (body.scope == "shared" and current["role"] != "admin"):
                raise HTTPException(403, "admin_required")
            if body.revision != row["revision"]:
                raise HTTPException(409, "revision_conflict")
            # Sharing must not transfer another user's private ownership.
            if body.scope != row["scope"] and row["owner_id"] != current["id"]:
                raise HTTPException(403, "owner_required")
            db.execute(
                "UPDATE dashboards SET name=?,scope=?,tiles=?,revision=revision+1 WHERE id=?",
                (body.name.strip(), body.scope, json.dumps([t.model_dump() for t in body.tiles]), id),
            )
            return output(db.execute("SELECT * FROM dashboards WHERE id=?", (id,)).fetchone(), current)

    @router.delete("/{id}")
    async def delete(id: str, revision: int, current=Depends(user)):
        with store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM dashboards WHERE id=?", (id,)).fetchone()
            if not row or not visible(row, current):
                raise HTTPException(404, "not_found")
            if not editable(row, current):
                raise HTTPException(403, "admin_required")
            if revision != row["revision"]:
                raise HTTPException(409, "revision_conflict")
            db.execute("DELETE FROM dashboards WHERE id=?", (id,))
        return {"status": "deleted"}

    return router
