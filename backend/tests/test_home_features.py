from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import httpx
import pytest
from app.camera_stream import CameraStreams
from app.energy import energy_router, summarize
from app.scenes import scenes_router
from app.storage import Store
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from test_api import login
from test_management import client  # noqa: F401


def scene_body():
    return {
        "name": "Filmkveld",
        "icon": "mdi:movie-open",
        "entities": {"light.living_pendant": {"state": "on", "brightness": 90}},
    }


def test_scene_creation_preservation_conflicts_and_roles(client):  # noqa: F811
    c = client
    before = c.app.state.ha.states["light.living_pendant"].copy()
    response = c.post("/api/scenes", json=scene_body())
    assert response.status_code == 200, response.text
    value = response.json()
    id = value["id"]
    assert c.app.state.ha.states["light.living_pendant"] == before  # Saving is not activation.
    assert c.get("/api/scenes").json()[0]["available"]
    assert c.get("/api/scenes/config/" + id).json()["entities"]["light.living_pendant"]["brightness"] == 90
    assert c.put("/api/scenes/config/" + id, json=scene_body()).status_code == 409
    assert (
        c.put(
            "/api/scenes/config/" + id, json=scene_body() | {"revision": value["revision"], "name": "Film"}
        ).status_code
        == 200
    )
    assert c.post("/api/scenes/activate/scene." + id, json={"confirmed": False}).status_code == 422
    assert (
        c.post("/api/scenes/activate/scene." + id, json={"confirmed": True}).json()["status"] == "simulated"
    )
    assert (
        c.post(
            "/api/scenes", json=scene_body() | {"entities": {"light.living_pendant": {"state": "invalid"}}}
        ).status_code
        == 422
    )
    assert c.post("/api/scenes", json=scene_body(), headers={"x-csrf-token": "bad"}).status_code == 403
    c.post("/api/users", json={"name": "resident", "password": "another long password", "role": "user"})
    c.post("/api/logout")
    login(c, "resident", "another long password")
    assert c.get("/api/scenes").status_code == 200
    assert c.post("/api/scenes", json=scene_body()).status_code == 403
    assert c.get("/api/scenes/config/" + id).status_code == 403
    assert c.post("/api/scenes/activate/scene." + id, json={"confirmed": True}).status_code == 200


def test_scene_native_save_preserves_advanced_and_other_domains(tmp_path):
    from app.demo import Demo

    ha = Demo()
    original = {
        "id": "old",
        "name": "Original",
        "icon": "mdi:lightbulb",
        "metadata": {"custom": True},
        "entities": {
            "light.living_pendant": {"state": "on", "brightness": 120, "effect": "evening"},
            "cover.garage": {"state": "closed"},
        },
    }
    calls = []

    async def rest(method, path, data=None):
        calls.append((method, path, data))
        return original if method == "GET" else {}

    ha.rest = rest
    app = FastAPI()
    app.include_router(
        scenes_router(
            ha,
            Store(tmp_path / "test.sqlite"),
            lambda: {"id": 1, "role": "admin"},
            SimpleNamespace(mode="live"),
        )
    )
    with TestClient(app) as c:
        value = c.get("/api/scenes/config/old").json()
        assert value["preserved"] == ["cover.garage"]
        assert "effect" not in value["entities"]["light.living_pendant"]
        r = c.put("/api/scenes/config/old", json=scene_body() | {"revision": value["revision"]})
        assert r.status_code == 200, r.text
        posted = calls[-1][2]
        assert calls[-1][:2] == ("POST", "config/scene/config/old")
        assert posted["metadata"] == original["metadata"]
        assert posted["entities"]["cover.garage"] == {"state": "closed"}
        assert posted["entities"]["light.living_pendant"]["effect"] == "evening"
        assert posted["entities"]["light.living_pendant"]["brightness"] == 90


def test_energy_missing_samples_not_zero_and_comparable_units():
    start = datetime(2026, 10, 1, tzinfo=UTC)
    end = start + timedelta(hours=24)
    rows = [
        {"start": (start + timedelta(hours=i)).timestamp() * 1000, "change": 2, "mean": 3} for i in range(24)
    ]
    energy = summarize(rows, start, end, True)
    power = summarize(rows, start, end, False)
    assert energy["value"] == 48 and energy["complete"]
    assert power["value"] == 3
    rows[3]["change"] = None
    energy = summarize(rows, start, end, True)
    assert energy["value"] == 46 and not energy["complete"] and energy["points"][3]["value"] is None
    assert summarize([], start, end, True)["value"] is None
    # Negative net energy is legitimate; no clamping or fabricated savings.
    rows[0]["change"] = -2
    assert summarize(rows, start, end, True)["points"][0]["value"] == -2


def test_energy_preferences_per_user_bounded_and_stats_contract(client):  # noqa: F811
    ha = client.app.state.ha
    ha.states["sensor.energy"] = {
        "state": "100",
        "attributes": {"unit_of_measurement": "kWh", "device_class": "energy"},
    }
    pref = {"meters": ["sensor.energy"], "hidden": ["comparison"], "period": "7d", "chart": "line"}
    assert client.put("/api/home/energy/preferences", json=pref).status_code == 200
    assert client.get("/api/home/energy/preferences").json() == pref
    value = client.get("/api/home/energy/statistics?period=7d").json()
    assert value["series"][0]["current"]["value"] is None
    assert value["series"][0]["change_percent"] is None
    assert len(value["series"][0]["current"]["points"]) == 7
    assert (
        client.put(
            "/api/home/energy/preferences", json=pref | {"meters": ["light.living_pendant"]}
        ).status_code
        == 422
    )
    assert client.get("/api/home/energy/statistics?period=100y").status_code == 422
    client.post("/api/users", json={"name": "resident", "password": "another long password", "role": "user"})
    client.post("/api/logout")
    login(client, "resident", "another long password")
    assert client.get("/api/home/energy/preferences").json()["meters"] == []


def test_energy_native_statistics_query_converts_units(tmp_path):
    from app.demo import Demo

    ha = Demo()
    ha.states["sensor.energy"] = {"state": "1500", "attributes": {"unit_of_measurement": "Wh"}}
    calls = []

    async def request(kind, **data):
        calls.append((kind, data))
        start = datetime.fromisoformat(data["start_time"])
        return {
            "sensor.energy": [
                {"start": (start + timedelta(hours=i)).timestamp() * 1000, "change": 1 if i < 24 else 2}
                for i in range(48)
            ]
        }

    ha.request = request
    app = FastAPI()
    app.include_router(
        energy_router(ha, Store(tmp_path / "e.sqlite"), lambda: {"id": 1}, SimpleNamespace(mode="live"))
    )
    with TestClient(app) as c:
        r = c.get("/api/home/energy/statistics?ids=sensor.energy").json()
        assert r["series"][0]["unit"] == "kWh"
        assert r["series"][0]["current"]["value"] == 48
        assert r["series"][0]["change_percent"] == 100
        assert calls[0][0] == "recorder/statistics_during_period"
        assert calls[0][1]["units"] == {"energy": "kWh", "power": "kW"}


@pytest.mark.parametrize("http_url", ["http://ha.local:8123/api/", "http://supervisor/core/api/"])
@pytest.mark.asyncio
async def test_live_hls_rewrites_every_uri_and_rejects_external_urls(monkeypatch, http_url):
    observed = []
    content = b'#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXT-X-PART:DURATION=0.5,URI="segment/1.0.m4s"\nsegment/1.m4s\nplaylist.m3u8\n'
    original = httpx.AsyncClient

    def reply(request):
        observed.append(request)
        return httpx.Response(200, content=content)

    monkeypatch.setattr(
        httpx, "AsyncClient", lambda **kw: original(transport=httpx.MockTransport(reply), **kw)
    )

    async def request(kind, **data):
        assert kind == "camera/stream" and data["format"] == "hls"
        return {"url": "/api/hls/abcdef/master_playlist.m3u8"}

    ha = SimpleNamespace(connected=True, http_url=http_url, token="private-secret", request=request)
    streams = CameraStreams(ha)
    value = await streams.start("camera.front", (1, "session1"))
    sid = value["id"]
    assert "abcdef" not in str(value) and "private-secret" not in str(value)
    session = streams.session(sid, (1, "session1"))
    rid = value["path"].split("/")[-1]
    data, media = await streams.fetch(session, rid, {"_HLS_msn": "1"})
    assert media == "application/vnd.apple.mpegurl"
    assert "segment/" not in data.decode() and "init.mp4" not in data.decode()
    assert len(session["resources"]) == 5
    assert observed[0].headers["authorization"] == "Bearer private-secret"
    assert str(observed[0].url) == http_url + "hls/abcdef/master_playlist.m3u8?_HLS_msn=1"
    # HA can emit canonical root-relative links even when reached through Supervisor.
    root_segment = streams.resource(session, http_url, "/api/hls/abcdef/segment/1.m4s")
    assert session["resources"][root_segment] == http_url + "hls/abcdef/segment/1.m4s"
    assert streams.resource(session, http_url, http_url + "hls/abcdef/segment/1.m4s") == root_segment
    content = b"video-segment"
    video, media = await streams.fetch(session, root_segment, {})
    assert video == content and media == "video/mp4"
    assert str(observed[-1].url) == http_url + "hls/abcdef/segment/1.m4s"
    for bad in ["https://evil.test/video.m3u8", "/api/config", "../123/playlist.m3u8", "%2e%2e/secret.mp4"]:
        with pytest.raises(HTTPException):
            streams.resource(session, ha.http_url + "hls/abcdef/master_playlist.m3u8", bad)
    with pytest.raises(HTTPException):
        streams.session(sid, (1, "another-login"))
    with pytest.raises(HTTPException):
        await streams.fetch(session, rid, {"url": "http://evil"})
    content = b"#EXTM3U\nhttps://evil.test/video.m3u8\n"
    with pytest.raises(HTTPException):
        await streams.fetch(session, rid, {})
    session["used"] -= 121
    with pytest.raises(HTTPException):
        streams.session(sid, (1, "session1"))


def test_stream_start_is_authenticated_and_demo_does_not_fake_live(client):  # noqa: F811
    client.app.state.ha.states["camera.front"] = {"state": "idle", "attributes": {}}
    assert client.post("/api/home/camera/camera.front/live").status_code == 503
    assert client.post("/api/home/camera/light.living_pendant/live").status_code == 404
    assert (
        client.post("/api/home/camera/camera.front/live", headers={"x-csrf-token": "bad"}).status_code == 403
    )
    assert "media-src" in client.get("/api/home").headers["content-security-policy"]
    client.post("/api/logout")
    assert client.post("/api/home/camera/camera.front/live").status_code == 401
    assert client.get("/api/home/camera-stream/unknown/unknown").status_code == 401
