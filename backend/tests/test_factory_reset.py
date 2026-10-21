# ruff: noqa: F811
import asyncio
import json
from uuid import uuid4

from test_api import login
from test_management import client  # noqa: F401

PATH = "/api/manage/settings/factory-reset"
BODY = {
    "request_id": str(uuid4()),
    "acknowledge_manual_cleanup": True,
    "password": "correct horse battery",
    "confirmation": "RESET HUB",
    "acknowledge_data_loss": True,
    "acknowledge_pairing": True,
    "backup_decision": "skip",
}


def advanced(client):
    store = client.app.state.store
    with store.connect() as db:
        user = db.execute("SELECT id FROM users WHERE name='owner'").fetchone()[0]
    store.set(f"experience:{user}", json.dumps({"mode": "advanced"}))


def test_reset_requires_advanced_admin_and_csrf(client):
    client.put("/api/home/experience", json={"mode": "normal"})
    assert client.get(PATH).status_code == 403
    advanced(client)
    assert client.get(PATH).json()["ready"] is False
    assert client.post(PATH, json=BODY, headers={"x-csrf-token": "bad"}).status_code == 403
    client.post("/api/users", json={"name": "resident", "password": "another long password", "role": "user"})
    client.post("/api/logout")
    login(client, "resident", "another long password")
    assert client.get(PATH).status_code == 403
    assert client.post(PATH, json=BODY).status_code == 403


def test_confirmation_is_validated_and_password_never_echoed(client):
    advanced(client)
    for patch in [
        {"confirmation": "wrong"},
        {"acknowledge_pairing": False},
        {"acknowledge_data_loss": False},
        {"backup_decision": ""},
    ]:
        response = client.post(PATH, json=BODY | patch)
        assert response.status_code == 422
        assert BODY["password"] not in response.text
    response = client.post(PATH, json=BODY | {"password": "incorrect"})
    assert response.status_code == 409
    assert response.json()["detail"] == "factory_reset_unavailable"
    assert client.get("/api/session").status_code == 200


def test_no_provider_never_deletes_data_or_sessions(client):
    advanced(client)
    store = client.app.state.store
    store.set("home_name", "Keep this home")
    response = client.post(PATH, json=BODY)
    assert response.status_code == 409
    assert response.json()["detail"] == "factory_reset_unavailable"
    assert store.get("home_name") == "Keep this home"
    assert client.get("/api/session").status_code == 200
    with store.connect() as db:
        assert db.execute("SELECT count(*) FROM users").fetchone()[0] == 1


class Provider:
    def __init__(self):
        self.calls = []

    async def preflight(self):
        return {"ready": True, "blockers": []}

    async def plan(self):
        return [
            {"kind": "zigbee", "id": "1", "name": "Testlampe"},
            {"kind": "manual", "id": "2", "name": "Sovende enhet"},
        ]

    async def execute(self, op):
        self.calls.append(op["id"])
        return ("done", "") if op["id"] == "1" else ("manual", "physical_reset_required")


def test_real_job_records_partial_result_and_duplicate_never_replays(client):
    advanced(client)
    engine = client.app.state.factory_reset
    provider = Provider()
    engine.provider = provider
    body = {k: v for k, v in BODY.items() if k != "password"} | {"request_id": str(uuid4())}
    r = client.post(PATH, json=body)
    assert r.status_code == 202
    import time

    for _ in range(100):
        result = client.get(PATH + "/" + body["request_id"]).json()
        if result["status"] != "running":
            break
        time.sleep(0.01)
    assert result["status"] == "incomplete"
    assert [r["status"] for r in result["results"]] == ["done", "manual"]
    assert client.post(PATH, json=body).json()["id"] == body["request_id"]
    assert provider.calls == ["1", "2"]
    with engine.store.connect() as db:
        persisted = db.execute("SELECT body FROM factory_resets").fetchone()[0]
    assert BODY["password"] not in persisted
    assert client.get("/api/session").status_code == 200


def test_running_reset_blocks_other_writes_and_restart_does_not_repeat(client):
    advanced(client)
    engine = client.app.state.factory_reset
    job = {
        "id": str(uuid4()),
        "status": "running",
        "step": "zigbee",
        "results": [{"name": "Lamp", "status": "running"}],
    }
    with engine.store.connect() as db:
        db.execute("INSERT INTO factory_resets VALUES(?,?,?,?)", (job["id"], 1, "running", json.dumps(job)))
    assert client.post("/api/manage/rooms", json={"name": "Bad timing"}).status_code == 423
    engine.recover()
    assert engine.read(job["id"], 1)["status"] == "interrupted"
    assert engine.read(job["id"], 1)["results"][0]["status"] == "unconfirmed"
    assert not engine.active()


def test_inventory_failure_cannot_start_deletion(client):
    from app.factory_reset import FactoryReset

    class Broken(Provider):
        async def plan(self):
            raise RuntimeError("secret-sensitive-error")

    provider = Broken()
    engine = FactoryReset(client.app.state.store, provider)

    async def exercise():
        result = await engine.start(uuid4(), 1)
        await asyncio.gather(*engine.tasks)
        return engine.read(result["id"], 1)

    result = asyncio.run(exercise())
    assert result["status"] == "incomplete"
    assert result["error"] == "reset_failed"
    assert "secret" not in json.dumps(result)
    assert not provider.calls


def test_pause_failure_stops_remaining_deletions(client):
    from app.factory_reset import FactoryReset
    from app.ha import HAError

    class Broken(Provider):
        async def plan(self):
            return [
                {"kind": "pause", "name": "automation", "id": "1"},
                {"kind": "zigbee", "name": "lamp", "id": "2"},
            ]

        async def execute(self, op):
            self.calls.append(op["id"])
            raise HAError("cannot_pause")

    provider = Broken()
    engine = FactoryReset(client.app.state.store, provider)

    async def exercise():
        result = await engine.start(uuid4(), 1)
        await asyncio.gather(*engine.tasks)
        return engine.read(result["id"], 1)

    result = asyncio.run(exercise())
    assert result["error"] == "could_not_pause_home"
    assert provider.calls == ["1"]
    assert result["results"][1]["status"] == "pending"


def test_provider_removes_supported_data_but_never_uninstalls_apps(client):
    from types import SimpleNamespace

    from app.factory_reset_provider import HomeResetProvider

    calls = []

    class HA:
        connected = True
        states = {"automation.test": {"attributes": {"id": "abc", "friendly_name": "Test"}}}

        async def request(self, kind, **kw):
            calls.append((kind, kw))
            return {
                "config_entries/get": [{"entry_id": "radio", "domain": "zwave_js"}],
                "config/device_registry/list": [
                    {"id": "node", "name": "Z-Wave", "config_entries": ["radio"]}
                ],
                "person/list": {"storage": [{"id": "person", "name": "Person"}], "config": []},
                "zone/list": [],
                "config/area_registry/list": [],
                "config/floor_registry/list": [],
                "config/auth/list": [
                    {"id": "owner", "is_owner": True},
                    {"id": "system", "system_generated": True},
                ],
                "recorder/list_statistic_ids": [],
            }.get(kind)

        async def rest(self, method, path):
            calls.append((method, path))

    class Inventory:
        async def list(self, provider):
            return {"status": "ready", "devices": []}

    async def permit(seconds):
        calls.append(("permit", seconds))

    setup = SimpleNamespace(inventory=Inventory(), permit=permit, session=None)
    provider = HomeResetProvider(HA(), setup, SimpleNamespace(mode="live"), client.app.state.store)

    async def exercise():
        plan = await provider.plan()
        result = [await provider.execute(op) for op in plan]
        return plan, result

    plan, result = asyncio.run(exercise())
    assert ("DELETE", "config/automation/config/abc") in calls
    assert ("person/delete", {"person_id": "person"}) in calls
    assert any(op.get("reason") == "zwave_exclusion_required" for op in plan)
    assert any(op.get("reason") == "ha_owner_cleanup_required" for op in plan)
    assert ("unconfirmed", "history_purge_requested") in result
    assert not any("addons" in str(c) or "datadisk" in str(c) for c in calls)
    assert not any(c[0] == "config/auth/delete" for c in calls)


def test_concurrent_requests_and_cancellation_do_not_repeat_operations(client):
    from app.factory_reset import FactoryReset

    class Waiting(Provider):
        async def execute(self, op):
            self.calls.append(op["id"])
            await asyncio.Event().wait()

    provider = Waiting()
    engine = FactoryReset(client.app.state.store, provider)

    async def exercise():
        from fastapi import HTTPException

        id = uuid4()
        first = await engine.start(id, 1)
        await asyncio.sleep(0)
        duplicate = await engine.start(id, 1)
        assert duplicate["id"] == first["id"]
        try:
            await engine.start(uuid4(), 1)
            assert False, "Concurrent reset must be rejected"
        except HTTPException as exc:
            assert exc.status_code == 409
        await engine.close()
        return engine.read(str(id), 1)

    result = asyncio.run(exercise())
    assert result["status"] == "interrupted"
    assert result["results"][0]["status"] == "unconfirmed"
    assert provider.calls == ["1"]


def test_completed_onboarding_archives_report_but_preserves_history_and_next_attempt(client):
    from types import SimpleNamespace

    advanced(client)
    store = client.app.state.store
    engine = client.app.state.factory_reset
    state = {"id": "reset-generation-one", "phase": "completed"}
    engine.provider.full = SimpleNamespace(state=lambda: state)
    with store.connect() as db:
        owner = db.execute("SELECT id FROM users WHERE name='owner'").fetchone()[0]
        old = {"id": str(uuid4()), "status": "incomplete", "results": [], "step": "finished", "error": ""}
        db.execute(
            "INSERT INTO factory_resets VALUES(?,?,?,?)", (old["id"], owner, old["status"], json.dumps(old))
        )
    # Recreating the HA owner alone does not prove the entire setup succeeded.
    assert client.get(PATH).json()["job"]["id"] == old["id"]
    store.set("onboarding:new-plan", json.dumps(["user", "completed"]))
    assert client.get(PATH).json()["job"] is None
    assert engine.read(old["id"], owner) == old
    new = old | {"id": str(uuid4()), "status": "running"}
    with store.connect() as db:
        db.execute(
            "INSERT INTO factory_resets VALUES(?,?,?,?)", (new["id"], owner, new["status"], json.dumps(new))
        )
    assert client.get(PATH).json()["job"]["id"] == new["id"]
    new["status"] = "interrupted"
    engine.save(new)
    assert client.get(PATH).json()["job"]["id"] == new["id"]


def test_incomplete_reset_is_not_archived_by_old_onboarding_checkpoint(client):
    from app.factory_reset import archive_previous_reset

    advanced(client)
    store = client.app.state.store
    store.set("onboarding:old-plan", json.dumps(["completed"]))
    for phase in ["failed", "awaiting_owner", "awaiting_reboot", "creating_owner"]:
        archive_previous_reset(store, {"id": "incomplete-reset", "phase": phase})
    assert store.get("factory_reset_report_cutoff") == ""
