import inspect
import re
import sqlite3
import time
from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient

from app.cloud import create_cloud

ORIGIN = "https://home.smarti.dev"
SECRET = "test-provision-" + "x" * 40


def account(app, name):
    c = TestClient(app, base_url=ORIGIN)
    c.headers["Origin"] = ORIGIN
    body = {"username": name, "password": "test-cloud-password-only"}
    profile = dict(
        email=name + "@example.test",
        full_name=name + " Customer",
        phone="12345678",
        address="Test street 1",
        postal_code="1234",
        city="Oslo",
        country="Norge",
    )
    response = c.post("/api/register", json=body | {"profile": profile})
    assert response.status_code == 200, response.text
    # Exercise the real email verification URL from the test outbox.
    route = next(r for r in app.routes if getattr(r, "path", None) == "/api/customer/verify")
    db = inspect.getclosurevars(route.endpoint).nonlocals["db"]
    with db() as connection:
        mail = connection.execute(
            "SELECT body FROM mail_outbox WHERE recipient=? ORDER BY id DESC", (profile["email"],)
        ).fetchone()[0]
    token = re.search(r"verify=([^\s]+)", mail).group(1)
    assert c.post("/api/customer/verify", json={"token": token}).status_code == 200
    login = c.post("/api/login", json=body)
    assert login.status_code == 200
    c.headers["X-CSRF-Token"] = login.json()["csrf"]
    return c


def provision(app, name):
    c = TestClient(app, base_url=ORIGIN)
    home = c.post(
        "/api/provision/homes", headers={"Authorization": "Bearer " + SECRET}, json={"name": name}
    ).json()
    return c, home


def code(c, home):
    response = c.post(
        "/api/hubs/" + home["installation_id"] + "/claim-code",
        headers={"Authorization": "Bearer " + home["credential"]},
    )
    assert response.status_code == 200
    return response.json()["code"]


def test_multi_home_account_isolation_and_single_use(tmp_path):
    app = create_cloud(tmp_path / "cloud.sqlite", SECRET)
    alice, bob = account(app, "alice"), account(app, "bob")
    c, house = provision(app, "Hjemme")
    _, cabin = provision(app, "Hytta")
    _, other = provision(app, "Et annet hjem")
    first = code(c, house)
    for home, owner in [(house, alice), (cabin, alice), (other, bob)]:
        token = first if home == house else code(c, home)
        assert owner.post("/api/homes/claim", json={"code": token}).status_code == 200
        assert bob.post("/api/homes/claim", json={"code": token}).status_code == 400
    assert {h["name"] for h in alice.get("/api/homes").json()} == {"Hjemme", "Hytta"}
    assert [h["name"] for h in bob.get("/api/homes").json()] == ["Et annet hjem"]
    assert "credential" not in str(alice.get("/api/homes").json())
    assert (
        c.post(
            "/api/hubs/" + house["installation_id"] + "/claim-code",
            headers={"Authorization": "Bearer " + house["credential"]},
        ).status_code
        == 409
    )


def test_claim_rotation_expiration_and_wrong_hub_credential(tmp_path):
    path = tmp_path / "cloud.sqlite"
    app = create_cloud(path, SECRET)
    alice = account(app, "alice")
    c, house = provision(app, "Hjemme")
    _, other = provision(app, "Other")
    assert (
        c.post(
            "/api/hubs/" + house["installation_id"] + "/claim-code",
            headers={"Authorization": "Bearer " + other["credential"]},
        ).status_code
        == 403
    )
    old, new = code(c, house), code(c, house)
    assert alice.post("/api/homes/claim", json={"code": old}).status_code == 400
    with sqlite3.connect(path) as db:
        db.execute("UPDATE claims SET expires=?", (time.time() - 1,))
    assert alice.post("/api/homes/claim", json={"code": new}).status_code == 400
    assert alice.get("/api/homes").json() == []


def test_claim_race_has_exactly_one_owner(tmp_path):
    app = create_cloud(tmp_path / "cloud.sqlite", SECRET)
    alice, bob = account(app, "alice"), account(app, "bob")
    c, house = provision(app, "Hjemme")
    token = code(c, house)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(
            pool.map(lambda client: client.post("/api/homes/claim", json={"code": token}), [alice, bob])
        )
    assert sorted(r.status_code for r in results) == [200, 400]
    assert len(alice.get("/api/homes").json()) + len(bob.get("/api/homes").json()) == 1


def test_auth_boundaries_logout_and_secret_storage(tmp_path):
    path = tmp_path / "cloud.sqlite"
    app = create_cloud(path, SECRET)
    alice = account(app, "alice")
    assert (
        alice.post(
            "/api/homes/claim", json={"code": "x" * 32}, headers={"Origin": "https://evil.example"}
        ).status_code
        == 403
    )
    assert (
        alice.post("/api/homes/claim", json={"code": "x" * 32}, headers={"X-CSRF-Token": "bad"}).status_code
        == 403
    )
    assert alice.post("/api/provision/homes", json={"name": "Not allowed"}).status_code == 403
    assert alice.post("/api/logout").status_code == 200
    assert alice.get("/api/homes").status_code == 401
    c, home = provision(app, "Hjemme")
    token = code(c, home)
    with sqlite3.connect(path) as db:
        assert home["credential"] not in str(db.execute("SELECT * FROM homes").fetchall())
        assert token not in str(db.execute("SELECT * FROM claims").fetchall())
        assert "test-cloud-password-only" not in str(db.execute("SELECT * FROM accounts").fetchall())
    page = c.get("/")
    assert page.status_code == 200
    assert "frame-ancestors 'none'" in page.headers["content-security-policy"]
    assert c.get("/assets/app.js").status_code == 200


def test_brute_force_is_limited(tmp_path):
    app = create_cloud(tmp_path / "cloud.sqlite", SECRET)
    c = TestClient(app, base_url=ORIGIN, headers={"Origin": ORIGIN})
    for _ in range(8):
        assert (
            c.post(
                "/api/login",
                json={
                    "username": "nobody",
                    "password": "not-a-real-password",
                },
            ).status_code
            == 401
        )
    assert (
        c.post(
            "/api/login",
            json={
                "username": "nobody",
                "password": "not-a-real-password",
            },
        ).status_code
        == 429
    )


def test_remote_revocation_is_owner_scoped_and_registry_enforced(tmp_path):
    from app.multihome_relay import HomeRegistry

    path = tmp_path / "cloud.sqlite"
    app = create_cloud(path, SECRET)
    alice, bob = account(app, "alice"), account(app, "bob")
    c, house = provision(app, "Hjemme")
    registry = HomeRegistry(path)
    home_id = house["installation_id"]
    assert registry.credential(home_id) is None  # Unclaimed hubs cannot connect.
    assert alice.post("/api/homes/claim", json={"code": code(c, house)}).status_code == 200
    assert registry.credential(home_id)
    assert bob.delete(f"/api/homes/{home_id}/remote").status_code == 404
    assert registry.credential(home_id)
    assert alice.delete(f"/api/homes/{home_id}/remote").status_code == 200
    assert registry.credential(home_id) is None
    assert alice.get("/api/homes").json()[0]["remote_enabled"] == 0


def test_invalid_credentials_never_echo_password(tmp_path):
    app = create_cloud(tmp_path / "cloud.sqlite", SECRET)
    c = TestClient(app, base_url=ORIGIN, headers={"Origin": ORIGIN})
    result = c.post("/api/register", json={"username": "validname", "password": "secret"})
    assert result.status_code == 422
    assert "secret" not in result.text


def test_valid_logins_do_not_consume_failure_budget(tmp_path):
    app = create_cloud(tmp_path / "cloud.sqlite", SECRET)
    c = account(app, "alice")
    for _ in range(10):
        response = c.post("/api/login", json={"username": "alice", "password": "test-cloud-password-only"})
        assert response.status_code == 200
        assert "__Host-smarti_cloud=" in response.headers["set-cookie"]
        assert "Domain=" not in response.headers["set-cookie"]


def test_login_checks_existing_password_without_registration_length_rule(tmp_path):
    from app.cloud import PASSWORDS

    path = tmp_path / "cloud.sqlite"
    app = create_cloud(path, SECRET)
    c = TestClient(app, base_url=ORIGIN, headers={"Origin": ORIGIN})
    body = {"username": "existing", "password": "short-test"}
    assert c.post("/api/register", json=body).status_code == 422
    with sqlite3.connect(path) as db:
        db.execute(
            "INSERT INTO accounts VALUES(?,?,?)",
            ("existing-id", "existing", PASSWORDS.hash(body["password"])),
        )
    assert c.post("/api/login", json={**body, "password": "wrong"}).status_code == 401
    assert c.post("/api/login", json=body).status_code == 200
    assert c.get("/api/session").status_code == 200
