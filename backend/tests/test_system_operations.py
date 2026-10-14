from uuid import uuid4

import pytest
from app.system_operations import Supervisor
from fastapi import HTTPException
from test_api import login
from test_management import client  # noqa: F401


@pytest.fixture
def supervisor(monkeypatch):
    calls = []

    async def request(self, method, path, data=None):
        calls.append((method, path, data))
        if path == "/network/info":
            return {
                "interfaces": [
                    {
                        "interface": "eth0",
                        "type": "ethernet",
                        "ipv4": {
                            "method": "auto",
                            "address": ["192.168.1.4/24"],
                            "gateway": "192.168.1.1",
                            "nameservers": [],
                        },
                    }
                ]
            }
        if path == "/jobs/info":
            return {"jobs": [{"uuid": "job1", "done": True, "errors": []}]}
        return {"job_id": "job1"}

    monkeypatch.setattr(Supervisor, "request", request)
    return calls


def test_backup_idempotency_completion_and_no_saved_password(client, supervisor):  # noqa: F811
    id = str(uuid4())
    payload = {"request_id": id, "name": "Copy", "password": "private-backup-password"}
    first = client.post("/api/manage/settings/backups", json=payload)
    assert first.json()["status"] == "accepted"
    assert client.post("/api/manage/settings/backups", json=payload).json() == first.json()
    assert len(supervisor) == 1
    assert supervisor[0][2]["background"] is True
    assert "private-backup-password" not in client.app.state.management.store.get("system_operation:" + id)
    assert client.get("/api/manage/settings/operations/" + id).json()["status"] == "completed"
    assert (
        client.post("/api/manage/settings/backups", json=payload, headers={"x-csrf-token": "bad"}).status_code
        == 403
    )


def test_network_validation_review_revision_and_uncertain_result(client, supervisor, monkeypatch):  # noqa: F811
    info = client.get("/api/manage/settings/network/eth0").json()
    payload = {
        "request_id": str(uuid4()),
        "revision": info["revision"],
        "ipv4": {
            "method": "static",
            "address": ["192.168.1.8/24"],
            "gateway": "192.168.1.1",
            "nameservers": ["1.1.1.1"],
        },
    }
    assert (
        client.put(
            "/api/manage/settings/network/eth0",
            json=payload | {"ipv4": {"method": "static", "address": ["bad"]}},
        ).status_code
        == 422
    )
    assert (
        client.put("/api/manage/settings/network/eth0", json=payload | {"revision": "a" * 64}).status_code
        == 409
    )
    assert client.put("/api/manage/settings/network/missing", json=payload).status_code == 404
    assert not any(c[0] == "POST" for c in supervisor)
    assert client.put("/api/manage/settings/network/eth0", json=payload).json()["status"] == "accepted"
    assert supervisor[-1] == ("POST", "/network/interface/eth0/update", {"ipv4": payload["ipv4"]})
    assert client.put("/api/manage/settings/network/eth0", json=payload).status_code == 200
    assert sum(c[0] == "POST" for c in supervisor) == 1

    async def failure(self, method, path, data=None):
        raise HTTPException(502, "unconfirmed")

    monkeypatch.setattr(Supervisor, "request", failure)
    backup = {"request_id": str(uuid4()), "name": "Copy", "password": "private-backup-password"}
    assert client.post("/api/manage/settings/backups", json=backup).json()["status"] == "unconfirmed"


def test_system_write_authorization_and_validation_redaction(client, supervisor):  # noqa: F811
    bad = {"request_id": str(uuid4()), "name": "Backup", "password": "private"}
    response = client.post("/api/manage/settings/backups", json=bad)
    assert response.status_code == 422 and "private" not in response.text
    client.post("/api/users", json={"name": "resident", "password": "another long password", "role": "user"})
    client.post("/api/logout")
    login(client, "resident", "another long password")
    assert client.post("/api/manage/settings/backups", json=bad).status_code == 403
    assert client.get("/api/manage/settings/network/eth0").status_code == 403


def test_restore_requires_confirmation_and_never_repeats(client, monkeypatch):  # noqa: F811
    calls = []

    async def request(self, method, path, data=None):
        calls.append((method, path, data))
        if path == "/backups/info":
            return {"backups": [{"slug": "copy1"}]}
        if path.endswith("/info"):
            return {
                "slug": "copy1",
                "type": "partial",
                "protected": True,
                "homeassistant": {"version": "1"},
                "addons": [{"slug": "test"}],
                "folders": ["share"],
            }
        return {"job_id": "restore-job"}

    monkeypatch.setattr(Supervisor, "request", request)
    body = {"request_id": str(uuid4()), "confirm_slug": "wrong", "password": "backup-secret"}
    url = "/api/manage/settings/backups/copy1/restore"
    assert client.post(url, json=body).status_code == 422
    assert not calls
    body["confirm_slug"] = "copy1"
    assert client.post(url, json=body | {"password": ""}).status_code == 422
    assert client.post(url, json=body, headers={"x-csrf-token": "bad"}).status_code == 403
    assert client.post(url, json=body).json()["status"] == "accepted"
    assert client.post(url, json=body).json()["status"] == "accepted"
    writes = [c for c in calls if c[0] == "POST"]
    assert len(writes) == 1
    assert writes[0][1].endswith("/restore/partial")
    assert writes[0][2]["addons"] == ["test"]
    assert writes[0][2]["homeassistant"] is True
    activity = client.get("/api/manage/settings/operations").json()
    assert activity[0]["request_id"] == body["request_id"]
    assert "backup-secret" not in str(activity)
    assert client.get("/api/manage/settings/backups/missing/info").status_code == 404


def test_backup_download_streams_private_file_and_requires_admin(tmp_path, monkeypatch):
    import httpx
    from app.config import Settings
    from app.demo import Demo
    from app.main import create_app
    from fastapi.testclient import TestClient
    from test_api import ORIGIN, SECRET

    settings = Settings(
        _env_file=None,
        mode="demo",
        data_dir=tmp_path,
        development=True,
        origin=ORIGIN,
        bootstrap_secret=SECRET,
    )
    app = create_app(settings, Demo())
    monkeypatch.setenv("SUPERVISOR_TOKEN", "test-supervisor-token")

    async def request(self, method, path, data=None):
        if path == "/backups/info":
            return {"backups": [{"slug": "copy1"}]}
        return {"slug": "copy1", "type": "full"}

    monkeypatch.setattr(Supervisor, "request", request)
    calls = []

    def handle(request):
        calls.append(request)
        assert str(request.url) == "http://supervisor/backups/copy1/download"
        assert request.headers["authorization"] == "Bearer test-supervisor-token"
        return httpx.Response(200, content=b"backup-file-bytes")

    original = httpx.AsyncClient
    monkeypatch.setattr(
        "app.system_operations.httpx.AsyncClient",
        lambda **kwargs: original(transport=httpx.MockTransport(handle), **kwargs),
    )
    with TestClient(app) as download_client:
        download_client.headers["origin"] = ORIGIN
        login(download_client)
        settings.mode = "live"
        settings.ingress = True
        settings.ingress_proxy = "testclient"
        result = download_client.get("/api/manage/settings/backups/copy1/download")
        assert result.status_code == 200
        assert result.content == b"backup-file-bytes"
        assert "attachment" in result.headers["content-disposition"]
        assert "no-store" in result.headers["cache-control"]
        assert "test-supervisor-token" not in str(result.headers)
        assert len(calls) == 1
        download_client.post(
            "/api/users", json={"name": "resident", "password": "another long password", "role": "user"}
        )
        download_client.post("/api/logout")
        login(download_client, "resident", "another long password")
        assert download_client.get("/api/manage/settings/backups/copy1/download").status_code == 403


def test_core_restart_confirmation_idempotency_and_authorization(client, supervisor):  # noqa: F811
    path = "/api/manage/settings/restart"
    payload = {"request_id": str(uuid4()), "confirm": True}
    assert client.post(path, json={"request_id": payload["request_id"]}).status_code == 422
    assert client.post(path, json=payload | {"confirm": False}).status_code == 422
    assert client.post(path, json=payload, headers={"x-csrf-token": "bad"}).status_code == 403
    assert supervisor == []
    first = client.post(path, json=payload)
    assert first.json()["status"] == "accepted"
    assert client.post(path, json=payload).json() == first.json()
    assert supervisor == [("POST", "/core/restart", None)]
    client.post("/api/users", json={"name": "viewer", "password": "another long password", "role": "user"})
    client.post("/api/logout")
    login(client, "viewer", "another long password")
    assert client.post(path, json=payload).status_code == 403
