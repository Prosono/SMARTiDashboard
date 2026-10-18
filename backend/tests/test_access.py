import json

from app.access import ALL
from fastapi.testclient import TestClient
from test_api import ORIGIN, app, client, login  # noqa: F401


def resident(client):  # noqa: F811
    login(client)
    assert (
        client.post(
            "/api/users", json={"name": "resident", "password": "resident-password-long", "role": "user"}
        ).status_code
        == 200
    )
    return next(a["id"] for a in client.get("/api/manage/accounts").json() if a["name"] == "resident")


def sign_in(client):  # noqa: F811
    response = client.post("/api/login", json={"name": "resident", "password": "resident-password-long"})
    assert response.status_code == 200
    client.headers["x-csrf-token"] = response.json()["csrf"]


def test_custom_view_hides_data_and_denies_direct_and_aggregate_routes(client):  # noqa: F811
    id = resident(client)
    assert (
        client.put(
            f"/api/manage/accounts/{id}/access", json={"profile": "custom", "permissions": ["lights.view"]}
        ).status_code
        == 200
    )
    sign_in(client)
    home = client.get("/api/home").json()
    assert home["controls"]
    assert all(c["domain"] == "light" for c in home["controls"])
    assert all(not c["capabilities"] for c in home["controls"])
    assert home["permissions"] == ["lights.view"]
    for url in [
        "/api/home/people",
        "/api/home/calendar",
        "/api/home/energy/statistics",
        "/api/home/camera/anything",
        "/api/home/camera-stream/anything/anything",
        "/api/groups",
        "/api/scenes",
        "/api/manage/accounts",
        "/api/manage/settings/system",
        "/api/manage/device/anything/history?entity_id=sensor.bedroom_temperature",
    ]:
        assert client.get(url).status_code == 403, url
    for url, body in [
        ("/api/controls/light.living_pendant/commands", {"action": "turn_on"}),
        ("/api/controls/climate.living/commands", {"action": "set_temperature", "value": 22}),
        ("/api/home/camera/anything/live", {}),
        ("/api/home/modes/away/run", {"confirmed": True}),
        ("/api/groups/anything/commands", {"action": "turn_on"}),
        ("/api/scenes/activate/scene.anything", {"confirmed": True}),
    ]:
        assert client.post(url, json=body).status_code == 403, url
    assert client.put(f"/api/manage/accounts/{id}/access", json={"profile": "admin"}).status_code == 403
    assert client.put("/api/favorites/sensor.bedroom_temperature").status_code == 403


def test_custom_control_only_permitted_function(client):  # noqa: F811
    id = resident(client)
    client.put(
        f"/api/manage/accounts/{id}/access",
        json={"profile": "custom", "permissions": ["lights.view", "lights.control"]},
    )
    sign_in(client)
    assert (
        client.post("/api/controls/light.living_pendant/commands", json={"action": "turn_off"}).status_code
        == 200
    )
    assert (
        client.post("/api/controls/switch.kitchen/commands", json={"action": "turn_off"}).status_code == 403
    )


def test_viewer_and_resident_presets(client):  # noqa: F811
    id = resident(client)
    response = client.put(f"/api/manage/accounts/{id}/access", json={"profile": "viewer"})
    assert response.status_code == 200
    assert all(p.endswith(".view") for p in response.json()["permissions"])
    sign_in(client)
    assert client.get("/api/home").json()["controls"]
    assert all(not c["capabilities"] for c in client.get("/api/home").json()["controls"])
    assert (
        client.post("/api/controls/light.living_pendant/commands", json={"action": "turn_off"}).status_code
        == 403
    )
    assert client.post("/api/home/modes/away/run", json={"confirmed": True}).status_code == 403
    login(client)
    assert client.put(f"/api/manage/accounts/{id}/access", json={"profile": "resident"}).json()[
        "permissions"
    ] == sorted(ALL)


def test_policy_validation_and_administrator_protection(client):  # noqa: F811
    id = resident(client)
    for permissions in [["madeup.view"], ["lights.control"]]:
        assert (
            client.put(
                f"/api/manage/accounts/{id}/access", json={"profile": "custom", "permissions": permissions}
            ).status_code
            == 422
        )
    owner = next(a["id"] for a in client.get("/api/manage/accounts").json() if a["role"] == "admin")
    assert client.put(f"/api/manage/accounts/{owner}/access", json={"profile": "viewer"}).status_code == 409
    assert (
        client.put(
            f"/api/manage/accounts/{id}/access", json={"profile": "admin"}, headers={"x-csrf-token": "bad"}
        ).status_code
        == 403
    )
    assert client.put("/api/manage/accounts/99999/access", json={"profile": "viewer"}).status_code == 404


def test_existing_session_revocation_is_immediate(client, app):  # noqa: F811
    id = resident(client)
    with TestClient(app) as other:
        other.headers["origin"] = ORIGIN
        sign_in(other)
        assert (
            other.post("/api/controls/light.living_pendant/commands", json={"action": "turn_off"}).status_code
            == 200
        )
        assert (
            client.put(
                f"/api/manage/accounts/{id}/access", json={"profile": "custom", "permissions": []}
            ).status_code
            == 200
        )
        assert other.get("/api/home").json()["controls"] == []
        assert (
            other.post("/api/controls/light.living_pendant/commands", json={"action": "turn_on"}).status_code
            == 403
        )
        assert other.get("/api/session").json()["permissions"] == []


def test_corrupt_policy_fails_closed(client, app):  # noqa: F811
    id = resident(client)
    app.state.store.set(f"access:{id}", json.dumps({"profile": "custom", "permissions": ["madeup"]}))
    sign_in(client)
    assert client.get("/api/home").json()["controls"] == []


def test_entity_history_requires_only_its_feature_view(client):  # noqa: F811
    id = resident(client)
    client.put(
        f"/api/manage/accounts/{id}/access", json={"profile": "custom", "permissions": ["lights.view"]}
    )
    sign_in(client)
    assert client.get("/api/controls/light.living_pendant/history?hours=6").status_code == 200
    assert client.get("/api/controls/sensor.bedroom_temperature/history").status_code == 403
    assert client.get("/api/controls/light.living_pendant/history?hours=999").status_code == 422
    assert client.get("/api/controls/light.missing/history").status_code == 404
