import json
import sqlite3
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest
from app.config import Settings
from app.full_reset import ISOLATED_CONFIG, FullReset
from app.ha_auth_reset import AuthResetError
from app.reset_credentials import public_key, seal, unseal
from app.storage import Store
from cryptography.hazmat.primitives.asymmetric import x25519
from test_ha_auth_reset import fixture_documents
from test_onboarding import HEARTBEAT, PLAN, factory, ready_and_claim


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
    assert other.post("/api/onboarding/" + home, json=PLAN).status_code == 404
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


class SupervisorFake:
    def __init__(self):
        self.info = {"boot": True, "watchdog": True, "port": 8123, "ssl": False, "ip_address": "172.30.32.1"}
        self.calls = []

    async def request(self, method, path, data=None):
        self.calls.append((method, path, data))
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
    reset = FullReset(settings, store, root, supervisor)
    reset.cloud = AsyncMock(return_value={"version": 1, "acknowledged": True})
    return reset, store, supervisor


@pytest.mark.asyncio
async def test_full_reset_erases_users_history_config_keeps_apps_and_requires_owner(tmp_path, monkeypatch):
    reset, store, supervisor = setup_reset(tmp_path)

    async def refused(*a, **k):
        raise ConnectionRefusedError()

    monkeypatch.setattr("asyncio.open_connection", refused)
    assert await reset.execute() == ("done", "")
    assert reset.state()["phase"] == "awaiting_owner"
    assert (reset.root / "configuration.yaml").read_text() == ISOLATED_CONFIG
    assert not (reset.root / "home-assistant_v2.db").exists()
    assert not (reset.root / ".storage" / "core.config_entries").exists()
    assert (reset.root / "custom_components" / "keep.py").read_text() == "software"
    with store.connect() as c:
        assert c.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0
        assert c.execute("SELECT COUNT(*) FROM sessions").fetchone()[0] == 0
    assert not any(path == "/core/start" for _, path, _ in supervisor.calls)
    with pytest.raises(AuthResetError, match="reset_plan_mismatch"):
        await reset.bootstrap({"reset_id": str(uuid4())})


@pytest.mark.asyncio
async def test_cloud_failure_changes_no_customer_files(tmp_path):
    reset, store, supervisor = setup_reset(tmp_path)

    async def cloud(action, body=None):
        if action == "capabilities":
            return {"version": 1}
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
