import re
import sqlite3

from fastapi.testclient import TestClient
from test_cloud import ORIGIN, SECRET
from test_onboarding import PLAN, factory, ready_and_claim

from app.cloud import PASSWORDS, create_cloud

PROFILE = dict(
    email="new@example.test",
    full_name="Åse Hansen",
    phone="12345678",
    address="Testveien 1",
    postal_code="1234",
    city="Oslo",
    country="Norge",
)


def mail_token(path, purpose):
    with sqlite3.connect(path) as c:
        body = c.execute("SELECT body FROM mail_outbox ORDER BY id DESC").fetchone()[0]
    return re.search(purpose + r"=([^\s]+)", body).group(1)


def test_registration_verification_and_recovery(tmp_path):
    path = tmp_path / "cloud.sqlite"
    app = create_cloud(path, SECRET)
    c = TestClient(app, base_url=ORIGIN, headers={"Origin": ORIGIN})
    body = {"username": PROFILE["email"], "password": "portal-password-2026"}
    assert c.post("/api/register", json=body).status_code == 422
    assert c.post("/api/register", json=body | {"profile": PROFILE}).status_code == 200
    login = c.post("/api/login", json=body)
    c.headers["X-CSRF-Token"] = login.json()["csrf"]
    assert c.post("/api/homes/claim", json={"code": "x" * 32}).status_code == 403
    assert c.post("/api/customer/verify", json={"token": mail_token(path, "verify")}).status_code == 200
    assert c.post("/api/homes/claim", json={"code": "x" * 32}).status_code == 400
    assert c.post("/api/customer/password/forgot", json={"email": PROFILE["email"]}).status_code == 200
    token = mail_token(path, "token")
    reset = {
        "token": token,
        "password": "new-portal-password-2026",
        "password_repeat": "new-portal-password-2026",
    }
    assert (
        c.post(
            "/api/customer/password/reset", json=reset, headers={"Origin": "https://evil.test"}
        ).status_code
        == 403
    )
    assert (
        c.post("/api/customer/password/reset", json=reset | {"password_repeat": "mismatch12345"}).status_code
        == 422
    )
    assert c.post("/api/customer/password/reset", json=reset).status_code == 200
    assert c.get("/api/session").status_code == 401
    assert c.post("/api/customer/password/reset", json=reset).status_code == 400
    assert c.post("/api/login", json=body).status_code == 401
    assert c.post("/api/login", json=body | {"password": reset["password"]}).status_code == 200
    assert c.post("/api/customer/password/forgot", json={"email": "unknown@example.test"}).json() == {
        "queued": True
    }


def test_admin_credentials_are_home_scoped_and_never_returned_to_owner(tmp_path):
    path, app, staff, owner, other, hub, home, activation, kit = factory(tmp_path)
    ready_and_claim(staff, owner, hub, home, activation)
    job = owner.post("/api/onboarding/" + home, json=PLAN).json()["id"]
    with sqlite3.connect(path) as c:
        c.execute("UPDATE onboarding_plans SET status='completed' WHERE home=?", (home,))
    endpoint = "/api/admin/homes/" + home + "/credentials"
    body = {
        "username": "newadmin",
        "password": "another-hub-password-2026",
        "password_repeat": "another-hub-password-2026",
    }
    assert owner.post(endpoint, json=body).status_code == 403
    assert other.get(endpoint).status_code == 403
    assert staff.post(endpoint, json=body | {"password_repeat": "wrong-pass-123"}).status_code == 422
    result = staff.post(endpoint, json=body)
    assert result.status_code == 200, result.text
    assert "password" not in staff.get(endpoint).text
    command = hub.post("/api/hubs/" + home + "/onboarding/credentials", json={}).json()["change"]
    assert command["home"] == home and command["plan"] == job
    assert PASSWORDS.verify(body["password"], command["password_hash"])
    assert owner.post("/api/hubs/" + home + "/onboarding/credentials", json={}).status_code == 403
    assert staff.post(endpoint, json=body).status_code == 409
    assert (
        hub.post(
            "/api/hubs/" + home + "/onboarding/credentials-result",
            json={"id": command["id"], "success": True},
        ).status_code
        == 200
    )
    assert staff.get(endpoint).json()["status"] == "applied"
    assert hub.post("/api/hubs/" + home + "/onboarding/credentials", json={}).json()["change"] is None
    with sqlite3.connect(path) as c:
        assert c.execute("SELECT password_hash FROM hub_credential_changes").fetchone()[0] == ""
        assert PASSWORDS.verify(
            "test-cloud-password-only",
            c.execute("SELECT password FROM accounts WHERE username='customer'").fetchone()[0],
        )


def test_local_credential_change_is_idempotent_and_targets_only_mapped_admin(tmp_path):
    import asyncio

    from app.hub_onboarding import HubOnboarding
    from app.storage import Store

    store = Store(tmp_path / "hub.sqlite")
    with store.connect() as c:
        c.execute("INSERT INTO users VALUES(1,'owner','oldhash','admin')")
        c.execute("INSERT INTO users VALUES(2,'other','untouched','admin')")
        c.execute("INSERT INTO settings VALUES('cloud_account:owner-account','1')")
        c.execute("INSERT INTO settings VALUES(?,?)", ("onboarding:plan", '["completed"]'))
        c.execute("INSERT INTO sessions VALUES('one',1,'csrf',9999999999)")
        c.execute("INSERT INTO sessions VALUES('two',2,'csrf',9999999999)")
    worker = object.__new__(HubOnboarding)
    worker.store = store
    command = dict(
        id="change1", plan="plan", account="owner-account", username="newname", password_hash="newhash"
    )
    receipts = []

    async def call(action, body):
        if action == "credentials":
            return {"change": command}
        receipts.append(body)
        return {"saved": True}

    worker.call = call
    asyncio.run(worker.update_credentials())
    asyncio.run(worker.update_credentials())
    assert receipts == [{"id": "change1", "success": True}] * 2
    with store.connect() as c:
        assert tuple(c.execute("SELECT name,password FROM users WHERE id=1").fetchone()) == (
            "newname",
            "newhash",
        )
        assert c.execute("SELECT password FROM users WHERE id=2").fetchone()[0] == "untouched"
        assert [r[0] for r in c.execute("SELECT token FROM sessions")] == ["two"]
    command.update(id="stale", plan="previous-setup", password_hash="must-not-apply")
    asyncio.run(worker.update_credentials())
    assert receipts[-1] == {"id": "stale", "success": False}
