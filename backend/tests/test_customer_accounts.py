import hashlib
import hmac
import sqlite3
import time
from urllib.parse import urlparse

from fastapi.testclient import TestClient
from test_cloud import ORIGIN
from test_onboarding import PLAN, factory, ready_and_claim

from app.multihome_relay import HomeRegistry

PROFILE = dict(
    email="owner@example.com",
    full_name="Test Person",
    phone="+4712345678",
    address="Testveien 1",
    postal_code="1234",
    city="Oslo",
    country="Norge",
    photo="",
)


def finish(owner, hub, home):
    job = owner.post(f"/api/onboarding/{home}", json=PLAN).json()["id"]
    r = hub.post(
        f"/api/hubs/{home}/onboarding/progress", json=dict(id=job, status="completed", step="completed")
    )
    assert r.status_code == 200, r.text


def test_new_qr_needs_no_pin_but_cannot_take_owned_home(tmp_path):
    path, app, staff, owner, other, hub, home, activation, kit = factory(tmp_path)
    with sqlite3.connect(path) as c:
        nonce = c.execute("select label_nonce from factory_hubs").fetchone()[0]
    from test_cloud import SECRET

    code = (
        "v2."
        + hmac.new(SECRET.encode(), ("hub-qr-v2:" + home + ":" + nonce).encode(), hashlib.sha256).hexdigest()
    )
    anonymous = TestClient(app, base_url=ORIGIN)
    assert anonymous.post(f"/api/activation/{home}/identify", json={"code": code}).status_code == 200
    ready_and_claim(staff, owner, hub, home, activation)
    assert other.post(f"/api/activation/{home}/claim", json={"code": code}).status_code == 409
    assert (
        anonymous.post(f"/api/activation/{home}/identify", json={"code": activation["code"]}).status_code
        == 404
    )


def test_verification_grace_relay_pause_and_recovery(tmp_path):
    path, app, staff, owner, other, hub, home, activation, kit = factory(tmp_path)
    assert owner.put("/api/customer/profile", json=PROFILE).status_code == 200
    ready_and_claim(staff, owner, hub, home, activation)
    finish(owner, hub, home)
    registry = HomeRegistry(path)
    assert registry.credential(home)
    with sqlite3.connect(path) as c:
        deadline = c.execute("select deadline from customer_profiles").fetchone()[0]
        assert 86400 * 10 - 10 < deadline - time.time() <= 86400 * 10
        body = c.execute("select body from mail_outbox").fetchone()[0]
        token = body.split("#verify=")[1].split()[0]
        c.execute("update customer_profiles set deadline=?", (time.time() - 1,))
    assert registry.credential(home) is None
    assert hub.get(f"/api/hubs/{home}/status").json()["remote_enabled"] is False
    assert owner.post(f"/api/customer/homes/{home}/open").status_code == 403
    anonymous = TestClient(app, base_url=ORIGIN, headers={"Origin": ORIGIN})
    assert anonymous.post("/api/customer/verify", json={"token": token}).status_code == 200
    assert anonymous.post("/api/customer/verify", json={"token": token}).status_code == 400
    assert registry.credential(home)
    assert hub.get(f"/api/hubs/{home}/status").json()["remote_enabled"] is True


def test_single_use_home_bound_signin_and_member_revoke(tmp_path):
    path, app, staff, owner, other, hub, home, activation, kit = factory(tmp_path)
    owner.put("/api/customer/profile", json=PROFILE)
    other.put("/api/customer/profile", json=PROFILE | {"email": "guest@example.com"})
    ready_and_claim(staff, owner, hub, home, activation)
    assert owner.post(f"/api/customer/homes/{home}/open").status_code == 409
    finish(owner, hub, home)
    link = owner.post(f"/api/customer/homes/{home}/open").json()["url"]
    token = urlparse(link).fragment
    response = hub.post(f"/api/hubs/{home}/customer/redeem", json={"token": token})
    assert response.status_code == 200
    connection = response.json()["token"]
    assert hub.post(f"/api/hubs/{home}/customer/redeem", json={"token": token}).status_code == 401
    assert hub.post(f"/api/hubs/{home}/customer/check", json={"token": connection}).json()["role"] == "admin"
    assert (
        other.post(f"/api/customer/homes/{home}/invitations", json={"email": "x@example.com"}).status_code
        == 404
    )
    assert (
        owner.post(
            f"/api/customer/homes/{home}/invitations", json={"email": "guest@example.com", "name": "Guest"}
        ).status_code
        == 200
    )
    with sqlite3.connect(path) as c:
        body = c.execute("select body from mail_outbox where recipient='guest@example.com'").fetchone()[0]
    assert "Hei Guest!" in body
    invite = body.split("#invite=")[1].split()[0]
    assert owner.post("/api/customer/invitations/accept", json={"token": invite}).status_code == 400
    assert other.post("/api/customer/invitations/accept", json={"token": invite}).status_code == 200
    assert other.post("/api/customer/invitations/accept", json={"token": invite}).status_code == 400
    assert other.get("/api/homes").json()[0]["installation_id"] == home
    members = owner.get(f"/api/customer/homes/{home}/members").json()
    assert {m["role"] for m in members} == {"owner", "member"}
    assert len(members) == 2
    assert other.get(f"/api/customer/homes/{home}/members").status_code == 404
    link = other.post(f"/api/customer/homes/{home}/open").json()["url"]
    token = hub.post(f"/api/hubs/{home}/customer/redeem", json={"token": urlparse(link).fragment}).json()[
        "token"
    ]
    info = hub.post(f"/api/hubs/{home}/customer/check", json={"token": token}).json()
    assert info["role"] == "user"
    assert owner.delete(f"/api/customer/homes/{home}/members/{info['account']}").status_code == 200
    assert hub.post(f"/api/hubs/{home}/customer/check", json={"token": token}).status_code == 401


def test_complete_registration_atomic_and_profile_private(tmp_path):
    path, app, staff, owner, other, hub, home, activation, kit = factory(tmp_path)
    client = TestClient(app, base_url=ORIGIN, headers={"Origin": ORIGIN})
    body = {"username": PROFILE["email"], "password": "long-test-password", "profile": PROFILE}
    assert client.post("/api/register", json=body).status_code == 200
    assert client.get("/api/customer/profile").status_code == 401
    csrf = client.post("/api/login", json=body).json()["csrf"]
    client.headers["X-CSRF-Token"] = csrf
    profile = client.get("/api/customer/profile").json()["profile"]
    assert profile["full_name"] == PROFILE["full_name"] and profile["deadline"] is None
    assert client.post("/api/register", json=body | {"username": "mismatch@example.com"}).status_code == 422
    assert (
        client.put(
            "/api/customer/profile", json=PROFILE | {"photo": "data:image/svg+xml;base64,PHN2Zz4="}
        ).status_code
        == 422
    )


async def test_hub_customer_mapping_does_not_claim_local_admin(tmp_path):
    from types import SimpleNamespace

    import pytest
    from fastapi import HTTPException

    from app.config import Settings
    from app.customer_access import CustomerAccess
    from app.storage import Store

    store = Store(Settings(data_dir=tmp_path).database)
    with store.connect() as c:
        c.execute("INSERT INTO users(name,password,role) VALUES('same@example.com','unused','admin')")
    customer = CustomerAccess(None, store)
    info = {"account": "a" * 32, "name": "same@example.com", "role": "admin", "csrf": "csrf", "profile": None}

    async def fake(action, token):
        return info

    customer.cloud = fake
    request = SimpleNamespace(method="GET", cookies={}, headers={})
    owner = await customer.user(request)
    assert owner["id"] != 1 and owner["role"] == "admin"
    assert (await customer.user(request))["id"] == owner["id"]
    info["role"] = "user"
    user = await customer.user(request)
    assert user["id"] != 1 and user["role"] == "user"
    with store.connect() as c:
        assert c.execute("select count(*) from users").fetchone()[0] == 2
    assert (await customer.user(request))["id"] == user["id"]

    request.method = "POST"
    with pytest.raises(HTTPException) as failure:
        await customer.user(request)
    assert failure.value.status_code == 403
    request.headers = {"x-csrf-token": "csrf"}
    assert (await customer.user(request))["id"] == user["id"]


def test_existing_and_legacy_owner_can_open_but_stranger_cannot(tmp_path):
    import json

    path, app, staff, owner, other, hub, home, activation, kit = factory(tmp_path)
    ready_and_claim(staff, owner, hub, home, activation)
    finish(owner, hub, home)
    with sqlite3.connect(path) as c:
        c.execute("UPDATE onboarding_plans SET payload=?", (json.dumps(PLAN | {"mode": "existing"}),))
    for legacy in (False, True):
        if legacy:
            with sqlite3.connect(path) as c:
                c.execute("DELETE FROM onboarding_plans")
                c.execute("DELETE FROM factory_hubs")
        assert other.post(f"/api/customer/homes/{home}/open").status_code == 404
        result = owner.post(f"/api/customer/homes/{home}/open")
        assert result.status_code == 200, result.text
        token = urlparse(result.json()["url"]).fragment
        redeemed = hub.post(f"/api/hubs/{home}/customer/redeem", json={"token": token})
        assert redeemed.status_code == 200
        info = hub.post(f"/api/hubs/{home}/customer/check", json={"token": redeemed.json()["token"]})
        assert info.json()["role"] == "admin"


def test_remote_session_is_established_without_password_and_logout_clears_it(tmp_path):
    import uuid

    from app.config import Settings
    from app.demo import Demo
    from app.main import create_app

    origin = f"https://{uuid.uuid4()}.home.smarti.dev"
    settings = Settings(
        _env_file=None, mode="demo", data_dir=tmp_path, origin=origin, auto_local_origins=False
    )
    app = create_app(settings, Demo(), remote_surface=True, support_identity=tmp_path / "identity")

    async def fake(action, token):
        if action == "redeem":
            return {"token": "t" * 48, "expires": time.time() + 60}
        return {
            "account": "b" * 32,
            "name": "guest@example.com",
            "role": "user",
            "csrf": "test-csrf",
            "profile": None,
        }

    app.state.customer.cloud = fake
    client = TestClient(app, base_url=origin, headers={"Origin": origin})
    assert client.get("/_account").status_code == 200
    assert client.get("/_account/launch.css").status_code == 200
    assert client.get("/_account/logo.png").headers["content-type"] == "image/png"
    result = client.post("/api/customer-access/redeem", json={"token": "x" * 48})
    assert result.status_code == 200
    assert "__Host-smarti_customer=" in result.headers["set-cookie"]
    assert "Secure" in result.headers["set-cookie"] and "HttpOnly" in result.headers["set-cookie"]
    session = client.get("/api/session")
    assert session.status_code == 200, session.text
    assert session.json()["name"] == "guest@example.com" and session.json()["role"] == "user"
    assert client.get("/api/manage/accounts").status_code == 403
    assert client.post("/api/logout").status_code == 403
    assert client.post("/api/logout", headers={"X-CSRF-Token": "test-csrf"}).status_code == 200
    assert client.get("/api/session").status_code == 401


def test_mail_queue_retries_and_erases_delivered_links(tmp_path, monkeypatch):
    path, app, staff, owner, other, hub, home, activation, kit = factory(tmp_path)
    owner.put("/api/customer/profile", json=PROFILE)
    ready_and_claim(staff, owner, hub, home, activation)
    finish(owner, hub, home)
    monkeypatch.setenv("SMARTI_SMTP_HOST", "smtp.test.invalid")
    monkeypatch.setenv("SMARTI_MAIL_FROM", "SMARTi <sender@example.com>")
    monkeypatch.delenv("SMARTI_SMTP_USER", raising=False)
    sent = []

    class SMTP:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def starttls(self, context):
            assert context.check_hostname

        def send_message(self, message):
            sent.append(message)

    monkeypatch.setattr("app.cloud_accounts.smtplib.SMTP", SMTP)
    app.state.deliver_customer_mail()
    app.state.deliver_customer_mail()
    assert len(sent) == 1 and sent[0]["To"] == PROFILE["email"]
    with sqlite3.connect(path) as c:
        row = c.execute("select body,sent from mail_outbox").fetchone()
        assert row[0] == "" and row[1]
