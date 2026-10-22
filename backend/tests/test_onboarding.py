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

PASSWORD = "hub-password-only-2026"
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
    "country": "SE",
    "rooms": [{"name": "Stue", "floor": "Første etasje"}, {"name": "Soverom", "floor": "Andre etasje"}],
    "experience": "simple",
    "password": PASSWORD,
    "password_repeat": PASSWORD,
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
    assert owner.post(endpoint, json=PLAN | {"password": "wrong"}).status_code == 422
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
    assert next(data for kind, data in ha.calls if kind == "config/core/update")["country"] == "SE"
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


@pytest.mark.asyncio
async def test_reset_onboarding_waits_for_radios_before_user_and_completion(tmp_path, monkeypatch):
    from app.full_reset import FullReset

    path, app, staff, owner, other, hub, home, activation, kit = factory(tmp_path)
    settings = Settings(data_dir=tmp_path, database=tmp_path / "hub.sqlite", mode="demo")
    identity = tmp_path / "identity.json"
    identity.write_text(json.dumps({"installation_id": home, "credential": kit["remote_credential"]}))
    settings.remote_identity_file = identity
    store = Store(settings.database)
    worker = HubOnboarding(settings, FakeHA(), store, {}, httpx.ASGITransport(app=app))
    await worker.tick()
    assert staff.post(f"/api/admin/hubs/{home}/ready", json=CHECKS).status_code == 200
    assert owner.post(f"/api/activation/{home}/claim", json=activation).status_code == 200
    assert owner.post(f"/api/onboarding/{home}", json=PLAN).status_code == 200
    monkeypatch.setattr(FullReset, "state", lambda self: {"id": "reset-test", "phase": "completed"})

    class Radios:
        ready = False

        async def ensure(self, reset_id):
            assert reset_id == "reset-test"
            if not self.ready:
                raise HAError("radio_connections_not_ready")

    worker.radios = Radios()
    await worker.tick()
    plan = owner.get(f"/api/onboarding/{home}").json()["plan"]
    assert (plan["status"], plan["step"], plan["error"]) == ("failed", "radios", "radios_unavailable")
    with store.connect() as c:
        assert c.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0
    worker.radios.ready = True
    owner.post(f"/api/onboarding/{home}", json=PLAN)
    await worker.tick()
    assert owner.get(f"/api/onboarding/{home}").json()["plan"]["status"] == "completed"


def test_country_validation_and_legacy_default():
    from pydantic import ValidationError

    from app.cloud_onboarding import Plan

    assert Plan(**PLAN).country == "SE"
    assert Plan(**{k: v for k, v in PLAN.items() if k != "country"}).country == "NO"
    for invalid in ["Norge", "ZZ", "no", ""]:
        with pytest.raises(ValidationError):
            Plan(**(PLAN | {"country": invalid}))


def test_admin_map_only_exposes_completed_location_and_no_credentials(tmp_path):
    path, app, staff, owner, other, hub, home, activation, kit = factory(tmp_path)
    assert staff.get("/api/admin/hubs").json()[0]["location"] is None
    assert owner.get("/api/admin/hubs").status_code == 403
    assert TestClient(app, base_url=ORIGIN).get("/api/admin/hubs").status_code == 401
    payload = {**PLAN, "password_hash": "private-hash", "ha_credentials": "private-credentials"}
    with sqlite3.connect(path) as db:
        owner_id = db.execute("SELECT id FROM accounts WHERE username=?", ("customer",)).fetchone()[0]
        db.execute(
            "INSERT INTO onboarding_plans VALUES(?,?,?,?,?,?,?,?,?)",
            (home, "map-test", owner_id, json.dumps(payload), "working", "location", "", 1, 1),
        )
    assert staff.get("/api/admin/hubs").json()[0]["location"] is None
    with sqlite3.connect(path) as db:
        db.execute("UPDATE onboarding_plans SET status='completed'")
    result = staff.get("/api/admin/hubs").json()[0]
    assert result["location"] == {
        "latitude": 59.9,
        "longitude": 10.7,
        "name": "Hytta",
        "source": "onboarding",
    }
    assert "private-" not in str(result) and PASSWORD not in str(result)
    with sqlite3.connect(path) as db:
        db.execute(
            "INSERT INTO hub_resets(home,id,public_key,phase,created) VALUES(?,?,?,?,?)",
            (home, "reset", "", "awaiting_owner", 1),
        )
    assert staff.get("/api/admin/hubs").json()[0]["location"] is None


def test_admin_can_delete_only_unlinked_hub(tmp_path):
    path, app, staff, owner, other, hub, home, activation, kit = factory(tmp_path)
    url = "/api/admin/hubs/" + home
    assert staff.get("/api/admin/hubs").json()[0]["can_delete"] is True
    assert owner.delete(url).status_code == 403
    anonymous = TestClient(app, base_url=ORIGIN)
    assert anonymous.delete(url).status_code == 401
    ready_and_claim(staff, owner, hub, home, activation)
    assert staff.get("/api/admin/hubs").json()[0]["can_delete"] is False
    assert staff.delete(url).json()["detail"] == "hub_still_linked"
    with sqlite3.connect(path) as c:
        c.execute("UPDATE homes SET owner=NULL WHERE id=?", (home,))
        c.execute("DELETE FROM home_members WHERE home=?", (home,))
    assert staff.delete(url).status_code == 200
    assert staff.get("/api/admin/hubs").json() == []
    assert staff.get(url + "/label").status_code == 404
    assert hub.post(f"/api/hubs/{home}/onboarding/heartbeat", json=HEARTBEAT).status_code in (401, 403, 404)
    assert owner.post(f"/api/activation/{home}/claim", json=activation).status_code == 404
    with sqlite3.connect(path) as c:
        assert not c.execute("SELECT 1 FROM homes WHERE id=?", (home,)).fetchone()
        assert (
            c.execute("SELECT action FROM admin_audit WHERE target=? ORDER BY id DESC", (home,)).fetchone()[0]
            == "hub_deleted"
        )
    assert staff.delete(url).status_code == 404


def test_deletion_rechecks_link_and_blocks_reset_in_progress(tmp_path):
    path, app, staff, owner, other, hub, home, activation, kit = factory(tmp_path)
    assert staff.get("/api/admin/hubs").json()[0]["can_delete"] is True
    with sqlite3.connect(path) as c:
        c.execute(
            "INSERT INTO hub_resets(home,id,public_key,phase,created) VALUES(?, 'reset','key','erasing',0)",
            (home,),
        )
    assert staff.delete("/api/admin/hubs/" + home).json()["detail"] == "hub_operation_in_progress"
    with sqlite3.connect(path) as c:
        c.execute("DELETE FROM hub_resets WHERE home=?", (home,))
        account_id = c.execute("SELECT id FROM accounts WHERE username='customer'").fetchone()[0]
        c.execute("INSERT INTO home_members(home,account) VALUES(?,?)", (home, account_id))
    assert staff.delete("/api/admin/hubs/" + home).json()["detail"] == "hub_still_linked"


def test_home_photo_is_private_owner_managed_and_removed_with_hub(tmp_path):
    import base64

    path, app, staff, owner, other, hub, home, activation, kit = factory(tmp_path)
    ready_and_claim(staff, owner, hub, home, activation)
    url = f"/api/customer/homes/{home}/photo"
    raw = b"\xff\xd8\xff\xe0test-photo\xff\xd9"
    photo = "data:image/jpeg;base64," + base64.b64encode(raw).decode()
    assert other.put(url, json={"photo": photo}).status_code == 404
    assert owner.put(url, json={"photo": "data:image/svg+xml;base64,PHN2Zz4="}).status_code == 422
    assert owner.put(url, json={"photo": photo}).status_code == 200
    assert owner.get("/api/homes").json()[0]["photo_url"].startswith(url + "?v=")
    assert owner.get("/api/homes").json()[0]["can_manage"] is True
    assert owner.get(url).content == raw
    assert "no-store" in owner.get(url).headers["cache-control"]
    assert other.get(url).status_code == 404
    assert TestClient(app, base_url=ORIGIN).get(url).status_code == 401
    with sqlite3.connect(path) as c:
        account_id = c.execute("SELECT id FROM accounts WHERE username='stranger'").fetchone()[0]
        c.execute("INSERT INTO home_members VALUES(?,?)", (home, account_id))
    assert other.get(url).content == raw
    assert other.get("/api/homes").json()[0]["can_manage"] is False
    assert other.put(url, json={"photo": ""}).status_code == 404
    assert owner.put(url, json={"photo": ""}).status_code == 200
    assert owner.get(url).status_code == 404
    assert owner.put(url, json={"photo": photo}).status_code == 200
    with sqlite3.connect(path) as c:
        c.execute("DELETE FROM home_members WHERE home=?", (home,))
        c.execute("UPDATE homes SET owner=NULL WHERE id=?", (home,))
    assert staff.delete("/api/admin/hubs/" + home).status_code == 200
    with sqlite3.connect(path) as c:
        assert not c.execute("SELECT 1 FROM home_photos WHERE home=?", (home,)).fetchone()
