import asyncio
from types import SimpleNamespace
from uuid import uuid4

from app.wireless_setup import WirelessSetup
from fastapi import FastAPI
from fastapi.testclient import TestClient
from test_management import client  # noqa: F401


def test_bluetooth_discovery_claim_and_release(client):  # noqa: F811
    m = client.app.state.management
    m.demo = False
    calls = []

    async def ws(kind, **kwargs):
        if kind == "config_entries/flow/progress":
            return [
                dict(
                    flow_id="ble",
                    handler="switchbot",
                    context={"source": "bluetooth", "title_placeholders": {"name": "Curtain"}},
                ),
                dict(flow_id="other", handler="other", context={"source": "user"}),
            ]
        return {"resources": {}}

    async def rest(method, path, data=None, **kwargs):
        calls.append((method, path))
        if path == "config":
            return {"components": ["bluetooth"]}
        return {"type": "form", "flow_id": "ble", "step_id": "confirm", "data_schema": []}

    m.ws, m.rest = ws, rest
    base = "/api/manage/integration-setup"
    assert client.get(base + "/bluetooth").json() == {
        "loaded": True,
        "discoveries": [{"id": "ble", "domain": "switchbot", "name": "Curtain"}],
    }
    assert client.post(base + "/bluetooth/other/claim", json={"domain": "other"}).status_code == 404
    assert (
        client.post(base + "/bluetooth/ble/claim", json={"domain": "switchbot"}).json()["step_id"]
        == "confirm"
    )
    assert client.delete(base + "/flows/ble").status_code == 200
    assert not any(method == "DELETE" for method, _ in calls)


def test_matter_network_only_idempotence_and_no_stored_code(client):  # noqa: F811
    m = client.app.state.management
    calls = []

    async def ws(kind, **kwargs):
        return [{"domain": "matter", "state": "loaded"}]

    async def request(kind, **kwargs):
        calls.append((kind, kwargs))

    m.ws = ws
    m.ha = SimpleNamespace(request=request)
    m.connected = lambda: None
    wireless = WirelessSetup(m, SimpleNamespace(mode="live"))
    app = FastAPI()
    app.include_router(wireless.router(lambda: {"id": "owner"}))
    body = {"request_id": str(uuid4()), "code": "1234-567-8901"}
    with TestClient(app) as c:
        assert c.post("/api/setup/matter", json={**body, "code": "invalid"}).status_code == 422
        assert c.post("/api/setup/matter", json=body).status_code == 200
        assert c.post("/api/setup/matter", json=body).status_code == 200
        assert c.get("/api/setup/matter").json()["session"]["status"] == "paired"
    assert calls == [("matter/commission", {"code": "12345678901", "network_only": True, "_timeout": 180})]
    stored = m.store.get("matter_setup:" + body["request_id"])
    assert "12345678901" not in stored and "code" not in stored

    async def fail(*args, **kwargs):
        raise TimeoutError()

    m.ha.request = fail
    state = {"status": "starting"}
    asyncio.run(wireless.commission("test-result", state, "12345678901"))
    assert state["status"] == "unconfirmed"


def test_wireless_demo_and_csrf(client):  # noqa: F811
    assert client.get("/api/setup/matter").status_code == 503
    assert client.get("/api/manage/integration-setup/bluetooth").status_code == 503
    assert (
        client.post(
            "/api/setup/matter",
            json={"request_id": str(uuid4()), "code": "12345678901"},
            headers={"x-csrf-token": "bad"},
        ).status_code
        == 403
    )
