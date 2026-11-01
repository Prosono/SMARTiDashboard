from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.home_extras import extras_router
from app.models import normalize
from app.storage import Store


@pytest.mark.parametrize("unit", ["°C", "°F"])
def test_climate_history_reads_measured_attribute_without_minimal_response(tmp_path, unit):
    now = datetime.now(UTC)
    calls = []

    class HA:
        connected = True
        devices = {}
        states = {
            "climate.room": {
                "state": "heat",
                "attributes": {"current_temperature": 21, "temperature_unit": unit},
            }
        }

        def controls(self):
            return normalize(self.states, {}, {})

        async def rest(self, method, path):
            calls.append(path)
            rows = []
            for index, (state, attributes) in enumerate(
                [
                    ("heat", {"current_temperature": 20}),
                    ("unavailable", {"current_temperature": 99}),
                    ("heat", None),
                    ("off", {"current_temperature": 0}),
                    ("heat", {"current_temperature": "18.2"}),
                    ("heat", {"current_temperature": True}),
                    ("heat", {"current_temperature": float("nan")}),
                ]
            ):
                rows.append(
                    {
                        "state": state,
                        "attributes": attributes,
                        "last_changed": (now - timedelta(hours=3)).isoformat(),
                        "last_updated": (now - timedelta(minutes=10 - index)).isoformat(),
                    }
                )
            return [rows]

    enabled = [True]

    def user():
        if not enabled[0]:
            raise HTTPException(401)
        return {"id": 1, "role": "admin"}

    ha = HA()
    app = FastAPI()
    app.include_router(
        extras_router(Store(tmp_path / "metric.sqlite3"), user, ha, SimpleNamespace(mode="live"))
    )
    with TestClient(app) as client:
        result = client.get("/api/controls/climate.room/history?hours=24")
        assert result.status_code == 200
        data = result.json()
        assert data["unit"] == unit
        assert [p["value"] for p in data["points"]] == [20, None, None, 0, 18.2, None, None]
        assert data["minimum"] == 0 and data["maximum"] == 20
        assert len({p["time"] for p in data["points"]}) == 7
        params = parse_qs(urlparse(calls[0]).query, keep_blank_values=True)
        assert params["filter_entity_id"] == ["climate.room"]
        assert params["significant_changes_only"] == ["0"]
        assert "no_attributes" not in params and "minimal_response" not in params
        assert client.get("/api/controls/climate.room/history?hours=999").status_code == 422
        assert client.get("/api/controls/climate.missing/history").status_code == 404
        ha.connected = False
        assert client.get("/api/controls/climate.room/history").status_code == 503
        enabled[0] = False
        assert client.get("/api/controls/climate.room/history").status_code == 401
