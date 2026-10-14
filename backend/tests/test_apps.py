from uuid import uuid4

import pytest
from fastapi import HTTPException
from test_api import login
from test_management import client  # noqa: F401


@pytest.fixture
def supervisor(monkeypatch):
    from app.system_operations import Supervisor

    calls = []
    info = {
        "slug": "core_test",
        "name": "Test app",
        "installed": False,
        "version": "1",
        "update_available": True,
        "options": {"password": "do-not-log"},
        "boot": "manual",
        "watchdog": False,
        "auto_update": False,
    }
    state = {"fail": False, "own": "renamed_instance", "valid": True, "done": False, "errors": []}

    async def request(self, method, path, data=None):
        calls.append((method, path, data))
        if path == "/addons/self/info":
            return {"slug": state["own"]}
        if path == "/addons":
            return {
                "addons": [
                    info,
                    {"slug": "renamed_instance", "name": "Renamed"},
                    {"slug": "abc_smarti", "name": "SMARTi"},
                ]
            }
        if path == "/store/addons":
            return [info, {"slug": "store_smarti", "name": "SMARTi"}, {"slug": "extra", "name": "Other"}]
        if path.endswith("/info") and path.startswith("/addons/") or path == "/store/addons/core_test":
            return info.copy()
        if path == "/jobs/info":
            return {
                "jobs": [
                    {
                        "uuid": "parent",
                        "child_jobs": [
                            {"uuid": "job1", "done": state["done"], "errors": state["errors"], "progress": 50}
                        ],
                    }
                ]
            }
        if path.endswith("/options/validate"):
            return {"valid": state["valid"]}
        if method == "POST" and state["fail"]:
            raise HTTPException(502, "unconfirmed")
        if path.endswith(("/install", "/update")):
            return {"job_id": "job1"}
        return {}

    monkeypatch.setattr(Supervisor, "request", request)
    return calls, info, state


def body(slug="core_test", action="install"):
    return {"request_id": str(uuid4()), "action": action, "confirm_slug": slug}


def test_inventory_and_self_protection(client, supervisor):  # noqa: F811
    calls, _, state = supervisor
    items = client.get("/api/manage/apps").json()
    assert [a["slug"] for a in items] == ["core_test", "extra"]
    assert items[0]["installed"] is True
    assert "do-not-log" not in str(items)
    for slug in ["self", "smarti", "abc_smarti", "renamed_instance"]:
        for action in ["install", "start", "stop", "restart", "update", "uninstall"]:
            assert client.post(f"/api/manage/apps/{slug}/actions", json=body(slug, action)).status_code == 404
        assert client.get(f"/api/manage/apps/{slug}/configuration").status_code == 404
        assert (
            client.put(
                f"/api/manage/apps/{slug}/configuration",
                json={
                    "revision": "a" * 64,
                    "options": {},
                    "boot": "manual",
                    "watchdog": False,
                    "auto_update": False,
                },
            ).status_code
            == 404
        )
    assert not any(c[0] == "POST" for c in calls)
    state["own"] = None
    assert client.post("/api/manage/apps/core_test/actions", json=body()).status_code == 503


def test_install_idempotence_jobs_and_unconfirmed_response(client, supervisor):  # noqa: F811
    calls, _, state = supervisor
    request = body()
    response = client.post("/api/manage/apps/core_test/actions", json=request)
    assert response.status_code == 200 and response.json()["status"] == "accepted"
    assert calls[-1] == ("POST", "/store/addons/core_test/install", {"background": True})
    assert client.post("/api/manage/apps/core_test/actions", json=request).json() == response.json()
    assert sum(c[1] == "/store/addons/core_test/install" for c in calls) == 1
    assert client.post("/api/manage/apps/core_test/actions", json=body()).status_code == 409
    state["done"] = True
    assert client.get("/api/manage/apps/operations").json()[0]["status"] == "completed"
    state["fail"] = True
    request = body(action="restart")
    assert client.post("/api/manage/apps/core_test/actions", json=request).json()["status"] == "unconfirmed"
    assert client.post("/api/manage/apps/core_test/actions", json=request).json()["status"] == "unconfirmed"
    assert sum(c[1] == "/addons/core_test/restart" for c in calls) == 1


def test_options_validation_uninstall_and_access(client, supervisor):  # noqa: F811
    calls, info, state = supervisor
    current = client.get("/api/manage/apps/core_test/configuration").json()
    payload = {k: current[k] for k in ["options", "revision", "boot", "watchdog", "auto_update"]}
    assert (
        client.put(
            "/api/manage/apps/core_test/configuration", json=payload | {"revision": "a" * 64}
        ).status_code
        == 409
    )
    state["valid"] = False
    assert client.put("/api/manage/apps/core_test/configuration", json=payload).status_code == 422
    assert not any(c[1] == "/addons/core_test/options" for c in calls)
    state["valid"] = True
    assert client.put("/api/manage/apps/core_test/configuration", json=payload).status_code == 200
    assert calls[-1][2]["options"] == {"password": "do-not-log"}
    info["system_managed"] = True
    assert client.post("/api/manage/apps/core_test/actions", json=body(action="uninstall")).status_code == 409
    info["system_managed"] = False
    assert client.post("/api/manage/apps/core_test/actions", json=body(action="uninstall")).status_code == 200
    assert calls[-1] == ("POST", "/addons/core_test/uninstall", {"remove_config": False})
    assert (
        client.post(
            "/api/manage/apps/core_test/actions", json=body(), headers={"x-csrf-token": "bad"}
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/manage/apps/repositories", json={"repository": "https://github.com/test/apps"}
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/manage/apps/repositories", json={"repository": "https://user:secret@github.com/test/apps"}
        ).status_code
        == 422
    )
    client.post("/api/users", json={"name": "resident", "password": "another long password", "role": "user"})
    client.post("/api/logout")
    login(client, "resident", "another long password")
    assert client.get("/api/manage/apps").status_code == 403
    assert client.post("/api/manage/apps/core_test/actions", json=body()).status_code == 403


def test_apps_unavailable_without_supervisor(client):  # noqa: F811
    assert client.get("/api/manage/apps").status_code == 503
    assert client.post("/api/manage/apps/core_test/actions", json=body()).status_code == 503
    assert (
        client.post("/api/manage/apps/core_test/actions", json=body() | {"action": "security"}).status_code
        == 422
    )


def test_app_images_fixed_routes_bounded_raster_and_self_protection(client, supervisor, monkeypatch):  # noqa: F811
    from types import SimpleNamespace

    import httpx
    from app.apps import apps_router
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    _, info, _ = supervisor
    info.update(icon=True, logo=True)
    monkeypatch.setenv("SUPERVISOR_TOKEN", "private-test-token")
    received = []
    content = {"body": b"\x89PNG\r\n\x1a\nimage"}
    real = httpx.AsyncClient

    def response(request):
        received.append(request)
        assert request.headers["authorization"] == "Bearer private-test-token"
        return httpx.Response(200, content=content["body"])

    monkeypatch.setattr(
        httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(response), **kw)
    )
    app = FastAPI()
    app.include_router(
        apps_router(
            client.app.state.management, lambda: {"id": 1}, SimpleNamespace(mode="live", ingress=True)
        )
    )
    with TestClient(app) as c:
        for source, path in [
            ("installed", "/addons/core_test/icon"),
            ("store", "/store/addons/core_test/icon"),
        ]:
            r = c.get(f"/api/manage/apps/core_test/image?source={source}")
            assert r.status_code == 200 and r.headers["content-type"] == "image/png"
            assert received[-1].url.path == path
            assert "private-test-token" not in str(r.headers)
        assert c.get("/api/manage/apps/self/image?source=installed").status_code == 404
        assert c.get("/api/manage/apps/renamed_instance/image?source=installed").status_code == 404
        assert c.get("/api/manage/apps/core_test/image?source=store&kind=logs").status_code == 422
        content["body"] = b"<html>Not an image</html>"
        assert c.get("/api/manage/apps/core_test/image?source=installed").status_code == 502
        content["body"] = b"\x89PNG\r\n\x1a\n" + b"a" * 2_000_001
        assert c.get("/api/manage/apps/core_test/image?source=installed").status_code == 502


def test_radio_ui_only_returns_running_ingress_targets(client, monkeypatch):  # noqa: F811
    from app.system_operations import Supervisor

    entries = [
        {
            "slug": "abc_zigbee2mqtt_proxy",
            "name": "Zigbee2MQTT Proxy",
            "ingress": True,
            "state": "started",
            "ingress_url": "/api/hassio_ingress/safe-token",
        },
        {
            "slug": "abc_zwavejs2mqtt",
            "name": "Z-Wave JS UI",
            "ingress": True,
            "state": "started",
            "ingress_url": "https://external.invalid/",
        },
        {
            "slug": "abc_other",
            "name": "Other",
            "ingress": True,
            "state": "started",
            "ingress_url": "/api/hassio_ingress/other",
        },
    ]

    async def request(self, method, path, data=None):
        assert method == "GET"
        if path == "/addons/self/info":
            return {"slug": "abc_smarti"}
        if path == "/addons":
            return {"addons": entries}
        return next(e for e in entries if path == "/addons/" + e["slug"] + "/info")

    monkeypatch.setattr(Supervisor, "request", request)
    base = "/api/manage/apps/radio-ui/"
    result = client.get(base + "zigbee2mqtt").json()
    assert len(result) == 1 and result[0]["available"]
    assert result[0]["url"] == "/api/hassio_ingress/safe-token"
    assert client.get(base + "zwave_js").json()[0]["url"] is None
    entries[0]["state"] = "stopped"
    assert not client.get(base + "zigbee2mqtt").json()[0]["available"]
    assert client.get(base + "other").status_code == 422
    client.post("/api/users", json={"name": "viewer", "password": "another long password", "role": "user"})
    client.post("/api/logout")
    login(client, "viewer", "another long password")
    assert client.get(base + "zigbee2mqtt").status_code == 403
