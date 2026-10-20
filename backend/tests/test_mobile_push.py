import json
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.mobile_companion import Companion
from app.mobile_push import HANotification, MobilePush, PushRegistration
from app.storage import Store


@pytest.fixture
def push(tmp_path):
    store = Store(tmp_path / "push.sqlite")
    with store.connect() as db:
        db.execute("INSERT INTO users(id,name,password,role) VALUES(1,'owner','unused','admin')")
        db.execute(
            "INSERT INTO mobile_devices(id,user_id,name,created,expires,revoked) VALUES('phone',1,'Phone',?,?,0)",
            (time.time(), time.time() + 3600),
        )
    companion = Companion(SimpleNamespace(store=store, ws=AsyncMock(return_value={"status": 200})))
    companion.save("phone", {"webhook_id": "private"})
    push = MobilePush(companion, None)
    push.cloud = AsyncMock(return_value={"ready": True, "status": "accepted_by_apple"})
    return push


async def test_notify_scoped_to_active_device_and_revoked_immediately(push):
    await push.enable({"device_id": "phone"}, PushRegistration(token="a" * 64))
    record = push.c.read("phone")
    payload = json.loads(push.c.m.ws.call_args.kwargs["body"])
    assert payload["type"] == "update_registration"
    assert payload["data"]["app_data"]["push_url"].startswith("http://127.0.0.1:8099/")
    assert "a" * 64 not in json.dumps(payload)
    body = HANotification(push_token=record["push_capability"], message="Test")
    assert (await push.notify(body))["status"] == "accepted_by_apple"
    push.cloud.reset_mock()
    with push.c.m.store.connect() as db:
        db.execute("UPDATE mobile_devices SET revoked=1")
    with pytest.raises(HTTPException) as failure:
        await push.notify(body)
    assert failure.value.status_code == 410
    push.cloud.assert_not_awaited()


async def test_disabled_and_wrong_capabilities_never_deliver(push):
    await push.enable({"device_id": "phone"}, PushRegistration(token="a" * 64))
    capability = push.c.read("phone")["push_capability"]
    with pytest.raises(HTTPException):
        await push.notify(HANotification(push_token="x" * 43, message="No"))
    push.disable("phone")
    assert not push.c.status("phone")["notifications_ready"]
    with pytest.raises(HTTPException):
        await push.notify(HANotification(push_token=capability, message="No"))


async def test_not_configured_does_not_change_ha(push):
    push.cloud.return_value = {"ready": False}
    with pytest.raises(HTTPException):
        await push.enable({"device_id": "phone"}, PushRegistration(token="a" * 64))
    push.c.m.ws.assert_not_awaited()


def test_local_webhook_does_not_open_ingress_to_lan_or_browser(tmp_path):
    from fastapi.testclient import TestClient

    from app.config import Settings
    from app.demo import Demo
    from app.main import create_app

    settings = Settings(
        _env_file=None,
        mode="demo",
        data_dir=tmp_path,
        origin="https://homeassistant.local:8123",
        ingress=True,
        remote_identity_file=tmp_path / "identity.json",
    )
    app = create_app(settings, Demo())
    body = {"push_token": "x" * 43, "message": "No"}
    for host in ("192.168.1.3", settings.ingress_proxy):
        c = TestClient(app, client=(host, 1234))
        assert c.post("/api/mobile/ha-notify", json=body).status_code == 403
    local = TestClient(app, client=("127.0.0.1", 1234))
    assert local.post("/api/mobile/ha-notify", json=body).status_code == 410
    assert (
        local.post("/api/mobile/ha-notify", json=body, headers={"Origin": "https://evil.example"}).status_code
        == 403
    )
    assert local.post("/api/mobile/ha-notify", json={}).status_code == 422
    assert local.post("/api/bootstrap", json={}).status_code == 403
