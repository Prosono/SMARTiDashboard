import uuid

from app.config import Settings
from app.demo import Demo
from app.main import create_app
from fastapi.testclient import TestClient


def test_remote_browser_requires_local_login_exact_host_origin_and_csrf(tmp_path):
    origin = f"https://{uuid.uuid4()}.home.smarti.dev"
    settings = Settings(
        _env_file=None,
        mode="demo",
        data_dir=tmp_path,
        origin=origin,
        auto_local_origins=False,
        bootstrap_secret="bootstrap-test-secret-123456",
    )
    ha = Demo()
    local = create_app(settings, ha)
    browser = TestClient(local, base_url=origin, headers={"Origin": origin})
    credentials = {"name": "owner", "password": "test-remote-password"}
    assert (
        browser.post("/api/bootstrap", json=credentials | {"secret": settings.bootstrap_secret}).status_code
        == 200
    )
    app = create_app(settings, ha, remote_surface=True)
    remote = TestClient(app, base_url=origin, headers={"Origin": origin})
    assert remote.get("/api/session").status_code == 401
    assert (
        remote.post("/api/bootstrap", json=credentials | {"secret": settings.bootstrap_secret}).status_code
        == 403
    )
    assert remote.get("/api/session", headers={"Host": "different.home.smarti.dev"}).status_code == 403
    assert remote.get("/api/session", headers={"X-Forwarded-Host": origin[8:]}).status_code == 401
    assert remote.get(origin.replace("https:", "http:") + "/api/session").status_code == 403
    assert (
        remote.post("/api/login", json=credentials, headers={"Origin": "https://home.smarti.dev"}).status_code
        == 403
    )
    login = remote.post("/api/login", json=credentials, headers={"X-Ingress-Path": "/evil"})
    assert login.status_code == 200
    cookie = login.headers["set-cookie"]
    assert "__Host-smarti_remote=" in cookie and "Secure" in cookie and "Path=/;" in cookie
    assert "Domain=" not in cookie and "evil" not in cookie
    assert remote.get("/api/session").status_code == 200
    assert remote.post("/api/logout").status_code == 403
    remote.headers["X-CSRF-Token"] = login.json()["csrf"]
    assert remote.get("/api/remote").status_code == 403
    assert remote.post("/api/logout").status_code == 200
    assert remote.get("/api/session").status_code == 401
    # Cloud portal / local ingress cookies must not create a remote session.
    local_login = browser.post("/api/login", json=credentials)
    assert local_login.status_code == 200
    remote.cookies.set("smarti_session", browser.cookies.get("smarti_session"))
    remote.cookies.set("__Host-smarti_cloud", "not-a-hub-session")
    assert remote.get("/api/session").status_code == 401


def test_provisioning_requires_local_admin_and_csrf(tmp_path):
    settings = Settings(
        _env_file=None,
        mode="demo",
        data_dir=tmp_path,
        origin="https://local.example",
        bootstrap_secret="bootstrap-test-secret-123456",
        auto_local_origins=False,
    )
    app = create_app(settings, Demo())
    client = TestClient(app, base_url=settings.origin, headers={"Origin": settings.origin})
    body = {"installation_id": str(uuid.uuid4()), "credential": "s" * 64}
    assert client.post("/api/remote/provision", json=body).status_code == 401
    credentials = {"name": "owner", "password": "test-remote-password"}
    client.post("/api/bootstrap", json=credentials | {"secret": settings.bootstrap_secret})
    login = client.post("/api/login", json=credentials)
    assert client.post("/api/remote/provision", json=body).status_code == 403
    client.headers["X-CSRF-Token"] = login.json()["csrf"]
    invalid = client.post("/api/remote/provision", json=body | {"credential": "secret-invalid!"}, headers={})
    assert invalid.status_code == 422
    assert "secret-invalid!" not in invalid.text
    assert (
        client.post(
            "/api/users", json={"name": "resident", "password": "test-resident-password", "role": "user"}
        ).status_code
        == 200
    )
    login = client.post("/api/login", json={"name": "resident", "password": "test-resident-password"})
    client.headers["X-CSRF-Token"] = login.json()["csrf"]
    assert client.post("/api/remote/provision", json=body).status_code == 403
    assert not (tmp_path / "remote-identity.json").exists()
