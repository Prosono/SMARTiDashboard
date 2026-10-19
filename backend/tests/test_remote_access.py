import json
import uuid
from types import SimpleNamespace

import httpx
from app.remote_access import remote_router
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient


def test_local_admin_enrollment_never_returns_hub_credential(tmp_path):
    home_id = str(uuid.uuid4())
    path = tmp_path / "identity.json"
    secret = "test-hub-private-credential-at-least-32"
    path.write_text(json.dumps({"installation_id": home_id, "credential": secret}))
    calls = []

    def request(req):
        calls.append((req.method, req.url.path))
        assert req.url.host == "home.smarti.dev"
        assert req.headers["authorization"] == "Bearer " + secret
        return httpx.Response(
            200, json={"linked": False, "remote_enabled": True, "code": "x" * 43, "expires_at": 2000000000}
        )

    app = FastAPI()
    app.include_router(
        remote_router(
            SimpleNamespace(remote_identity_file=path),
            lambda: {"role": "admin"},
            httpx.MockTransport(request),
        )
    )
    with TestClient(app) as c:
        status = c.get("/api/remote")
        assert status.json()["provisioned"] is True
        assert secret not in status.text
        assert c.post("/api/remote/claim-code").json()["code"] == "x" * 43
        assert c.delete("/api/remote/claim-code").status_code == 200
        assert c.delete("/api/remote").status_code == 200
        assert c.put("/api/remote").status_code == 200
    assert len(calls) == 5
    assert all(p.startswith(f"/api/hubs/{home_id}/") for _, p in calls)


def test_unprovisioned_and_nonadmin_do_not_contact_cloud():
    app = FastAPI()
    app.include_router(remote_router(SimpleNamespace(remote_identity_file=None), lambda: {"role": "admin"}))
    with TestClient(app) as c:
        assert c.get("/api/remote").json()["provisioned"] is False
        assert c.post("/api/remote/claim-code").status_code == 409

    def denied():
        raise HTTPException(403)

    app = FastAPI()
    app.include_router(remote_router(SimpleNamespace(remote_identity_file=None), denied))
    with TestClient(app) as c:
        assert c.get("/api/remote").status_code == 403
        assert c.post("/api/remote/claim-code").status_code == 403


def test_cloud_errors_do_not_leak_credentials_or_follow_redirects(tmp_path):
    path = tmp_path / "identity.json"
    secret = "private-hub-credential-for-test-12345"
    path.write_text(json.dumps({"installation_id": str(uuid.uuid4()), "credential": secret}))
    calls = []

    def request(req):
        calls.append(req)
        return httpx.Response(302, headers={"Location": "https://other.example/"}, text=secret)

    app = FastAPI()
    app.include_router(
        remote_router(SimpleNamespace(remote_identity_file=path), lambda: {}, httpx.MockTransport(request))
    )
    with TestClient(app) as c:
        response = c.post("/api/remote/claim-code")
        assert response.status_code == 503
        assert secret not in response.text
    assert len(calls) == 1
