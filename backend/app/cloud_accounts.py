"""Customer identity, mail verification, invitations and single-use home sign-in."""

import base64
import hashlib
import os
import re
import secrets
import smtplib
import ssl
import threading
import time
from email.message import EmailMessage
from pathlib import Path

from fastapi import BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


class Profile(BaseModel):
    email: str = Field(max_length=254)
    full_name: str = Field(min_length=2, max_length=120)
    phone: str = Field(min_length=6, max_length=40)
    address: str = Field(min_length=3, max_length=240)
    postal_code: str = Field(min_length=2, max_length=20)
    city: str = Field(min_length=2, max_length=100)
    country: str = Field(min_length=2, max_length=80)
    photo: str = Field(default="", max_length=700000)

    @field_validator("email")
    @classmethod
    def email_valid(cls, value):
        value = value.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("invalid email")
        return value

    @field_validator("photo")
    @classmethod
    def photo_valid(cls, value):
        if value:
            prefix = "data:image/jpeg;base64,"
            if not value.startswith(prefix):
                raise ValueError("JPEG required")
            try:
                raw = base64.b64decode(value[len(prefix) :], validate=True)
            except ValueError:
                raise ValueError("invalid photo") from None
            if not raw.startswith(b"\xff\xd8\xff") or len(raw) > 500000:
                raise ValueError("invalid photo")
        return value


class Token(BaseModel):
    token: str = Field(min_length=32, max_length=128)


class Invitation(BaseModel):
    email: str = Field(max_length=254)
    _email = field_validator("email")(Profile.email_valid.__func__)


def remote_allowed(c, account):
    row = c.execute("SELECT verified,deadline FROM customer_profiles WHERE account=?", (account,)).fetchone()
    return not row or bool(row["verified"] or row["deadline"] is None or row["deadline"] > time.time())


def install_accounts(app, db, session, home_auth, throttle, origin):
    with db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS customer_profiles(
          account TEXT PRIMARY KEY REFERENCES accounts(id), email TEXT UNIQUE NOT NULL,
          full_name TEXT NOT NULL, phone TEXT NOT NULL, address TEXT NOT NULL,
          postal_code TEXT NOT NULL, city TEXT NOT NULL, country TEXT NOT NULL, photo TEXT NOT NULL,
          verified REAL, deadline REAL);
        CREATE TABLE IF NOT EXISTS customer_tokens(
          hash TEXT PRIMARY KEY, account TEXT REFERENCES accounts(id), purpose TEXT NOT NULL,
          home TEXT REFERENCES homes(id), email TEXT, expires REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS home_members(
          home TEXT REFERENCES homes(id), account TEXT REFERENCES accounts(id),
          PRIMARY KEY(home,account));
        CREATE TABLE IF NOT EXISTS customer_connections(
          hash TEXT PRIMARY KEY, account TEXT REFERENCES accounts(id), home TEXT REFERENCES homes(id),
          csrf TEXT NOT NULL, expires REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS mail_outbox(
          id INTEGER PRIMARY KEY, recipient TEXT NOT NULL, subject TEXT NOT NULL,
          body TEXT NOT NULL, created REAL NOT NULL, sent REAL, error TEXT);
        """)

    mail_lock = threading.Lock()

    def deliver():
        if not mail_lock.acquire(blocking=False):
            return
        try:
            deliver_pending()
        finally:
            mail_lock.release()

    def deliver_pending():
        host, sender = os.getenv("SMARTI_SMTP_HOST"), os.getenv("SMARTI_MAIL_FROM")
        if not host or not sender:
            return
        with db() as c:
            rows = c.execute("SELECT * FROM mail_outbox WHERE sent IS NULL ORDER BY id LIMIT 20").fetchall()
        for row in rows:
            try:
                message = EmailMessage()
                message["From"], message["To"], message["Subject"] = sender, row["recipient"], row["subject"]
                message.set_content(row["body"])
                with smtplib.SMTP(host, int(os.getenv("SMARTI_SMTP_PORT", "587")), timeout=15) as smtp:
                    smtp.starttls(context=ssl.create_default_context())
                    user, password_file = (
                        os.getenv("SMARTI_SMTP_USER"),
                        os.getenv("SMARTI_SMTP_PASSWORD_FILE"),
                    )
                    if user:
                        smtp.login(user, Path(password_file).read_text().strip())
                    smtp.send_message(message)
                with db() as c:
                    # Erase bearer links after successful delivery.
                    c.execute(
                        "UPDATE mail_outbox SET sent=?,body='',error=NULL WHERE id=?",
                        (time.time(), row["id"]),
                    )
            except (OSError, smtplib.SMTPException, TypeError, ValueError):
                with db() as c:
                    c.execute("UPDATE mail_outbox SET error='delivery_failed' WHERE id=?", (row["id"],))

    app.state.deliver_customer_mail = deliver

    def queue(c, recipient, subject, body):
        c.execute(
            "INSERT INTO mail_outbox(recipient,subject,body,created) VALUES(?,?,?,?)",
            (recipient, subject, body, time.time()),
        )

    def verification(c, account):
        p = c.execute("SELECT * FROM customer_profiles WHERE account=?", (account,)).fetchone()
        if not p or p["verified"]:
            return
        token = secrets.token_urlsafe(48)
        c.execute("DELETE FROM customer_tokens WHERE account=? AND purpose='verify'", (account,))
        c.execute(
            "INSERT INTO customer_tokens VALUES(?,?,?,?,?,?)",
            (digest(token), account, "verify", None, p["email"], time.time() + 86400 * 10),
        )
        queue(
            c,
            p["email"],
            "Bekreft e-postadressen din hos SMARTi",
            "Velkommen hjem! Bekreft e-postadressen din her:\n"
            + origin
            + "/account#verify="
            + token
            + "\nEtter ti dager kreves bekreftet e-post for fjernaksess. Lokal tilgang påvirkes ikke.",
        )

    def completed(c, account):
        changed = c.execute(
            "UPDATE customer_profiles SET deadline=? WHERE account=? AND deadline IS NULL",
            (time.time() + 86400 * 10, account),
        ).rowcount
        if changed:
            verification(c, account)

    app.state.customer_onboarding_completed = completed

    @app.get("/account")
    def page():
        return FileResponse(Path(__file__).with_name("cloud_web") / "account.html")

    @app.get("/api/customer/profile")
    def profile(s=Depends(session)):
        with db() as c:
            p = c.execute("SELECT * FROM customer_profiles WHERE account=?", (s["account"],)).fetchone()
            return {
                "profile": dict(p) if p else None,
                "remote_allowed": remote_allowed(c, s["account"]),
                "mail_configured": bool(os.getenv("SMARTI_SMTP_HOST") and os.getenv("SMARTI_MAIL_FROM")),
            }

    @app.put("/api/customer/profile")
    def save(body: Profile, s=Depends(session)):
        with db() as c:
            existing = c.execute(
                "SELECT email FROM customer_profiles WHERE account=?", (s["account"],)
            ).fetchone()
            if existing and existing["email"] != body.email:
                raise HTTPException(409, "email_change_requires_verification")
            # E-mail is the new customer's login identifier; never rename legacy accounts implicitly.
            collision = c.execute(
                "SELECT id FROM accounts WHERE username=? AND id<>?", (body.email, s["account"])
            ).fetchone()
            if collision:
                raise HTTPException(409, "email_unavailable")
            import sqlite3

            try:
                c.execute(
                    """INSERT INTO customer_profiles(account,email,full_name,phone,address,postal_code,city,country,photo)
                  VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(account) DO UPDATE SET
                  full_name=excluded.full_name,phone=excluded.phone,address=excluded.address,
                  postal_code=excluded.postal_code,city=excluded.city,country=excluded.country,photo=excluded.photo""",
                    (
                        s["account"],
                        body.email,
                        body.full_name,
                        body.phone,
                        body.address,
                        body.postal_code,
                        body.city,
                        body.country,
                        body.photo,
                    ),
                )
            except sqlite3.IntegrityError:
                raise HTTPException(409, "email_unavailable") from None
        return {"saved": True}

    @app.post("/api/customer/verification")
    def resend(background: BackgroundTasks, s=Depends(session)):
        throttle("verify:" + s["account"])
        with db() as c:
            verification(c, s["account"])
        background.add_task(deliver)
        return {"queued": True}

    @app.post("/api/customer/verify")
    def verify(body: Token, request: Request):
        if request.headers.get("origin") != origin:
            raise HTTPException(403, "origin_rejected")
        throttle("verify-token:" + request.client.host)
        with db() as c:
            c.execute("BEGIN IMMEDIATE")
            row = c.execute(
                "SELECT * FROM customer_tokens WHERE hash=? AND purpose='verify' AND expires>?",
                (digest(body.token), time.time()),
            ).fetchone()
            if not row:
                raise HTTPException(400, "link_expired")
            c.execute(
                "UPDATE customer_profiles SET verified=? WHERE account=? AND email=?",
                (time.time(), row["account"], row["email"]),
            )
            c.execute("DELETE FROM customer_tokens WHERE hash=?", (digest(body.token),))
        return {"verified": True}

    def owner(c, home, account):
        row = c.execute("SELECT owner FROM homes WHERE id=?", (home,)).fetchone()
        if not row or row["owner"] != account:
            raise HTTPException(404, "home_not_found")

    @app.post("/api/customer/homes/{home}/invitations")
    def invite(home: str, body: Invitation, background: BackgroundTasks, s=Depends(session)):
        throttle("invite:" + s["account"])
        with db() as c:
            owner(c, home, s["account"])
            token = secrets.token_urlsafe(48)
            c.execute(
                "DELETE FROM customer_tokens WHERE home=? AND email=? AND purpose='invite'",
                (home, body.email),
            )
            c.execute(
                "INSERT INTO customer_tokens VALUES(?,?,?,?,?,?)",
                (digest(token), s["account"], "invite", home, body.email, time.time() + 86400 * 7),
            )
            queue(
                c,
                body.email,
                "Du er invitert til et SMARTi-hjem",
                "Opprett din egen konto eller logg inn for å bli med i hjemmet. Invitasjonen gir vanlig brukertilgang, ikke administratorrettigheter.\n"
                + origin
                + "/account#invite="
                + token
                + "\nLenken gjelder i sju dager.",
            )
        background.add_task(deliver)
        return {"queued": True}

    @app.post("/api/customer/invitations/accept")
    def accept(body: Token, s=Depends(session)):
        with db() as c:
            c.execute("BEGIN IMMEDIATE")
            row = c.execute(
                "SELECT * FROM customer_tokens WHERE hash=? AND purpose='invite' AND expires>?",
                (digest(body.token), time.time()),
            ).fetchone()
            p = c.execute("SELECT * FROM customer_profiles WHERE account=?", (s["account"],)).fetchone()
            if not row or not p or row["email"] != p["email"]:
                raise HTTPException(400, "invitation_unavailable")
            owner(c, row["home"], row["account"])
            c.execute("INSERT OR IGNORE INTO home_members VALUES(?,?)", (row["home"], s["account"]))
            c.execute("UPDATE customer_profiles SET verified=? WHERE account=?", (time.time(), s["account"]))
            c.execute("DELETE FROM customer_tokens WHERE hash=?", (digest(body.token),))
        return {"home": row["home"]}

    @app.get("/api/customer/homes/{home}/members")
    def members(home: str, s=Depends(session)):
        with db() as c:
            owner(c, home, s["account"])
            return [
                dict(r)
                for r in c.execute(
                    "SELECT a.id,a.username FROM home_members m JOIN accounts a ON a.id=m.account WHERE m.home=?",
                    (home,),
                )
            ]

    @app.delete("/api/customer/homes/{home}/members/{account}")
    def revoke(home: str, account: str, s=Depends(session)):
        with db() as c:
            owner(c, home, s["account"])
            c.execute("DELETE FROM home_members WHERE home=? AND account=?", (home, account))
            c.execute("DELETE FROM customer_connections WHERE home=? AND account=?", (home, account))
        return {"removed": True}

    def permission(c, home, account):
        h = c.execute("SELECT * FROM homes WHERE id=?", (home,)).fetchone()
        if (
            not h
            or not h["remote_enabled"]
            or not remote_allowed(c, h["owner"])
            or not remote_allowed(c, account)
        ):
            raise HTTPException(403, "email_verification_required")
        if h["owner"] == account:
            p = c.execute(
                "SELECT payload,status FROM onboarding_plans WHERE home=? AND owner=?", (home, account)
            ).fetchone()
            # Claimed legacy homes have no onboarding plan. Factory homes must
            # finish setup first, including the non-destructive "existing" mode.
            factory_home = c.execute("SELECT 1 FROM factory_hubs WHERE home=?", (home,)).fetchone()
            if (p and p["status"] != "completed") or (factory_home and not p):
                raise HTTPException(409, "onboarding_required")
            return "admin"
        if c.execute("SELECT 1 FROM home_members WHERE home=? AND account=?", (home, account)).fetchone():
            return "user"
        raise HTTPException(404, "home_not_found")

    @app.post("/api/customer/homes/{home}/open")
    def open_home(home: str, s=Depends(session)):
        with db() as c:
            permission(c, home, s["account"])
            token = secrets.token_urlsafe(48)
            c.execute("DELETE FROM customer_tokens WHERE expires<?", (time.time(),))
            c.execute(
                "INSERT INTO customer_tokens VALUES(?,?,?,?,?,?)",
                (digest(token), s["account"], "signin", home, None, time.time() + 60),
            )
        return {"url": "https://" + home + ".home.smarti.dev/_account#" + token}

    @app.post("/api/hubs/{home}/customer/redeem")
    def redeem(home: str, body: Token, request: Request):
        home_auth(home, request)
        with db() as c:
            c.execute("BEGIN IMMEDIATE")
            row = c.execute(
                "SELECT * FROM customer_tokens WHERE hash=? AND home=? AND purpose='signin' AND expires>?",
                (digest(body.token), home, time.time()),
            ).fetchone()
            if not row:
                raise HTTPException(401, "link_expired")
            permission(c, home, row["account"])
            token, csrf = secrets.token_urlsafe(48), secrets.token_urlsafe(32)
            expires = time.time() + 86400
            c.execute(
                "INSERT INTO customer_connections VALUES(?,?,?,?,?)",
                (digest(token), row["account"], home, csrf, expires),
            )
            c.execute("DELETE FROM customer_tokens WHERE hash=?", (digest(body.token),))
        return {"token": token, "expires": expires}

    @app.post("/api/hubs/{home}/customer/check")
    def check(home: str, body: Token, request: Request):
        home_auth(home, request)
        with db() as c:
            row = c.execute(
                "SELECT * FROM customer_connections WHERE hash=? AND home=? AND expires>?",
                (digest(body.token), home, time.time()),
            ).fetchone()
            if not row:
                raise HTTPException(401, "authentication_required")
            role = permission(c, home, row["account"])
            a = c.execute("SELECT username FROM accounts WHERE id=?", (row["account"],)).fetchone()
            p = c.execute("SELECT * FROM customer_profiles WHERE account=?", (row["account"],)).fetchone()
        return {
            "account": row["account"],
            "name": a["username"],
            "role": role,
            "csrf": row["csrf"],
            "expires": row["expires"],
            "profile": dict(p) if p else None,
        }
