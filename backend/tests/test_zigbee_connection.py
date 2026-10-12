import asyncio
import json
from urllib.parse import parse_qs, urlsplit

import pytest
from app.config import Settings
from app.setup import DeviceSetup
from test_setup import Radio
from websockets.asyncio.server import serve


def test_plain_bridge_status_and_early_device_samples(tmp_path):
    setup = DeviceSetup(Radio(), Settings(_env_file=None, mode="live", data_dir=tmp_path))
    setup.mqtt_event({"topic": "zigbee2mqtt/bridge/state", "payload": "online"})
    assert setup.mqtt_online
    inventory = setup.inventory
    inventory.event(
        {
            "topic": "zigbee2mqtt/room/lamp",
            "payload": '{"linkquality":120,"password":"never-store"}',
            "retain": True,
        }
    )
    inventory.event({"topic": "zigbee2mqtt/room/lamp/availability", "payload": "online"})
    inventory.event(
        {
            "topic": "zigbee2mqtt/bridge/devices",
            "payload": json.dumps([{"ieee_address": "lamp", "friendly_name": "room/lamp"}]),
        }
    )
    assert inventory.telemetry["lamp"]["lqi"] == 120
    assert inventory.telemetry["lamp"]["status"] == "online"
    assert inventory.telemetry["lamp"]["sample_at"] is None
    assert "never-store" not in str(inventory.__dict__)


@pytest.mark.asyncio
async def test_frontend_inventory_pairing_stop_without_ha_mqtt(tmp_path):
    commands = []

    async def server(ws):
        path = urlsplit(ws.request.path)
        assert path.path == "/z2m/api"
        assert parse_qs(path.query) == {"token": ["secret & value"]}
        for topic, payload in [
            ("bridge/state", "online"),
            ("bridge/info", {"version": "test", "permit_join": False, "config": {"password": "private"}}),
            ("lamp", {"linkquality": 101}),
            ("lamp/availability", {"state": "online"}),
            ("bridge/devices", [{"ieee_address": "lamp-id", "friendly_name": "lamp"}]),
        ]:
            await ws.send(json.dumps({"topic": topic, "payload": payload}))
        async for raw in ws:
            request = json.loads(raw)
            commands.append(request)
            response_topic = request["topic"].replace("/request/", "/response/")
            await ws.send(
                json.dumps({"topic": response_topic, "payload": {"transaction": "wrong", "status": "error"}})
            )
            await ws.send(
                json.dumps(
                    {
                        "topic": response_topic,
                        "payload": {"transaction": request["payload"]["transaction"], "status": "ok"},
                    }
                )
            )

    async with serve(server, "127.0.0.1", 0) as srv:
        port = srv.sockets[0].getsockname()[1]
        settings = Settings(
            _env_file=None,
            mode="live",
            data_dir=tmp_path,
            zigbee2mqtt_transport="frontend",
            zigbee2mqtt_server=f"http://127.0.0.1:{port}/z2m/",
            zigbee2mqtt_auth_token="secret & value",
        )
        settings.validate_runtime()
        ha = Radio()
        ha.connected = False
        setup = DeviceSetup(ha, settings)
        try:
            assert (await setup.providers())[0]["status"] == "ready"
            inventory = await setup.inventory.list("zigbee2mqtt")
            assert inventory["status"] == "ready"
            device = inventory["devices"][0]
            assert (device["lqi"], device["status"], device["sample_at"]) == (101, "online", None)
            session = await setup.start("zigbee2mqtt", None, 1)
            assert session["status"] == "searching"
            stopped = await setup.stop(session["id"])
            assert stopped["status"] == "stopped" and not stopped["radio_open"]
            await setup.remove("zigbee2mqtt", "lamp-id", 1)
            assert [c["topic"] for c in commands] == [
                "bridge/request/permit_join",
                "bridge/request/permit_join",
                "bridge/request/device/remove",
            ]
            assert [c["payload"]["time"] for c in commands[:2]] == [120, 0]
            assert not ha.calls
            status = await setup.zigbee_status()
            assert status["online"] and status["devices_received"]
            assert "private" not in str(setup.mqtt_info)
            assert "secret" not in str(status)
        finally:
            await setup.close()


@pytest.mark.asyncio
async def test_frontend_auth_rejection_is_redacted(tmp_path):
    async def server(ws):
        await ws.close(4401, "Unauthorized")

    async with serve(server, "127.0.0.1", 0) as srv:
        setup = DeviceSetup(
            Radio(),
            Settings(
                _env_file=None,
                zigbee2mqtt_transport="frontend",
                zigbee2mqtt_server=f"http://127.0.0.1:{srv.sockets[0].getsockname()[1]}",
                zigbee2mqtt_auth_token="never-return",
                data_dir=tmp_path,
            ),
        )
        try:
            status = await setup.zigbee_status()
            assert status["error"] == "frontend_auth_failed"
            assert "never-return" not in str(status)
        finally:
            await setup.close()


@pytest.mark.parametrize(
    "url",
    [
        "",
        "tcp://192.168.1.2:6638",
        "http://u:p@localhost",
        "http://localhost?token=secret",
        "https://localhost/#x",
    ],
)
def test_frontend_rejects_non_frontend_urls(url):
    with pytest.raises(ValueError):
        Settings(_env_file=None, zigbee2mqtt_transport="frontend", zigbee2mqtt_server=url).validate_runtime()


def test_pending_diagnostics_are_bounded(tmp_path):
    inventory = DeviceSetup(Radio(), Settings(_env_file=None, data_dir=tmp_path)).inventory
    for i in range(600):
        inventory.event({"topic": f"zigbee2mqtt/{i}", "payload": '{"linkquality":10,"password":"private"}'})
    assert len(inventory.pending) == 512
    assert "private" not in str(inventory.pending)


@pytest.mark.asyncio
async def test_disconnect_does_not_replay_start_and_requires_stop(tmp_path):
    connections = 0
    commands = []
    reconnected = asyncio.Event()

    async def server(ws):
        nonlocal connections
        connections += 1
        for topic, payload in [
            ("bridge/state", {"state": "online"}),
            ("bridge/info", {"permit_join": connections > 1}),
            ("bridge/devices", []),
        ]:
            await ws.send(json.dumps({"topic": topic, "payload": payload}))
        if connections > 1:
            reconnected.set()
        async for raw in ws:
            command = json.loads(raw)
            commands.append(command)
            if command["payload"].get("time") == 120:
                await ws.close()
                return
            await ws.send(
                json.dumps(
                    {
                        "topic": "bridge/response/permit_join",
                        "payload": {"status": "ok", "transaction": command["payload"]["transaction"]},
                    }
                )
            )

    async with serve(server, "127.0.0.1", 0) as srv:
        setup = DeviceSetup(
            Radio(),
            Settings(
                _env_file=None,
                zigbee2mqtt_transport="frontend",
                zigbee2mqtt_server=f"http://127.0.0.1:{srv.sockets[0].getsockname()[1]}",
                data_dir=tmp_path,
            ),
        )
        try:
            session = await setup.start("zigbee2mqtt", None, 1)
            assert session["status"] == "needs_stop" and session["radio_open"]
            await asyncio.wait_for(reconnected.wait(), 6)
            await asyncio.sleep(0.05)
            assert len(commands) == 1
            assert setup.snapshot()["status"] == "needs_stop"
            assert (await setup.stop(session["id"]))["status"] == "stopped"
            assert [c["payload"]["time"] for c in commands] == [120, 0]
        finally:
            await setup.close()


@pytest.mark.asyncio
async def test_wrong_transaction_does_not_confirm_command(tmp_path):
    async def server(ws):
        for topic, payload in [
            ("bridge/state", "online"),
            ("bridge/info", {"permit_join": False}),
            ("bridge/devices", []),
        ]:
            await ws.send(json.dumps({"topic": topic, "payload": payload}))
        async for raw in ws:
            await ws.send(
                json.dumps(
                    {
                        "topic": "bridge/response/permit_join",
                        "payload": {"status": "ok", "transaction": "wrong"},
                    }
                )
            )
            request = json.loads(raw)
            await ws.send(
                json.dumps(
                    {
                        "topic": "bridge/response/device/remove",
                        "payload": {"status": "ok", "transaction": request["payload"]["transaction"]},
                    }
                )
            )

    async with serve(server, "127.0.0.1", 0) as srv:
        setup = DeviceSetup(
            Radio(),
            Settings(
                _env_file=None,
                zigbee2mqtt_transport="frontend",
                zigbee2mqtt_server=f"http://127.0.0.1:{srv.sockets[0].getsockname()[1]}",
                data_dir=tmp_path,
            ),
        )
        try:
            await setup.ensure_mqtt()
            with pytest.raises(TimeoutError):
                await setup.mqtt_command("permit_join", {"time": 0}, timeout=0.1)
            assert not setup.responses
        finally:
            await setup.close()
