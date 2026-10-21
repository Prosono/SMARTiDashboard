import json
import shutil
import sqlite3
import uuid

import httpx
import pytest
from cryptography.hazmat.primitives.asymmetric import x25519
from test_onboarding import factory

from app.production_mode import start
from app.reset_credentials import public_key


def seed(data):
    data.mkdir()
    (data / "options.json").write_text(
        json.dumps({"remote_installation_id": str(uuid.uuid4()), "remote_credential": "x" * 48})
    )
    (data / "remote-identity.json").write_text(
        json.dumps({"installation_id": str(uuid.uuid4()), "credential": "x" * 48})
    )
    (data / "factory-reset-state.json").write_text(
        json.dumps(
            {
                "production": True,
                "ownership": "release_owner",
                "phase": "awaiting_reboot",
                "host_boot_id": "old",
                "recovery_user": "recovery",
                "id": str(uuid.uuid4()),
            }
        )
    )


def test_authorized_boot_rotation_cloning_and_pending_claim(tmp_path):
    data = tmp_path / "data"
    seed(data)
    calls = []
    delivery = None

    def handler(request):
        calls.append(request)
        if request.url.path.endswith("/ready"):
            return httpx.Response(200, json={"acknowledged": True})
        if request.url.host == "supervisor":
            return httpx.Response(200, json={"result": "ok"})
        return httpx.Response(200, json={"identity": delivery} if delivery else {"waiting": True})

    transport = httpx.MockTransport(handler)
    start(data, addresses={"aa"}, boot_id="new", transport=transport, supervisor_token="test")
    assert not (data / "remote-identity.json").exists()
    assert json.loads((data / "options.json").read_text())["remote_credential"] == ""
    secret = (data / "enrollment-secret").read_bytes()
    clone = tmp_path / "clone"
    shutil.copytree(data, clone)
    calls.clear()
    start(clone, addresses={"bb"}, transport=transport)
    assert not calls  # Never query the source hub's enrollment from a clone.
    assert (clone / "enrollment-secret").read_bytes() != secret
    start(data, addresses={"aa"}, transport=transport)
    assert (data / "enrollment-secret").read_bytes() != secret
    secret = (data / "enrollment-secret").read_bytes()
    delivery = {"installation_id": str(uuid.uuid4()), "credential": "y" * 48}
    start(data, addresses={"aa"}, transport=transport)
    assert not (data / "production-onboarding.json").exists()
    assert (data / "enrollment-secret").read_bytes() == secret
    assert json.loads((data / "remote-identity.json").read_text()) == delivery
    start(data, addresses={"aa"}, transport=transport)
    assert (data / "enrollment-secret").read_bytes() == secret


def test_failed_release_keeps_identity_and_never_wipes(tmp_path):
    data = tmp_path / "data"
    seed(data)
    original = (data / "remote-identity.json").read_bytes()
    with pytest.raises(httpx.HTTPStatusError):
        start(
            data,
            addresses={"aa"},
            boot_id="new",
            supervisor_token="test",
            transport=httpx.MockTransport(lambda r: httpx.Response(503)),
        )
    assert (data / "remote-identity.json").read_bytes() == original
    assert not (data / "production-onboarding.json").exists()


def test_central_grant_required_consumed_and_qr_preserved(tmp_path):
    path, app, staff, owner, other, hub, home, activation, kit = factory(tmp_path)
    with sqlite3.connect(path) as c:
        account = c.execute("SELECT id FROM accounts LIMIT 1").fetchone()[0]
        c.execute("UPDATE homes SET owner=? WHERE id=?", (account, home))
    url = f"/api/hubs/{home}/factory-reset"
    body = {
        "id": str(uuid.uuid4()),
        "ownership": "release_owner",
        "production": True,
        "public_key": public_key(x25519.X25519PrivateKey.generate()),
    }
    assert owner.post(f"/api/admin/hubs/{home}/production-access").status_code == 403
    assert hub.post(url + "/begin", json=body).status_code == 403
    assert staff.post(f"/api/admin/hubs/{home}/production-access").status_code == 200
    assert hub.get(url + "/capabilities").json()["production_allowed"]
    assert hub.post(url + "/begin", json=body).status_code == 200
    assert not hub.get(url + "/capabilities").json()["production_allowed"]
    assert hub.post(url + "/begin", json=body).status_code == 200
    ready = {"id": body["id"], "phase": "awaiting_owner", "report": []}
    assert hub.post(url + "/ready", json=ready).status_code == 200
    assert hub.post(url + "/ready", json=ready).status_code == 200
    with sqlite3.connect(path) as c:
        assert c.execute("SELECT owner FROM homes WHERE id=?", (home,)).fetchone()[0] is None
        assert c.execute("SELECT fingerprint FROM factory_hubs WHERE home=?", (home,)).fetchone()[0] is None
        assert not c.execute("SELECT 1 FROM hub_resets WHERE home=?", (home,)).fetchone()


def test_offline_waiting_hub_keeps_pending_identity(tmp_path):
    data = tmp_path / "data"
    seed(data)
    ready = httpx.MockTransport(lambda r: httpx.Response(200, json={"result": "ok", "acknowledged": True}))
    start(data, addresses={"aa"}, boot_id="new", supervisor_token="test", transport=ready)
    before = (data / "enrollment-secret").read_bytes()
    offline = httpx.MockTransport(lambda r: httpx.Response(503))
    start(data, addresses={"aa"}, transport=offline)
    assert (data / "enrollment-secret").read_bytes() == before
    assert (data / "production-onboarding.json").exists()
