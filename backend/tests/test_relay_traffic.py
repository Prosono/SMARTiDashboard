import time

from test_cloud_admin import setup

from app.relay_traffic import TrafficMeter, traffic_report


def test_daily_totals_survive_restarts_and_keep_hubs_separate(tmp_path):
    path = tmp_path / "traffic.sqlite"
    meter = TrafficMeter(path)
    meter.record("home-a", "to_hub", 120)
    meter.record("home-a", "from_hub", 900)
    meter.record("home-a", "connections", 1)
    meter.record("home-b", "from_hub", 30)
    meter.flush()
    meter.flush()  # No double counting when there is no new traffic.
    resumed = TrafficMeter(path)
    resumed.record("home-a", "from_hub", 100)
    resumed.flush()
    report = traffic_report(path, 7)
    assert report["available"] and not report["stale"]
    assert len(report["daily"]) == 7
    assert report["hubs"]["home-a"]["to_hub"] == 120
    assert report["hubs"]["home-a"]["from_hub"] == 1000
    assert report["hubs"]["home-b"]["from_hub"] == 30
    assert sum(d["from_hub"] for d in report["daily"]) == 1030
    assert report["hubs"]["home-a"]["connections"] == 1
    assert report["started"] <= time.time()


def test_missing_metrics_and_admin_only_api(tmp_path, monkeypatch):
    app, _, staff, customer = setup(tmp_path)
    path = tmp_path / "metrics.sqlite"
    monkeypatch.setenv("RELAY_TRAFFIC_DATABASE", str(path))
    assert not staff.get("/api/admin/traffic").json()["available"]
    assert customer.get("/api/admin/traffic").status_code == 403
    assert staff.get("/api/admin/traffic?days=999").status_code == 422
    TrafficMeter(path)
    assert staff.get("/api/admin/traffic?days=30").json()["available"]


async def test_tunnel_counts_payload_only_in_both_directions():
    from app.tunnel import Tunnel

    class Socket:
        async def send(self, frame):
            pass

        def __aiter__(self):
            async def frames():
                yield b"D" + b"a" * 16 + b"12345"
                yield b"C" + b"a" * 16

            return frames()

    class Writer:
        def write(self, data):
            assert data == b"12345"

        async def drain(self):
            pass

        def close(self):
            pass

    counts = []
    tunnel = Tunnel(Socket(), meter=lambda direction, size: counts.append((direction, size)))
    tunnel.streams[b"a" * 16] = Writer()
    await tunnel.send(b"O" + b"a" * 16)
    await tunnel.send(b"D" + b"a" * 16 + b"123")
    await tunnel.receive()
    assert counts == [("to_hub", 3), ("from_hub", 5)]
