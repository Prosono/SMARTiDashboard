import hashlib
import secrets
import time

from fastapi import HTTPException
from pwdlib import PasswordHash

hasher = PasswordHash.recommended()
DUMMY = hasher.hash(secrets.token_urlsafe(32))


def digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


class Auth:
    def __init__(self, store, settings):
        self.store, self.settings = store, settings

    def ready(self):
        with self.store.connect() as db:
            return bool(db.execute("SELECT 1 FROM users LIMIT 1").fetchone())

    def throttle(self, key):
        now = time.time()
        with self.store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("DELETE FROM attempts WHERE reset < ?", (now,))
            row = db.execute("SELECT count FROM attempts WHERE key=?", (key,)).fetchone()
            if row and row[0] >= 8:
                raise HTTPException(429, "rate_limited")
            db.execute(
                "INSERT INTO attempts VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1",
                (key, now + 900),
            )

    def finish_successful_attempt(self, key):
        # Refund this successful login only; preserve prior failures from this source.
        with self.store.connect() as db:
            db.execute("UPDATE attempts SET count=MAX(0,count-1) WHERE key=?", (key,))

    def bootstrap(self, name, password, secret):
        expected = self.settings.bootstrap_secret
        if len(expected) < 24 or not secrets.compare_digest(secret, expected):
            raise HTTPException(403, "invalid_setup_secret")
        with self.store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if db.execute("SELECT 1 FROM users LIMIT 1").fetchone():
                raise HTTPException(409, "already_configured")
            db.execute(
                "INSERT INTO users(name,password,role) VALUES (?,?,'admin')", (name, hasher.hash(password))
            )

    def login(self, name, password):
        with self.store.connect() as db:
            user = db.execute("SELECT * FROM users WHERE name=?", (name,)).fetchone()
            if not hasher.verify(password, user["password"] if user else DUMMY) or not user:
                raise HTTPException(401, "invalid_credentials")
            token, csrf = secrets.token_urlsafe(48), secrets.token_urlsafe(32)
            db.execute("DELETE FROM sessions WHERE expires < ?", (time.time(),))
            db.execute(
                "INSERT INTO sessions VALUES (?,?,?,?)",
                (digest(token), user["id"], csrf, time.time() + self.settings.session_hours * 3600),
            )
            return token, {"name": user["name"], "role": user["role"], "csrf": csrf}

    def session(self, token):
        with self.store.connect() as db:
            row = db.execute(
                "SELECT users.id,users.name,users.role,sessions.csrf FROM sessions "
                "JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?",
                (digest(token or ""), time.time()),
            ).fetchone()
            if not row:
                raise HTTPException(401, "authentication_required")
            return dict(row)

    def logout(self, token):
        with self.store.connect() as db:
            db.execute("DELETE FROM sessions WHERE token=?", (digest(token or ""),))
