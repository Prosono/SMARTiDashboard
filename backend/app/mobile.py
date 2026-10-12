"""Local mobile credentials. No cloud account or shared HA token reaches a phone."""

import secrets
import time
import uuid

from fastapi import HTTPException

from .auth import digest

PAIR_SECONDS = 300
ACCESS_SECONDS = 900
REFRESH_SECONDS = 30 * 86400
DEVICE_SECONDS = 90 * 86400


class MobileAuth:
    def __init__(self, store):
        self.store = store
        with store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute(
                "INSERT OR IGNORE INTO settings(key,value) VALUES ('installation_id',?)",
                (str(uuid.uuid4()),),
            )
            self.installation_id = db.execute(
                "SELECT value FROM settings WHERE key='installation_id'"
            ).fetchone()[0]

    def audit(self, db, event, user_id, device_id=None):
        db.execute(
            "INSERT INTO mobile_audit(event,user_id,device_id,created) VALUES (?,?,?,?)",
            (event, user_id, device_id, time.time()),
        )

    def issue_pairing(self, user_id):
        code = secrets.token_urlsafe(32)
        now = time.time()
        with self.store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            # At most one outstanding invitation per account. Old QR codes stop working.
            db.execute("DELETE FROM mobile_pairings WHERE user_id=? OR expires<=?", (user_id, now))
            db.execute(
                "INSERT INTO mobile_pairings(code,user_id,expires) VALUES (?,?,?)",
                (digest(code), user_id, now + PAIR_SECONDS),
            )
            self.audit(db, "pairing_created", user_id)
        return {"installation_id": self.installation_id, "code": code, "expires_at": now + PAIR_SECONDS}

    def cancel_pairing(self, user_id):
        with self.store.connect() as db:
            db.execute("DELETE FROM mobile_pairings WHERE user_id=?", (user_id,))
            self.audit(db, "pairing_cancelled", user_id)

    def tokens(self, db, device_id, absolute_expiry):
        now = time.time()
        access, refresh = secrets.token_urlsafe(48), secrets.token_urlsafe(48)
        access_expiry = min(now + ACCESS_SECONDS, absolute_expiry)
        db.execute("DELETE FROM mobile_access WHERE device_id=? OR expires<=?", (device_id, now))
        db.execute(
            "INSERT INTO mobile_access(token,device_id,expires) VALUES (?,?,?)",
            (digest(access), device_id, access_expiry),
        )
        db.execute(
            "INSERT INTO mobile_refresh(token,device_id,expires,used) VALUES (?,?,?,0)",
            (digest(refresh), device_id, min(now + REFRESH_SECONDS, absolute_expiry)),
        )
        return {
            "installation_id": self.installation_id,
            "device_id": device_id,
            "token_type": "Bearer",
            "access_token": access,
            "refresh_token": refresh,
            "expires_at": access_expiry,
            "device_expires_at": absolute_expiry,
        }

    def claim(self, installation_id, code, name):
        if installation_id != self.installation_id:
            raise HTTPException(403, "wrong_installation")
        now = time.time()
        with self.store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute(
                "SELECT p.user_id FROM mobile_pairings p JOIN users u ON u.id=p.user_id "
                "WHERE code=? AND expires>?",
                (digest(code), now),
            ).fetchone()
            if not row:
                raise HTTPException(403, "pairing_invalid_or_expired")
            device_id = str(uuid.uuid4())
            db.execute("DELETE FROM mobile_pairings WHERE code=?", (digest(code),))
            db.execute(
                "INSERT INTO mobile_devices(id,user_id,name,created,expires,revoked) VALUES (?,?,?,?,?,0)",
                (device_id, row["user_id"], name, now, now + DEVICE_SECONDS),
            )
            self.audit(db, "device_paired", row["user_id"], device_id)
            return self.tokens(db, device_id, now + DEVICE_SECONDS)

    def refresh(self, installation_id, token):
        if installation_id != self.installation_id:
            raise HTTPException(403, "wrong_installation")
        now = time.time()
        result = None
        with self.store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute(
                "SELECT r.used,r.expires AS refresh_expires,d.* FROM mobile_refresh r "
                "JOIN mobile_devices d ON d.id=r.device_id JOIN users u ON u.id=d.user_id WHERE r.token=?",
                (digest(token),),
            ).fetchone()
            if row and not row["revoked"] and row["expires"] > now:
                if row["used"]:
                    # Commit the revocation before raising; reused tokens invalidate this phone.
                    self._revoke(db, row["id"], row["user_id"], "refresh_reused")
                elif row["refresh_expires"] > now:
                    db.execute("UPDATE mobile_refresh SET used=1 WHERE token=?", (digest(token),))
                    result = self.tokens(db, row["id"], row["expires"])
        if result is None:
            raise HTTPException(401, "mobile_authentication_required")
        return result

    def session(self, token):
        now = time.time()
        with self.store.connect() as db:
            row = db.execute(
                "SELECT u.id,u.name,u.role,d.id AS device_id FROM mobile_access a "
                "JOIN mobile_devices d ON d.id=a.device_id JOIN users u ON u.id=d.user_id "
                "WHERE a.token=? AND a.expires>? AND d.expires>? AND d.revoked=0",
                (digest(token), now, now),
            ).fetchone()
            if not row:
                raise HTTPException(401, "mobile_authentication_required")
            return dict(row)

    def devices(self, user_id):
        with self.store.connect() as db:
            return [
                dict(r)
                for r in db.execute(
                    "SELECT id,name,created,expires,revoked FROM mobile_devices WHERE user_id=? ORDER BY created DESC",
                    (user_id,),
                )
            ]

    def _revoke(self, db, device_id, user_id, event):
        db.execute("UPDATE mobile_devices SET revoked=1 WHERE id=?", (device_id,))
        db.execute("DELETE FROM mobile_access WHERE device_id=?", (device_id,))
        db.execute("DELETE FROM mobile_refresh WHERE device_id=?", (device_id,))
        self.audit(db, event, user_id, device_id)

    def revoke(self, user_id, device_id):
        with self.store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute(
                "SELECT id FROM mobile_devices WHERE id=? AND user_id=?", (device_id, user_id)
            ).fetchone()
            if not row:
                raise HTTPException(404, "mobile_device_not_found")
            self._revoke(db, device_id, user_id, "device_revoked")
