"""Factory inventory and resumable, owner-bound hub activation."""

import hashlib
import hmac
import io
import json
import secrets
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
import qrcode
import qrcode.image.svg
from fastapi import BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field, model_validator

from .cloud_enrollment import install_enrollment


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


class FactoryHub(BaseModel):
    serial: str = Field(min_length=3, max_length=80, pattern=r"^[A-Za-z0-9_.-]+$")
    model: str = Field(min_length=2, max_length=120)
    hardware: str = Field(min_length=2, max_length=1000)


class Inspection(BaseModel):
    ha: bool
    zigbee: bool
    zwave: bool
    network: bool
    clean: bool


class Heartbeat(BaseModel):
    boot_id: str = Field(max_length=80)
    fingerprint: str = Field(min_length=32, max_length=128)
    version: str = Field(max_length=40)
    users: int = Field(ge=0)
    ha_connected: bool
    remote_ready: bool


class Activation(BaseModel):
    code: str = Field(min_length=32, max_length=128)
    pin: str = Field(default="", pattern=r"^(?:\d{8})?$")
    device: uuid.UUID | None = None


class Room(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    floor: str = Field(min_length=1, max_length=80)


COUNTRY_CODES = frozenset(
    "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split()
)


class Plan(BaseModel):
    mode: Literal["new", "reset", "existing"]
    name: str = Field(min_length=1, max_length=80)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    timezone: str = "Europe/Oslo"
    country: str = Field(default="NO", pattern=r"^[A-Z]{2}$")
    rooms: list[Room] = Field(default_factory=list, max_length=80)
    experience: Literal["simple", "normal", "advanced"] = "normal"
    password: str = Field(default="", max_length=128, repr=False)
    password_repeat: str = Field(default="", max_length=128, repr=False)
    confirmation: str = ""

    @model_validator(mode="after")
    def valid(self):
        if self.mode != "existing":
            from .hub_credentials import HubCredentials

            HubCredentials(username="admin", password=self.password, password_repeat=self.password_repeat)
        if self.country not in COUNTRY_CODES:
            raise ValueError("invalid country")
        try:
            ZoneInfo(self.timezone)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("invalid timezone") from None
        if len({r.name.strip().casefold() for r in self.rooms}) != len(self.rooms):
            raise ValueError("room names must be unique")
        return self


class Progress(BaseModel):
    id: str
    status: Literal["working", "completed", "failed"]
    step: Literal["checking", "resetting", "location", "rooms", "user", "radios", "completed"]
    error: Literal[
        "", "ha_unavailable", "setup_failed", "existing_users", "reset_not_supported", "radios_unavailable"
    ] = ""


def install_onboarding(
    app, db, session, is_admin, home_auth, throttle, secret, origin, passwords, relay_status_url=None
):
    with db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS factory_hubs(
          home TEXT PRIMARY KEY REFERENCES homes(id), serial TEXT UNIQUE NOT NULL, model TEXT NOT NULL,
          hardware TEXT NOT NULL, label_nonce TEXT NOT NULL, pin TEXT NOT NULL, phase TEXT NOT NULL,
          fingerprint TEXT, heartbeat TEXT, seen REAL, inspection TEXT, created REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS onboarding_plans(
          home TEXT PRIMARY KEY REFERENCES homes(id), id TEXT UNIQUE NOT NULL, owner TEXT NOT NULL,
          payload TEXT NOT NULL, status TEXT NOT NULL, step TEXT NOT NULL, error TEXT NOT NULL DEFAULT '',
          created REAL NOT NULL, updated REAL NOT NULL);
        """)

    from .cloud_factory_reset import install_factory_reset

    install_factory_reset(app, db, home_auth)
    bind_enrollment = install_enrollment(app, db, throttle, secret)

    def admin(s=Depends(session)):
        if not is_admin(s["account"]):
            raise HTTPException(403, "portal_admin_required")
        return s

    def audit(c, actor, action, home):
        c.execute(
            "INSERT INTO admin_audit(actor,action,target,created) VALUES(?,?,?,?)",
            (actor, action, home, time.time()),
        )

    def pin_digest(pin):
        # The short printed PIN cannot be brute-forced from a database-only leak.
        return hmac.new(secret.encode(), ("activation-pin:" + pin).encode(), hashlib.sha256).hexdigest()

    def label(row):
        return hmac.new(
            secret.encode(), ("hub-label:" + row["home"] + ":" + row["label_nonce"]).encode(), hashlib.sha256
        ).hexdigest()

    def qr_secret(row):
        return (
            "v2."
            + hmac.new(
                secret.encode(),
                ("hub-qr-v2:" + row["home"] + ":" + row["label_nonce"]).encode(),
                hashlib.sha256,
            ).hexdigest()
        )

    def valid_activation(row, body):
        return bool(row) and (
            secrets.compare_digest(qr_secret(row), body.code)
            or (activation_proof(row, body.code) and secrets.compare_digest(row["pin"], pin_digest(body.pin)))
        )

    def view(row):
        h = json.loads(row["heartbeat"] or "{}")
        return {
            "id": row["home"],
            "serial": row["serial"],
            "model": row["model"],
            "hardware": row["hardware"],
            "phase": row["phase"],
            "online": bool(row["seen"] and row["seen"] > time.time() - 100),
            "seen": row["seen"],
            "created": row["created"],
            "checks": json.loads(row["inspection"] or "{}"),
            "health": h,
        }

    def owned(c, home, s):
        row = c.execute(
            "SELECT f.*,h.owner FROM factory_hubs f JOIN homes h ON h.id=f.home WHERE home=?", (home,)
        ).fetchone()
        if not row or row["owner"] != s["account"]:
            raise HTTPException(404, "home_not_found")
        return row

    @app.get("/admin/hubs")
    @app.get("/activate")
    @app.get("/welcome")
    def page():
        return FileResponse(Path(__file__).with_name("cloud_web") / "onboarding.html")

    @app.get("/.well-known/apple-app-site-association")
    def association():
        return {
            "applinks": {
                "details": [{"appIDs": ["3T2Y4G6HVQ.dev.smarti.home"], "components": [{"/": "/activate"}]}]
            }
        }

    @app.get("/api/admin/hubs")
    def inventory(s=Depends(admin)):
        with db() as c:
            result = []
            for row in c.execute("SELECT * FROM factory_hubs ORDER BY created DESC"):
                item = view(row)
                reset = c.execute(
                    "SELECT phase,qr_required,qr_verified,ownership FROM hub_resets WHERE home=?",
                    (row["home"],),
                ).fetchone()
                item["reset"] = dict(reset) if reset else None
                plan = c.execute(
                    "SELECT status,payload FROM onboarding_plans WHERE home=?", (row["home"],)
                ).fetchone()
                item["setup_status"] = plan["status"] if plan else None
                # Never expose the full plan: it also contains credential material.
                item["location"] = None
                if plan and plan["status"] == "completed" and not (reset and reset["phase"] != "completed"):
                    payload = json.loads(plan["payload"])
                    lat, lon = payload.get("latitude"), payload.get("longitude")
                    if (type(lat) in (int, float) and type(lon) in (int, float)
                            and -90 <= lat <= 90 and -180 <= lon <= 180):
                        item["location"] = {"latitude": lat, "longitude": lon,
                                            "name": payload.get("name", ""), "source": "onboarding"}

                result.append(item)
            return result

    @app.post("/api/admin/hubs")
    def create(body: FactoryHub, s=Depends(admin)):
        home, credential, pin = (
            str(uuid.uuid4()),
            secrets.token_urlsafe(48),
            f"{secrets.randbelow(100000000):08d}",
        )
        with db() as c:
            try:
                c.execute(
                    "INSERT INTO homes(id,name,credential,owner) VALUES(?,?,?,NULL)",
                    (home, body.serial, digest(credential)),
                )
                c.execute(
                    "INSERT INTO factory_hubs(home,serial,model,hardware,label_nonce,pin,phase,created) VALUES(?,?,?,?,?,?,?,?)",
                    (
                        home,
                        body.serial,
                        body.model,
                        body.hardware,
                        secrets.token_hex(16),
                        pin_digest(pin),
                        "preparing",
                        time.time(),
                    ),
                )
                audit(c, s["account"], "factory_create", home)
            except sqlite3.IntegrityError:
                raise HTTPException(409, "serial_already_registered") from None
        # One-time factory download; neither credential nor PIN appears on the label.
        return {
            "installation_id": home,
            "remote_installation_id": home,
            "remote_credential": credential,
            "activation_pin": pin,
        }

    @app.post("/api/admin/hubs/{home}/reprovision")
    def reprovision(home: str, s=Depends(admin)):
        credential, pin = secrets.token_urlsafe(48), f"{secrets.randbelow(100000000):08d}"
        with db() as c:
            c.execute("BEGIN IMMEDIATE")
            row = c.execute(
                "SELECT f.phase,h.owner FROM factory_hubs f JOIN homes h ON h.id=f.home WHERE home=?", (home,)
            ).fetchone()
            if not row or row["owner"] or row["phase"] != "preparing":
                raise HTTPException(409, "hub_not_preparing")
            c.execute("UPDATE homes SET credential=? WHERE id=?", (digest(credential), home))
            c.execute(
                "UPDATE factory_hubs SET pin=?,fingerprint=NULL,heartbeat=NULL,seen=NULL,inspection=NULL WHERE home=?",
                (pin_digest(pin), home),
            )
            audit(c, s["account"], "factory_reprovision", home)
        return {
            "installation_id": home,
            "remote_installation_id": home,
            "remote_credential": credential,
            "activation_pin": pin,
        }

    @app.get("/api/admin/hubs/{home}/label")
    def print_label(home: str, s=Depends(admin)):
        with db() as c:
            row = c.execute("SELECT * FROM factory_hubs WHERE home=?", (home,)).fetchone()
            if not row:
                raise HTTPException(404, "hub_not_found")
        url = origin + "/activate#" + home + "." + qr_secret(row)
        buf = io.BytesIO()
        qrcode.make(url, image_factory=qrcode.image.svg.SvgPathImage).save(buf)
        return Response(buf.getvalue(), media_type="image/svg+xml")

    @app.post("/api/admin/hubs/{home}/ready")
    def ready(home: str, body: Inspection, s=Depends(admin)):
        with db() as c:
            c.execute("BEGIN IMMEDIATE")
            row = c.execute(
                "SELECT f.*,h.owner FROM factory_hubs f JOIN homes h ON h.id=f.home WHERE home=?", (home,)
            ).fetchone()
            if not row or row["owner"] or row["phase"] != "preparing":
                raise HTTPException(409, "hub_not_preparing")
            health = json.loads(row["heartbeat"] or "{}")
            if (
                not all(body.model_dump().values())
                or not row["seen"]
                or row["seen"] < time.time() - 100
                or health.get("users") != 0
                or not health.get("ha_connected")
            ):
                raise HTTPException(409, "factory_checks_incomplete")
            c.execute(
                "UPDATE factory_hubs SET phase='ready',inspection=? WHERE home=?",
                (body.model_dump_json(), home),
            )
            audit(c, s["account"], "factory_ready", home)
        return {"ready": True}

    @app.post("/api/hubs/{home}/onboarding/heartbeat")
    def heartbeat(home: str, body: Heartbeat, request: Request):
        home_auth(home, request)
        with db() as c:
            c.execute("BEGIN IMMEDIATE")
            row = c.execute("SELECT * FROM factory_hubs WHERE home=?", (home,)).fetchone()
            if not row:
                return {"managed": False}
            if row["fingerprint"] and row["fingerprint"] != body.fingerprint:
                raise HTTPException(409, "hardware_identity_mismatch")
            c.execute(
                "UPDATE factory_hubs SET fingerprint=?,heartbeat=?,seen=? WHERE home=?",
                (body.fingerprint, body.model_dump_json(), time.time(), home),
            )
            # A validated heartbeat acknowledges durable receipt of the new identity.
            c.execute("UPDATE hub_enrollments SET delivery=NULL WHERE home=?", (home,))
            job = c.execute(
                "SELECT * FROM onboarding_plans WHERE home=? AND status IN ('queued','working')", (home,)
            ).fetchone()
            result = {"managed": True}
            owner = c.execute("SELECT owner FROM homes WHERE id=?", (home,)).fetchone()[0]
            if row["phase"] == "ready" and not owner and body.users == 0:
                issued = str(int(time.time()))
                proof = hmac.new(
                    secret.encode(), ("lan-discovery:" + home + ":" + issued).encode(), hashlib.sha256
                ).hexdigest()
                result["discovery"] = {
                    "id": home,
                    "proof": issued + "." + proof,
                    "model": row["model"],
                    "serial": row["serial"],
                }

            resetting = c.execute(
                "SELECT phase FROM hub_resets WHERE home=? AND phase!='completed'", (home,)
            ).fetchone()
            if resetting and resetting["phase"] == "awaiting_owner" and body.users == 0:
                result["discovery"] = {
                    "id": home,
                    "model": row["model"],
                    "serial": row["serial"],
                    "state": "unconfigured",
                }
            if job:
                result["plan"] = json.loads(job["payload"]) | {"id": job["id"]}
        return result

    def activation_proof(row, code):
        if secrets.compare_digest(label(row), code):
            return True
        # A short-lived LAN discovery proof is never sufficient without the separate PIN.
        try:
            issued, digest = code.split(".", 1)
            age = time.time() - int(issued)
        except ValueError:
            return False
        expected = hmac.new(
            secret.encode(), ("lan-discovery:" + row["home"] + ":" + issued).encode(), hashlib.sha256
        ).hexdigest()
        return 0 <= age <= 300 and secrets.compare_digest(expected, digest)

    @app.post("/api/activation/{home}/identify")
    def identify(home: str, body: Activation, request: Request):
        throttle("activation:" + request.client.host)
        throttle("activation-hub:" + home)
        with db() as c:
            row = c.execute(
                "SELECT f.*,h.owner FROM factory_hubs f JOIN homes h ON h.id=f.home WHERE home=?", (home,)
            ).fetchone()
        if not row or not valid_activation(row, body):
            raise HTTPException(404, "activation_not_found")
        return {
            "model": row["model"],
            "serial": row["serial"],
            "online": bool(row["seen"] and row["seen"] > time.time() - 100),
            "claimed": bool(row["owner"]),
        }

    @app.post("/api/activation/{home}/claim")
    def activate(home: str, body: Activation, s=Depends(session)):
        with db() as c:
            app.state.require_verified_profile(c, s["account"])
        throttle("activate-account:" + s["account"])
        throttle("activation-hub:" + home)
        with db() as c:
            c.execute("BEGIN IMMEDIATE")
            row = c.execute(
                "SELECT f.*,h.owner FROM factory_hubs f JOIN homes h ON h.id=f.home WHERE home=?", (home,)
            ).fetchone()
            if not row or not valid_activation(row, body):
                raise HTTPException(404, "activation_not_found")
            if row["owner"] and row["owner"] != s["account"]:
                raise HTTPException(409, "home_has_an_owner")
            if (
                body.code.startswith("v2.")
                and not c.execute(
                    "SELECT 1 FROM customer_profiles WHERE account=?", (s["account"],)
                ).fetchone()
            ):
                raise HTTPException(422, "customer_profile_required")
            if body.device:
                # LAN selection supplies only a device locator; the printed QR and PIN above authorize binding.
                if not (
                    secrets.compare_digest(label(row), body.code)
                    or secrets.compare_digest(qr_secret(row), body.code)
                ):
                    raise HTTPException(404, "activation_not_found")
                bind_enrollment(c, row, str(body.device))
                row = c.execute(
                    "SELECT f.*,h.owner FROM factory_hubs f JOIN homes h ON h.id=f.home WHERE home=?", (home,)
                ).fetchone()
            transfer = c.execute(
                "SELECT * FROM hub_resets WHERE home=? AND ownership='release_owner' AND released=1 AND phase='awaiting_owner'",
                (home,),
            ).fetchone()
            if not row["owner"]:
                if (
                    (row["phase"] != "ready" and not transfer)
                    or json.loads(row["heartbeat"] or "{}").get("users") != 0
                    or not row["seen"]
                    or row["seen"] < time.time() - 100
                ):
                    raise HTTPException(409, "hub_not_ready_or_offline")
                c.execute(
                    "UPDATE homes SET owner=?,remote_enabled=1 WHERE id=? AND owner IS NULL",
                    (s["account"], home),
                )
                if transfer:
                    c.execute("UPDATE homes SET remote_enabled=0 WHERE id=?", (home,))
                else:
                    c.execute("UPDATE factory_hubs SET phase='activated' WHERE home=?", (home,))
                audit(c, s["account"], "hub_activated", home)
            reset = c.execute(
                "SELECT * FROM hub_resets WHERE home=? AND phase!='completed'", (home,)
            ).fetchone()
            if reset:
                if reset["phase"] != "awaiting_owner":
                    raise HTTPException(409, "reset_not_ready")
                if not (
                    secrets.compare_digest(label(row), body.code)
                    or secrets.compare_digest(qr_secret(row), body.code)
                ):
                    raise HTTPException(409, "reset_qr_required")
                # Owner authorization and QR/PIN proof above are both required.
                c.execute("UPDATE hub_resets SET qr_verified=1 WHERE home=? AND id=?", (home, reset["id"]))
            c.execute("DELETE FROM claims WHERE home=?", (home,))
        return {"id": home, "linked": True}

    @app.get("/api/onboarding/{home}")
    def status(home: str, s=Depends(session)):
        with db() as c:
            row = owned(c, home, s)
            plan = c.execute(
                "SELECT id,status,step,error,payload FROM onboarding_plans WHERE home=?", (home,)
            ).fetchone()
        result = view(row)
        with db() as c:
            reset = c.execute(
                "SELECT phase,report,qr_required,qr_verified FROM hub_resets WHERE home=?", (home,)
            ).fetchone()
        result["reset"] = (
            {
                "phase": reset["phase"],
                "report": json.loads(reset["report"]),
                "scan_required": bool(reset["qr_required"] and not reset["qr_verified"]),
            }
            if reset
            else None
        )
        result["remote_connected"] = False
        if relay_status_url:
            try:
                with httpx.Client(timeout=2, trust_env=False, follow_redirects=False) as client:
                    response = client.get(relay_status_url)
                    response.raise_for_status()
                    result["remote_connected"] = home in response.json()["connected"]
            except (httpx.HTTPError, ValueError, KeyError, TypeError):
                pass
        if plan:
            draft = json.loads(plan["payload"])
            draft.pop("password_hash", None)
            draft.pop("username", None)
            draft.pop("ha_credentials", None)
            result["plan"] = {
                "id": plan["id"],
                "status": plan["status"],
                "step": plan["step"],
                "error": plan["error"],
                "draft": draft,
            }
        return result

    @app.post("/api/onboarding/{home}")
    def configure(home: str, body: Plan, s=Depends(session)):
        throttle("setup:" + s["account"])
        with db() as c:
            account = c.execute("SELECT * FROM accounts WHERE id=?", (s["account"],)).fetchone()
        with db() as c:
            c.execute("BEGIN IMMEDIATE")
            profile = app.state.require_verified_profile(c, s["account"])
            row = owned(c, home, s)
            current = c.execute("SELECT * FROM onboarding_plans WHERE home=?", (home,)).fetchone()
            reset = c.execute(
                "SELECT * FROM hub_resets WHERE home=? AND phase!='completed'", (home,)
            ).fetchone()
            if reset and (reset["phase"] != "awaiting_owner" or body.mode != "new"):
                raise HTTPException(409, "reset_not_ready")
            if reset and reset["qr_required"] and not reset["qr_verified"]:
                raise HTTPException(409, "reset_qr_required")
            # Identical retry resumes the same operation, never queues a second reset.
            payload = body.model_dump(exclude={"password", "password_repeat", "confirmation"})
            if body.mode != "existing":
                from .hub_credentials import first_name

                username = first_name(profile["full_name"])
                old = json.loads(current["payload"]) if current else {}
                previous_hash = old.get("password_hash", "")
                try:
                    same_password = bool(previous_hash) and passwords.verify(body.password, previous_hash)
                except Exception:
                    same_password = False
                payload.update(
                    username=username,
                    password_hash=previous_hash if same_password else passwords.hash(body.password),
                    cloud_account=account["id"],
                )
                profile = c.execute(
                    "SELECT * FROM customer_profiles WHERE account=?", (s["account"],)
                ).fetchone()
                if profile:
                    payload["profile"] = dict(profile)
            if reset:
                from .reset_credentials import seal

                payload["reset_id"] = reset["id"]
                # Reuse a sealed envelope for idempotent retries; passwords are verified above.
                old = json.loads(current["payload"]) if current else {}
                payload["ha_credentials"] = (
                    old.get("ha_credentials")
                    if old.get("reset_id") == reset["id"]
                    and old.get("password_hash") == payload["password_hash"]
                    else seal(reset["public_key"], reset["id"], payload["username"], body.password)
                )
            if current and json.loads(current["payload"]) == payload:
                if current["status"] == "failed":
                    c.execute("UPDATE onboarding_plans SET status='queued',error='' WHERE home=?", (home,))
                return {"id": current["id"]}
            if current and current["status"] in {"queued", "working"}:
                raise HTTPException(409, "setup_in_progress")
            users = json.loads(row["heartbeat"] or "{}").get("users")
            if body.mode == "new" and users != 0:
                raise HTTPException(409, "existing_users")
            if body.mode == "existing" and not users:
                raise HTTPException(409, "no_existing_user")
            if body.mode == "reset" and body.confirmation != "SLETT BRUKERE OG HISTORIKK":
                raise HTTPException(422, "reset_confirmation_required")
            job = uuid.uuid4().hex
            now = time.time()
            c.execute(
                "INSERT OR REPLACE INTO onboarding_plans VALUES(?,?,?,?,?,?,?,?,?)",
                (home, job, s["account"], json.dumps(payload), "queued", "checking", "", now, now),
            )
            if not reset:
                c.execute("UPDATE homes SET remote_enabled=1 WHERE id=?", (home,))
            if body.mode != "existing":
                c.execute("UPDATE homes SET name=? WHERE id=?", (body.name, home))
            if body.mode == "reset":
                c.execute("DELETE FROM customer_connections WHERE home=?", (home,))
                c.execute("DELETE FROM customer_tokens WHERE home=? AND purpose='signin'", (home,))
                c.execute(
                    "UPDATE support_grants SET decision='revoked',expires=? WHERE home=? AND decision IN ('pending','approved')",
                    (now, home),
                )
            audit(c, s["account"], "onboarding_" + body.mode, home)
        return {"id": job}

    @app.post("/api/hubs/{home}/onboarding/progress")
    def progress(home: str, body: Progress, request: Request, background: BackgroundTasks):
        home_auth(home, request)
        with db() as c:
            changed = c.execute(
                "UPDATE onboarding_plans SET status=?,step=?,error=?,updated=? WHERE home=? AND id=? AND status IN ('queued','working','failed')",
                (body.status, body.step, body.error, time.time(), home, body.id),
            ).rowcount
            if not changed:
                row = c.execute(
                    "SELECT status FROM onboarding_plans WHERE home=? AND id=?", (home, body.id)
                ).fetchone()
                if not row or row["status"] != "completed":
                    raise HTTPException(409, "stale_plan")
            if body.status == "completed":
                c.execute(
                    "UPDATE hub_resets SET phase='completed',public_key='' WHERE home=? AND phase='awaiting_owner'",
                    (home,),
                )
                c.execute("UPDATE factory_hubs SET phase='activated' WHERE home=?", (home,))
                c.execute("UPDATE homes SET remote_enabled=1 WHERE id=?", (home,))
                saved = c.execute("SELECT payload FROM onboarding_plans WHERE home=?", (home,)).fetchone()
                if saved:
                    payload = json.loads(saved["payload"])
                    payload.pop("ha_credentials", None)
                    c.execute(
                        "UPDATE onboarding_plans SET payload=? WHERE home=?", (json.dumps(payload), home)
                    )
                owner = c.execute("SELECT owner FROM homes WHERE id=?", (home,)).fetchone()[0]
                app.state.customer_onboarding_completed(c, owner)
                background.add_task(app.state.deliver_customer_mail)
        return {"saved": True}
