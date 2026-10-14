"""Provision paired local/controller accounts without exposing privileged credentials."""

import asyncio
import base64
import binascii
import json
import re
import sqlite3
from typing import Literal
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, field_validator

from .auth import hasher
from .home_extras import image_type


class AccountPhoto(BaseModel):
    model_config = {"extra": "forbid"}
    photo: str = Field(default="", max_length=800_000, repr=False)

    @field_validator("photo")
    @classmethod
    def image(cls, value):
        if value:
            try:
                raw = base64.b64decode(value, validate=True)
            except (ValueError, binascii.Error):
                raise ValueError("Invalid photo") from None
            if len(raw) > 600_000 or image_type(raw) not in {"image/png", "image/jpeg"}:
                raise ValueError("JPEG or PNG up to 600 KB required")
        return value


class AccountCreate(AccountPhoto):
    request_id: UUID
    name: str = Field(pattern=r"^[a-z0-9][a-z0-9_.-]{1,79}$")
    display_name: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=12, max_length=128, repr=False)

    @field_validator("display_name")
    @classmethod
    def display(cls, value):
        if not value.strip():
            raise ValueError("Name required")
        return value.strip()

    role: Literal["user", "admin"] = "user"


def accounts_router(m, admin, user):
    router = APIRouter(prefix="/api")
    lock = asyncio.Lock()

    def public(state):
        return {
            k: state.get(k)
            for k in ["status", "name", "display_name", "role", "ha_user_id", "local_id", "profile_saved"]
        }

    async def upload(photo):
        raw = base64.b64decode(photo)
        try:
            async with httpx.AsyncClient(timeout=25, trust_env=False, follow_redirects=False) as client:
                r = await client.post(
                    m.ha.http_url + "image/upload",
                    headers={"Authorization": "Bearer " + m.ha.token},
                    files={"file": ("profile.jpg", raw, image_type(raw))},
                )
                r.raise_for_status()
                id = r.json()["id"]
                if not re.fullmatch(r"[a-f0-9]{32}", id):
                    raise ValueError()
                return f"/api/image/serve/{id}/512x512"
        except (httpx.HTTPError, ValueError, KeyError):
            raise HTTPException(502, "profile_upload_failed") from None

    async def profile(local_id, info, photo):
        # Save locally even if the controller is temporarily unavailable.
        m.store.set(f"account_photo:{local_id}", photo)
        if not info.get("ha_user_id"):
            return True
        picture = await upload(photo) if photo else None
        people = await m.ws("person/list")
        person = next((p for p in people.get("storage", []) if p.get("user_id") == info["ha_user_id"]), None)
        if person:
            await m.ws("person/update", person_id=person["id"], picture=picture)
        else:
            await m.ws(
                "person/create",
                name=info["display_name"],
                user_id=info["ha_user_id"],
                picture=picture,
                device_trackers=[],
            )
        return True

    @router.get("/manage/accounts")
    async def accounts(current=Depends(admin)):
        with m.store.connect() as db:
            rows = [dict(r) for r in db.execute("SELECT id,name,role FROM users ORDER BY name")]
        for row in rows:
            info = json.loads(m.store.get(f"account:{row['id']}", "{}"))
            row.update(
                display_name=info.get("display_name", row["name"]),
                linked=bool(info.get("ha_user_id")),
                ha_user_id=info.get("ha_user_id"),
                photo=bool(m.store.get(f"account_photo:{row['id']}")),
            )
        return rows

    @router.get("/account/photo")
    async def own_photo(current=Depends(user)):
        return photo_response(current["id"])

    def photo_response(id):
        data = m.store.get(f"account_photo:{id}")
        if not data:
            raise HTTPException(404, "photo_missing")
        raw = base64.b64decode(data)
        return Response(raw, media_type=image_type(raw), headers={"Cache-Control": "private, no-store"})

    @router.get("/manage/accounts/{id}/photo")
    async def read_photo(id: int, current=Depends(admin)):
        return photo_response(id)

    @router.put("/manage/accounts/{id}/photo")
    async def save_photo(id: int, body: AccountPhoto, current=Depends(admin)):
        with m.store.connect() as db:
            if not db.execute("SELECT 1 FROM users WHERE id=?", (id,)).fetchone():
                raise HTTPException(404, "account_missing")
        info = json.loads(m.store.get(f"account:{id}", "{}"))
        try:
            await profile(id, info, body.photo)
            return {"local_saved": True, "controller_saved": bool(info.get("ha_user_id"))}
        except HTTPException:
            return {"local_saved": True, "controller_saved": False}

    @router.get("/manage/accounts/pending")
    async def pending(current=Depends(admin)):
        with m.store.connect() as db:
            states = [
                json.loads(r[0])
                for r in db.execute("SELECT value FROM settings WHERE key LIKE 'account_setup:%'")
            ]
        return [
            public(s) | {"request_id": s["request_id"]}
            for s in states
            if s["owner"] == current["id"] and s["status"] != "completed"
        ]

    async def finish_local(state, body, key):
        info = {"ha_user_id": state["ha_user_id"], "display_name": state["display_name"]}
        with m.store.connect() as db:
            row = db.execute("SELECT id FROM users WHERE name=?", (state["name"],)).fetchone()
            if row:
                id = row["id"]
                linked = db.execute("SELECT value FROM settings WHERE key=?", (f"account:{id}",)).fetchone()
                if not linked or json.loads(linked[0]).get("ha_user_id") != state["ha_user_id"]:
                    raise HTTPException(409, "user_exists")
            else:
                id = db.execute(
                    "INSERT INTO users(name,password,role) VALUES (?,?,?)",
                    (state["name"], state["password_hash"], state["role"]),
                ).lastrowid
                db.execute(
                    "INSERT INTO settings(key,value) VALUES (?,?)", (f"account:{id}", json.dumps(info))
                )
        state.update(local_id=id, status="profile_pending")
        m.store.set(key, json.dumps(state))
        await profile(id, info, body.photo or m.store.get(f"account_photo:{id}"))
        state.update(status="completed", profile_saved=True)

    @router.post("/manage/accounts")
    async def create(body: AccountCreate, current=Depends(admin)):
        if m.demo:
            raise HTTPException(503, "live_accounts_required")
        m.connected()
        key = "account_setup:" + str(body.request_id)
        async with lock:
            state = json.loads(m.store.get(key, "null"))
            if state:
                if (
                    state["owner"] != current["id"]
                    or state["name"] != body.name
                    or state["role"] != body.role
                    or state["display_name"] != body.display_name
                ):
                    raise HTTPException(409, "account_request_conflict")
                if state["status"] == "completed":
                    return public(state)
                if not hasher.verify(body.password, state["password_hash"]):
                    raise HTTPException(422, "original_password_required")
                # Reconcile only the exact user created by this request; never claim another account.
                if state.get("ha_user_id"):
                    users = await m.ws("config/auth/list")
                    remote = next(
                        (
                            u
                            for u in users
                            if u["id"] == state["ha_user_id"] and u.get("username") == state["name"]
                        ),
                        None,
                    )
                    if remote:
                        try:
                            await finish_local(state, body, key)
                        except (HTTPException, sqlite3.Error):
                            pass
                m.store.set(key, json.dumps(state))
                return public(state)
            with m.store.connect() as db:
                if db.execute("SELECT 1 FROM users WHERE name=?", (body.name,)).fetchone():
                    raise HTTPException(409, "user_exists")
                pending = db.execute("SELECT value FROM settings WHERE key LIKE 'account_setup:%'").fetchall()
                if any(json.loads(r[0]).get("name") == body.name for r in pending):
                    raise HTTPException(409, "account_request_conflict")
            existing = await m.ws("config/auth/list")
            if any(u.get("username") == body.name for u in existing):
                raise HTTPException(409, "user_exists")
            state = {
                "owner": current["id"],
                "request_id": str(body.request_id),
                "name": body.name,
                "display_name": body.display_name.strip(),
                "role": body.role,
                "password_hash": hasher.hash(body.password),
                "status": "ha_user_unconfirmed",
            }
            m.store.set(key, json.dumps(state))
            try:
                result = await m.ws(
                    "config/auth/create",
                    name=state["display_name"],
                    group_ids=["system-admin" if body.role == "admin" else "system-users"],
                    local_only=False,
                )
                state.update(ha_user_id=result["user"]["id"], status="ha_login_unconfirmed")
                m.store.set(key, json.dumps(state))
                await m.ws(
                    "config/auth_provider/homeassistant/create",
                    user_id=state["ha_user_id"],
                    username=body.name,
                    password=body.password,
                )
                state["status"] = "local_account_unconfirmed"
                m.store.set(key, json.dumps(state))
                await finish_local(state, body, key)
            except (HTTPException, sqlite3.Error):
                pass
            m.store.set(key, json.dumps(state))
            return public(state)

    return router
