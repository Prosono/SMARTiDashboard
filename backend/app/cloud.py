"""Multi-home account/enrollment control plane; does not proxy home commands."""

import hashlib
import os
import re
import secrets
import sqlite3
import threading
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pwdlib import PasswordHash
from pydantic import BaseModel, Field

from app.cloud_admin import install_admin
from app.cloud_support import install_support

PASSWORDS = PasswordHash.recommended()
PASSWORD_WORKERS = threading.BoundedSemaphore(2)
DUMMY = PASSWORDS.hash(secrets.token_urlsafe(32))


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=80, pattern=r"^[a-zA-Z0-9_.@+-]+$")
    password: str = Field(min_length=1, max_length=256)


class Registration(Credentials):
    password: str = Field(min_length=12, max_length=256)


class HomeName(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class Claim(BaseModel):
    code: str = Field(min_length=32, max_length=128)


class CertificateChallenge(BaseModel):
    model_config = {"extra": "forbid"}
    token: str = Field(pattern=r"^[A-Za-z0-9_-]{22,128}$")
    validation: str = Field(pattern=r"^[A-Za-z0-9_-]{22,128}\.[A-Za-z0-9_-]{43}$")


def create_cloud(database, provision_secret, origin="https://home.smarti.dev", relay_status_url=None):
    if len(provision_secret) < 32:
        raise ValueError("A separate random provisioning credential is required")
    if not origin.startswith("https://") or origin.endswith("/"):
        raise ValueError("An HTTPS origin without trailing slash is required")
    database = Path(database)
    database.parent.mkdir(parents=True, exist_ok=True)

    @contextmanager
    def db():
        connection = sqlite3.connect(database, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    with db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS accounts(
            id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions(
            token TEXT PRIMARY KEY, account TEXT NOT NULL REFERENCES accounts(id),
            csrf TEXT NOT NULL, expires REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS homes(
            id TEXT PRIMARY KEY, name TEXT NOT NULL, credential TEXT NOT NULL,
            owner TEXT REFERENCES accounts(id));
        CREATE TABLE IF NOT EXISTS claims(
            token TEXT PRIMARY KEY, home TEXT UNIQUE NOT NULL REFERENCES homes(id),
            expires REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS attempts(
            key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS certificate_challenges(
            home TEXT PRIMARY KEY REFERENCES homes(id), token TEXT NOT NULL,
            validation TEXT NOT NULL, expires REAL NOT NULL);
        """)
        columns = {row[1] for row in c.execute("PRAGMA table_info(homes)")}
        if "remote_enabled" not in columns:
            c.execute("ALTER TABLE homes ADD COLUMN remote_enabled INTEGER NOT NULL DEFAULT 1")
    os.chmod(database, 0o600)
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    @app.exception_handler(RequestValidationError)
    async def invalid_input(request, exc):
        # Never echo submitted passwords, codes or credential values.
        return JSONResponse({"detail": "invalid_input"}, status_code=422)

    @app.middleware("http")
    async def headers(request, call_next):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self'; "
            "frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
        )
        return response

    def throttle(key):
        now = time.time()
        with db() as c:
            c.execute("BEGIN IMMEDIATE")
            c.execute("DELETE FROM attempts WHERE expires < ?", (now,))
            row = c.execute("SELECT count FROM attempts WHERE key=?", (key,)).fetchone()
            if row and row["count"] >= 8:
                raise HTTPException(429, "rate_limited")
            c.execute(
                "INSERT INTO attempts VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1",
                (key, now + 900),
            )

    def browser(request: Request):
        if request.headers.getlist("origin") != [origin]:
            raise HTTPException(403, "origin_rejected")

    def session(request: Request):
        with db() as c:
            row = c.execute(
                "SELECT * FROM sessions WHERE token=? AND expires>?",
                (digest(request.cookies.get("__Host-smarti_cloud", "")), time.time()),
            ).fetchone()
        if not row:
            raise HTTPException(401, "authentication_required")
        if request.method not in {"GET", "HEAD"}:
            browser(request)
            if not secrets.compare_digest(request.headers.get("x-csrf-token", ""), row["csrf"]):
                raise HTTPException(403, "csrf_rejected")
        return dict(row)

    def operator(request: Request):
        if not secrets.compare_digest(request.headers.get("authorization", ""), "Bearer " + provision_secret):
            raise HTTPException(403, "provisioning_denied")

    def home_auth(home_id, request):
        with db() as c:
            home = c.execute("SELECT * FROM homes WHERE id=?", (home_id,)).fetchone()
        authorization = request.headers.get("authorization", "")
        if not authorization.startswith("Bearer "):
            raise HTTPException(403, "home_authentication_failed")
        token = authorization[7:]
        if not home or not secrets.compare_digest(home["credential"], digest(token)):
            raise HTTPException(403, "home_authentication_failed")
        return home

    @app.get("/healthz")
    def health():
        return {"status": "ok"}

    @app.post("/api/register", dependencies=[Depends(browser)])
    def register(body: Registration, request: Request):
        throttle("register:" + request.client.host)
        with PASSWORD_WORKERS:
            hashed = PASSWORDS.hash(body.password)
        with db() as c:
            try:
                c.execute(
                    "INSERT INTO accounts VALUES(?,?,?)",
                    (
                        uuid.uuid4().hex,
                        body.username.lower(),
                        hashed,
                    ),
                )
            except sqlite3.IntegrityError:
                raise HTTPException(409, "account_not_created") from None
        return {"created": True}

    @app.post("/api/login", dependencies=[Depends(browser)])
    def login(body: Credentials, request: Request, response: Response):
        throttle("login-ip:" + request.client.host)
        throttle("login-user:" + digest(body.username.lower()))
        with db() as c:
            account = c.execute(
                "SELECT * FROM accounts WHERE username=?", (body.username.lower(),)
            ).fetchone()
            with PASSWORD_WORKERS:
                valid = PASSWORDS.verify(body.password, account["password"] if account else DUMMY)
            if not account or not valid:
                raise HTTPException(401, "invalid_credentials")
            for key in ("login-ip:" + request.client.host, "login-user:" + digest(body.username.lower())):
                c.execute("UPDATE attempts SET count=MAX(0,count-1) WHERE key=?", (key,))
            token, csrf = secrets.token_urlsafe(48), secrets.token_urlsafe(32)
            c.execute("DELETE FROM sessions WHERE expires<?", (time.time(),))
            c.execute(
                "INSERT INTO sessions VALUES(?,?,?,?)",
                (
                    digest(token),
                    account["id"],
                    csrf,
                    time.time() + 86400,
                ),
            )
        response.set_cookie(
            "__Host-smarti_cloud",
            token,
            secure=True,
            httponly=True,
            samesite="strict",
            max_age=86400,
            path="/",
        )
        return {"csrf": csrf, "username": account["username"]}

    @app.get("/api/session")
    def current(s=Depends(session)):
        return {"csrf": s["csrf"], "portal_admin": is_admin(s["account"])}

    @app.post("/api/logout")
    def logout(response: Response, s=Depends(session)):
        with db() as c:
            c.execute("DELETE FROM sessions WHERE token=?", (s["token"],))
        response.delete_cookie("__Host-smarti_cloud", secure=True, httponly=True, samesite="strict")
        return {"logged_out": True}

    @app.post("/api/provision/homes", dependencies=[Depends(operator)])
    def provision(body: HomeName):
        home_id, credential = str(uuid.uuid4()), secrets.token_urlsafe(48)
        with db() as c:
            c.execute(
                "INSERT INTO homes(id,name,credential,owner) VALUES(?,?,?,NULL)",
                (home_id, body.name, digest(credential)),
            )
        # Installer must deliver this directly to the intended hub, never to the browser.
        return {"installation_id": home_id, "credential": credential}

    @app.get("/api/hubs/{home_id}/status")
    def hub_status(home_id: str, request: Request):
        home = home_auth(home_id, request)
        return {"linked": home["owner"] is not None, "remote_enabled": bool(home["remote_enabled"])}

    @app.put("/api/hubs/{home_id}/certificate-challenge")
    def publish_challenge(home_id: str, body: CertificateChallenge, request: Request):
        home_auth(home_id, request)
        if body.validation.split(".", 1)[0] != body.token:
            raise HTTPException(422, "invalid_challenge")
        with db() as c:
            c.execute("BEGIN IMMEDIATE")
            home = c.execute("SELECT * FROM homes WHERE id=?", (home_id,)).fetchone()
            if not home["owner"] or not home["remote_enabled"]:
                raise HTTPException(403, "remote_disabled_or_unclaimed")
            c.execute("DELETE FROM certificate_challenges WHERE expires<?", (time.time(),))
            c.execute(
                "INSERT OR REPLACE INTO certificate_challenges VALUES(?,?,?,?)",
                (home_id, body.token, body.validation, time.time() + 900),
            )
        return {"published": True}

    @app.delete("/api/hubs/{home_id}/certificate-challenge/{token}")
    def clear_challenge(home_id: str, token: str, request: Request):
        home_auth(home_id, request)
        with db() as c:
            c.execute("DELETE FROM certificate_challenges WHERE home=? AND token=?", (home_id, token))
        return {"removed": True}

    @app.get("/.well-known/acme-challenge/{token}")
    def certificate_challenge(token: str, request: Request):
        # Never trust X-Forwarded-Host: only this exact home's HTTP Host selects a proof.
        host = request.headers.get("host", "").lower().removesuffix(":80")
        match = re.fullmatch(r"(?:ha-)?([0-9a-f-]{36})\.home\.smarti\.dev", host)
        if not match or len(request.headers.getlist("host")) != 1:
            raise HTTPException(404, "challenge_not_found")
        with db() as c:
            row = c.execute(
                "SELECT validation FROM certificate_challenges c JOIN homes h ON h.id=c.home "
                "WHERE c.home=? AND c.token=? AND c.expires>? AND h.owner IS NOT NULL "
                "AND h.remote_enabled=1",
                (match[1], token, time.time()),
            ).fetchone()
        if not row:
            raise HTTPException(404, "challenge_not_found")
        return PlainTextResponse(row["validation"])

    @app.delete("/api/hubs/{home_id}/claim-code")
    def cancel_claim(home_id: str, request: Request):
        home_auth(home_id, request)
        with db() as c:
            c.execute("DELETE FROM claims WHERE home=?", (home_id,))
        return {"cancelled": True}

    @app.put("/api/hubs/{home_id}/remote")
    def hub_enable(home_id: str, request: Request):
        home_auth(home_id, request)
        with db() as c:
            c.execute("UPDATE homes SET remote_enabled=1 WHERE id=?", (home_id,))
        return {"enabled": True}

    @app.delete("/api/hubs/{home_id}/remote")
    def hub_disable(home_id: str, request: Request):
        home_auth(home_id, request)
        with db() as c:
            c.execute("UPDATE homes SET remote_enabled=0 WHERE id=?", (home_id,))
            c.execute("DELETE FROM claims WHERE home=?", (home_id,))
        return {"disabled": True}

    @app.post("/api/hubs/{home_id}/claim-code")
    def issue(home_id: str, request: Request):
        home_auth(home_id, request)
        code = secrets.token_urlsafe(32)
        expires = time.time() + 300
        with db() as c:
            c.execute("BEGIN IMMEDIATE")
            if c.execute("SELECT owner FROM homes WHERE id=?", (home_id,)).fetchone()["owner"]:
                raise HTTPException(409, "home_already_claimed")
            c.execute("DELETE FROM claims WHERE home=?", (home_id,))
            c.execute("INSERT INTO claims VALUES(?,?,?)", (digest(code), home_id, expires))
        return {"code": code, "expires_at": expires, "installation_id": home_id}

    @app.post("/api/homes/claim")
    def claim(body: Claim, s=Depends(session)):
        throttle("claim:" + s["account"])
        with db() as c:
            c.execute("BEGIN IMMEDIATE")
            row = c.execute(
                "SELECT * FROM claims WHERE token=? AND expires>?", (digest(body.code), time.time())
            ).fetchone()
            if not row:
                raise HTTPException(400, "claim_invalid_or_expired")
            changed = c.execute(
                "UPDATE homes SET owner=? WHERE id=? AND owner IS NULL", (s["account"], row["home"])
            ).rowcount
            if changed != 1:
                raise HTTPException(409, "home_already_claimed")
            c.execute("DELETE FROM claims WHERE home=?", (row["home"],))
        return {"installation_id": row["home"], "linked": True}

    @app.delete("/api/homes/{home_id}/remote")
    def disable_remote(home_id: str, s=Depends(session)):
        with db() as c:
            count = c.execute(
                "UPDATE homes SET remote_enabled=0 WHERE id=? AND owner=?",
                (home_id, s["account"]),
            ).rowcount
            if count != 1:
                raise HTTPException(404, "home_not_found")
        return {"disabled": True}

    @app.get("/api/homes")
    def homes(s=Depends(session)):
        connected = set()
        if relay_status_url:
            try:
                with httpx.Client(timeout=2, trust_env=False, follow_redirects=False) as client:
                    response = client.get(relay_status_url)
                    response.raise_for_status()
                    connected = set(response.json()["connected"])
            except (httpx.HTTPError, ValueError, KeyError, TypeError):
                pass
        with db() as c:
            return [
                {
                    **dict(row),
                    "connected": bool(row["remote_enabled"] and row["installation_id"] in connected),
                }
                for row in c.execute(
                    "SELECT id AS installation_id,name,remote_enabled FROM homes WHERE owner=? ORDER BY name",
                    (s["account"],),
                )
            ]

    is_admin = install_admin(app, db, session, relay_status_url)
    install_support(app, db, session, is_admin, home_auth, origin)

    static = Path(__file__).with_name("cloud_web")
    app.mount("/assets", StaticFiles(directory=static), name="assets")

    @app.get("/")
    def index():
        return FileResponse(static / "index.html")

    return app


def factory():
    return create_cloud(
        os.environ.get("CLOUD_DATABASE", "/data/cloud.sqlite"),
        Path(os.environ["CLOUD_PROVISION_SECRET_FILE"]).read_text().strip(),
        os.environ.get("CLOUD_ORIGIN", "https://home.smarti.dev"),
        os.environ.get("CLOUD_RELAY_STATUS_URL"),
    )
