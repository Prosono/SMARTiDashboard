import pytest
from app.config import Settings
from app.demo import Demo
from app.main import create_app
from fastapi.testclient import TestClient
from test_api import ORIGIN, SECRET, login


@pytest.mark.parametrize("mode,ingress", [("demo", False), ("demo", True), ("live", False), ("live", True)])
def test_debug_target_is_admin_only_and_same_origin(tmp_path, mode, ingress):
    settings = Settings(
        _env_file=None, mode=mode, ingress=ingress, data_dir=tmp_path,
        development=not ingress, allow_http_ingress=ingress, origin=ORIGIN, bootstrap_secret=SECRET,
        ha_url="http://internal-supervisor-not-for-browser", ha_token="never-expose-this",
    )
    app = create_app(settings, Demo())
    with TestClient(app, client=("172.30.32.2", 12345)) as client:
        client.headers["origin"] = ORIGIN
        path = "/api/manage/debugging/target"
        assert client.get(path).status_code == 401
        login(client)
        available = mode == "live" and ingress
        response = client.get(path)
        assert response.json() == {
            "available": available, "remote": False, "path": "/config/dashboard" if available else None,
        }
        assert "never-expose" not in response.text
        assert "internal-supervisor" not in response.text
        client.post("/api/users", json={"name": "resident", "password": "another good password"})
        client.post("/api/logout")
        login(client, "resident", "another good password")
        assert client.get(path).status_code == 403
