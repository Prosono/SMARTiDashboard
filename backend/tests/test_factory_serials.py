import sqlite3
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from test_cloud import ORIGIN, SECRET, account

from app import cloud_onboarding
from app.cloud import create_cloud

ENDPOINT = "/api/admin/hubs/serial"


@pytest.fixture
def factory(tmp_path, monkeypatch):
    monkeypatch.setattr(
        cloud_onboarding, "datetime", SimpleNamespace(now=lambda _: datetime(2026, 11, 1, tzinfo=UTC))
    )
    path = tmp_path / "factory.sqlite"
    app = create_cloud(path, SECRET)
    staff, member = account(app, "factory"), account(app, "resident")
    with sqlite3.connect(path) as db:
        db.execute("INSERT INTO portal_admins SELECT id FROM accounts WHERE username='factory'")
    return path, app, staff, member


def register(staff, serial):
    return staff.post(
        "/api/admin/hubs", json={"serial": serial, "model": "SMARTi Hub", "hardware": "Zigbee + Z-Wave"}
    )


def clone_client(app, staff):
    client = TestClient(app, base_url=ORIGIN, headers={"Origin": ORIGIN})
    client.cookies.update(staff.cookies)
    client.headers["X-CSRF-Token"] = staff.headers["X-CSRF-Token"]
    return client


def test_serial_generation_requires_current_portal_role_origin_and_csrf(factory):
    path, app, staff, member = factory
    assert TestClient(app, base_url=ORIGIN).post(ENDPOINT).status_code == 401
    assert member.post(ENDPOINT).status_code == 403
    assert staff.post(ENDPOINT, headers={"X-CSRF-Token": "wrong"}).status_code == 403
    assert staff.post(ENDPOINT, headers={"Origin": "https://elsewhere.example"}).status_code == 403
    assert staff.get(ENDPOINT).status_code == 405
    assert staff.post(ENDPOINT).json() == {"serial": "SMARTi-2026-000001"}
    with sqlite3.connect(path) as db:
        db.execute("DELETE FROM portal_admins")
    assert staff.post(ENDPOINT).status_code == 403
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT next_number FROM factory_serial_sequence").fetchone()[0] == 2


def test_generating_only_allocates_a_public_number_then_registration_and_labels_use_it(factory):
    path, app, staff, member = factory
    result = staff.post(ENDPOINT)
    assert result.status_code == 200 and result.json() == {"serial": "SMARTi-2026-000001"}
    assert result.headers["cache-control"] == "no-store"
    assert staff.get("/api/admin/hubs").json() == []
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT count(*) FROM homes").fetchone()[0] == 0
        audit = db.execute("SELECT action,target FROM admin_audit").fetchall()
        assert audit == [("factory_serial_generated", "SMARTi-2026-000001")]
    serial = result.json()["serial"]
    created = register(staff, serial)
    assert created.status_code == 200
    hub = staff.get("/api/admin/hubs").json()[0]
    assert hub["serial"] == serial and hub["phase"] == "preparing"
    assert staff.get(f"/api/admin/hubs/{hub['id']}/label").headers["content-type"].startswith("image/svg+xml")
    assert register(staff, serial).status_code == 409
    assert staff.post("/api/admin/hubs", json={"model": "Hub", "hardware": "Zigbee"}).status_code == 422
    assert staff.post(ENDPOINT).json()["serial"] == "SMARTi-2026-000002"


def test_counter_survives_restart_abandoned_forms_and_deleted_hubs(factory):
    path, app, staff, member = factory
    assert staff.post(ENDPOINT).json()["serial"] == "SMARTi-2026-000001"
    serial = staff.post(ENDPOINT).json()["serial"]
    hub = register(staff, serial).json()["installation_id"]
    assert staff.delete(f"/api/admin/hubs/{hub}").status_code == 200
    restarted = clone_client(create_cloud(path, SECRET), staff)
    assert restarted.post(ENDPOINT).json()["serial"] == "SMARTi-2026-000003"
    assert restarted.get("/api/admin/hubs").json() == []


def test_existing_manual_numbers_are_preserved_and_case_variants_cannot_duplicate_a_hub(factory):
    path, app, staff, member = factory
    assert register(staff, "smarti-2026-000001").status_code == 200
    assert register(staff, "LEGACY-123").status_code == 200
    assert staff.post(ENDPOINT).json()["serial"] == "SMARTi-2026-000002"
    assert register(staff, "SMARTi-2026-000001").json()["detail"] == "serial_already_registered"
    assert register(staff, "legacy-123").status_code == 409
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT count(*) FROM homes").fetchone()[0] == 2
        assert db.execute("SELECT count(*) FROM factory_hubs").fetchone()[0] == 2


def test_concurrent_workers_share_one_atomic_sequence(factory):
    path, app, staff, member = factory
    apps = [app, create_cloud(path, SECRET)]

    def generate(index):
        response = clone_client(apps[index % 2], staff).post(ENDPOINT)
        assert response.status_code == 200
        return response.json()["serial"]

    with ThreadPoolExecutor(max_workers=4) as pool:
        serials = list(pool.map(generate, range(12)))
    assert set(serials) == {f"SMARTi-2026-{number:06d}" for number in range(1, 13)}
    assert staff.get("/api/admin/hubs").json() == []
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT next_number FROM factory_serial_sequence").fetchone()[0] == 13
        assert (
            db.execute("SELECT count(*) FROM admin_audit WHERE action='factory_serial_generated'").fetchone()[
                0
            ]
            == 12
        )


def test_new_year_has_its_own_sequence_without_resetting_previous_year(factory, monkeypatch):
    path, app, staff, member = factory
    assert staff.post(ENDPOINT).json()["serial"] == "SMARTi-2026-000001"
    monkeypatch.setattr(
        cloud_onboarding, "datetime", SimpleNamespace(now=lambda _: datetime(2027, 1, 1, tzinfo=UTC))
    )
    assert staff.post(ENDPOINT).json()["serial"] == "SMARTi-2027-000001"
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT * FROM factory_serial_sequence ORDER BY year").fetchall() == [
            (2026, 2),
            (2027, 2),
        ]


def test_counter_expands_past_six_digits_without_truncation(factory):
    path, app, staff, member = factory
    with sqlite3.connect(path) as db:
        db.execute("INSERT INTO factory_serial_sequence VALUES(2026,999999)")
    assert staff.post(ENDPOINT).json()["serial"] == "SMARTi-2026-999999"
    serial = staff.post(ENDPOINT).json()["serial"]
    assert serial == "SMARTi-2026-1000000"
    assert register(staff, serial).status_code == 200


def test_counter_and_audit_rollback_together_on_failure(factory):
    path, app, staff, member = factory
    with sqlite3.connect(path) as db:
        db.execute("""CREATE TRIGGER reject_serial_audit BEFORE INSERT ON admin_audit
            WHEN NEW.action='factory_serial_generated' BEGIN SELECT RAISE(ABORT,'test failure'); END""")
    failing = TestClient(app, base_url=ORIGIN, headers=staff.headers, raise_server_exceptions=False)
    failing.cookies.update(staff.cookies)
    assert failing.post(ENDPOINT).status_code == 500
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT count(*) FROM factory_serial_sequence").fetchone()[0] == 0
        assert db.execute("SELECT count(*) FROM factory_hubs").fetchone()[0] == 0
        db.execute("DROP TRIGGER reject_serial_audit")
    assert staff.post(ENDPOINT).json()["serial"] == "SMARTi-2026-000001"
