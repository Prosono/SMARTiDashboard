"""Explicit, atomic account removal; hub ownership is never silently released."""

import time
from typing import Literal

from fastapi import Depends, HTTPException, Response
from pydantic import BaseModel, StrictBool


class DeleteAccount(BaseModel):
    confirmation: Literal["DELETE"]
    understood: StrictBool


def install_account_deletion(app, db, session):
    # Audit identifiers are retained without a foreign key or customer profile.
    with db() as c:
        c.execute("""CREATE TABLE IF NOT EXISTS deleted_account_audit(
            actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT, created REAL NOT NULL)""")

    def check(c, account):
        if not c.execute("SELECT 1 FROM accounts WHERE id=?", (account,)).fetchone():
            raise HTTPException(404, "account_not_found")
        if (
            c.execute("SELECT 1 FROM homes WHERE owner=?", (account,)).fetchone()
            or c.execute("SELECT 1 FROM home_members WHERE account=?", (account,)).fetchone()
        ):
            return "account_has_hubs"
        if c.execute("SELECT 1 FROM portal_admins WHERE account=?", (account,)).fetchone():
            if c.execute("SELECT count(*) FROM portal_admins").fetchone()[0] <= 1:
                return "last_admin"
        if c.execute(
            "SELECT 1 FROM onboarding_plans WHERE owner=? AND status IN ('queued','working')", (account,)
        ).fetchone():
            return "onboarding_in_progress"
        return None

    def authorize(c, s, admin):
        # Recheck inside the write transaction, including revoked sessions/roles.
        if not c.execute(
            "SELECT 1 FROM sessions WHERE token=? AND expires>?", (s["token"], time.time())
        ).fetchone():
            raise HTTPException(401, "authentication_required")
        if admin and not c.execute("SELECT 1 FROM portal_admins WHERE account=?", (s["account"],)).fetchone():
            raise HTTPException(403, "portal_admin_required")

    def eligibility(account, s, admin=False):
        with db() as c:
            authorize(c, s, admin)
            reason = check(c, account)
        return {"can_delete": reason is None, "reason": reason}

    def remove(account, body, response, s, admin=False):
        if not body.understood:
            raise HTTPException(422, "confirmation_required")
        with db() as c:
            c.execute("BEGIN IMMEDIATE")
            authorize(c, s, admin)
            reason = check(c, account)
            if reason:
                raise HTTPException(409, reason)
            email = c.execute("SELECT email FROM customer_profiles WHERE account=?", (account,)).fetchone()
            grants = "SELECT id FROM support_grants WHERE owner=? OR admin=? OR ticket IN (SELECT id FROM support_cases WHERE owner=?)"
            for table in ("support_codes", "support_connections"):
                c.execute(f"DELETE FROM {table} WHERE grant_id IN ({grants})", (account,) * 3)
            c.execute(f"DELETE FROM support_grants WHERE id IN ({grants})", (account,) * 3)
            c.execute(
                "DELETE FROM case_messages WHERE author=? OR ticket IN (SELECT id FROM support_cases WHERE owner=?)",
                (account, account),
            )
            c.execute("DELETE FROM support_cases WHERE owner=?", (account,))
            c.execute("UPDATE support_cases SET assigned=NULL WHERE assigned=?", (account,))
            c.execute("DELETE FROM support_notes WHERE account=? OR author=?", (account, account))
            c.execute(
                "INSERT INTO deleted_account_audit SELECT actor,action,target,created FROM admin_audit WHERE actor=?",
                (account,),
            )
            c.execute("DELETE FROM admin_audit WHERE actor=?", (account,))
            c.execute(
                "INSERT INTO deleted_account_audit VALUES(?,?,?,?)",
                (s["account"], "account_deleted", account, time.time()),
            )
            c.execute("DELETE FROM onboarding_plans WHERE owner=?", (account,))
            c.execute("DELETE FROM hub_credential_changes WHERE account=?", (account,))
            c.execute("DELETE FROM push_limits WHERE target=?", (account,))
            if email:
                c.execute("DELETE FROM customer_tokens WHERE email=?", (email[0],))
                c.execute("DELETE FROM mail_outbox WHERE recipient=?", (email[0],))
            for table in (
                "sessions",
                "customer_tokens",
                "customer_connections",
                "customer_consents",
                "customer_profiles",
                "portal_admins",
            ):
                c.execute(f"DELETE FROM {table} WHERE account=?", (account,))
            c.execute("DELETE FROM accounts WHERE id=?", (account,))
        if account == s["account"]:
            response.delete_cookie("__Host-smarti_cloud", secure=True, httponly=True, samesite="strict")
        return {"deleted": True, "self": account == s["account"]}

    @app.get("/api/customer/account/deletion")
    def customer_check(s=Depends(session)):
        return eligibility(s["account"], s)

    @app.delete("/api/customer/account")
    def customer_delete(body: DeleteAccount, response: Response, s=Depends(session)):
        return remove(s["account"], body, response, s)

    @app.get("/api/admin/accounts/{account}/deletion")
    def admin_check(account: str, s=Depends(session)):
        return eligibility(account, s, True)

    @app.delete("/api/admin/accounts/{account}")
    def admin_delete(account: str, body: DeleteAccount, response: Response, s=Depends(session)):
        return remove(account, body, response, s, True)
