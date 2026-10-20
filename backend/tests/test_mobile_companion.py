import json
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.mobile_companion import Companion, LocationUpdate, Registration
from app.storage import Store


@pytest.fixture
def companion(tmp_path):
    m = SimpleNamespace(
        store=Store(tmp_path / "mobile.sqlite"),
        demo=False,
        rest=AsyncMock(side_effect=[{"components": ["mobile_app"]}, {"webhook_id": "private-webhook"}]),
        ws=AsyncMock(return_value={"status": 200, "body": "{}"}),
    )
    return Companion(m)


async def register(c, device="phone-one"):
    return await c.register(
        {"device_id": device}, Registration(name="My iPhone", os_version="26", app_version="0.1")
    )


async def test_registration_is_private_and_idempotent(companion):
    result = await register(companion)
    assert result["registered"]
    assert not result["location_enabled"]
    assert "private-webhook" not in json.dumps(result)
    await register(companion)
    assert companion.m.rest.await_count == 2
    assert not companion.status("other-phone")["registered"]


async def test_location_requires_consent_and_rejects_old_positions(companion):
    await register(companion)
    user = {"device_id": "phone-one"}
    point = LocationUpdate(latitude=58, longitude=8, accuracy=10, timestamp=time.time())
    with pytest.raises(HTTPException) as error:
        await companion.location(user, point)
    assert error.value.status_code == 403
    await companion.consent(user, True)
    assert (await companion.location(user, point))["status"] == "delivered"
    payload = companion.m.ws.call_args.kwargs
    assert payload["webhook_id"] == "private-webhook"
    assert json.loads(payload["body"])["type"] == "update_location"
    assert "latitude" not in companion.read("phone-one")
    assert (await companion.location(user, point))["status"] == "ignored_older_location"
    assert companion.m.ws.await_count == 1
    with pytest.raises(HTTPException):
        await companion.location(user, point.model_copy(update={"timestamp": time.time() - 1000}))
    await companion.consent(user, False)
    with pytest.raises(HTTPException):
        await companion.location(user, point.model_copy(update={"timestamp": time.time()}))


async def test_unregistered_phone_cannot_use_another_webhook(companion):
    await register(companion)
    with pytest.raises(HTTPException):
        await companion.consent({"device_id": "other"}, True)
    with pytest.raises(ValueError):
        LocationUpdate(latitude=58, longitude=8, accuracy=10, timestamp=time.time(), webhook_id="other")


async def test_failed_delivery_does_not_advance_timestamp(companion):
    await register(companion)
    user = {"device_id": "phone-one"}
    await companion.consent(user, True)
    companion.m.ws.return_value = {"status": 500}
    with pytest.raises(HTTPException):
        await companion.location(
            user, LocationUpdate(latitude=58, longitude=8, accuracy=10, timestamp=time.time())
        )
    assert companion.status("phone-one")["last_location_at"] is None


def test_remote_native_boundary_and_revocation(tmp_path):
    from fastapi.testclient import TestClient

    from app.config import Settings
    from app.demo import Demo
    from app.main import create_app

    origin = "https://00000000-0000-0000-0000-000000000001.home.smarti.dev"
    settings = Settings(
        _env_file=None,
        mode="demo",
        data_dir=tmp_path,
        origin=origin,
        auto_local_origins=False,
        mobile_enabled=True,
        bootstrap_secret="test-bootstrap-secret-long-enough",
    )
    local = create_app(settings, Demo())
    with TestClient(local, base_url=origin) as setup:
        setup.headers["origin"] = origin
        setup.post(
            "/api/bootstrap",
            json={
                "name": "owner",
                "password": "test password long enough",
                "secret": settings.bootstrap_secret,
            },
        ).raise_for_status()
    app = create_app(settings, Demo(), remote_surface=True)
    with TestClient(app, base_url=origin) as web, TestClient(app, base_url=origin) as phone:
        web.headers["origin"] = origin
        login = web.post("/api/login", json={"name": "owner", "password": "test password long enough"})
        web.headers["x-csrf-token"] = login.json()["csrf"]
        invitation = web.post("/api/mobile/pairings").json()
        body = {
            "installation_id": invitation["installation_id"],
            "code": invitation["code"],
            "device_name": "iPhone",
        }
        assert web.post("/api/mobile/v1/pair", json=body).status_code == 403
        assert phone.post("/api/mobile/pairings").status_code == 403
        assert phone.get("/api/mobile/v1/companion").status_code == 401
        paired = phone.post("/api/mobile/v1/pair", json=body)
        assert paired.status_code == 200
        tokens = paired.json()
        phone.headers["authorization"] = "Bearer " + tokens["access_token"]
        assert phone.get("/api/mobile/v1/companion").status_code == 200
        assert phone.get("http://" + origin[8:] + "/api/mobile/v1/companion").status_code == 403
        assert phone.post("/api/mobile/v1/logout").status_code == 200
        assert phone.get("/api/mobile/v1/companion").status_code == 401
        assert web.post("/api/remote/provision", json={}).status_code == 403


async def test_existing_registration_gets_metadata_without_duplicate_ha_device(companion):
    companion.save("phone-one", {"webhook_id": "existing", "location_enabled": True})
    await register(companion)
    companion.m.rest.assert_not_awaited()
    record = companion.read("phone-one")
    assert record["webhook_id"] == "existing"
    assert record["location_enabled"] is True
    assert record["registration"] == {
        "device_name": "My iPhone", "manufacturer": "Apple", "model": "iPhone",
        "os_version": "26", "app_version": "0.1",
    }
