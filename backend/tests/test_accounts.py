from uuid import uuid4

import pytest
from fastapi import HTTPException
from test_api import login
from test_management import client  # noqa: F401


@pytest.fixture
def controller(client):  # noqa: F811
    m = client.app.state.management
    m.demo = False
    calls = []
    users = []

    async def ws(kind, **data):
        calls.append((kind, data))
        if kind == "config/auth/list":
            return users
        if kind == "config/auth/create":
            users.append({"id": "ha1", "username": None})
            return {"user": {"id": "ha1"}}
        if kind == "config/auth_provider/homeassistant/create":
            users[0]["username"] = data["username"]
        if kind == "person/list":
            return {"storage": []}
        return {"id": "person1"}

    m.ws = ws
    return m, calls, users


def body():
    return {
        "request_id": str(uuid4()),
        "name": "newuser",
        "display_name": "New User",
        "password": "private-long-password",
        "role": "user",
        "photo": "",
    }


def test_paired_accounts_person_and_idempotency(client, controller):  # noqa: F811
    m, calls, users = controller
    payload = body()
    result = client.post("/api/manage/accounts", json=payload).json()
    assert result["status"] == "completed"
    assert (
        "config/auth/create",
        {"name": "New User", "group_ids": ["system-users"], "local_only": False},
    ) in calls
    assert (
        "person/create",
        {"name": "New User", "user_id": "ha1", "picture": None, "device_trackers": []},
    ) in calls
    assert client.post("/api/manage/accounts", json=payload).json() == result
    assert sum(k == "config/auth/create" for k, d in calls) == 1
    with m.store.connect() as db:
        assert "private-long-password" not in str([tuple(r) for r in db.execute("SELECT * FROM settings")])
    assert client.get("/api/manage/accounts/pending").json() == []
    rows = client.get("/api/manage/accounts").json()
    assert next(r for r in rows if r["name"] == "newuser")["linked"]
    client.post("/api/logout")
    login(client, "newuser", "private-long-password")
    assert client.get("/api/manage/accounts").status_code == 403


def test_uncertain_credentials_reconcile_without_creating_duplicate(client, controller):  # noqa: F811
    m, calls, users = controller
    original = m.ws

    async def ws(kind, **data):
        result = await original(kind, **data)
        if kind == "config/auth_provider/homeassistant/create":
            raise HTTPException(503, "lost_response")
        return result

    m.ws = ws
    payload = body()
    result = client.post("/api/manage/accounts", json=payload).json()
    assert result["status"] == "ha_login_unconfirmed" and not result["local_id"]
    assert client.get("/api/manage/accounts/pending").json()[0]["request_id"] == payload["request_id"]
    assert client.post("/api/manage/accounts", json=payload).json()["status"] == "completed"
    assert sum(k == "config/auth/create" for k, d in calls) == 1
    assert sum(k == "config/auth_provider/homeassistant/create" for k, d in calls) == 1


def test_account_validation_and_no_overwriting_existing_remote(client, controller):  # noqa: F811
    m, calls, users = controller
    payload = body()
    users.append({"id": "existing", "username": "newuser"})
    assert client.post("/api/manage/accounts", json=payload).status_code == 409
    assert [k for k, d in calls] == ["config/auth/list"]
    response = client.post("/api/manage/accounts", json=payload | {"password": "secret"})
    assert response.status_code == 422 and "secret" not in response.text
    assert (
        client.post("/api/manage/accounts", json=payload, headers={"x-csrf-token": "bad"}).status_code == 403
    )
    assert client.put("/api/manage/accounts/1/photo", json={"photo": "not base64"}).status_code == 422


def test_profile_upload_uses_controller_prefix_and_keeps_tokens_private(client, controller, monkeypatch):  # noqa: F811
    import base64

    import httpx

    m, calls, users = controller
    m.ha.http_url = "http://supervisor/core/api/"
    m.ha.token = "controller-secret"
    payload = body()
    result = client.post("/api/manage/accounts", json=payload).json()
    raw = b"\x89PNG\r\n\x1a\nimage"
    original = httpx.AsyncClient
    seen = []

    def reply(request):
        seen.append(request)
        assert str(request.url) == "http://supervisor/core/api/image/upload"
        assert request.headers["authorization"] == "Bearer controller-secret"
        return httpx.Response(200, json={"id": "a" * 32})

    monkeypatch.setattr(
        httpx, "AsyncClient", lambda **kw: original(transport=httpx.MockTransport(reply), **kw)
    )
    photo = {"photo": base64.b64encode(raw).decode()}
    response = client.put(f"/api/manage/accounts/{result['local_id']}/photo", json=photo)
    assert response.json() == {"local_saved": True, "controller_saved": True}
    assert "controller-secret" not in response.text
    assert client.get(f"/api/manage/accounts/{result['local_id']}/photo").content == raw
    assert calls[-1][1]["picture"] == "/api/image/serve/" + "a" * 32 + "/512x512"
    assert len(seen) == 1
