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
