import base64
import json
import sqlite3
import uuid

import httpx
from app.config import Settings
from app.ha import HAError
from app.hub_onboarding import HubOnboarding
from app.storage import Store
from test_onboarding import CHECKS, HEARTBEAT, PLAN, FakeHA, factory, ready_and_claim


async def test_configured_hub_location_updates_and_is_cleared_on_reset(tmp_path):
    path, app, staff, owner, _, hub, home, activation, kit = factory(tmp_path)
    identity = tmp_path / "identity.json"
    identity.write_text(json.dumps({"installation_id": home, "credential": kit["remote_credential"]}))
    settings = Settings(
        data_dir=tmp_path, database=tmp_path / "hub.sqlite", mode="demo", remote_identity_file=identity
    )

    class LocatedHA(FakeHA):
        config = {}

        async def request(self, kind, **data):
            if kind == "get_config":
                if self.config is None:
                    raise HAError("disconnected")
                return self.config
            return await super().request(kind, **data)

    ha = LocatedHA()
    worker = HubOnboarding(settings, ha, Store(settings.database), {}, httpx.ASGITransport(app=app))
    inventory_url = "/api/admin/hubs"
    owner_url = f"/api/onboarding/{home}"
    initial = {"latitude": 60.39, "longitude": 5.32, "name": "Bergen", "source": "configured"}

    def inventory():
        return staff.get(inventory_url).json()[0]

    await worker.tick()
    assert staff.post(f"/api/admin/hubs/{home}/ready", json=CHECKS).status_code == 200
    assert owner.post(f"/api/activation/{home}/claim", json=activation).status_code == 200
    assert owner.post(owner_url, json=PLAN).status_code == 200
    await worker.tick()
    assert inventory()["location"]["source"] == "onboarding"

    ha.config = {
        "config_source": "storage",
        "latitude": initial["latitude"],
        "longitude": initial["longitude"],
        "location_name": initial["name"],
        "internal_url": "http://private-internal",
    }
    await worker.tick()
    assert inventory()["location"] == initial
    assert "location" not in inventory()["health"]
    assert "private-internal" not in staff.get(inventory_url).text
    assert "Bergen" not in owner.get(owner_url).text
    assert owner.get(inventory_url).status_code == 403

    ha.config = None
    await worker.tick()
    assert inventory()["location"] == initial
    ha.config = {"config_source": "discovered", "latitude": 12, "longitude": 34, "location_name": "Other"}
    await worker.tick()
    assert inventory()["location"] is None

    ha.config |= {"config_source": "yaml", "location_name": "Configured new home"}
    await worker.tick()
    assert inventory()["location"] == {
        "latitude": 12,
        "longitude": 34,
        "name": "Configured new home",
        "source": "configured",
    }
    public_key = base64.b64encode(b"k" * 32).decode()
    assert (
        hub.post(
            f"/api/hubs/{home}/factory-reset/begin",
            json={"id": str(uuid.uuid4()), "public_key": public_key},
        ).status_code
        == 200
    )
    await worker.tick()
    assert inventory()["location"] is None
    with sqlite3.connect(path) as conn:
        assert conn.execute("SELECT 1 FROM hub_map_locations WHERE home=?", (home,)).fetchone() is None


def test_existing_onboarding_draft_does_not_supply_a_location(tmp_path):
    _, _, staff, owner, _, hub, home, activation, _ = factory(tmp_path)
    ready_and_claim(staff, owner, hub, home, activation)
    heartbeat_url = f"/api/hubs/{home}/onboarding/heartbeat"
    heartbeat = HEARTBEAT | {"users": 1, "location": {"latitude": 1, "longitude": 2, "name": "Existing"}}
    assert hub.post(heartbeat_url, json=heartbeat).status_code == 200

    plan = owner.post(
        f"/api/onboarding/{home}", json=PLAN | {"mode": "existing", "latitude": 0, "longitude": 0}
    ).json()
    assert (
        hub.post(
            f"/api/hubs/{home}/onboarding/progress",
            json={"id": plan["id"], "status": "completed", "step": "completed"},
        ).status_code
        == 200
    )
    assert staff.get("/api/admin/hubs").json()[0]["location"] is None

    assert hub.post(heartbeat_url, json=heartbeat).status_code == 200
    assert staff.get("/api/admin/hubs").json()[0]["location"]["name"] == "Existing"
