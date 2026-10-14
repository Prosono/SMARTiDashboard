import httpx
from test_api import login
from test_management import client  # noqa: F401


def test_home_and_people_admin_updates(client):  # noqa: F811
    m = client.app.state.management
    m.demo = False
    calls = []

    async def ws(kind, **data):
        calls.append((kind, data))
        if kind == "person/list":
            return {
                "storage": [{"id": "p1", "name": "Test", "device_trackers": []}],
                "config": [{"id": "yaml", "name": "Fixed"}],
            }
        return {"id": "p1"}

    m.ws = ws
    m.ha.states["device_tracker.phone"] = {"state": "home", "attributes": {"friendly_name": "Telefon"}}
    body = {
        "location_name": "Huset",
        "latitude": 58.1,
        "longitude": 8,
        "elevation": 12,
        "time_zone": "Europe/Oslo",
    }
    assert client.put("/api/manage/settings/home", json=body | {"latitude": 100}).status_code == 422
    assert (
        client.put("/api/manage/settings/home", json=body | {"time_zone": "Invalid/Zone"}).status_code == 422
    )
    assert not calls
    assert client.put("/api/manage/settings/home", json=body).status_code == 200
    assert calls[-1] == ("config/core/update", body)
    assert m.store.get("home_name") == "Huset"
    people = client.get("/api/manage/settings/people").json()
    assert people["people"][1]["editable"] is False
    assert people["trackers"][-1]["id"] == "device_tracker.phone"
    person = {"name": "Test", "device_trackers": ["device_tracker.phone"]}
    assert client.post("/api/manage/settings/people", json=person).status_code == 200
    assert calls[-1] == ("person/create", person)
    assert client.put("/api/manage/settings/people/p1", json=person).status_code == 200
    assert calls[-1] == ("person/update", {"person_id": "p1", **person})
    assert client.put("/api/manage/settings/people/yaml", json=person).status_code == 404
    assert (
        client.post(
            "/api/manage/settings/people", json=person | {"device_trackers": ["light.any"]}
        ).status_code
        == 422
    )
    assert client.delete("/api/manage/settings/people/p1").status_code == 200
    assert calls[-1] == ("person/delete", {"person_id": "p1"})
    assert (
        client.put("/api/manage/settings/home", json=body, headers={"x-csrf-token": "bad"}).status_code == 403
    )
    client.post("/api/users", json={"name": "resident", "password": "another long password", "role": "user"})
    client.post("/api/logout")
    login(client, "resident", "another long password")
    for path in ["system", "home", "people"]:
        assert client.get("/api/manage/settings/" + path).status_code == 403


def test_supervisor_metadata_partial_failures_and_no_secrets(client, monkeypatch):  # noqa: F811
    from types import SimpleNamespace

    from app.system_settings import system_settings_router
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    m = client.app.state.management
    m.demo = False
    monkeypatch.setenv("SUPERVISOR_TOKEN", "private-token")
    observed = []
    real = httpx.AsyncClient

    def reply(request):
        observed.append(request)
        assert request.headers["authorization"] == "Bearer private-token"
        value = {
            "/host/info": {"hostname": "hub", "disk_free": 12, "secret": "hidden"},
            "/core/stats": {"cpu_percent": 3, "memory_usage": 1024},
            "/backups/info": {"backups": [{"slug": "a", "name": "Backup", "password": "hidden"}]},
        }.get(request.url.path)
        return httpx.Response(200, json={"result": "ok", "data": value}) if value else httpx.Response(503)

    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(reply), **kw))
    app = FastAPI()
    app.include_router(system_settings_router(m, lambda: {"id": 1}, SimpleNamespace(ingress=True)))
    with TestClient(app) as c:
        value = c.get("/api/manage/settings/system").json()
    assert value["core"]["cpu_percent"] == 3
    assert value["host"]["disk_free"] == 12
    assert value["network"] is None
    assert value["unavailable"] == ["network"]
    assert "hidden" not in str(value) and "private-token" not in str(value)
    assert len(observed) == 4


def test_demo_no_fake_host_values_or_mutations(client):  # noqa: F811
    value = client.get("/api/manage/settings/system").json()
    assert value["core"]["cpu_percent"] is None and value["backups"] is None
    assert client.get("/api/manage/settings/home").status_code == 503
    assert client.post("/api/manage/settings/people", json={"name": "Demo"}).status_code == 503
