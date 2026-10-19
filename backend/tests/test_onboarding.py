import hashlib
import hmac
import json
import sqlite3

import httpx
import pytest
from fastapi.testclient import TestClient
from test_cloud import ORIGIN, SECRET, account

from app.cloud import create_cloud
from app.config import Settings
from app.ha import HAError
from app.hub_onboarding import HubOnboarding
from app.storage import Store

PASSWORD = "test-cloud-password-only"
CHECKS = dict.fromkeys(["ha", "zigbee", "zwave", "network", "clean"], True)
HEARTBEAT = {
    "boot_id": "boot",
    "fingerprint": "f" * 64,
    "version": "1.35.47",
    "users": 0,
    "ha_connected": True,
    "remote_ready": False,
}
PLAN = {
    "mode": "new",
    "name": "Hytta",
    "latitude": 59.9,
    "longitude": 10.7,
    "timezone": "Europe/Oslo",
    "rooms": [{"name": "Stue", "floor": "Første etasje"}, {"name": "Soverom", "floor": "Andre etasje"}],
    "experience": "simple",
    "password": PASSWORD,
}


def factory(tmp_path):
    path = tmp_path / "cloud.sqlite"
    app = create_cloud(path, SECRET)
    staff = account(app, "factory")
    owner = account(app, "customer")
    other = account(app, "stranger")
    with sqlite3.connect(path) as c:
        c.execute("INSERT INTO portal_admins SELECT id FROM accounts WHERE username='factory'")
    kit = staff.post(
        "/api/admin/hubs", json={"serial": "SMART-001", "model": "Hub One", "hardware": "Zigbee + Z-Wave"}
    ).json()
    home = kit["installation_id"]
    with sqlite3.connect(path) as c:
        nonce = c.execute("SELECT label_nonce FROM factory_hubs").fetchone()[0]
    label = hmac.new(
        SECRET.encode(), ("hub-label:" + home + ":" + nonce).encode(), hashlib.sha256
    ).hexdigest()
    activation = {"code": label, "pin": kit["activation_pin"]}
    hub = TestClient(app, base_url=ORIGIN, headers={"Authorization": "Bearer " + kit["remote_credential"]})
    return path, app, staff, owner, other, hub, home, activation, kit


def ready_and_claim(staff, owner, hub, home, activation):
    assert hub.post(f"/api/hubs/{home}/onboarding/heartbeat", json=HEARTBEAT).status_code == 200
    assert staff.post(f"/api/admin/hubs/{home}/ready", json=CHECKS).status_code == 200
    r = owner.post(f"/api/activation/{home}/claim", json=activation)
    assert r.status_code == 200, r.text


def test_factory_label_readiness_and_activation_isolation(tmp_path):
    path, app, staff, owner, other, hub, home, activation, kit = factory(tmp_path)
    anonymous = TestClient(app, base_url=ORIGIN)
    assert anonymous.get("/api/admin/hubs").status_code == 401
    assert owner.get("/api/admin/hubs").status_code == 403
    assert staff.get(f"/api/admin/hubs/{home}/label").headers["content-type"].startswith("image/svg+xml")
    inventory = staff.get("/api/admin/hubs").text
    assert kit["remote_credential"] not in inventory and kit["activation_pin"] not in inventory
    assert staff.post(f"/api/admin/hubs/{home}/ready", json=CHECKS).status_code == 409
    assert owner.post(f"/api/activation/{home}/claim", json=activation).status_code == 409
    assert (
        anonymous.post(f"/api/activation/{home}/identify", json=activation | {"pin": "00000000"}).status_code
        == 404
    )
    assert anonymous.post(f"/api/activation/{home}/identify", json=activation).status_code == 200
    assert anonymous.post(f"/api/activation/{home}/claim", json=activation).status_code == 401
    ready_and_claim(staff, owner, hub, home, activation)
    assert other.post(f"/api/activation/{home}/claim", json=activation).status_code == 409
    assert owner.post(f"/api/activation/{home}/claim", json=activation).status_code == 200
    assert (
        owner.post(
            f"/api/activation/{home}/claim", json=activation, headers={"X-CSRF-Token": "wrong"}
        ).status_code
        == 403
    )
    assert other.get(f"/api/onboarding/{home}").status_code == 404
    assert (
        hub.post(
            f"/api/hubs/{home}/onboarding/heartbeat", json=HEARTBEAT | {"fingerprint": "a" * 64}
        ).status_code
        == 409
    )
    assert anonymous.post(f"/api/hubs/{home}/onboarding/heartbeat", json=HEARTBEAT).status_code == 403


def test_plans_reset_reauth_and_retry(tmp_path):
    path, app, staff, owner, other, hub, home, activation, kit = factory(tmp_path)
    ready_and_claim(staff, owner, hub, home, activation)
    endpoint = f"/api/onboarding/{home}"
    assert owner.post(endpoint, json=PLAN | {"password": "wrong"}).status_code == 403
    assert owner.post(endpoint, json=PLAN | {"mode": "reset"}).status_code == 422
    assert owner.post(endpoint, json=PLAN | {"mode": "existing"}).status_code == 409
    assert owner.post(endpoint, json=PLAN | {"timezone": "fake/time"}).status_code == 422
    assert owner.post(endpoint, json=PLAN | {"rooms": [PLAN["rooms"][0]] * 2}).status_code == 422
    r = owner.post(endpoint, json=PLAN)
    assert r.status_code == 200, r.text
    job = r.json()["id"]
    assert owner.post(endpoint, json=PLAN).json()["id"] == job
    assert owner.post(endpoint, json=PLAN | {"name": "Other"}).status_code == 409
    assert "password_hash" not in owner.get(endpoint).text
    work = hub.post(f"/api/hubs/{home}/onboarding/heartbeat", json=HEARTBEAT).json()["plan"]
    assert work["password_hash"].startswith("$argon2") and work["username"] == "customer"
    assert PASSWORD not in json.dumps(work)
    assert (
        hub.post(
            f"/api/hubs/{home}/onboarding/progress",
            json={"id": "wrong", "status": "completed", "step": "completed"},
        ).status_code
        == 409
    )
    assert (
        hub.post(
            f"/api/hubs/{home}/onboarding/progress",
            json={"id": job, "status": "failed", "step": "checking", "error": "ha_unavailable"},
        ).status_code
        == 200
    )
    assert owner.post(endpoint, json=PLAN).json()["id"] == job
    assert (
        hub.post(
            f"/api/hubs/{home}/onboarding/progress",
            json={"id": job, "status": "completed", "step": "completed"},
        ).status_code
        == 200
    )
    assert (
        "plan" not in hub.post(f"/api/hubs/{home}/onboarding/heartbeat", json=HEARTBEAT | {"users": 1}).json()
    )
    assert (
        owner.post(
            endpoint, json=PLAN | {"mode": "reset", "confirmation": "SLETT BRUKERE OG HISTORIKK"}
        ).status_code
        == 200
    )


class FakeHA:
    connected = True

    def __init__(self):
        self.calls = []
        self.floors = []
        self.areas = []
        self.fail = False

    async def request(self, kind, **data):
        self.calls.append((kind, data))
        if kind == "config/area_registry/create" and self.fail:
            self.fail = False
            raise HAError("interruption")
        if kind == "config/floor_registry/list":
            return list(self.floors)
        if kind == "config/area_registry/list":
            return list(self.areas)
        if kind == "config/floor_registry/create":
            row = {"floor_id": str(len(self.floors)), **data}
            self.floors.append(row)
            return row
        if kind == "config/area_registry/create":
            row = {"area_id": str(len(self.areas)), **data}
            self.areas.append(row)
            return row
        if kind == "recorder/list_statistic_ids":
            return [{"statistic_id": "sensor.power"}]
        return {}


@pytest.mark.asyncio
async def test_worker_resumes_without_duplicate_rooms_and_reset_replay(tmp_path):
    path, app, staff, owner, other, hub, home, activation, kit = factory(tmp_path)
    settings = Settings(data_dir=tmp_path, database=tmp_path / "hub.sqlite", mode="demo")
    identity = tmp_path / "identity.json"
    identity.write_text(json.dumps({"installation_id": home, "credential": kit["remote_credential"]}))
    settings.remote_identity_file = identity
    store = Store(settings.database)
    ha = FakeHA()
    ha.fail = True
    worker = HubOnboarding(settings, ha, store, {}, httpx.ASGITransport(app=app))
    await worker.tick()
    assert staff.post(f"/api/admin/hubs/{home}/ready", json=CHECKS).status_code == 200
    assert owner.post(f"/api/activation/{home}/claim", json=activation).status_code == 200
    r = owner.post(f"/api/onboarding/{home}", json=PLAN)
    assert r.status_code == 200, r.text
    await worker.tick()
    assert owner.get(f"/api/onboarding/{home}").json()["plan"]["status"] == "failed"
    owner.post(f"/api/onboarding/{home}", json=PLAN)
    await worker.tick()
    await worker.tick()
    assert len(ha.floors) == 2 and len(ha.areas) == 2
    with store.connect() as c:
        assert c.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1
    assert json.loads(store.get("experience:1")) == {"mode": "simple"}
    assert owner.get(f"/api/onboarding/{home}").json()["plan"]["status"] == "completed"
    reset = PLAN | {"mode": "reset", "confirmation": "SLETT BRUKERE OG HISTORIKK"}
    assert owner.post(f"/api/onboarding/{home}", json=reset).status_code == 200
    await worker.tick()
    await worker.tick()
    assert len([x for x in ha.calls if x[0] == "recorder/clear_statistics"]) == 1
    with store.connect() as c:
        assert c.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1
    assert len(ha.areas) == 2


def test_reprovision_only_unclaimed_preparing_hubs(tmp_path):
    path, app, staff, owner, other, hub, home, activation, kit = factory(tmp_path)
    endpoint = f"/api/admin/hubs/{home}/reprovision"
    assert owner.post(endpoint).status_code == 403
    assert staff.post(endpoint, headers={"X-CSRF-Token": "wrong"}).status_code == 403
    renewed = staff.post(endpoint)
    assert renewed.status_code == 200
    assert renewed.json()["remote_credential"] != kit["remote_credential"]
    assert hub.post(f"/api/hubs/{home}/onboarding/heartbeat", json=HEARTBEAT).status_code == 403
    hub.headers["Authorization"] = "Bearer " + renewed.json()["remote_credential"]
    activation["pin"] = renewed.json()["activation_pin"]
    ready_and_claim(staff, owner, hub, home, activation)
    assert staff.post(endpoint).status_code == 409


def test_lan_discovery_proof_requires_pin_and_expires(tmp_path):
    import time

    path, app, staff, owner, other, hub, home, activation, kit = factory(tmp_path)
    endpoint = f"/api/hubs/{home}/onboarding/heartbeat"
    assert "discovery" not in hub.post(endpoint, json=HEARTBEAT).json()
    assert staff.post(f"/api/admin/hubs/{home}/ready", json=CHECKS).status_code == 200
    discovery = hub.post(endpoint, json=HEARTBEAT).json()["discovery"]
    assert discovery["id"] == home
    assert kit["remote_credential"] not in json.dumps(discovery)
    assert kit["activation_pin"] not in json.dumps(discovery)
    assert "discovery" not in hub.post(endpoint, json=HEARTBEAT | {"users": 1}).json()
    body = {"code": discovery["proof"], "pin": kit["activation_pin"]}
    identify = f"/api/activation/{home}/identify"
    bad_pin = "11111111" if body["pin"] != "11111111" else "22222222"
    assert owner.post(identify, json=body | {"pin": bad_pin}).status_code == 404
    expired = str(int(time.time()) - 301)
    expired += (
        "."
        + hmac.new(
            SECRET.encode(), ("lan-discovery:" + home + ":" + expired).encode(), hashlib.sha256
        ).hexdigest()
    )
    assert owner.post(identify, json=body | {"code": expired}).status_code == 404
    assert owner.post(identify, json=body | {"code": "0" * 64}).status_code == 404
    assert owner.post(identify, json=body).status_code == 200
    hub.post(endpoint, json=HEARTBEAT)
    claim = f"/api/activation/{home}/claim"
    assert owner.post(claim, json=body).status_code == 200
    assert owner.post(claim, json=body).status_code == 200
    assert other.post(claim, json=body).status_code == 409
    assert "discovery" not in hub.post(endpoint, json=HEARTBEAT).json()


@pytest.mark.asyncio
async def test_bonjour_updates_and_stops(monkeypatch):
    from app import lan_discovery

    calls = []

    class FakeZeroconf:
        async def async_register_service(self, info):
            calls.append(("register", info))

        async def async_update_service(self, info):
            calls.append(("update", info))

        async def async_unregister_service(self, info):
            calls.append(("remove", info))

        async def async_close(self):
            calls.append(("close", None))

    monkeypatch.setattr(lan_discovery, "AsyncZeroconf", FakeZeroconf)
    advertiser = lan_discovery.HubAdvertisement()
    data = {
        "id": "12345678-1234-1234-1234-123456789012",
        "proof": "1234567890." + "a" * 64,
        "model": "Ø" * 120,
        "serial": "SM-001",
    }
    await advertiser.update(data)
    await advertiser.update(data | {"proof": "1234567891." + "b" * 64})
    await advertiser.update(None)
    assert [c[0] for c in calls] == ["register", "update", "close"]
    assert calls[0][1].properties[b"state"] == b"ready"
    assert advertiser.zeroconf is None
