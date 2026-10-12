import concurrent.futures
import time

import pytest
from app.config import Settings
from app.demo import Demo
from app.main import create_app
from app.mobile import MobileAuth
from app.storage import Store
from fastapi import HTTPException
from fastapi.testclient import TestClient


@pytest.fixture
def pilot(tmp_path):
    settings = Settings(
        _env_file=None,
        mode="demo",
        data_dir=tmp_path,
        origin="https://web.example",
        mobile_enabled=True,
        bootstrap_secret="mobile-pilot-secret-at-least-24",
    )
    web = create_app(settings, Demo())
    native = create_app(settings, Demo(), mobile_only=True)
    with (
        TestClient(web, base_url="https://web.example") as browser,
        TestClient(native, base_url="https://mobile.example") as phone,
    ):
        browser.headers["origin"] = settings.origin
        credentials = {"name": "owner", "password": "test mobile password"}
        browser.post("/api/bootstrap", json=credentials | {"secret": settings.bootstrap_secret})
        login = browser.post("/api/login", json=credentials)
        browser.headers["x-csrf-token"] = login.json()["csrf"]
        yield web, browser, phone


def pair(browser, phone):
    invitation = browser.post("/api/mobile/pairings").json()
    response = phone.post(
        "/api/mobile/v1/pair",
        json={
            "installation_id": invitation["installation_id"],
            "code": invitation["code"],
            "device_name": "Test phone",
        },
    )
    assert response.status_code == 200
    tokens = response.json()
    phone.headers["authorization"] = "Bearer " + tokens["access_token"]
    return tokens, invitation


def test_mobile_journey_and_immediate_revocation(pilot):
    web, browser, phone = pilot
    tokens, invitation = pair(browser, phone)
    assert phone.get("/api/mobile/v1/home").json()["mode"] == "demo"
    assert (
        phone.post(
            "/api/mobile/v1/controls/light.living_pendant/commands", json={"action": "turn_off"}
        ).status_code
        == 200
    )
    assert (
        phone.post(
            "/api/mobile/v1/controls/climate.living/commands",
            json={"action": "set_temperature", "value": 200},
        ).status_code
        == 422
    )
    assert (
        phone.post(
            "/api/mobile/v1/pair",
            json={
                "installation_id": invitation["installation_id"],
                "code": invitation["code"],
                "device_name": "Second",
            },
        ).status_code
        == 403
    )
    assert browser.delete("/api/mobile/devices/" + tokens["device_id"]).status_code == 200
    assert phone.get("/api/mobile/v1/home").status_code == 401
    assert (
        phone.post(
            "/api/mobile/v1/refresh",
            json={"installation_id": invitation["installation_id"], "refresh_token": tokens["refresh_token"]},
        ).status_code
        == 401
    )
    database = web.state.store.path.read_bytes()
    assert tokens["access_token"].encode() not in database
    assert tokens["refresh_token"].encode() not in database
    assert invitation["code"].encode() not in database


def test_refresh_rotation_reuse_revokes_family(pilot):
    _, browser, phone = pilot
    tokens, invitation = pair(browser, phone)
    body = {"installation_id": invitation["installation_id"], "refresh_token": tokens["refresh_token"]}
    rotated = phone.post("/api/mobile/v1/refresh", json=body).json()
    assert phone.get("/api/mobile/v1/home").status_code == 401
    phone.headers["authorization"] = "Bearer " + rotated["access_token"]
    assert phone.get("/api/mobile/v1/home").status_code == 200
    assert phone.post("/api/mobile/v1/refresh", json=body).status_code == 401
    assert phone.get("/api/mobile/v1/home").status_code == 401


def test_native_boundary_does_not_accept_web_sessions(pilot):
    _, browser, phone = pilot
    assert phone.get("/api/home").status_code == 404
    assert phone.post("/api/bootstrap", json={}).status_code == 404
    phone.cookies.update(browser.cookies)
    assert phone.get("/api/mobile/v1/home").status_code == 401
    assert (
        phone.post("/api/mobile/v1/pair", headers={"origin": "https://web.example"}, json={}).status_code
        == 403
    )
    assert phone.get("http://mobile.example/api/mobile/v1/home").status_code == 403
    assert browser.post("/api/mobile/v1/pair", json={}).status_code in {404, 405}
    csrf = browser.headers.pop("x-csrf-token")
    assert browser.post("/api/mobile/pairings").status_code == 403
    browser.headers["x-csrf-token"] = csrf


def test_pairing_expiry_wrong_home_and_cancellation(pilot):
    web, browser, phone = pilot
    invitation = browser.post("/api/mobile/pairings").json()
    body = {
        "installation_id": "00000000-0000-0000-0000-000000000000",
        "code": invitation["code"],
        "device_name": "Phone",
    }
    assert phone.post("/api/mobile/v1/pair", json=body).json()["detail"] == "wrong_installation"
    body["installation_id"] = invitation["installation_id"]
    with web.state.store.connect() as db:
        db.execute("UPDATE mobile_pairings SET expires=?", (time.time() - 1,))
    assert phone.post("/api/mobile/v1/pair", json=body).status_code == 403
    invitation = browser.post("/api/mobile/pairings").json()
    body["code"] = invitation["code"]
    browser.delete("/api/mobile/pairings")
    assert phone.post("/api/mobile/v1/pair", json=body).status_code == 403


def test_atomic_claim_and_identity_survives_restart(pilot):
    web, browser, _ = pilot
    mobile = web.state.mobile
    invitation = browser.post("/api/mobile/pairings").json()

    def claim():
        try:
            return mobile.claim(invitation["installation_id"], invitation["code"], "Phone")
        except HTTPException as error:
            return error.status_code

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: claim(), range(2)))
    assert sum(isinstance(r, dict) for r in results) == 1
    assert 403 in results
    assert MobileAuth(Store(web.state.store.path)).installation_id == invitation["installation_id"]


def test_disabled_by_default(tmp_path):
    s = Settings(_env_file=None, data_dir=tmp_path, mode="demo")
    with TestClient(create_app(s, Demo(), mobile_only=True), base_url="https://localhost") as phone:
        assert phone.get("/api/mobile/v1/session").status_code == 404


def test_role_changes_expiry_and_other_users_devices(pilot):
    web, browser, phone = pilot
    tokens, _ = pair(browser, phone)
    with web.state.store.connect() as db:
        db.execute("UPDATE users SET role='user' WHERE id=1")
    assert (
        phone.post(
            "/api/mobile/v1/controls/automation.evening/commands", json={"action": "turn_off"}
        ).status_code
        == 403
    )
    with pytest.raises(HTTPException) as error:
        web.state.mobile.revoke(999, tokens["device_id"])
    assert error.value.status_code == 404
    assert phone.get("/api/mobile/v1/home").status_code == 200
    with web.state.store.connect() as db:
        db.execute("UPDATE mobile_access SET expires=0")
    assert phone.get("/api/mobile/v1/home").status_code == 401
    response = phone.post(
        "/api/mobile/v1/refresh",
        json={"installation_id": tokens["installation_id"], "refresh_token": tokens["refresh_token"]},
    )
    assert response.status_code == 200
    phone.headers["authorization"] = "Bearer " + response.json()["access_token"]
    with web.state.store.connect() as db:
        db.execute("UPDATE mobile_devices SET expires=0")
    assert phone.get("/api/mobile/v1/home").status_code == 401


def test_atomic_refresh_replay_revokes_winning_token(pilot):
    web, browser, phone = pilot
    tokens, _ = pair(browser, phone)

    def refresh():
        try:
            return web.state.mobile.refresh(tokens["installation_id"], tokens["refresh_token"])
        except HTTPException as error:
            return error.status_code

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: refresh(), range(2)))
    assert 401 in results
    winners = [r for r in results if isinstance(r, dict)]
    assert len(winners) == 1
    with pytest.raises(HTTPException):
        web.state.mobile.session(winners[0]["access_token"])


def test_pair_budget_and_new_invitation_invalidates_old(pilot):
    _, browser, phone = pilot
    old = browser.post("/api/mobile/pairings").json()
    browser.post("/api/mobile/pairings").raise_for_status()
    body = {"installation_id": old["installation_id"], "code": old["code"], "device_name": "Phone"}
    for _ in range(8):
        assert phone.post("/api/mobile/v1/pair", json=body).status_code == 403
    assert phone.post("/api/mobile/v1/pair", json=body).status_code == 429


def test_upgrade_from_version_two_preserves_users_and_sessions(tmp_path):
    import sqlite3

    from app.storage import MIGRATIONS

    path = tmp_path / "existing.sqlite3"
    with sqlite3.connect(path) as db:
        db.executescript(MIGRATIONS[0] + MIGRATIONS[1] + "PRAGMA user_version=2;")
        db.execute("INSERT INTO users VALUES (1,'existing','hashed-password','admin')")
        db.execute("INSERT INTO sessions VALUES ('existing-token',1,'existing-csrf',9999999999)")
    store = Store(path)
    identity = MobileAuth(store).installation_id
    with store.connect() as db:
        assert db.execute("PRAGMA user_version").fetchone()[0] == 3
        assert db.execute("SELECT name FROM users").fetchone()[0] == "existing"
        assert db.execute("SELECT token FROM sessions").fetchone()[0] == "existing-token"
    assert MobileAuth(Store(path)).installation_id == identity
