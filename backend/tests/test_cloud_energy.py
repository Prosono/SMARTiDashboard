import sqlite3
from datetime import UTC, datetime, timedelta

from test_cloud import SECRET, account, code, provision

from app.cloud import create_cloud


def test_energy_archive_isolated_idempotent_and_owner_scoped(tmp_path):
    path = tmp_path / "cloud.db"
    app = create_cloud(path, SECRET)
    alice, bob = account(app, "alice"), account(app, "bob")
    client, home = provision(app, "Home")
    headers = {"Authorization": "Bearer " + home["credential"]}
    endpoint = f"/api/hubs/{home['installation_id']}/energy/history"
    start = datetime.now(UTC).replace(minute=0, second=0, microsecond=0) - timedelta(hours=1)
    row = {
        "entity": "sensor.import",
        "start": start.isoformat(),
        "end": (start + timedelta(hours=1)).isoformat(),
        "value": "2.5",
        "source": "ha:recorder",
        "quality": "measured",
    }
    assert client.post(endpoint, headers=headers, json={"readings": [row]}).status_code == 409
    assert alice.post("/api/homes/claim", json={"code": code(client, home)}).status_code == 200
    for _ in range(2):
        assert client.post(
            endpoint,
            headers=headers,
            json={
                "readings": [row],
                "agreements": [
                    {
                        "start": start.isoformat(),
                        "config": {
                            "company": "elvia",
                            "equipment": {"solar": True, "ev": False, "battery": False},
                        },
                    }
                ],
            },
        ).json() == {"accepted": 1}
    assert client.post(endpoint, json={"readings": [row]}).status_code == 403
    read = f"/api/homes/{home['installation_id']}/energy/history"
    query = {"start": start.isoformat(), "end": (start + timedelta(hours=1)).isoformat()}
    assert (
        client.post(
            endpoint,
            headers=headers,
            json={
                "readings": [],
                "agreements": [
                    {
                        "start": start.isoformat(),
                        "config": {
                            "company": "elvia",
                            "equipment": {"solar": True, "ev": False, "battery": False},
                        },
                    }
                ],
            },
        ).status_code
        == 200
    )
    assert len(alice.get(read, params=query).json()["readings"]) == 1
    assert alice.get(read, params=query).json()["agreements"][0]["config"]["company"] == "elvia"
    assert alice.get(read, params=query).json()["agreements"][0]["config"]["equipment"] == {
        "solar": True,
        "ev": False,
        "battery": False,
    }
    assert bob.get(read, params=query).status_code == 404
    # Simulate reassignment: the new owner must not inherit private readings.
    with sqlite3.connect(path) as db:
        owner = db.execute("SELECT id FROM accounts WHERE username='bob'").fetchone()[0]
        db.execute("UPDATE homes SET owner=? WHERE id=?", (owner, home["installation_id"]))
    assert alice.get(read, params=query).status_code == 404
    assert bob.get(read, params=query).json()["readings"] == []
    assert bob.get(read, params=query).json()["agreements"] == []
    bad = row | {"value": "NaN"}
    assert client.post(endpoint, headers=headers, json={"readings": [bad]}).status_code == 422
