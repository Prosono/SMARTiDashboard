import pytest
from app.config import Settings
from app.demo import Demo
from app.main import create_app
from fastapi.testclient import TestClient

SECRET = "test-bootstrap-secret-at-least-24"
ORIGIN = "http://localhost:5173"


@pytest.fixture
def app(tmp_path):
    return create_app(
        Settings(mode="demo", data_dir=tmp_path, development=True, origin=ORIGIN, bootstrap_secret=SECRET),
        Demo(),
    )


@pytest.fixture
def client(app):
    with TestClient(app) as client:
        client.headers["origin"] = ORIGIN
        yield client


def login(client, name="owner", password="correct horse battery"):
    client.post("/api/bootstrap", json={"name": name, "password": password, "secret": SECRET})
    r = client.post("/api/login", json={"name": name, "password": password})
    assert r.status_code == 200
    client.headers["x-csrf-token"] = r.json()["csrf"]
    return r


def test_bootstrap_is_not_first_browser_wins(client):
    r = client.post(
        "/api/bootstrap", json={"name": "owner", "password": "correct horse battery", "secret": "bad"}
    )
    assert r.status_code == 403
    assert not client.get("/api/bootstrap").json()["configured"]
    login(client)
    assert (
        client.post(
            "/api/bootstrap", json={"name": "other", "password": "correct horse battery", "secret": SECRET}
        ).status_code
        == 409
    )


def test_auth_csrf_origin_and_logout(client):
    assert client.get("/api/home").status_code == 401
    login(client)
    assert client.get("/api/home").headers["cache-control"] == "no-store"
    path = "/api/controls/light.living_pendant/commands"
    assert (
        client.post(path, json={"action": "turn_off"}, headers={"origin": "https://evil.example"}).status_code
        == 403
    )
    assert (
        client.post(path, json={"action": "turn_off"}, headers={"x-csrf-token": "forged"}).status_code == 403
    )
    assert client.post(path, json={"action": "turn_off"}).json()["status"] == "simulated"
    old = client.cookies.get("smarti_session")
    assert client.post("/api/logout").status_code == 200
    client.cookies.set("smarti_session", old)
    assert client.get("/api/home").status_code == 401


def test_commands_validate_capabilities_values_and_availability(client):
    login(client)

    def command(entity, **body):
        return client.post(f"/api/controls/{entity}/commands", json=body)

    assert command("climate.living", action="set_temperature", value=50).status_code == 422
    assert command("climate.living", action="set_temperature", value=21.1).status_code == 422
    assert command("climate.living", action="set_temperature", value=22.5).status_code == 200
    assert command("switch.kitchen", action="set_brightness", value=40).status_code == 422
    assert command("sensor.bedroom_temperature", action="turn_off").status_code == 422
    assert command("light.bedroom", action="turn_on").status_code == 409
    assert command("light.missing", action="turn_on").status_code == 404
    assert command("light.living_pendant", action="turn_on", value=4).status_code == 422
    assert command("light.living_pendant", action="toggle").status_code == 422


def test_user_roles_and_forged_headers(client):
    login(client)
    assert (
        client.post("/api/users", json={"name": "resident", "password": "another good password"}).status_code
        == 200
    )
    client.post("/api/logout")
    r = client.post("/api/login", json={"name": "resident", "password": "another good password"})
    client.headers["x-csrf-token"] = r.json()["csrf"]
    client.headers["x-remote-user-id"] = "admin"
    assert client.get("/api/session").json()["role"] == "user"
    assert (
        client.post(
            "/api/users", json={"name": "intruder", "password": "another good password", "role": "admin"}
        ).status_code
        == 403
    )
    assert (
        client.post("/api/controls/automation.evening/commands", json={"action": "turn_off"}).status_code
        == 403
    )
    assert client.get("/api/setup/providers").status_code == 403


def test_live_never_falls_back_to_demo(tmp_path):
    settings = Settings(
        mode="live", data_dir=tmp_path, development=True, origin=ORIGIN, bootstrap_secret=SECRET
    )
    with TestClient(create_app(settings)) as c:
        c.headers["origin"] = ORIGIN
        login(c)
        data = c.get("/api/home").json()
        assert data["mode"] == "live"
        assert data["controls"] == []
        assert data["areas"] == []
        assert not data["connected"]
        assert c.get("/healthz").json()["status"] == "running"


def test_ingress_rejects_lan_even_with_forged_headers(tmp_path):
    settings = Settings(
        mode="demo", data_dir=tmp_path, ingress=True, origin="https://ha.example", bootstrap_secret=SECRET
    )
    with TestClient(create_app(settings)) as c:
        assert (
            c.get(
                "/api/bootstrap", headers={"x-forwarded-for": "172.30.32.2", "x-ingress-path": "/fake"}
            ).status_code
            == 403
        )


def test_ingress_cookie_path_and_secure(tmp_path):
    settings = Settings(
        mode="demo",
        data_dir=tmp_path,
        ingress=True,
        ingress_proxy="testclient",
        origin="https://ha.example",
        bootstrap_secret=SECRET,
    )
    with TestClient(create_app(settings), base_url="https://ha.example") as c:
        c.headers.update({"origin": "https://ha.example", "x-ingress-path": "/api/hassio_ingress/test"})
        r = login(c)
        cookie = r.headers["set-cookie"]
        assert "Secure" in cookie and "HttpOnly" in cookie and "SameSite=strict" in cookie
        assert "Path=/api/hassio_ingress/test/" in cookie


def test_rate_limit(client):
    for _ in range(8):
        assert (
            client.post("/api/login", json={"name": "owner", "password": "a wrong password"}).status_code
            == 401
        )
    assert (
        client.post("/api/login", json={"name": "owner", "password": "a wrong password"}).status_code == 429
    )


def test_favorites_are_private_and_persisted(client, app):
    login(client)
    assert client.put("/api/favorites/light.living_pendant").json()["favorite"]
    assert client.get("/api/home").json()["favorites"] == ["light.living_pendant"]
    assert not client.put("/api/favorites/light.living_pendant").json()["favorite"]
    assert client.put("/api/favorites/light.missing").status_code == 404


def test_https_required(tmp_path):
    with pytest.raises(ValueError):
        create_app(Settings(data_dir=tmp_path, origin="http://192.168.1.5"))
    with pytest.raises(ValueError):
        create_app(Settings(data_dir=tmp_path, development=True, origin="http://192.168.1.5"))


def test_session_expiry_and_setup_capabilities(client, app):
    login(client)
    providers = client.get("/api/setup/providers").json()
    assert {p["id"] for p in providers} == {"zwave_js", "zigbee2mqtt"}
    assert all(p["status"] == "demo" for p in providers)
    with app.state.store.connect() as db:
        db.execute("UPDATE sessions SET expires=0")
    assert client.get("/api/home").status_code == 401
    assert client.get("/api/events").status_code == 401


def test_database_is_owner_only(app):
    assert app.state.store.path.stat().st_mode & 0o777 == 0o600


def test_favorite_survives_entity_id_rename(client, app):
    login(client)
    client.put("/api/favorites/light.living_pendant")
    ha = app.state.ha
    entity = ha.entities.pop("light.living_pendant")
    entity["entity_id"] = "light.renamed"
    ha.entities["light.renamed"] = entity
    state = ha.states.pop("light.living_pendant")
    state["entity_id"] = "light.renamed"
    ha.states["light.renamed"] = state
    assert client.get("/api/home").json()["favorites"] == ["light.renamed"]
    assert client.put("/api/favorites/light.renamed").json()["favorite"] is False


@pytest.mark.parametrize(
    "address,secure", [("https://remote.example", True), ("http://homeassistant.local:8123", False)]
)
def test_multiple_ingress_origins(tmp_path, address, secure):
    settings = Settings(
        mode="demo",
        data_dir=tmp_path,
        ingress=True,
        ingress_proxy="testclient",
        origin="https://remote.example",
        additional_origins=["http://homeassistant.local:8123"],
        allow_http_ingress=True,
        bootstrap_secret=SECRET,
    )
    with TestClient(create_app(settings, Demo()), base_url=address) as c:
        c.headers.update({"origin": address, "x-ingress-path": "/"})
        r = login(c)
        assert ("Secure" in r.headers["set-cookie"]) == secure
        assert c.get("/api/session").status_code == 200
        assert c.put("/api/favorites/light.living_pendant").status_code == 200
        for bad in ["https://evil.example", "null", "https://remote.example.evil.example"]:
            rejected = c.post("/api/logout", headers={"origin": bad})
            assert rejected.status_code == 403
            assert rejected.json() == {"detail": "origin_rejected"}
            assert rejected.headers["cache-control"] == "no-store"
        assert c.post("/api/logout").status_code == 200
        assert c.get("/api/session").status_code == 401


@pytest.mark.parametrize(
    "origin",
    [
        "https://host/path",
        "https://user:pass@host",
        "https://*.example",
        "https://host?x=y",
        "https://host#frag",
        "http://homeassistant.local:8123",
    ],
)
def test_reject_invalid_additional_origins(origin):
    with pytest.raises(ValueError):
        Settings(ingress=True, additional_origins=[origin]).validate_runtime()


def test_http_opt_in_does_not_enable_standalone_http():
    with pytest.raises(ValueError):
        Settings(origin="http://homeassistant.local:8123", allow_http_ingress=True).validate_runtime()


def test_successful_logins_do_not_exhaust_budget_or_erase_failures(client):
    login(client)
    for _ in range(12):
        assert (
            client.post("/api/login", json={"name": "owner", "password": "correct horse battery"}).status_code
            == 200
        )
    for _ in range(7):
        assert (
            client.post("/api/login", json={"name": "owner", "password": "a wrong password"}).status_code
            == 401
        )
    assert (
        client.post("/api/login", json={"name": "owner", "password": "correct horse battery"}).status_code
        == 200
    )
    assert (
        client.post("/api/login", json={"name": "owner", "password": "a wrong password"}).status_code == 401
    )
    assert (
        client.post("/api/login", json={"name": "owner", "password": "a wrong password"}).status_code == 429
    )
