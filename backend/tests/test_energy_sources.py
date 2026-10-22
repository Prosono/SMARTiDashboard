from datetime import date, timedelta

import httpx
from fastapi.testclient import TestClient
from test_cloud import SECRET

from app.cloud import create_cloud
from app.energy_intervals import local_day


def patch_http(monkeypatch, handler):
    original = httpx.AsyncClient

    def client(*args, **kwargs):
        return original(*args, **kwargs, transport=httpx.MockTransport(handler))

    monkeypatch.setattr(httpx, "AsyncClient", client)


def test_cloud_spot_cache_handles_23_hour_day_and_rejects_incomplete_prices(tmp_path, monkeypatch):
    app = create_cloud(tmp_path / "cloud.db", SECRET)
    calls = []

    def handler(request):
        calls.append(str(request.url))
        start, end = local_day(date(2026, 3, 29))
        count = 23 if "03-29" in request.url.path else 22
        rows = [
            {
                "time_start": (start + timedelta(hours=i)).isoformat(),
                "time_end": (start + timedelta(hours=i + 1)).isoformat(),
                "NOK_per_kWh": -0.15,
            }
            for i in range(count)
        ]
        return httpx.Response(200, json=rows)

    patch_http(monkeypatch, handler)
    client = TestClient(app)
    response = client.get("/api/energy/prices/NO1/2026-03-29")
    assert response.status_code == 200, response.text
    assert len(response.json()) == 23
    assert client.get("/api/energy/prices/NO1/2026-03-29").json() == response.json()
    assert len(calls) == 1
    assert client.get("/api/energy/prices/NO1/2026-03-28").status_code == 503
    assert client.get("/api/energy/prices/invalid/2026-03-29").status_code == 422


def test_tariff_fallback_and_allowlist(tmp_path, monkeypatch):
    app = create_cloud(tmp_path / "cloud.db", SECRET)
    calls = []

    def handler(request):
        calls.append(str(request.url))
        return httpx.Response(503)

    patch_http(monkeypatch, handler)
    client = TestClient(app)
    result = client.get("/api/energy/tariffs/elvia")
    assert result.status_code == 200
    assert result.json()["stale"]
    assert result.json()["data"]["netteier"] == "Elvia AS"
    assert client.get("/api/energy/tariffs/elvia").json() == result.json()
    assert len(calls) == 1
    assert client.get("/api/energy/tariffs/unknown").status_code == 404
