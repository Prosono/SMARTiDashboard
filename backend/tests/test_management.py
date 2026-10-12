import json

import httpx
import pytest
from app.config import Settings
from app.demo import Demo
from app.ha import HAError, HomeAssistant
from app.main import create_app
from fastapi.testclient import TestClient
from test_api import ORIGIN, SECRET, login


@pytest.fixture
def client(tmp_path):
    app = create_app(
        Settings(
            _env_file=None,
            mode="demo",
            data_dir=tmp_path,
            development=True,
            origin=ORIGIN,
            bootstrap_secret=SECRET,
        ),
        Demo(),
    )
    with TestClient(app) as c:
        c.headers["origin"] = ORIGIN
        login(c)
        yield c


def tile():
    return {
        "id": "tile",
        "kind": "heading",
        "title": "Morning",
        "layouts": {bp: {"x": 0, "y": 0, "w": 2, "h": 1} for bp in ["phone", "tablet", "desktop"]},
    }


def test_dashboard_ownership_revisions_layout_and_restart(client):
    board = client.post("/api/dashboards", json={"name": "Private", "tiles": [tile()]}).json()
    assert board["editable"] and board["revision"] == 1
    body = {k: board[k] for k in ["name", "scope", "revision", "tiles"]}
    body["name"] = "Renamed"
    assert client.put(f"/api/dashboards/{board['id']}", json=body).status_code == 200
    assert client.put(f"/api/dashboards/{board['id']}", json=body).status_code == 409
    assert client.delete(f"/api/dashboards/{board['id']}?revision=1").status_code == 409
    shared = client.post("/api/dashboards", json={"name": "Shared", "scope": "shared"}).json()
    assert (
        client.post(
            "/api/users", json={"name": "resident", "password": "another long password", "role": "user"}
        ).status_code
        == 200
    )
    client.post("/api/logout")
    login(client, "resident", "another long password")
    listing = client.get("/api/dashboards").json()
    assert [b["id"] for b in listing] == [shared["id"]]
    assert not listing[0]["editable"]
    assert client.put(f"/api/dashboards/{board['id']}", json=body).status_code == 404
    assert client.post("/api/dashboards", json={"name": "Unauthorized", "scope": "shared"}).status_code == 403
    assert (
        client.put(f"/api/dashboards/{shared['id']}", json={"name": "Attack", "revision": 1}).status_code
        == 403
    )
    own = client.post("/api/dashboards", json={"name": "Resident", "tiles": [tile()]}).json()
    assert own["editable"]
    # Independent app against the same SQLite file preserves dashboards and sessions.
    from app.storage import Store

    reopened = Store(client.app.state.store.path)
    with reopened.connect() as db:
        persisted = db.execute("SELECT name,tiles FROM dashboards WHERE id=?", (own["id"],)).fetchone()
        assert persisted["name"] == "Resident"
        assert json.loads(persisted["tiles"]) == own["tiles"]
    invalid = tile()
    invalid["layouts"]["phone"]["x"] = 1
    assert client.post("/api/dashboards", json={"name": "Overflow", "tiles": [invalid]}).status_code == 422
    assert (
        client.post(
            "/api/dashboards", json={"name": "Overlap", "tiles": [tile(), tile() | {"id": "second"}]}
        ).status_code
        == 422
    )


def test_management_admin_csrf_and_room_registry_semantics(client):
    result = client.post("/api/manage/rooms", json={"name": "Office"})
    assert result.status_code == 200
    room = next(a for a in result.json()["areas"] if a["name"] == "Office")
    id = room["area_id"]
    assert client.put(f"/api/manage/rooms/{id}", json={"name": "Study"}).status_code == 200
    result = client.put("/api/manage/placements/device/d1", json={"area_id": id})
    assert next(d for d in result.json()["devices"] if d["id"] == "d1")["area_id"] == id
    # Moving the device doesn't silently erase independent entity overrides.
    entity = next(e for e in result.json()["entities"] if e["entity_id"] == "light.living_pendant")
    assert entity["area_id"] == "living"
    result = client.put("/api/manage/placements/entity/light.living_pendant", json={"area_id": None})
    assert (
        next(e for e in result.json()["entities"] if e["entity_id"] == "light.living_pendant")["area_id"]
        is None
    )
    assert client.put("/api/manage/placements/device/d1", json={"area_id": "missing"}).status_code == 404
    result = client.delete(f"/api/manage/rooms/{id}").json()
    assert next(d for d in result["devices"] if d["id"] == "d1")["area_id"] is None
    assert (
        client.post("/api/manage/rooms", json={"name": "Bad"}, headers={"x-csrf-token": "bad"}).status_code
        == 403
    )
    client.post("/api/users", json={"name": "resident", "password": "another long password", "role": "user"})
    client.post("/api/logout")
    login(client, "resident", "another long password")
    for path in ["rooms", "automations", "integrations", "updates", "entities"]:
        assert client.get("/api/manage/" + path).status_code == 403
    assert client.post("/api/manage/rooms", json={"name": "No"}).status_code == 403


def test_automation_unknown_fields_are_preserved_and_conflicts_blocked(client):
    value = {
        "alias": "Advanced",
        "triggers": [],
        "conditions": [],
        "actions": [{"choose": [{"conditions": "{{ true }}", "sequence": [{"action": "light.turn_on"}]}]}],
        "variables": {"custom": "keep-me"},
        "mode": "queued",
        "max": 3,
    }
    saved = client.post("/api/manage/automations", json={"config": value}).json()
    path = f"/api/manage/automations/{saved['id']}"
    loaded = client.get(path).json()
    loaded["config"]["alias"] = "Renamed"
    updated = client.put(path, json=loaded)
    assert updated.status_code == 200
    assert updated.json()["config"]["actions"] == value["actions"]
    assert updated.json()["config"]["variables"] == value["variables"]
    assert client.put(path, json=loaded).status_code == 409
    assert client.delete(path + "?expected_revision=" + loaded["revision"]).status_code == 409
    assert client.delete(path + "?expected_revision=" + updated.json()["revision"]).status_code == 200


class LiveContract(Demo):
    def __init__(self):
        super().__init__()
        self.calls = []
        self.config = {"id": "file-id", "alias": "Fixture", "triggers": [], "actions": []}
        self.states["automation.evening"]["attributes"]["id"] = "file-id"
        self.states["update.core"] = {
            "entity_id": "update.core",
            "state": "on",
            "attributes": {
                "title": "Home Assistant Core",
                "installed_version": "1",
                "latest_version": "2",
                "supported_features": 9,
                "in_progress": False,
            },
        }

    async def registries(self):
        pass

    async def request(self, kind, **data):
        self.calls.append((kind, data))
        if kind == "get_states":
            return list(self.states.values())
        if kind == "config_entries/get":
            return [
                {
                    "entry_id": "abc",
                    "title": "Fixture",
                    "domain": "mqtt",
                    "state": "loaded",
                    "data": {"password": "never-expose"},
                    "options": {"secret": "never-expose"},
                }
            ]
        if kind == "config/area_registry/create":
            self.areas["new"] = {"area_id": "new", "name": data["name"]}
        return {"require_restart": True}

    async def rest(self, method, path, data=None):
        self.calls.append((method, path, data))
        if method == "GET":
            return self.config
        if method == "POST" and "automation/config" in path:
            self.config = data
        return {"require_restart": True}


@pytest.fixture
def live(tmp_path):
    ha = LiveContract()
    app = create_app(
        Settings(
            _env_file=None,
            mode="live",
            data_dir=tmp_path,
            development=True,
            origin=ORIGIN,
            bootstrap_secret=SECRET,
        ),
        ha,
    )
    with TestClient(app) as c:
        c.headers["origin"] = ORIGIN
        login(c)
        yield c, ha


def test_live_api_contracts_and_update_branding(live):
    client, ha = live
    ha.states["person.fixture"] = {
        "entity_id": "person.fixture",
        "state": "home",
        "attributes": {"friendly_name": "Resident", "secret": "never-return"},
    }
    catalog = client.get("/api/manage/entities").json()
    assert {"entity_id": "person.fixture", "name": "Resident"} in catalog
    assert "never-return" not in str(catalog)
    assert client.post("/api/manage/rooms", json={"name": "Test"}).status_code == 200
    assert ("config/area_registry/create", {"name": "Test"}) in ha.calls
    client.put("/api/manage/placements/device/d1", json={"area_id": "living"})
    assert ("config/device_registry/update", {"device_id": "d1", "area_id": "living"}) in ha.calls
    loaded = client.get("/api/manage/automations/file-id").json()
    loaded["config"]["alias"] = "New"
    assert client.put("/api/manage/automations/file-id", json=loaded).status_code == 200
    assert any(c[0] == "POST" and c[1] == "config/automation/config/file-id" for c in ha.calls)
    client.post("/api/manage/automation-actions/automation.evening", json={"action": "trigger"})
    assert (
        "call_service",
        {
            "domain": "automation",
            "service": "trigger",
            "service_data": {"entity_id": "automation.evening", "skip_condition": False},
        },
    ) in ha.calls
    assert "never-expose" not in client.get("/api/manage/integrations").text
    assert client.post("/api/manage/integrations/abc", json={"action": "reload"}).json()["require_restart"]
    assert ("POST", "config/config_entries/entry/abc/reload", None) in ha.calls
    client.post("/api/manage/integrations/abc", json={"action": "disable"})
    assert ("config_entries/disable", {"entry_id": "abc", "disabled_by": "user"}) in ha.calls
    update = client.get("/api/manage/updates").json()[0]
    assert update["name"] == "SMARTi Core" and update["smarti"]
    assert ha.states["update.core"]["attributes"]["title"] == "Home Assistant Core"
    path = "/api/manage/updates/update.core/install"
    assert client.post(path, json={"version": "old"}).status_code == 409
    assert client.post(path, json={"version": "2", "backup": True}).json()["status"] == "accepted"
    assert client.post(path, json={"version": "2", "backup": True}).status_code == 409
    assert (
        "call_service",
        {
            "domain": "update",
            "service": "install",
            "service_data": {"entity_id": "update.core", "backup": True},
        },
    ) in ha.calls


def test_disconnected_cannot_mutate(live):
    client, ha = live
    ha.connected = False
    assert client.post("/api/manage/rooms", json={"name": "No"}).status_code == 503
    assert client.get("/api/manage/updates").status_code == 503


@pytest.mark.asyncio
async def test_rest_keeps_backend_token_and_redacts_errors(monkeypatch):
    observed = []

    def handler(request):
        observed.append(request)
        return httpx.Response(400, json={"secret": "never expose upstream text"})

    original = httpx.AsyncClient
    monkeypatch.setattr(
        httpx, "AsyncClient", lambda **kw: original(transport=httpx.MockTransport(handler), **kw)
    )
    ha = HomeAssistant("http://supervisor/core", "backend-only")
    ha.connected = True
    with pytest.raises(HAError, match="ha_request_rejected"):
        await ha.rest("POST", "config/automation/config/123", {"alias": "test"})
    assert str(observed[0].url) == "http://supervisor/core/api/config/automation/config/123"
    assert observed[0].headers["authorization"] == "Bearer backend-only"
    assert json.loads(observed[0].content) == {"alias": "test"}
