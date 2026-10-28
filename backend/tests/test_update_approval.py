import time
from types import SimpleNamespace

import httpx
import pytest
from app.config import Settings
from app.update_approval import UpdateApproval, component
from fastapi.testclient import TestClient
from test_cloud import ORIGIN, provision
from test_cloud_admin import setup


def test_cloud_release_approval_auth_and_version_scope(tmp_path):
    app, path, staff, customer = setup(tmp_path)
    public = TestClient(app, base_url=ORIGIN)
    release = {"component": "core", "version": "2026.10.4", "approved": True, "notes": "Tested"}
    assert customer.post("/api/admin/releases", json=release).status_code == 403
    assert public.get("/api/admin/releases").status_code == 401
    assert staff.post("/api/admin/releases", json=release, headers={"X-CSRF-Token": "bad"}).status_code == 403
    assert public.get("/api/releases/approved").json() == {"releases": []}
    assert staff.post("/api/admin/releases", json=release).status_code == 200
    result = public.get("/api/releases/approved")
    assert result.headers["cache-control"] == "no-store"
    assert result.json()["releases"] == [{"component": "core", "version": "2026.10.4"}]
    assert (
        staff.post(
            "/api/admin/releases", json={**release, "version": "2026.10.5", "approved": False}
        ).status_code
        == 200
    )
    assert len(public.get("/api/releases/approved").json()["releases"]) == 1
    assert staff.post("/api/admin/releases", json={**release, "approved": False}).status_code == 200
    assert public.get("/api/releases/approved").json()["releases"] == []
    assert {"approve_release", "withdraw_release"} <= {
        r["action"] for r in staff.get("/api/admin/audit").json()
    }
    assert staff.get("/admin/updates").status_code == 200
    assert customer.get("/admin/updates").status_code == 403


def test_candidate_report_cannot_approve_or_revoke(tmp_path):
    app, path, staff, customer = setup(tmp_path)
    client, home = provision(app, "Test")
    route = f"/api/hubs/{home['installation_id']}/update-candidates"
    body = {"releases": [{"component": "os", "version": "17.0"}]}
    headers = {"Authorization": "Bearer " + home["credential"]}
    assert customer.post(route, json=body).status_code == 403
    assert client.post(route, json=body, headers=headers).status_code == 200
    assert not staff.get("/api/admin/releases").json()[0]["approved"]
    staff.post("/api/admin/releases", json={**body["releases"][0], "approved": True})
    client.post(route, json=body, headers=headers)
    assert staff.get("/api/admin/releases").json()[0]["approved"] == 1


@pytest.mark.asyncio
async def test_gate_fails_closed_and_revocation_bypasses_cache(tmp_path):
    ha = SimpleNamespace(states={}, entities={})
    approved = True

    def handler(request):
        return httpx.Response(
            200, json={"releases": [{"component": "core", "version": "2"}] if approved else []}
        )

    gate = UpdateApproval(Settings(data_dir=tmp_path), ha, httpx.MockTransport(handler))
    await gate.refresh()
    assert gate.approved("core", "2")
    assert not gate.approved("core", "3")
    assert not gate.approved("os", "2")
    approved = False
    await gate.refresh(force=True)
    assert not gate.approved("core", "2")
    approved = True
    await gate.refresh(force=True)
    gate.transport = httpx.MockTransport(lambda r: httpx.Response(503))
    await gate.refresh(force=True)
    assert not gate.approved("core", "2")
    gate.allowed = {("core", "2")}
    gate.checked = time.monotonic() - 121
    assert not gate.approved("core", "2")


def test_renamed_system_entities_and_unrelated_firmware():
    ha = SimpleNamespace(
        entities={"update.renamed": {"platform": "hassio", "unique_id": "homeassistant_version_latest"}}
    )
    assert component(ha, "update.renamed", {"title": "Renamed"}) == "core"
    assert component(ha, "update.os", {"title": "Home Assistant Operating System"}) == "os"
    assert component(ha, "update.app", {"title": "SMARTi"}) is None
    assert component(ha, "update.bulb", {"title": "Bulb firmware"}) is None
