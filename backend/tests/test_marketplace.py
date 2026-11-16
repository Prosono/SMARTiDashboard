from app.ha import HAError
from test_api import login
from test_management import client  # noqa: F401


def test_marketplace_requests_and_returns_only_visible_integrations(client, monkeypatch):  # noqa: F811
    management = client.app.state.management
    management.demo = False
    integration = {
        "category": "integration",
        "full_name": "vendor/air-sensors",
        "name": "Air sensors",
        "domain": "air_sensors",
        "installed": True,
        "installed_version": "v1.2",
        "local_path": "/config/custom_components/air_sensors",
    }

    async def request(kind, **data):
        assert kind == "marketplace/repositories/list"
        assert data == {"categories": ["integration"]}
        return [
            integration,
            {**integration, "category": "theme", "full_name": "vendor/theme"},
            {**integration, "category": "plugin", "full_name": "vendor/dashboard"},
            {**integration, "category": "template", "full_name": "vendor/template"},
            {**integration, "hide": True, "full_name": "vendor/hidden"},
            {**integration, "full_name": "vendor/.."},
        ]

    monkeypatch.setattr(management.ha, "request", request)
    path = "/api/manage/marketplace"
    response = client.get(path)
    assert response.status_code == 200
    assert [item["full_name"] for item in response.json()] == ["vendor/air-sensors"]
    assert response.json()[0]["installed_version"] == "v1.2"
    assert "local_path" not in response.json()[0]

    client.post("/api/users", json={"name": "resident", "password": "another long password", "role": "user"})
    client.post("/api/logout")
    login(client, "resident", "another long password")
    assert client.get(path).status_code == 403


def test_marketplace_reports_an_unsupported_or_disabled_hub(client, monkeypatch):  # noqa: F811
    management = client.app.state.management
    path = "/api/manage/marketplace"
    assert client.get(path).status_code == 404
    management.demo = False

    async def request(*args, **kwargs):
        raise HAError("ha_request_rejected", code="not_loaded")

    monkeypatch.setattr(management.ha, "request", request)
    assert client.get(path).json() == {"detail": "marketplace_unavailable"}
