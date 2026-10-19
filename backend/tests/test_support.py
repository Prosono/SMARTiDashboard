import json
import sqlite3
import time

import httpx
from fastapi.testclient import TestClient
from test_cloud import ORIGIN, SECRET, account, code, provision

from app.cloud import create_cloud
from app.config import Settings
from app.demo import Demo
from app.main import create_app
from app.support_access import COOKIE


def environment(tmp_path):
    db = tmp_path / "cloud.sqlite"
    portal = create_cloud(db, SECRET)
    staff, second = account(portal, "support"), account(portal, "otherstaff")
    owner, stranger = account(portal, "owner"), account(portal, "stranger")
    with sqlite3.connect(db) as c:
        c.execute(
            "INSERT INTO portal_admins SELECT id FROM accounts WHERE username IN ('support','otherstaff')"
        )
    installer, home = provision(portal, "Home")
    owner.post("/api/homes/claim", json={"code": code(installer, home)})
    prices = owner.get("/api/support/pricing").json()
    draft = {
        "subject": "Automasjon for lys",
        "category": "automation",
        "text": "Kan dere sette opp lysstyring?",
        "home_id": home["installation_id"],
        "billing_accepted": True,
        "pricing_version": prices["version"],
    }
    return db, portal, staff, second, owner, stranger, installer, home, draft


def approved(tmp_path):
    values = environment(tmp_path)
    db, portal, staff, second, owner, stranger, installer, home, draft = values
    id = owner.post("/api/support/cases", json=draft).json()["id"]
    grant = staff.post(
        f"/api/admin/support/cases/{id}/access", json={"reason": "Kontrollere og sette opp lysstyringen."}
    ).json()["id"]
    assert owner.post(f"/api/support/access/{grant}/decision", json={"approve": True}).status_code == 200
    return values, id, grant


def test_case_isolation_billing_snapshot_and_workflow(tmp_path):
    db, portal, staff, second, owner, stranger, installer, home, draft = environment(tmp_path)
    assert owner.post("/api/support/cases", json=draft | {"billing_accepted": False}).status_code == 409
    assert owner.post("/api/support/cases", json=draft | {"pricing_version": "old"}).status_code == 409
    assert stranger.post("/api/support/cases", json=draft).status_code == 403
    id = owner.post("/api/support/cases", json=draft).json()["id"]
    assert stranger.get(f"/api/support/cases/{id}").status_code == 404
    assert stranger.post(f"/api/support/cases/{id}/messages", json={"text": "no"}).status_code == 404
    assert owner.get("/api/admin/support/cases").status_code == 403
    assert TestClient(portal, base_url=ORIGIN).get("/api/admin/support/cases").status_code == 401
    assert (
        staff.patch(
            f"/api/admin/support/cases/{id}", json={"status": "in_progress", "take": True}
        ).status_code
        == 200
    )
    assert (
        staff.post(
            f"/api/admin/support/cases/{id}/messages", json={"text": "Vi avtaler enkel automasjon."}
        ).status_code
        == 200
    )
    t = owner.get(f"/api/support/cases/{id}").json()
    assert t["assignee"] == "support" and t["status"] == "in_progress"
    assert len(t["messages"]) == 2
    old = t["pricing"]
    assert (
        staff.put(
            "/api/admin/support/pricing",
            json={k: old[k] for k in ["hourly", "simple", "complex", "advanced", "terms"]} | {"hourly": 599},
        ).status_code
        == 200
    )
    assert owner.get(f"/api/support/cases/{id}").json()["pricing"] == old
    assert (
        owner.post(
            f"/api/support/cases/{id}/messages", json={"text": "hi"}, headers={"X-CSRF-Token": "bad"}
        ).status_code
        == 403
    )


def test_owner_consent_expiry_one_time_home_binding_and_revocation(tmp_path):
    values = environment(tmp_path)
    db, portal, staff, second, owner, stranger, installer, home, draft = values
    id = owner.post("/api/support/cases", json=draft).json()["id"]
    grant = staff.post(
        f"/api/admin/support/cases/{id}/access", json={"reason": "Kontrollere lysstyringen."}
    ).json()["id"]
    linkpath = f"/api/admin/support/access/{grant}/link"
    assert staff.post(linkpath).status_code == 403
    assert stranger.post(f"/api/support/access/{grant}/decision", json={"approve": True}).status_code == 404
    assert (
        owner.post(
            f"/api/support/access/{grant}/decision", json={"approve": True}, headers={"X-CSRF-Token": "bad"}
        ).status_code
        == 403
    )
    assert owner.post(f"/api/support/access/{grant}/decision", json={"approve": True}).status_code == 200
    assert owner.post(f"/api/support/access/{grant}/decision", json={"approve": True}).status_code == 409
    assert second.post(linkpath).status_code == 403
    link = staff.post(linkpath).json()
    secret = link["url"].split("#")[1]
    _, wrong = provision(portal, "Wrong home")
    wrong_headers = {"Authorization": "Bearer " + wrong["credential"]}
    assert (
        installer.post(
            f"/api/hubs/{wrong['installation_id']}/support/redeem",
            headers=wrong_headers,
            json={"code": secret},
        ).status_code
        == 403
    )
    headers = {"Authorization": "Bearer " + home["credential"]}
    base = f"/api/hubs/{home['installation_id']}/support"
    redeemed = installer.post(base + "/redeem", headers=headers, json={"code": secret})
    assert redeemed.status_code == 200
    assert installer.post(base + "/redeem", headers=headers, json={"code": secret}).status_code == 403
    token = redeemed.json()["token"]
    assert installer.post(base + "/check", headers=headers, json={"token": token}).status_code == 200
    owner.post(f"/api/support/access/{grant}/decision", json={"approve": False})
    assert installer.post(base + "/check", headers=headers, json={"token": token}).status_code == 403
    assert staff.post(linkpath).status_code == 403


def test_hub_support_session_scope_no_user_creation_and_owner_revocation(tmp_path):
    values, id, grant = approved(tmp_path)
    db, portal, staff, second, owner, stranger, installer, home, draft = values
    identity = tmp_path / "identity.json"
    identity.write_text(json.dumps(home))
    origin = f"https://{home['installation_id']}.home.smarti.dev"
    settings = Settings(
        _env_file=None,
        mode="demo",
        data_dir=tmp_path / "hub",
        origin=origin,
        auto_local_origins=False,
        mobile_enabled=True,
    )
    app = create_app(settings, Demo(), remote_surface=True, support_identity=identity)
    app.state.support.transport = httpx.ASGITransport(app=portal)
    browser = TestClient(app, base_url=origin, headers={"Origin": origin})
    link = staff.post(f"/api/admin/support/access/{grant}/link").json()["url"]
    assert browser.post("/api/support-access/redeem", json={"code": link.split("#")[1]}).status_code == 200
    session = browser.get("/api/session")
    assert session.status_code == 200 and session.json()["support"]["ticket"] == id
    browser.headers["X-CSRF-Token"] = session.json()["csrf"]
    assert browser.get("/api/home").status_code == 200
    assert (
        browser.post("/api/controls/light.living_pendant/commands", json={"action": "turn_on"}).status_code
        == 200
    )
    assert (
        browser.post(
            "/api/controls/light.living_pendant/commands",
            json={"action": "turn_on"},
            headers={"X-CSRF-Token": "wrong"},
        ).status_code
        == 403
    )
    assert browser.get("/api/manage/accounts").status_code == 403
    assert browser.post("/api/mobile/pairings").status_code == 403
    assert browser.post("/api/manage/console/open", json={}).status_code == 403
    assert browser.get("/api/home/camera-stream/test").status_code in {403, 404}
    with app.state.store.connect() as c:
        assert c.execute("SELECT count(*) FROM users").fetchone()[0] == 0
    assert COOKIE in browser.cookies
    owner.post(f"/api/support/access/{grant}/decision", json={"approve": False})
    assert browser.get("/api/home").status_code == 401


def test_admin_session_logout_closure_expiry_fail_closed(tmp_path):
    values, id, grant = approved(tmp_path)
    db, portal, staff, second, owner, stranger, installer, home, draft = values
    link = staff.post(f"/api/admin/support/access/{grant}/link").json()["url"]
    headers = {"Authorization": "Bearer " + home["credential"]}
    base = f"/api/hubs/{home['installation_id']}/support"
    token = installer.post(base + "/redeem", headers=headers, json={"code": link.split("#")[1]}).json()[
        "token"
    ]
    with sqlite3.connect(db) as c:
        c.execute("UPDATE support_grants SET expires=?", (time.time() - 1,))
    assert installer.post(base + "/check", headers=headers, json={"token": token}).status_code == 403
    with sqlite3.connect(db) as c:
        c.execute("UPDATE support_grants SET expires=?", (time.time() + 100,))
    staff.post("/api/logout")
    assert installer.post(base + "/check", headers=headers, json={"token": token}).status_code == 403
    second.patch(f"/api/admin/support/cases/{id}", json={"status": "closed"})
    with sqlite3.connect(db) as c:
        assert c.execute("SELECT decision FROM support_grants").fetchone()[0] == "revoked"
