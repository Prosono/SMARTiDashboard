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
    app.state.management.update_approval.transport = httpx.MockTransport(
        lambda request: httpx.Response(200, json={"releases": [{"component": "core", "version": "2"}]})
    )
    with TestClient(app) as c:
        c.headers["origin"] = ORIGIN
        login(c)
        yield c


def test_dashboard_creation_removed(client):
    assert client.post("/api/dashboards", json={"name": "Old"}).status_code == 410


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
    for path in [
        "rooms",
        "automations",
        "integrations",
        "updates",
        "entities",
        "automation-preview/automation.evening",
    ]:
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
        if kind == "automation/config":
            response = getattr(self, "preview_response", {"config": self.config})
            if isinstance(response, Exception):
                raise response
            return response
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
    app.state.management.update_approval.transport = httpx.MockTransport(
        lambda request: httpx.Response(200, json={"releases": [{"component": "core", "version": "2"}]})
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


def test_detailed_entity_catalog_includes_helpers_with_safe_metadata(live):
    client, ha = live
    ha.devices["catalog_device"] = {
        "id": "catalog_device",
        "area_id": "living",
        "secret": "never-return-device",
    }
    ha.states["input_number.target_temperature"] = {
        "entity_id": "input_number.target_temperature",
        "state": "21.5",
        "attributes": {
            "friendly_name": "Target temperature",
            "device_class": "temperature",
            "unit_of_measurement": "°C",
            "api_token": "never-return-state",
            "nested": {"password": "never-return-nested"},
        },
    }
    ha.entities["input_number.target_temperature"] = {
        "entity_id": "input_number.target_temperature",
        "device_id": "catalog_device",
        "area_id": "bedroom",
        "secret": "never-return-registry",
    }
    ha.states["device_tracker.phone"] = {
        "entity_id": "device_tracker.phone",
        "state": "home",
        "attributes": {"friendly_name": "Phone", "latitude": 59.0},
    }
    ha.entities["device_tracker.phone"] = {
        "entity_id": "device_tracker.phone",
        "device_id": "catalog_device",
    }
    ha.states["input_boolean.guest_mode"] = {
        "entity_id": "input_boolean.guest_mode",
        "state": "off",
        "attributes": {},
    }
    # Helpers and trackers need not be supported dashboard controls to remain
    # available as automation inputs, conditions or targets.
    assert not any(
        control.entity_id
        in {
            "input_number.target_temperature",
            "device_tracker.phone",
            "input_boolean.guest_mode",
        }
        for control in ha.controls()
    )
    response = client.get("/api/manage/entities?details=true")
    assert response.status_code == 200
    catalog = {row["entity_id"]: row for row in response.json()}
    assert catalog["input_number.target_temperature"] == {
        "entity_id": "input_number.target_temperature",
        "id": "input_number.target_temperature",
        "device_name": None,
        "name": "Target temperature",
        "domain": "input_number",
        "state": "21.5",
        "attributes": {"device_class": "temperature", "unit_of_measurement": "°C"},
        "device_id": "catalog_device",
        "area_id": "bedroom",
    }
    assert catalog["device_tracker.phone"] == {
        "entity_id": "device_tracker.phone",
        "id": "device_tracker.phone",
        "device_name": None,
        "name": "Phone",
        "domain": "device_tracker",
        "state": "home",
        "attributes": {},
        "device_id": "catalog_device",
        "area_id": "living",
    }
    assert catalog["input_boolean.guest_mode"] == {
        "entity_id": "input_boolean.guest_mode",
        "id": "input_boolean.guest_mode",
        "device_name": None,
        "name": "input_boolean.guest_mode",
        "domain": "input_boolean",
        "state": "off",
        "attributes": {},
        "device_id": None,
        "area_id": None,
    }
    assert "never-return" not in response.text
    assert "latitude" not in response.text
    # Opting out keeps the original compact endpoint contract.
    compact = {row["entity_id"]: row for row in client.get("/api/manage/entities").json()}
    assert compact["input_number.target_temperature"] == {
        "entity_id": "input_number.target_temperature",
        "name": "Target temperature",
    }


def test_disconnected_cannot_mutate(live):
    client, ha = live
    ha.connected = False
    assert client.post("/api/manage/rooms", json={"name": "No"}).status_code == 503
    assert client.get("/api/manage/updates").status_code == 503


def test_automation_preview_is_resolved_read_only_and_preserves_blueprint(live):
    client, ha = live
    ha.config = {
        "id": "file-id",
        "alias": "Motion blueprint",
        "use_blueprint": {
            "path": "homeassistant/motion_light.yaml",
            "input": {
                "motion_entity": "binary_sensor.motion",
                "light_target": {"area_id": ["living"]},
                "custom_template": "{{ untouched }}",
            },
        },
    }
    resolved = {
        "id": "file-id",
        "alias": "Motion blueprint",
        "triggers": [{"trigger": "state", "entity_id": "binary_sensor.motion", "to": "on"}],
        "actions": [{"action": "light.turn_on", "target": {"area_id": ["living"]}}],
        "variables": {"keep": "{{ untouched }}"},
    }
    ha.preview_response = {"config": resolved}
    original = client.get("/api/manage/automations/file-id").json()
    before = len(ha.calls)
    response = client.get("/api/manage/automation-preview/automation.evening")
    assert response.status_code == 200
    assert response.json() == {
        "entity_id": "automation.evening",
        "config": resolved,
        "read_only": True,
    }
    assert ha.calls[before:] == [("automation/config", {"entity_id": "automation.evening"})]
    assert client.get("/api/manage/automations/file-id").json() == original
    assert (
        client.put(
            "/api/manage/automation-preview/automation.evening",
            json={"config": resolved},
        ).status_code
        == 405
    )
    # Even with the original file's revision, a resolved preview cannot replace
    # the linked blueprint. Editing normal blueprint inputs still works.
    result = client.put(
        "/api/manage/automations/file-id",
        json={"config": resolved, "revision": original["revision"]},
    )
    assert result.status_code == 409
    assert result.json()["detail"] == "blueprint_conversion_not_supported"
    assert client.get("/api/manage/automations/file-id").json() == original
    original["config"]["alias"] = "Renamed blueprint"
    updated = client.put("/api/manage/automations/file-id", json=original)
    assert updated.status_code == 200
    assert updated.json()["config"]["use_blueprint"] == original["config"]["use_blueprint"]


@pytest.mark.parametrize(
    "payload",
    [
        None,
        [],
        {},
        {"config": None},
        {"config": []},
        {"config": {"alias": "Missing steps"}},
        {"config": {"triggers": [], "actions": [], "use_blueprint": {"path": "unresolved.yaml"}}},
        {"config": {"triggers": "unexpected", "actions": []}},
    ],
)
def test_automation_preview_rejects_malformed_response(live, payload):
    client, ha = live
    ha.preview_response = payload
    result = client.get("/api/manage/automation-preview/automation.evening")
    assert result.status_code == 502
    assert result.json()["detail"] == "automation_preview_unavailable"


def test_automation_preview_checks_entity_connection_and_redacts_errors(live):
    client, ha = live
    before = len(ha.calls)
    for entity_id in ["light.living_pendant", "automation.missing"]:
        assert client.get("/api/manage/automation-preview/" + entity_id).status_code == 404
    assert len(ha.calls) == before
    for error in [HAError("upstream secret"), TimeoutError("upstream secret")]:
        ha.preview_response = error
        result = client.get("/api/manage/automation-preview/automation.evening")
        assert result.status_code == 503
        assert result.json()["detail"] == "ha_request_unconfirmed"
        assert "upstream secret" not in result.text
    ha.connected = False
    assert client.get("/api/manage/automation-preview/automation.evening").status_code == 503


def test_demo_automation_preview_uses_stored_config(client):
    original = client.get("/api/manage/automations/evening").json()
    result = client.get("/api/manage/automation-preview/automation.evening")
    assert result.status_code == 200
    assert result.json()["config"] == original["config"]
    assert result.json()["read_only"] is True
    assert "revision" not in result.json()


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


def test_integration_device_membership_legacy_and_current(live):
    client, ha = live
    ha.devices = {
        "first": {
            "id": "first",
            "config_entries": ["abc"],
            "config_entry_id": "abc",
            "name": "Lamp",
            "name_by_user": "My lamp",
            "area_id": "living",
            "secret": "hidden",
        },
        "second": {"id": "second", "config_entry_id": "abc", "name": "Socket"},
        "other": {"id": "other", "config_entry_id": "different", "name": "Other"},
    }
    entry = client.get("/api/manage/integrations").json()[0]
    assert entry["devices"] == 2
    assert [d["name"] for d in entry["device_items"]] == ["My lamp", "Socket"]
    assert "hidden" not in str(entry)
    assert "never-expose" not in str(entry)


@pytest.mark.asyncio
async def test_brand_image_bounded_authenticated_no_redirects(monkeypatch):
    original = httpx.AsyncClient
    observed = []
    png = b"\x89PNG\r\n\x1a\nfixture"

    def reply(request):
        observed.append(request)
        return httpx.Response(200, content=png)

    monkeypatch.setattr(
        httpx, "AsyncClient", lambda **kw: original(transport=httpx.MockTransport(reply), **kw)
    )
    ha = HomeAssistant("http://ha.local:8123", "private-token")
    assert await ha.brand_image("hue") == png
    assert observed[0].headers["authorization"] == "Bearer private-token"
    assert observed[0].url.path == "/api/brands/integration/hue/icon.png"
    with pytest.raises(HAError):
        await ha.brand_image("../secrets")
    assert len(observed) == 1
    for body in [b"<html>not an image</html>", b"\x89PNG\r\n\x1a\n" + b"x" * 2_000_000]:
        png = body
        with pytest.raises(HAError):
            await ha.brand_image("hue")


def test_automation_icon_saved_without_changing_config(client):
    row = client.get("/api/manage/automations").json()[0]
    path = "/api/manage/automation-appearance/" + row["entity_id"]
    original = client.get("/api/manage/automations/" + row["id"]).json()
    assert client.put(path, json={"icon": "moon"}).status_code == 200
    saved = client.get("/api/manage/automations").json()[0]
    assert saved["icon"] == "moon"
    assert client.get("/api/manage/automations/" + row["id"]).json() == original
    assert client.put(path, json={"icon": "<script>"}).status_code == 422
    assert (
        client.put("/api/manage/automation-appearance/light.missing", json={"icon": "sun"}).status_code == 404
    )
    client.post("/api/users", json={"name": "viewer", "password": "another long password", "role": "user"})
    client.post("/api/logout")
    login(client, "viewer", "another long password")
    assert client.put(path, json={"icon": "sun"}).status_code == 403


def test_notification_recipients_use_registered_ha_services(tmp_path):
    from types import SimpleNamespace
    from unittest.mock import AsyncMock

    from app.management import management_router
    from fastapi import FastAPI

    rest = AsyncMock(
        return_value=[
            {"domain": "light", "services": {"turn_on": {}}},
            {
                "domain": "notify",
                "services": {
                    "mobile_app_new_iphone": {"name": "New iPhone"},
                    "mobile_app_annas_phone": {},
                    "persistent_notification": {},
                    "send_message": {},
                },
            },
        ]
    )
    import time

    from app.storage import Store

    store = Store(tmp_path / "recipients.sqlite")
    with store.connect() as db:
        db.execute("INSERT INTO users(id,name,password,role) VALUES(1,'Anna','unused','admin')")
        for id, revoked in [("phone", 0), ("old", 1)]:
            db.execute(
                "INSERT INTO mobile_devices(id,user_id,name,created,expires,revoked) VALUES(?,1,'iPhone',?,?,?)",
                (id, time.time(), time.time() + 3600, revoked),
            )
            store_value = {"push_token": "private", "notify_service": "notify.mobile_app_annas_phone"}
    store.set("companion:phone", json.dumps(store_value))
    store.set("companion:old", json.dumps(store_value))
    app = FastAPI()
    app.include_router(management_router(SimpleNamespace(demo=False, rest=rest, store=store), lambda: True))
    with TestClient(app) as client:
        assert client.get("/api/manage/notification-recipients").json() == [
            {"action": "notify.mobile_app_annas_phone", "name": "Anna", "phone": "iPhone"},
        ]
        rest.assert_awaited_once_with("GET", "services")


def test_demo_has_no_real_notification_recipients(client):
    assert client.get("/api/manage/notification-recipients").json() == []


def test_automation_services_are_read_only_and_filter_entity_features():
    from types import SimpleNamespace
    from unittest.mock import AsyncMock

    from app.management import management_router
    from fastapi import FastAPI

    rest = AsyncMock(
        return_value=[
            {
                "domain": "siren",
                "services": {
                    "turn_on": {
                        "name": "Start siren",
                        "target": {"entity": [{"domain": ["siren"], "supported_features": [1]}]},
                        "fields": {"duration": {"selector": {"number": {"min": 1}}}},
                    },
                    "turn_off": {"target": {"entity": [{"supported_features": [2]}]}},
                    "global_operation": {"fields": {}},
                },
            },
            {"domain": "light", "services": {"turn_on": {"target": {}}}},
        ]
    )
    app = FastAPI()
    manager = SimpleNamespace(
        demo=False,
        connected=lambda: None,
        rest=rest,
        ha=SimpleNamespace(states={"siren.hall": {"attributes": {"supported_features": 1}}}),
    )
    app.include_router(management_router(manager, lambda: True))
    with TestClient(app) as c:
        result = c.get("/api/manage/automation-services?entity_id=siren.hall")
        assert result.status_code == 200
        assert [row["action"] for row in result.json()] == ["siren.turn_on"]
        assert result.json()[0]["fields"]["duration"]["selector"]["number"]["min"] == 1
        rest.assert_awaited_once_with("GET", "services")
        assert c.get("/api/manage/automation-services?entity_id=siren.missing").status_code == 404


def test_update_gate_rechecks_before_install_and_hides_pending(live):
    client, ha = live
    gate = client.app.state.management.update_approval
    assert any(u["entity_id"] == "update.core" for u in client.get("/api/manage/updates").json())
    # Cached listing was approved, but operator withdraws before the click.
    gate.transport = httpx.MockTransport(lambda r: httpx.Response(200, json={"releases": []}))
    assert client.post("/api/manage/updates/update.core/install", json={"version": "2"}).status_code == 409
    assert not any(c[0] == "call_service" and c[1].get("domain") == "update" for c in ha.calls)
    assert not any(u["entity_id"] == "update.core" for u in client.get("/api/manage/updates").json())


def test_update_gate_pins_approved_version(live):
    client, ha = live
    ha.states["update.core"]["attributes"]["supported_features"] = 11
    assert client.post("/api/manage/updates/update.core/install", json={"version": "2"}).status_code == 200
    assert (
        "call_service",
        {
            "domain": "update",
            "service": "install",
            "service_data": {"entity_id": "update.core", "version": "2", "backup": False},
        },
    ) in ha.calls
