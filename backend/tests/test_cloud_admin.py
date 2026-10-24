import sqlite3
from unittest.mock import patch

from fastapi.testclient import TestClient
from test_cloud import ORIGIN, SECRET, account, code, provision

from app.cloud import create_cloud


def setup(tmp_path, relay=None):
    path = tmp_path / "cloud.sqlite"
    app = create_cloud(path, SECRET, relay_status_url=relay)
    staff = account(app, "support")
    customer = account(app, "customer")
    with sqlite3.connect(path) as c:
        c.execute("INSERT INTO portal_admins SELECT id FROM accounts WHERE username='support'")
    return app, path, staff, customer


def test_admin_requires_role_on_every_request_and_revocation(tmp_path):
    app, path, staff, customer = setup(tmp_path)
    for route in ("/api/admin/overview", "/api/admin/accounts/missing", "/api/admin/audit"):
        assert TestClient(app, base_url=ORIGIN).get(route).status_code == 401
        assert customer.get(route).status_code == 403
    assert staff.get("/api/session").json()["portal_admin"]
    assert not customer.get("/api/session").json()["portal_admin"]
    assert staff.get("/api/admin/overview").status_code == 200
    with sqlite3.connect(path) as c:
        c.execute("DELETE FROM portal_admins")
    assert staff.get("/api/admin/overview").status_code == 403


def test_admin_notes_csrf_audit_and_no_secrets(tmp_path):
    app, path, staff, customer = setup(tmp_path)
    c, home = provision(app, "Home")
    customer.post("/api/homes/claim", json={"code": code(c, home)})
    overview = staff.get("/api/admin/overview").json()
    assert overview["summary"]["customers"] == 1
    assert overview["summary"]["accounts"] == 2
    assert not overview["relay_available"]
    a = next(a for a in overview["customers"] if a["username"] == "customer")
    assert a["homes"][0]["status"] == "unknown"
    assert home["credential"] not in str(overview)
    assert "password" not in str(overview)
    route = "/api/admin/accounts/" + a["id"] + "/notes"
    assert customer.post(route, json={"text": "bad"}).status_code == 403
    assert staff.post(route, json={"text": "bad"}, headers={"X-CSRF-Token": "bad"}).status_code == 403
    assert staff.post(route, json={"text": "   "}).status_code == 422
    assert staff.post(route, json={"text": "Customer will check router."}).status_code == 200
    detail = staff.get("/api/admin/accounts/" + a["id"]).json()
    assert detail["notes"][0]["author"] == "support"
    assert len(detail["notes"]) == 1
    assert {r["action"] for r in staff.get("/api/admin/audit").json()} >= {"add_note", "view_customer"}
    assert customer.get("/api/homes").json()[0]["name"] == "Home"


def test_status_and_literal_search(tmp_path):
    app, path, staff, customer = setup(tmp_path, "http://relay/status")
    c, home = provision(app, "Home")
    customer.post("/api/homes/claim", json={"code": code(c, home)})

    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            return {"connected": [home["installation_id"]]}

    with patch("app.cloud_admin.httpx.Client") as client:
        client.return_value.__enter__.return_value.get.return_value = Response()
        d = staff.get("/api/admin/overview").json()
        assert d["relay_available"] and d["summary"]["online"] == 1
        assert staff.get("/api/admin/overview?q=%25").json()["total"] == 0
    with patch("app.cloud_admin.httpx.Client") as client:
        client.return_value.__enter__.return_value.get.side_effect = ValueError()
        d = staff.get("/api/admin/overview").json()
        assert not d["relay_available"] and d["summary"]["offline"] == 0


def test_staff_customer_pages_redirect_before_rendering(tmp_path):
    app, path, staff, customer = setup(tmp_path)
    destinations = {'/': '/admin', '/account': '/admin', '/support': '/admin/support',
                    '/support/prices': '/admin/support/prices', '/welcome': '/admin',
                    '/activate': '/admin/hubs'}
    for route, destination in destinations.items():
        response = staff.get(route, follow_redirects=False)
        assert response.status_code == 303
        assert response.headers['location'] == destination
        assert response.headers['cache-control'] == 'no-store'
        assert customer.get(route, follow_redirects=False).status_code == 200
    assert staff.get('/admin/support/prices').status_code == 200
    with sqlite3.connect(path) as c:
        c.execute('DELETE FROM portal_admins')
    assert staff.get('/', follow_redirects=False).status_code == 200


def test_architecture_is_admin_only_and_sources_exist(tmp_path):
    import json
    from pathlib import Path

    app, path, staff, customer = setup(tmp_path)
    for route in ("/admin/architecture", "/api/admin/architecture"):
        assert TestClient(app, base_url=ORIGIN).get(route).status_code == 401
        assert customer.get(route).status_code == 403
        assert staff.get(route).status_code == 200
    data = staff.get("/api/admin/architecture").json()
    ids = {n["id"] for n in data["nodes"]}
    assert len(ids) == len(data["nodes"])
    root = Path(__file__).resolve().parents[2]
    for n in data["nodes"]:
        assert 0 <= n["zone"] < len(data["zones"])
        for source in n["sources"]:
            assert (root / source).is_file(), source
    for edge in data["edges"]:
        assert edge["source"] in ids and edge["target"] in ids
    assert "test-cloud-password-only" not in json.dumps(data)
    with sqlite3.connect(path) as c:
        c.execute("DELETE FROM portal_admins")
    assert staff.get("/api/admin/architecture").status_code == 403
    assert staff.get("/admin/architecture").status_code == 403


def test_admin_changes_only_own_password_and_keeps_current_session(tmp_path):
    app, path, staff, customer = setup(tmp_path)
    other = TestClient(app, base_url=ORIGIN, headers={"Origin": ORIGIN})
    assert other.post('/api/login', json={'username':'support','password':'test-cloud-password-only'}).status_code == 200
    route = '/api/admin/account/password'
    body = {'current_password':'test-cloud-password-only','password':'new-admin-password-2026','password_confirmation':'new-admin-password-2026'}
    assert customer.post(route, json=body).status_code == 403
    assert customer.get('/admin/account').status_code == 403
    assert staff.get('/api/admin/account').json() == {'username':'support'}
    assert staff.post(route, json=body, headers={'X-CSRF-Token':'wrong'}).status_code == 403
    assert staff.post(route, json=body | {'current_password':'wrong'}).status_code == 400
    assert staff.post(route, json=body | {'password_confirmation':'different-password'}).status_code == 422
    assert staff.post(route, json=body | {'password':'short','password_confirmation':'short'}).status_code == 422
    assert staff.post(route, json=body).status_code == 200
    assert staff.get('/api/admin/account').status_code == 200
    assert other.get('/api/session').status_code == 401
    assert customer.get('/api/session').status_code == 200
    assert other.post('/api/login', json={'username':'support','password':'test-cloud-password-only'}).status_code == 401
    assert other.post('/api/login', json={'username':'support','password':body['password']}).status_code == 200
    audit=staff.get('/api/admin/audit').json()
    assert any(r['action']=='change_own_password' for r in audit)
    assert body['password'] not in str(audit)


def test_admin_password_verification_is_rate_limited(tmp_path):
    app, path, staff, customer = setup(tmp_path)
    body={'current_password':'incorrect','password':'new-admin-password','password_confirmation':'new-admin-password'}
    for _ in range(8):
        assert staff.post('/api/admin/account/password',json=body).status_code == 400
    assert staff.post('/api/admin/account/password',json=body).status_code == 429
