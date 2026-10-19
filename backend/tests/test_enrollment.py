import asyncio
import hashlib
import json
import sqlite3
import uuid
from unittest.mock import AsyncMock

import httpx
import pytest
from app.config import Settings
from app.hub_onboarding import HubOnboarding
from app.storage import Store
from fastapi.testclient import TestClient
from test_cloud import ORIGIN
from test_onboarding import HEARTBEAT, PLAN, FakeHA, factory


def pending(secret="x" * 48):
    return {
        "device": str(uuid.UUID(bytes=hashlib.sha256(secret.encode()).digest()[:16], version=4)),
        "secret": secret,
        "fingerprint": "f" * 64,
        "version": "1.35.50",
        "users": 0,
        "ha_connected": True,
    }


def test_unconfigured_hub_binds_and_receives_identity_without_preparation(tmp_path):
    path, app, staff, owner, other, hub, home, activation, kit = factory(tmp_path)
    anonymous = TestClient(app, base_url=ORIGIN)
    body = pending()
    assert anonymous.post("/api/enrollment/poll", json=body).json() == {"waiting": True}
    assert anonymous.post("/api/enrollment/poll", json=body | {"secret": "z" * 48}).status_code == 403
    claim = activation | {"device": body["device"]}
    url = f"/api/activation/{home}/claim"
    assert anonymous.post(url, json=claim).status_code == 401
    assert owner.post(url, json=claim, headers={"X-CSRF-Token": "bad"}).status_code == 403
    assert owner.post(url, json=claim | {"code": "0" * 64}).status_code == 404
    assert owner.post(url, json=claim).status_code == 200
    result = anonymous.post("/api/enrollment/poll", json=body).json()["identity"]
    assert result["installation_id"] == home
    assert result["credential"] != kit["remote_credential"]
    assert owner.post(url, json=claim).status_code == 200
    assert anonymous.post("/api/enrollment/poll", json=body).json()["identity"] == result
    assert other.post(url, json=claim).status_code == 409
    assert result["credential"] not in owner.get(f"/api/onboarding/{home}").text
    with sqlite3.connect(path) as c:
        encrypted = c.execute("SELECT delivery FROM hub_enrollments").fetchone()[0]
        assert result["credential"] not in encrypted
        assert body["secret"] not in c.execute("SELECT secret_hash FROM hub_enrollments").fetchone()[0]
    assert hub.post(f"/api/hubs/{home}/onboarding/heartbeat", json=HEARTBEAT).status_code == 403
    hub.headers["Authorization"] = "Bearer " + result["credential"]
    assert hub.post(f"/api/hubs/{home}/onboarding/heartbeat", json=HEARTBEAT).status_code == 200
    assert anonymous.post("/api/enrollment/poll", json=body).json() == {"waiting": True}


def test_enrollment_offline_configured_and_duplicate_binding_are_rejected(tmp_path):
    path, app, staff, owner, other, hub, home, activation, kit = factory(tmp_path)
    client = TestClient(app, base_url=ORIGIN)
    body = pending()
    url = f"/api/activation/{home}/claim"
    claim = activation | {"device": body["device"]}
    assert client.post("/api/enrollment/poll", json=body | {"users": 1}).status_code == 409
    assert owner.post(url, json=claim).status_code == 409
    client.post("/api/enrollment/poll", json=body | {"ha_connected": False})
    assert owner.post(url, json=claim).json()["detail"] == "enrollment_not_ready"
    client.post("/api/enrollment/poll", json=body)
    with sqlite3.connect(path) as c:
        c.execute("UPDATE hub_enrollments SET seen=0")
    assert owner.post(url, json=claim).json()["detail"] == "enrollment_offline"
    client.post("/api/enrollment/poll", json=body)
    hub.post(f"/api/hubs/{home}/onboarding/heartbeat", json=HEARTBEAT)
    assert owner.post(url, json=claim).json()["detail"] == "hub_already_personalized"
    with sqlite3.connect(path) as c:
        assert c.execute("SELECT owner FROM homes WHERE id=?", (home,)).fetchone()[0] is None
        assert c.execute("SELECT home FROM hub_enrollments").fetchone()[0] is None


@pytest.mark.asyncio
async def test_hub_automatically_installs_identity_and_completes_setup(tmp_path):
    path, app, staff, owner, other, hub, home, activation, kit = factory(tmp_path)
    settings = Settings(data_dir=tmp_path / "hub", ingress=True, mode="live")
    store = Store(settings.database)
    started = []
    worker = HubOnboarding(
        settings, FakeHA(), store, {}, httpx.ASGITransport(app=app), start_remote=lambda: started.append(True)
    )
    worker.advertisement = AsyncMock()
    advertisement = worker.unconfigured_discovery()
    assert advertisement["state"] == "unconfigured"
    assert worker.enrollment_secret not in json.dumps(advertisement)
    assert "proof" not in advertisement
    await worker.enroll()
    assert settings.remote_identity_file is None
    assert (
        owner.post(f"/api/activation/{home}/claim", json=activation | {"device": worker.device}).status_code
        == 200
    )
    await worker.enroll()
    assert started == [True]
    assert settings.remote_identity_file.stat().st_mode & 0o777 == 0o600
    assert worker.unconfigured_discovery() is None
    # A normal addon restart reuses the auto-provisioned identity, with empty options.
    from app.remote_options import configure_remote_identity

    assert configure_remote_identity({}, settings.data_dir) == settings.remote_identity_file
    assert owner.post(f"/api/onboarding/{home}", json=PLAN).status_code == 200
    await worker.tick()
    assert owner.get(f"/api/onboarding/{home}").json()["plan"]["status"] == "completed"
    with store.connect() as c:
        assert c.execute("SELECT name FROM users").fetchone()[0] == "customer"


@pytest.mark.asyncio
async def test_local_advertisement_starts_before_cloud_and_survives_offline(tmp_path, monkeypatch):
    settings = Settings(data_dir=tmp_path, ingress=True, mode="live")
    worker = HubOnboarding(settings, FakeHA(), Store(settings.database), {})
    events = []

    class Advertisement:
        async def update(self, value):
            events.append(("advertise", value))

        async def close(self):
            events.append(("close", None))

    worker.advertisement = Advertisement()

    async def offline():
        events.append(("cloud", None))
        raise httpx.ConnectError("offline")

    worker.enroll = offline

    async def stop(_):
        raise asyncio.CancelledError()

    monkeypatch.setattr("app.hub_onboarding.asyncio.sleep", stop)
    with pytest.raises(asyncio.CancelledError):
        await worker.run()
    assert [x[0] for x in events] == ["advertise", "cloud", "close"]
    assert events[0][1]["state"] == "unconfigured"
    assert HubOnboarding(settings, FakeHA(), worker.store, {}).device == worker.device
