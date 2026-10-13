from datetime import UTC, datetime, timedelta

from test_api import login
from test_management import client  # noqa: F401


def install(ha, id, value, unit="W", age=0):
    ha.states[id] = {
        "state": str(value),
        "attributes": {"unit_of_measurement": unit},
        "last_updated": (datetime.now(UTC) - timedelta(seconds=age)).isoformat(),
    }


def test_flow_direction_units_split_and_no_commands(client):  # noqa: F811
    c = client
    ha = c.app.state.ha
    install(ha, "sensor.grid", 1.5, "kW")
    install(ha, "sensor.export", 300)
    install(ha, "sensor.battery", 500)
    install(ha, "sensor.soc", 74, "%")
    install(ha, "sensor.solar", 0)
    p = c.get("/api/home/energy-flow/preferences").json()
    p.update(
        grid={"source": "sensor.grid", "return_source": "sensor.export", "positive": "supply"},
        battery={"source": "sensor.battery", "positive": "consume"},
        battery_level="sensor.soc",
        solar={"source": "sensor.solar"},
    )
    assert c.put("/api/home/energy-flow/preferences", json=p).status_code == 200
    live = c.get("/api/home/energy-flow/live").json()
    assert live["flows"]["grid"]["watts"] == 1200
    assert live["flows"]["battery"]["watts"] == -500
    assert live["flows"]["solar"]["watts"] == 0
    assert live["battery_level"] == 74
    install(ha, "sensor.grid", -2, "kW")
    p["grid"]["return_source"] = None
    assert c.put("/api/home/energy-flow/preferences", json=p).status_code == 200
    assert c.get("/api/home/energy-flow/live").json()["flows"]["grid"]["watts"] == -2000
    assert ha.states["sensor.battery"]["state"] == "500"


def test_flow_freshness_and_invalid_mappings(client):  # noqa: F811
    c = client
    ha = c.app.state.ha
    install(ha, "sensor.power", 500, age=600)
    install(ha, "sensor.energy", 5, "kWh")
    assert (
        c.put("/api/home/energy-flow/preferences", json={"home": {"source": "sensor.power"}}).status_code
        == 200
    )
    live = c.get("/api/home/energy-flow/live").json()
    assert live["flows"]["home"]["status"] == "stale"
    assert live["flows"]["home"]["watts"] is None
    ha.states["sensor.power"]["last_reported"] = datetime.now(UTC).isoformat()
    assert c.get("/api/home/energy-flow/live").json()["flows"]["home"]["watts"] == 500
    install(ha, "sensor.power", -100)
    assert c.get("/api/home/energy-flow/live").json()["flows"]["home"]["status"] == "invalid"
    for body in [
        {"solar": {"source": "sensor.energy"}},
        {"ev": {"source": "sensor.power", "return_source": "sensor.power"}},
        {"grid": {"return_source": "sensor.power"}},
        {"grid": {"source": "sensor.power", "return_source": "sensor.power"}},
        {"battery_level": "sensor.power"},
        {"max_age": 5},
        {"solar": {"source": "sensor.missing"}},
    ]:
        assert c.put("/api/home/energy-flow/preferences", json=body).status_code == 422
    install(ha, "sensor.power", "not-a-number")
    assert c.get("/api/home/energy-flow/live").json()["flows"]["home"]["status"] == "invalid"
    install(ha, "sensor.power", 50, "%")
    assert c.get("/api/home/energy-flow/live").json()["flows"]["home"]["status"] == "invalid"
    ha.connected = False
    assert c.get("/api/home/energy-flow/live").json()["flows"]["home"]["status"] == "unavailable"


def test_flow_personal_preferences_and_auth(client):  # noqa: F811
    c = client
    assert c.put("/api/home/energy-flow/preferences", json={"solar": {"visible": False}}).status_code == 200
    assert (
        c.put("/api/home/energy-flow/preferences", json={}, headers={"x-csrf-token": "bad"}).status_code
        == 403
    )
    c.post("/api/users", json={"name": "resident", "password": "another long password", "role": "user"})
    c.post("/api/logout")
    login(c, "resident", "another long password")
    assert c.get("/api/home/energy-flow/preferences").json()["solar"]["visible"]
    c.cookies.clear()
    assert c.get("/api/home/energy-flow/live").status_code == 401
    assert c.get("/api/home/energy-flow/preferences").status_code == 401


def test_history_hour_alignment_net_sign_and_missing_data():
    from app.energy_flow import Binding, flow_history

    start = datetime(2026, 10, 13, tzinfo=UTC)

    def row(hour, mean):
        return {"start": (start + timedelta(hours=hour)).timestamp() * 1000, "mean": mean}

    bindings = {
        "grid": Binding(source="import", return_source="export"),
        "battery": Binding(source="battery", positive="consume"),
        "solar": Binding(source="solar"),
        "ev": Binding(source="ev", visible=False),
    }
    result = flow_history(
        bindings,
        {
            "import": [row(0, 2), row(1, 1), row(2, -1)],
            "export": [row(0, 0.5), row(2, 0.1)],
            "battery": [row(0, 0.4), row(1, -0.6), row(2, float("nan"))],
            "solar": [row(0, 0), row(1, -1), row(2, 2.5)],
        },
        start,
        start + timedelta(hours=3),
    )
    assert [p["value"] for p in result["grid"]] == [1500, None, None]
    assert [p["value"] for p in result["battery"]] == [-400, 600, None]
    assert [p["value"] for p in result["solar"]] == [0, None, 2500]
    assert "ev" not in result


def test_flow_history_native_query_and_failures(tmp_path):
    from types import SimpleNamespace

    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from app.demo import Demo
    from app.energy_flow import energy_flow_router
    from app.ha import HAError
    from app.storage import Store

    ha = Demo()
    install(ha, "sensor.solar", 2500)
    calls = []

    async def request(kind, **params):
        calls.append((kind, params))
        start = datetime.fromisoformat(params["start_time"])
        return {"sensor.solar": [{"start": start.timestamp() * 1000, "mean": 2.5}]}

    ha.request = request
    app = FastAPI()
    app.include_router(
        energy_flow_router(
            Store(tmp_path / "flow.sqlite"), lambda: {"id": 1}, ha, SimpleNamespace(mode="live")
        )
    )
    with TestClient(app) as c:
        assert (
            c.put("/api/home/energy-flow/preferences", json={"solar": {"source": "sensor.solar"}}).status_code
            == 200
        )
        result = c.get("/api/home/energy-flow/history?period=7d").json()
        assert len(result["series"]["solar"]) == 168
        assert result["series"]["solar"][0]["value"] == 2500
        assert result["series"]["solar"][1]["value"] is None
        assert calls[0][0] == "recorder/statistics_during_period"
        assert calls[0][1]["units"] == {"power": "kW"}
        assert calls[0][1]["statistic_ids"] == ["sensor.solar"]
        assert c.get("/api/home/energy-flow/history?period=bad").status_code == 422

        async def unavailable(*args, **kwargs):
            raise HAError("unavailable")

        ha.request = unavailable
        assert c.get("/api/home/energy-flow/history").status_code == 503
        ha.connected = False
        assert c.get("/api/home/energy-flow/history").status_code == 503


def test_model_can_hide_removed_sensor_and_history_requires_login(client):  # noqa: F811
    c = client
    assert (
        c.put(
            "/api/home/energy-flow/preferences", json={"ev": {"source": "sensor.removed", "visible": False}}
        ).status_code
        == 200
    )
    assert "ev" not in c.get("/api/home/energy-flow/history").json()["series"]
    c.cookies.clear()
    assert c.get("/api/home/energy-flow/history").status_code == 401
