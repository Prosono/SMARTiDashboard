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


def test_event_poll_requires_auth_and_returns_revisions(client):
    assert client.get("/api/events?poll=true").status_code == 401
    login(client)
    response = client.get("/api/events?poll=true")
    assert response.status_code == 200
    assert isinstance(response.json()["revision"], int)
    assert isinstance(response.json()["radio_revision"], int)
    assert response.headers["cache-control"] == "no-store"
    assert client.get("/api/events?poll=true", headers={"origin": "https://evil.example"}).status_code == 403


def test_climate_mode_only_accepts_supported_modes(client):
    login(client)
    path = "/api/controls/climate.living/commands"
    assert client.post(path, json={"action": "set_hvac_mode", "hvac_mode": "auto"}).status_code == 200
    control = next(
        c for c in client.get("/api/home").json()["controls"] if c["entity_id"] == "climate.living"
    )
    assert control["state"] == "auto"
    for body in [
        {"action": "set_hvac_mode", "hvac_mode": "cool"},
        {"action": "set_hvac_mode"},
        {"action": "set_hvac_mode", "hvac_mode": "off", "value": 22},
        {"action": "set_temperature", "hvac_mode": "off", "value": 22},
    ]:
        assert client.post(path, json=body).status_code == 422
    assert (
        client.post(
            "/api/controls/switch.kitchen/commands", json={"action": "set_hvac_mode", "hvac_mode": "off"}
        ).status_code
        == 422
    )


@pytest.mark.asyncio
async def test_climate_mode_ha_service_payload():
    from app.ha import HomeAssistant

    ha = HomeAssistant("http://example.invalid", "unused")
    ha.connected = True

    async def request(kind, **kwargs):
        assert kind == "call_service"
        assert kwargs == {
            "domain": "climate",
            "service": "set_hvac_mode",
            "target": {"entity_id": "climate.stue"},
            "service_data": {"hvac_mode": "cool"},
        }
        ha.states["climate.stue"] = {"context": {"id": "test"}}
        return {"context": {"id": "test"}}

    ha.request = request
    assert (await ha.command("climate.stue", "set_hvac_mode", "cool"))["status"] == "state_updated"


def test_light_appearance_is_persisted_and_admin_only(client, app):
    login(client)
    original = next(c for c in client.get("/api/home").json()["controls"] if c["domain"] == "light")
    route = "/api/controls/" + original["entity_id"] + "/appearance"
    assert client.put(route, json={"name": "Spisebord", "icon": "pendant"}).status_code == 200
    changed = next(
        c for c in client.get("/api/home").json()["controls"] if c["entity_id"] == original["entity_id"]
    )
    assert changed["name"] == "Spisebord"
    assert changed["attributes"]["smarti_icon"] == "pendant"
    assert changed["id"] == original["id"]
    assert client.put(route, json={"name": "Bad", "icon": "<svg>"}).status_code == 422
    assert client.put(route, json={"name": "", "icon": "auto"}).status_code == 200
    restored = next(
        c for c in client.get("/api/home").json()["controls"] if c["entity_id"] == original["entity_id"]
    )
    assert restored["name"] == original["name"]
    client.post(
        "/api/users", json={"name": "resident", "password": "another strong password", "role": "user"}
    )
    r = client.post("/api/login", json={"name": "resident", "password": "another strong password"})
    client.headers["x-csrf-token"] = r.json()["csrf"]
    assert client.put(route, json={"name": "No", "icon": "bulb"}).status_code == 403


def test_visibility_filters_every_control_domain_and_restores(client):
    login(client)
    original = client.get("/api/home").json()["controls"]
    for c in original:
        route = "/api/controls/" + c["entity_id"] + "/visibility"
        assert client.put(route, json={"hidden": True}).status_code == 200
    hidden_home = client.get("/api/home").json()
    assert hidden_home["controls"] == []
    assert hidden_home["devices"] == []
    inventory = client.get("/api/control-visibility").json()
    assert len(inventory) == len(original)
    assert all(c["attributes"]["smarti_hidden"] for c in inventory)
    for c in original:
        assert (
            client.put("/api/controls/" + c["entity_id"] + "/visibility", json={"hidden": False}).status_code
            == 200
        )
    assert len(client.get("/api/home").json()["controls"]) == len(original)
    client.post(
        "/api/users", json={"name": "resident", "password": "another strong password", "role": "user"}
    )
    r = client.post("/api/login", json={"name": "resident", "password": "another strong password"})
    client.headers["x-csrf-token"] = r.json()["csrf"]
    assert client.get("/api/control-visibility").status_code == 403
    assert (
        client.put(
            "/api/controls/" + original[0]["entity_id"] + "/visibility", json={"hidden": True}
        ).status_code
        == 403
    )


def test_media_appearance_is_saved_with_domain_specific_icons(client, app):
    login(client)
    ha = app.state.ha
    ha.states["media_player.speaker"] = {
        "entity_id": "media_player.speaker",
        "state": "idle",
        "attributes": {"friendly_name": "Høyttaler", "device_class": "speaker"},
    }
    route = "/api/controls/media_player.speaker/appearance"
    for icon in ["tv", "speaker", "homepod", "homepod_mini", "soundbar", "radio", "projector"]:
        assert client.put(route, json={"name": "Stue", "icon": icon}).status_code == 200
        c = next(
            c for c in client.get("/api/home").json()["controls"] if c["entity_id"] == "media_player.speaker"
        )
        assert c["name"] == "Stue"
        assert c["attributes"]["smarti_icon"] == icon
    assert client.put(route, json={"name": "", "icon": "bulb"}).status_code == 422
    assert (
        client.put("/api/controls/light.living_pendant/appearance", json={"icon": "homepod"}).status_code
        == 422
    )
    assert client.put(route, json={"name": "", "icon": "auto"}).status_code == 200
    c = next(
        c for c in client.get("/api/home").json()["controls"] if c["entity_id"] == "media_player.speaker"
    )
    assert c["name"] == "Høyttaler"
