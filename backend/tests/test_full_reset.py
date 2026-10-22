import json
import sqlite3
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest
from cryptography.hazmat.primitives.asymmetric import x25519
from test_ha_auth_reset import fixture_documents
from test_onboarding import HEARTBEAT, PLAN, factory, ready_and_claim

from app.config import Settings
from app.full_reset import ISOLATED_CONFIG, NORMAL_CONFIG, FullReset
from app.ha_auth_reset import AuthResetError
from app.reset_credentials import public_key, seal, unseal
from app.storage import Store


def test_reset_credentials_bound_to_hub_and_generation():
    key = x25519.X25519PrivateKey.generate()
    envelope = seal(public_key(key), "generation", "owner", "secret")
    assert "secret" not in envelope
    assert unseal(key, "generation", envelope) == {"username": "owner", "password": "secret"}
    with pytest.raises(ValueError):
        unseal(key, "another", envelope)
    with pytest.raises(ValueError):
        unseal(x25519.X25519PrivateKey.generate(), "generation", envelope)


def test_cloud_reset_owner_bound_revocation_and_sealed_setup(tmp_path):
    path, app, staff, owner, other, hub, home, activation, kit = factory(tmp_path)
    ready_and_claim(staff, owner, hub, home, activation)
    key = x25519.X25519PrivateKey.generate()
    reset_id = str(uuid4())
    url = f"/api/hubs/{home}/factory-reset"
    assert owner.post(url + "/begin", json={"id": reset_id, "public_key": public_key(key)}).status_code == 403
    with sqlite3.connect(path) as c:
        owner_id = c.execute("SELECT id FROM accounts WHERE username='customer'").fetchone()[0]
        c.execute("INSERT INTO claims VALUES(?,?,?)", ("oldclaim", home, 9999999999))
    assert hub.post(url + "/begin", json={"id": reset_id, "public_key": public_key(key)}).status_code == 200
    assert hub.post(url + "/begin", json={"id": reset_id, "public_key": public_key(key)}).status_code == 200
    assert owner.post("/api/onboarding/" + home, json=PLAN).status_code == 409
    assert hub.post(url + "/ready", json={"id": str(uuid4())}).status_code == 409
    assert hub.post(url + "/ready", json={"id": reset_id}).status_code == 200
    assert owner.get("/api/homes").json()[0]["reset_phase"] == "awaiting_owner"
    inventory = staff.get("/api/admin/hubs").json()[0]
    assert inventory["reset"] == {
        "phase": "awaiting_owner",
        "qr_required": 1,
        "qr_verified": 0,
        "ownership": "keep_owner",
    }
    assert "public_key" not in inventory["reset"]
    assert other.post("/api/onboarding/" + home, json=PLAN).status_code == 404
    assert owner.post("/api/onboarding/" + home, json=PLAN).json()["detail"] == "reset_qr_required"
    assert other.post(f"/api/activation/{home}/claim", json=activation).status_code == 409
    assert owner.post(f"/api/activation/{home}/claim", json=activation).status_code == 200
    response = owner.post("/api/onboarding/" + home, json=PLAN)
    assert response.status_code == 200, response.text
    plan = hub.post(f"/api/hubs/{home}/onboarding/heartbeat", json=HEARTBEAT).json()["plan"]
    assert unseal(key, reset_id, plan["ha_credentials"])["password"] == PLAN["password"]
    assert "ha_credentials" not in owner.get("/api/onboarding/" + home).text
    with sqlite3.connect(path) as c:
        assert c.execute("SELECT owner,remote_enabled FROM homes WHERE id=?", (home,)).fetchone() == (
            owner_id,
            0,
        )
        assert not c.execute("SELECT 1 FROM claims WHERE home=?", (home,)).fetchone()
        assert (
            PLAN["password"]
            not in c.execute("SELECT payload FROM onboarding_plans WHERE home=?", (home,)).fetchone()[0]
        )
    assert owner.post("/api/onboarding/" + home, json=PLAN).json() == response.json()
    assert (
        hub.post(
            f"/api/hubs/{home}/onboarding/progress",
            json={"id": plan["id"], "status": "completed", "step": "completed"},
        ).status_code
        == 200
    )
    assert owner.get("/api/homes").json()[0]["reset_phase"] is None
    assert staff.get("/api/admin/hubs").json()[0]["reset"]["phase"] == "completed"


class SupervisorFake:
    def __init__(self):
        self.info = {
            "version": "2026.10.2",
            "boot": True,
            "watchdog": True,
            "port": 8123,
            "ssl": False,
            "ip_address": "172.30.32.1",
        }
        self.calls = []

    async def request(self, method, path, data=None):
        self.calls.append((method, path, data))
        if path == "/addons/self/info":
            return {"boot": "auto"}
        if path == "/core/options":
            self.info.update(data)
        return dict(self.info)


def setup_reset(tmp_path):
    root = tmp_path / "ha"
    root.mkdir()
    storage = root / ".storage"
    storage.mkdir()
    for name, doc in fixture_documents().items():
        (storage / name).write_text(json.dumps(doc))
    (storage / "core.config_entries").write_text('{"customer":"old"}')
    (root / "configuration.yaml").write_text("default_config:\n")
    (root / "home-assistant_v2.db").write_text("old history")
    (root / "secrets.yaml").write_text("old password")
    (root / "zigbee2mqtt").mkdir()
    (root / "zigbee2mqtt" / "database.db").write_text("paired devices")
    (root / "custom_components").mkdir()
    (root / "custom_components" / "keep.py").write_text("software")
    settings = Settings(
        _env_file=None, ingress=True, data_dir=tmp_path / "data", remote_identity_file=tmp_path / "identity"
    )
    store = Store(settings.database)
    with store.connect() as c:
        c.execute("INSERT INTO users VALUES(1,'old','hash','admin')")
        c.execute("INSERT INTO sessions VALUES('oldtoken',1,'csrf',9999999999)")
    supervisor = SupervisorFake()
    owner_requests = []

    def ha(request):
        onboarding = json.loads((storage / "onboarding").read_text())
        if request.method == "GET":
            return httpx.Response(200, json=[{"step": "user", "done": "user" in onboarding["data"]["done"]}])
        assert request.url.path == "/api/onboarding/users"
        body = json.loads(request.content)
        owner_requests.append(body)
        user_id = uuid4().hex
        auth = json.loads((storage / "auth").read_text())
        auth["data"]["users"].append(
            {
                "id": user_id,
                "system_generated": False,
                "is_owner": True,
                "local_only": False,
                "is_active": True,
                "name": body["name"],
            }
        )
        auth["data"]["credentials"].append(
            {
                "id": uuid4().hex,
                "user_id": user_id,
                "auth_provider_type": "homeassistant",
                "data": {"username": body["username"]},
            }
        )
        auth["data"]["refresh_tokens"].append({"user_id": user_id, "token": "onboarding-token"})
        (storage / "auth").write_text(json.dumps(auth))
        provider = json.loads((storage / "auth_provider.homeassistant").read_text())
        provider["data"]["users"].append({"username": body["username"], "password": "test-hash"})
        (storage / "auth_provider.homeassistant").write_text(json.dumps(provider))
        onboarding["data"]["done"].append("user")
        (storage / "onboarding").write_text(json.dumps(onboarding))
        return httpx.Response(200, json={"auth_code": "not-returned"})

    reset = FullReset(settings, store, root, supervisor, ha_transport=httpx.MockTransport(ha))
    reset.owner_requests = owner_requests
    reset.host_boot_id = lambda: "boot-one"
    reset.cloud = AsyncMock(return_value={"version": 2, "acknowledged": True})
    return reset, store, supervisor


@pytest.mark.asyncio
async def test_full_reset_erases_users_history_config_keeps_apps_and_requires_owner(tmp_path, monkeypatch):
    reset, store, supervisor = setup_reset(tmp_path)

    async def refused(*a, **k):
        raise ConnectionRefusedError()

    monkeypatch.setattr("asyncio.open_connection", refused)
    assert await reset.execute() == ("done", "")
    assert reset.state()["phase"] == "awaiting_reboot"
    await reset.resume_reboot()
    await reset.resume_reboot()
    assert sum(path == "/host/reboot" for _, path, _ in supervisor.calls) == 1
    reset.host_boot_id = lambda: "boot-two"
    await reset.resume_reboot()
    assert reset.state()["phase"] == "awaiting_owner"
    assert (reset.root / "configuration.yaml").read_text() == NORMAL_CONFIG
    assert not (reset.root / "home-assistant_v2.db").exists()
    assert (reset.root / "zigbee2mqtt" / "database.db").read_text() == "paired devices"
    assert not (reset.root / ".storage" / "core.config_entries").exists()
    assert (reset.root / "custom_components" / "keep.py").read_text() == "software"
    with store.connect() as c:
        assert c.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0
        assert c.execute("SELECT COUNT(*) FROM sessions").fetchone()[0] == 0
    assert sum(path == "/core/start" for _, path, _ in supervisor.calls) == 2
    with pytest.raises(AuthResetError, match="reset_plan_mismatch"):
        await reset.bootstrap({"reset_id": str(uuid4())})


@pytest.mark.asyncio
async def test_cloud_failure_changes_no_customer_files(tmp_path):
    reset, store, supervisor = setup_reset(tmp_path)

    async def cloud(action, body=None):
        if action == "capabilities":
            return {"version": 2}
        raise httpx.ConnectError("offline")

    reset.cloud = cloud
    with pytest.raises(httpx.ConnectError):
        await reset.execute()
    assert (reset.root / "home-assistant_v2.db").exists()
    with store.connect() as c:
        assert c.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1
    assert not any(method == "POST" for method, _, _ in supervisor.calls)


@pytest.mark.asyncio
async def test_external_database_is_blocked_before_mutation(tmp_path):
    reset, _, supervisor = setup_reset(tmp_path)
    (reset.root / "configuration.yaml").write_text('"recorder":\n  db_url: mysql://remote/db\n')
    with pytest.raises(AuthResetError, match="custom_recorder"):
        await reset.execute()
    assert not supervisor.calls


@pytest.mark.asyncio
async def test_local_packages_are_checked_and_allowed(tmp_path):
    reset, store, supervisor = setup_reset(tmp_path)
    (reset.root / "packages").mkdir()
    (reset.root / "packages" / "lights.yaml").write_text("input_boolean:\n  test_light:\n")
    (reset.root / "configuration.yaml").write_text(
        "homeassistant:\n  packages: !include_dir_named packages\n"
    )
    await reset.preflight()
    (reset.root / "packages" / "history.yaml").write_text("recorder:\n  db_url: !secret database\n")
    with pytest.raises(AuthResetError, match="custom_recorder"):
        await reset.preflight()
    assert all(method == "GET" for method, _, _ in supervisor.calls)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "content",
    [
        "homeassistant:\n  packages: !include ../outside.yaml\n",
        "homeassistant:\n  packages: !include configuration.yaml\n",
        "homeassistant: &loop\n  packages: *loop\n",
    ],
)
async def test_unsafe_or_recursive_package_includes_remain_blocked(tmp_path, content):
    reset, store, supervisor = setup_reset(tmp_path)
    (reset.root / "configuration.yaml").write_text(content)
    with pytest.raises(AuthResetError, match="custom_yaml"):
        await reset.preflight()
    assert not supervisor.calls


@pytest.mark.asyncio
async def test_preflight_reports_safe_reason_without_exception_details(tmp_path):
    from types import SimpleNamespace

    from app.factory_reset_provider import HomeResetProvider

    reset, store, _ = setup_reset(tmp_path)
    provider = HomeResetProvider(
        SimpleNamespace(connected=True), SimpleNamespace(session=None), reset.settings, store
    )
    provider.full.preflight = AsyncMock(side_effect=AuthResetError("ha_auth_schema_unsupported"))
    assert (await provider.preflight())["blockers"] == ["ha_auth_schema_unsupported"]
    provider.full.preflight = AsyncMock(side_effect=AuthResetError("secret raw data"))
    assert (await provider.preflight())["blockers"] == ["full_reset_preflight_failed"]
    provider.full.preflight = AsyncMock(side_effect=PermissionError("secret path"))
    assert (await provider.preflight())["blockers"] == ["reset_storage_unreadable"]


@pytest.mark.asyncio
async def test_full_plan_never_calls_pairing_apis(tmp_path):
    from types import SimpleNamespace

    from app.factory_reset_provider import HomeResetProvider

    reset, store, _ = setup_reset(tmp_path)
    ha = SimpleNamespace(request=AsyncMock(side_effect=AssertionError("No device inventory needed")))
    provider = HomeResetProvider(ha, SimpleNamespace(), reset.settings, store)
    plan = await provider.plan()
    assert [op["kind"] for op in plan] == ["manual", "full_reset"]
    assert plan[0]["reason"] == "pairings_not_removed"
    ha.request.assert_not_called()


@pytest.mark.asyncio
async def test_uncertain_reboot_is_not_replayed(tmp_path):
    from fastapi import HTTPException

    reset, _, supervisor = setup_reset(tmp_path)
    reset.save({"id": "reset", "phase": "awaiting_reboot", "host_boot_id": "boot-one", "report": []})
    original = supervisor.request

    async def request(method, path, data=None):
        await original(method, path, data)
        if path == "/host/reboot":
            raise HTTPException(502, "unknown result")

    supervisor.request = request
    await reset.resume_reboot()
    await reset.resume_reboot()
    assert reset.state()["reboot_unconfirmed"]
    assert sum(path == "/host/reboot" for _, path, _ in supervisor.calls) == 1
    reset.host_boot_id = lambda: "boot-two"
    await reset.resume_reboot()
    assert reset.state()["phase"] == "awaiting_owner"


def test_release_owner_requires_finished_reset_and_same_qr_can_onboard_new_owner(tmp_path):
    path, app, staff, owner, other, hub, home, activation, kit = factory(tmp_path)
    ready_and_claim(staff, owner, hub, home, activation)
    key = x25519.X25519PrivateKey.generate()
    reset_id = str(uuid4())
    url = f"/api/hubs/{home}/factory-reset"
    body = {"id": reset_id, "public_key": public_key(key), "ownership": "release_owner"}
    with sqlite3.connect(path) as c:
        original_label = c.execute("SELECT label_nonce FROM factory_hubs WHERE home=?", (home,)).fetchone()[0]
        original_owner = c.execute("SELECT owner FROM homes WHERE id=?", (home,)).fetchone()[0]
    import hashlib
    import hmac

    from test_cloud import SECRET

    activation = {
        "code": "v2."
        + hmac.new(
            SECRET.encode(), ("hub-qr-v2:" + home + ":" + original_label).encode(), hashlib.sha256
        ).hexdigest()
    }
    assert hub.post(url + "/begin", json=body).status_code == 200
    assert hub.post(url + "/begin", json=body | {"ownership": "keep_owner"}).status_code == 409
    assert other.post(f"/api/activation/{home}/claim", json=activation).status_code == 409
    assert hub.post(url + "/ready", json={"id": reset_id, "phase": "rebooting"}).status_code == 200
    with sqlite3.connect(path) as c:
        assert c.execute("SELECT owner FROM homes WHERE id=?", (home,)).fetchone()[0] == original_owner
    assert hub.post(url + "/ready", json={"id": reset_id}).status_code == 200
    assert owner.get("/api/homes").json() == []
    assert owner.get("/api/onboarding/" + home).status_code == 404
    assert owner.post("/api/customer/homes/" + home + "/open").status_code == 409
    assert hub.post(url + "/begin", json=body).status_code == 200
    # Reusing the unchanged printed label establishes a new owner, not a reused plan.
    assert other.post(f"/api/activation/{home}/claim", json=activation).status_code == 200
    assert hub.post(url + "/ready", json={"id": reset_id}).status_code == 200
    assert len(other.get("/api/homes").json()) == 1
    assert owner.get("/api/homes").json() == []
    assert other.post("/api/onboarding/" + home, json=PLAN).status_code == 200
    plan = hub.post(f"/api/hubs/{home}/onboarding/heartbeat", json=HEARTBEAT).json()["plan"]
    assert plan["username"] == "stranger"
    assert unseal(key, reset_id, plan["ha_credentials"])["password"] == PLAN["password"]
    with sqlite3.connect(path) as c:
        assert (
            c.execute("SELECT label_nonce FROM factory_hubs WHERE home=?", (home,)).fetchone()[0]
            == original_label
        )
        assert c.execute("SELECT owner FROM homes WHERE id=?", (home,)).fetchone()[0] != original_owner
        assert c.execute("SELECT COUNT(*) FROM accounts").fetchone()[0] == 3


@pytest.mark.asyncio
async def test_new_owner_reset_requires_cloud_support_before_erasure(tmp_path, monkeypatch):
    async def refused(*args, **kwargs):
        raise ConnectionRefusedError()

    monkeypatch.setattr("asyncio.open_connection", refused)
    reset, store, supervisor = setup_reset(tmp_path)
    with pytest.raises(AuthResetError, match="cloud_reset_update_required"):
        await reset.execute(ownership="release_owner")
    with store.connect() as c:
        assert c.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1
    reset.cloud = AsyncMock(return_value={"version": 3, "acknowledged": True})
    assert await reset.execute(ownership="release_owner") == ("done", "")
    begin = next(call for call in reset.cloud.call_args_list if call.args[0] == "begin")
    assert begin.args[1]["ownership"] == "release_owner"
    assert reset.state()["ownership"] == "release_owner"
    with store.connect() as c:
        assert c.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0


@pytest.mark.asyncio
async def test_recovery_owner_is_local_and_revoked_before_real_owner(tmp_path, monkeypatch):
    reset, store, supervisor = setup_reset(tmp_path)

    async def refused(*a, **k):
        raise ConnectionRefusedError()

    monkeypatch.setattr("asyncio.open_connection", refused)
    await reset.execute()
    state = reset.state()
    recovery_id = state["recovery_user"]
    auth_path = reset.root / ".storage" / "auth"
    auth = json.loads(auth_path.read_text())
    recovery = next(u for u in auth["data"]["users"] if u["id"] == recovery_id)
    assert recovery["local_only"] and recovery["is_owner"]
    assert not any(t["user_id"] == recovery_id for t in auth["data"]["refresh_tokens"])
    assert reset.owner_requests[0]["username"] == "admin"
    assert reset.owner_requests[0]["password"] == "admin123"
    assert supervisor.info["boot"] is True
    # Simulate recovery sessions, including tokens that must not survive setup.
    auth["data"]["refresh_tokens"].append({"user_id": recovery_id, "token": "recovery-session"})
    auth_path.write_text(json.dumps(auth))
    reset.host_boot_id = lambda: "boot-two"
    await reset.resume_reboot()
    key = x25519.X25519PrivateKey.from_private_bytes(reset.key_path.read_bytes())
    plan = {
        "reset_id": state["id"],
        "username": "newowner",
        "ha_credentials": seal(public_key(key), state["id"], "newowner", "A new password 123"),
    }
    await reset.bootstrap(plan)
    auth = json.loads(auth_path.read_text())["data"]
    assert not any(u["id"] == recovery_id for u in auth["users"])
    assert not any(t["user_id"] == recovery_id for t in auth["refresh_tokens"])
    assert not any(c["user_id"] == recovery_id for c in auth["credentials"])
    provider = json.loads((reset.root / ".storage" / "auth_provider.homeassistant").read_text())
    assert [u["username"] for u in provider["data"]["users"]] == ["newowner"]
    assert reset.state()["phase"] == "completed"
    assert "recovery_user" not in reset.state()
    assert not reset.key_path.exists()
    await reset.bootstrap(plan)
    assert len(reset.owner_requests) == 2


@pytest.mark.asyncio
async def test_recovery_creation_failure_never_exposes_ha(tmp_path, monkeypatch):
    reset, _, supervisor = setup_reset(tmp_path)

    async def refused(*a, **k):
        raise ConnectionRefusedError()

    monkeypatch.setattr("asyncio.open_connection", refused)
    reset.ha_transport = httpx.MockTransport(
        lambda r: (
            httpx.Response(200, json=[{"step": "user", "done": False}])
            if r.method == "GET"
            else httpx.Response(500)
        )
    )
    with pytest.raises(AuthResetError):
        await reset.execute()
    assert reset.state()["phase"] == "failed"
    assert (reset.root / "configuration.yaml").read_text() == ISOLATED_CONFIG
    assert supervisor.info["boot"] is False
    assert not any(path == "/host/reboot" for _, path, _ in supervisor.calls)


@pytest.mark.asyncio
async def test_recovery_removal_failure_does_not_create_real_owner(tmp_path, monkeypatch):
    reset, _, supervisor = setup_reset(tmp_path)

    async def refused(*a, **k):
        raise ConnectionRefusedError()

    monkeypatch.setattr("asyncio.open_connection", refused)
    await reset.execute()
    reset.host_boot_id = lambda: "boot-two"
    await reset.resume_reboot()
    state = reset.state()
    key = x25519.X25519PrivateKey.from_private_bytes(reset.key_path.read_bytes())
    plan = {
        "reset_id": state["id"],
        "username": "newowner",
        "ha_credentials": seal(public_key(key), state["id"], "newowner", "A new password 123"),
    }
    monkeypatch.setattr(
        "app.full_reset.OfflineAuthReset.execute", AsyncMock(side_effect=AuthResetError("write_failed"))
    )
    with pytest.raises(AuthResetError):
        await reset.bootstrap(plan)
    assert len(reset.owner_requests) == 1
    assert supervisor.info["boot"] is False
    assert (reset.root / "configuration.yaml").read_text() == ISOLATED_CONFIG


@pytest.mark.asyncio
@pytest.mark.parametrize("phase", ["creating_owner", "failed"])
@pytest.mark.parametrize("existing", ["empty", "owner", "orphan", "schema"])
async def test_interrupted_owner_creation_resumes_only_proven_empty_storage(
    tmp_path, monkeypatch, existing, phase
):
    reset, _, supervisor = setup_reset(tmp_path)

    async def refused(*a, **k):
        raise ConnectionRefusedError()

    monkeypatch.setattr("asyncio.open_connection", refused)
    await reset.execute()
    reset.host_boot_id = lambda: "boot-two"
    await reset.resume_reboot()
    state = reset.state()
    await reset.remove_recovery_owner(state)
    state["phase"] = phase
    reset.save(state)
    storage = reset.root / ".storage"
    if existing == "owner":
        await reset.isolated_owner(
            name="Existing", username="existing", password="secret", before_create=lambda: None
        )
    elif existing == "orphan":
        path = storage / "auth_provider.homeassistant"
        doc = json.loads(path.read_text())
        doc["data"]["users"].append({"username": "orphan", "password": "hash"})
        path.write_text(json.dumps(doc))
    elif existing == "schema":
        path = storage / "auth"
        doc = json.loads(path.read_text())
        doc["version"] = 99
        path.write_text(json.dumps(doc))
    original = {p.name: p.read_bytes() for p in storage.iterdir() if p.is_file()}
    posts = len(reset.owner_requests)
    key = x25519.X25519PrivateKey.from_private_bytes(reset.key_path.read_bytes())
    plan = {
        "reset_id": state["id"],
        "username": "NewOwner",
        "ha_credentials": seal(public_key(key), state["id"], "NewOwner", "A new password 123"),
    }
    if existing == "empty":
        await reset.bootstrap(plan)
        assert reset.state()["phase"] == "completed"
        assert len(reset.owner_requests) == posts + 1
        assert reset.owner_requests[-1]["username"] == "newowner"
    else:
        with pytest.raises(AuthResetError):
            await reset.bootstrap(plan)
        assert len(reset.owner_requests) == posts
        assert reset.state()["phase"] == phase
        assert {p.name: p.read_bytes() for p in storage.iterdir() if p.is_file()} == original
        assert supervisor.info["boot"] is False


@pytest.mark.asyncio
async def test_reset_keeps_8123_and_reimports_http_at_every_access_transition(tmp_path, monkeypatch):
    """Model HA's one-time YAML import: an existing store overrides new YAML."""
    import yaml

    reset, _, supervisor = setup_reset(tmp_path)
    storage = reset.root / ".storage" / "http"
    storage.write_text(
        json.dumps(
            {
                "version": 2,
                "minor_version": 2,
                "key": "http",
                "data": {"stable": {"server_port": 80}, "pending": None, "yaml_migration_done": True},
            }
        )
    )
    starts = []
    request = supervisor.request

    async def ha_request(method, path, data=None):
        if path == "/core/start":
            if storage.exists():
                document = json.loads(storage.read_text())
                assert document["data"]["pending"] is None
                assert document["data"]["yaml_migration_done"] is True
                config = document["data"]["stable"]
            else:
                config = yaml.load(
                    (reset.root / "configuration.yaml").read_text(), Loader=yaml.BaseLoader
                ).get("http", {"server_port": 80})
                storage.write_text(json.dumps(config))
            starts.append(config)
        return await request(method, path, data)

    async def refused(*args, **kwargs):
        raise ConnectionRefusedError()

    supervisor.request = ha_request
    monkeypatch.setattr("asyncio.open_connection", refused)
    await reset.execute()
    reset.host_boot_id = lambda: "boot-two"
    await reset.resume_reboot()
    state = reset.state()
    key = x25519.X25519PrivateKey.from_private_bytes(reset.key_path.read_bytes())
    await reset.bootstrap(
        {
            "reset_id": state["id"],
            "username": "newowner",
            "ha_credentials": seal(public_key(key), state["id"], "newowner", "A new password 123"),
        }
    )
    assert len(starts) == 4
    assert all(int(config["server_port"]) == 8123 for config in starts)
    assert [config.get("server_host") for config in starts] == [
        ["127.0.0.1", "172.30.32.1"],
        None,
        ["127.0.0.1", "172.30.32.1"],
        None,
    ]
    assert reset.state()["phase"] == "completed"


@pytest.mark.asyncio
async def test_reset_http_does_not_modify_storage_without_confirmed_stop(tmp_path):
    reset, _, _ = setup_reset(tmp_path)
    storage = reset.root / ".storage" / "http"
    storage.write_text("keep")
    original = (reset.root / "configuration.yaml").read_text()
    with pytest.raises(AuthResetError, match="ha_stop_unconfirmed"):
        await reset.configure_reset_http(NORMAL_CONFIG)
    assert storage.read_text() == "keep"
    assert (reset.root / "configuration.yaml").read_text() == original


@pytest.mark.asyncio
async def test_reset_http_rejects_unknown_storage_schema_before_writing(tmp_path, monkeypatch):
    reset, _, supervisor = setup_reset(tmp_path)
    reset.stopped = True
    supervisor.info.update(boot=False, watchdog=False)

    async def refused(*args, **kwargs):
        raise ConnectionRefusedError()

    monkeypatch.setattr("asyncio.open_connection", refused)
    storage = reset.root / ".storage" / "http"
    storage.write_text('{"version": 3, "minor_version": 0}')
    original = (reset.root / "configuration.yaml").read_text()
    with pytest.raises(AuthResetError, match="ha_http_storage_unsupported"):
        await reset.configure_reset_http(NORMAL_CONFIG)
    assert (reset.root / "configuration.yaml").read_text() == original
    assert json.loads(storage.read_text())["version"] == 3
