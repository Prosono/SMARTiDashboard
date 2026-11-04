import json
import sqlite3
import time
import uuid
from types import SimpleNamespace
from urllib.parse import urlparse

import httpx
import pytest
from app.auth import Auth, digest
from app.cloud import create_cloud
from app.config import Settings
from app.customer_access import CustomerAccess
from app.demo import Demo
from app.main import create_app
from app.session_policy import SESSION_COOKIE_SECONDS, SESSION_EXPIRY
from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.datastructures import Headers
from test_api import app, client, login  # noqa: F401
from test_cloud import ORIGIN, SECRET, account, code, provision


def test_local_session_survives_weeks_renews_cookie_and_still_revokes(client, app, monkeypatch):  # noqa: F811
    result = login(client)
    token = client.cookies.get("smarti_session")
    assert f"Max-Age={SESSION_COOKIE_SECONDS}" in result.headers["set-cookie"]
    now = time.time()
    with monkeypatch.context() as clock:
        clock.setattr(time, "time", lambda: now + 45 * 86400)
        assert client.get("/api/session").status_code == 200
        renewed = client.post("/api/session")
        assert renewed.status_code == 200
        assert f"Max-Age={SESSION_COOKIE_SECONDS}" in renewed.headers["set-cookie"]
        assert "HttpOnly" in renewed.headers["set-cookie"]
        assert "SameSite=strict" in renewed.headers["set-cookie"]
        assert client.post("/api/session", headers={"x-csrf-token": "wrong"}).status_code == 403
        assert client.post("/api/logout").status_code == 200
        client.cookies.set("smarti_session", token)
        assert client.get("/api/session").status_code == 401


def test_upgrade_only_preserves_still_valid_local_sessions(client, app):  # noqa: F811
    login(client)
    with app.state.store.connect() as db:
        db.execute("UPDATE sessions SET expires=?", (time.time() + 60,))
        db.execute("INSERT INTO sessions VALUES ('expired',1,'csrf',0)")
    Auth(app.state.store, app.state.auth.settings)
    with app.state.store.connect() as db:
        assert db.execute("SELECT expires FROM sessions WHERE token='expired'").fetchone()[0] == 0
        assert (
            db.execute(
                "SELECT expires FROM sessions WHERE token=?", (digest(client.cookies.get("smarti_session")),)
            ).fetchone()[0]
            == SESSION_EXPIRY
        )
    assert client.get("/api/session").status_code == 200


def test_portal_and_home_sessions_survive_weeks_and_home_logout_blocks_replay(tmp_path, monkeypatch):
    path = tmp_path / "cloud.sqlite"
    cloud = create_cloud(path, SECRET)
    owner = account(cloud, "resident")
    operator, house = provision(cloud, "Test home")
    home = house["installation_id"]
    assert owner.post("/api/homes/claim", json={"code": code(operator, house)}).status_code == 200
    hub = TestClient(cloud, base_url=ORIGIN, headers={"Authorization": "Bearer " + house["credential"]})
    link = owner.post(f"/api/customer/homes/{home}/open")
    assert link.status_code == 200, link.text
    issued = hub.post(
        f"/api/hubs/{home}/customer/redeem", json={"token": urlparse(link.json()["url"]).fragment}
    )
    assert issued.status_code == 200
    connection = issued.json()["token"]
    now = time.time()
    with monkeypatch.context() as clock:
        clock.setattr(time, "time", lambda: now + 45 * 86400)
        renewed = owner.get("/api/session")
        assert renewed.status_code == 200
        assert f"Max-Age={SESSION_COOKIE_SECONDS}" in renewed.headers["set-cookie"]
        assert hub.post(f"/api/hubs/{home}/customer/check", json={"token": connection}).status_code == 200
        assert hub.post(f"/api/hubs/{home}/customer/logout", json={"token": connection}).status_code == 200
        assert hub.post(f"/api/hubs/{home}/customer/check", json={"token": connection}).status_code == 401
        assert owner.get("/api/homes").status_code == 200
        assert owner.post("/api/logout").status_code == 200
        assert owner.get("/api/session").status_code == 401


def test_cloud_restart_does_not_resurrect_expired_sessions(tmp_path):
    path = tmp_path / "cloud.sqlite"
    cloud = create_cloud(path, SECRET)
    account(cloud, "resident")
    _, home = provision(cloud, "Test")
    with sqlite3.connect(path) as db:
        db.execute("UPDATE sessions SET expires=?", (time.time() + 60,))
        db.execute("INSERT INTO sessions SELECT 'expired',account,'csrf',0 FROM sessions LIMIT 1")
        account_id = db.execute("SELECT account FROM sessions LIMIT 1").fetchone()[0]
        db.execute(
            "INSERT INTO customer_connections VALUES('valid',?,?, 'csrf',?)",
            (account_id, home["installation_id"], time.time() + 60),
        )
        db.execute(
            "INSERT INTO customer_connections VALUES('expired',?,?,'csrf',0)",
            (account_id, home["installation_id"]),
        )
    create_cloud(path, SECRET)
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT expires FROM sessions WHERE token='expired'").fetchone()[0] == 0
        assert (
            db.execute("SELECT expires FROM sessions WHERE token<>'expired'").fetchone()[0] == SESSION_EXPIRY
        )
        assert dict(db.execute("SELECT hash,expires FROM customer_connections")) == {
            "valid": SESSION_EXPIRY,
            "expired": 0,
        }


def test_remote_browser_renews_secure_cookie_and_logout_revokes_server_credential(tmp_path):
    cloud = create_cloud(tmp_path / "cloud.sqlite", SECRET)
    owner = account(cloud, "resident")
    operator, house = provision(cloud, "Home")
    home = house["installation_id"]
    assert owner.post("/api/homes/claim", json={"code": code(operator, house)}).status_code == 200
    identity = tmp_path / "identity"
    identity.write_text(json.dumps(house))
    origin = f"https://{home}.home.smarti.dev"
    application = create_app(
        Settings(
            _env_file=None, mode="demo", data_dir=tmp_path / "hub", origin=origin, auto_local_origins=False
        ),
        Demo(),
        remote_surface=True,
        support_identity=identity,
    )
    application.state.customer.transport = httpx.ASGITransport(app=cloud)
    browser = TestClient(application, base_url=origin, headers={"Origin": origin})
    link = owner.post(f"/api/customer/homes/{home}/open").json()["url"]
    assert (
        browser.post("/api/customer-access/redeem", json={"token": urlparse(link).fragment}).status_code
        == 200
    )
    token = browser.cookies.get("__Host-smarti_customer")
    session = browser.get("/api/session").json()
    browser.headers["X-CSRF-Token"] = session["csrf"]
    renewed = browser.post("/api/session")
    assert renewed.status_code == 200
    cookie = renewed.headers["set-cookie"]
    assert "Secure" in cookie and "HttpOnly" in cookie and "SameSite=strict" in cookie
    assert f"Max-Age={SESSION_COOKIE_SECONDS}" in cookie
    assert browser.post("/api/logout").status_code == 200
    assert (
        browser.get("/api/session", headers={"Cookie": "__Host-smarti_customer=" + token}).status_code == 401
    )


@pytest.mark.parametrize(
    "status,expected", [(401, 401), (403, 401), (404, 401), (429, 503), (500, 503), (502, 503), (503, 503)]
)
async def test_remote_validation_distinguishes_denial_from_temporary_errors(tmp_path, status, expected):
    identity = tmp_path / "identity"
    identity.write_text(json.dumps({"installation_id": str(uuid.uuid4()), "credential": "x" * 48}))
    customer = CustomerAccess(identity, None, transport=httpx.MockTransport(lambda _: httpx.Response(status)))
    with pytest.raises(HTTPException) as failure:
        await customer.cloud("check", "t" * 48)
    assert failure.value.status_code == expected


@pytest.mark.parametrize("status,event", [(503, "unavailable"), (401, "expired")])
async def test_event_stream_only_expires_a_confirmed_invalid_session(tmp_path, status, event):
    origin = f"https://{uuid.uuid4()}.home.smarti.dev"
    application = create_app(
        Settings(_env_file=None, mode="demo", data_dir=tmp_path, origin=origin, auto_local_origins=False),
        Demo(),
        remote_surface=True,
        support_identity=tmp_path / "identity",
    )

    async def user(_):
        raise HTTPException(status, "test")

    application.state.customer.user = user

    async def connected():
        return False

    request = SimpleNamespace(headers=Headers(), cookies={}, is_disconnected=connected)
    endpoint = next(r.endpoint for r in application.routes if getattr(r, "path", None) == "/api/events")
    response = await endpoint(request=request, poll=False, current={"customer": True})
    frames = [frame async for frame in response.body_iterator]
    assert frames == [f"event: {event}\ndata: {{}}\n\n"]
