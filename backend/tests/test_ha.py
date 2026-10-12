import asyncio
import contextlib
import json

import pytest
import websockets
from app.ha import HAError, HomeAssistant


def state(value, timestamp, context=None):
    return {
        "entity_id": "light.test",
        "state": value,
        "last_updated": timestamp,
        "attributes": {"friendly_name": "Test"},
        "context": {"id": context},
    }


async def wait_until(predicate):
    async with asyncio.timeout(8):
        while not predicate():
            await asyncio.sleep(0.01)


@pytest.mark.asyncio
async def test_real_websocket_contract_snapshot_race_reconnect_and_commands():
    connections = []
    subscriptions = []
    calls = []

    async def server(ws):
        connections.append(ws)
        subscriptions.append([])
        connection = len(connections)
        await ws.send(json.dumps({"type": "auth_required"}))
        auth = json.loads(await ws.recv())
        assert auth == {"type": "auth", "access_token": "server-secret"}
        await ws.send(json.dumps({"type": "auth_ok", "ha_version": "contract-fixture"}))
        async for raw in ws:
            msg = json.loads(raw)
            result = None
            if msg["type"] == "subscribe_events":
                subscriptions[-1].append(msg["event_type"])
            elif msg["type"] == "get_states":
                # A newer event arrives while a deliberately older snapshot is in flight.
                await ws.send(
                    json.dumps(
                        {
                            "type": "event",
                            "event": {
                                "event_type": "state_changed",
                                "data": {
                                    "entity_id": "light.test",
                                    "new_state": state("on", f"2026-10-12T00:00:0{connection}+00:00"),
                                },
                            },
                        }
                    )
                )
                result = [state("off", "2026-10-11T00:00:00+00:00")]
            elif msg["type"].endswith("/list"):
                result = []
            elif msg["type"] == "call_service":
                calls.append(msg)
                result = {"context": {"id": "command-context"}}
                await ws.send(
                    json.dumps(
                        {
                            "type": "event",
                            "event": {
                                "event_type": "state_changed",
                                "data": {
                                    "entity_id": "light.test",
                                    "new_state": state("off", "2026-10-13T00:00:00+00:00", "command-context"),
                                },
                            },
                        }
                    )
                )
            await ws.send(json.dumps({"id": msg["id"], "type": "result", "success": True, "result": result}))

    async with websockets.serve(server, "127.0.0.1", 0) as srv:
        port = srv.sockets[0].getsockname()[1]
        ha = HomeAssistant(f"http://127.0.0.1:{port}", "server-secret")
        task = asyncio.create_task(ha.run())
        try:
            await wait_until(lambda: ha.connected)
            assert ha.states["light.test"]["state"] == "on"
            result = await ha.command("light.test", "turn_off")
            assert result["status"] == "state_updated"
            assert not result["physical_execution_verified"]
            assert calls[0]["service"] == "turn_off"
            assert calls[0]["target"] == {"entity_id": "light.test"}
            await connections[0].close()
            await wait_until(lambda: len(connections) == 2 and ha.connected)
            assert len(calls) == 1  # No replay after reconnection.
            assert len(subscriptions[0]) == len(set(subscriptions[0])) == 4
            assert len(subscriptions[1]) == 4
            assert ha.states["light.test"]["state"] == "on"
        finally:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task


@pytest.mark.asyncio
async def test_authentication_rejection_is_explicit():
    async def server(ws):
        await ws.send(json.dumps({"type": "auth_required"}))
        await ws.recv()
        await ws.send(json.dumps({"type": "auth_invalid", "message": "do not leak server text"}))

    async with websockets.serve(server, "127.0.0.1", 0) as srv:
        ha = HomeAssistant(f"http://127.0.0.1:{srv.sockets[0].getsockname()[1]}", "bad")
        task = asyncio.create_task(ha.run())
        try:
            await wait_until(lambda: ha.error == "authentication_rejected")
            assert not ha.connected
            assert ha.states == {}
            with pytest.raises(HAError):
                await ha.command("light.test", "turn_on")
        finally:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task


def test_buffered_removal_does_not_erase_recreated_newer_state():
    ha = HomeAssistant("", "")
    ha.states["light.test"] = state("on", "2026-10-12T11:00:00+00:00")
    ha.apply_state({"entity_id": "light.test", "new_state": None, "event_time": "2026-10-12T10:00:00+00:00"})
    assert ha.states["light.test"]["state"] == "on"
    ha.apply_state({"entity_id": "light.test", "new_state": None, "event_time": "2026-10-12T12:00:00+00:00"})
    assert "light.test" not in ha.states


def test_state_timestamps_compare_instants_not_strings():
    ha = HomeAssistant("", "")
    ha.states["light.test"] = state("on", "2026-10-12T11:00:00+00:00")
    ha.apply_state({"entity_id": "light.test", "new_state": state("off", "2026-10-12T12:00:00+02:00")})
    assert ha.states["light.test"]["state"] == "on"


@pytest.mark.asyncio
async def test_registry_change_during_refresh_is_not_lost():
    ha = HomeAssistant("", "")
    areas_calls = 0

    async def request(kind):
        nonlocal areas_calls
        if kind == "config/area_registry/list":
            areas_calls += 1
            if areas_calls == 1:
                ha.registry_generation += 1
            return [{"area_id": "a", "name": f"Room {areas_calls}"}]
        return []

    ha.request = request
    await ha.registries()
    assert ha.areas["a"]["name"] == "Room 2"
    assert areas_calls == 2


@pytest.mark.asyncio
async def test_failed_registry_refresh_keeps_previous_data():
    ha = HomeAssistant("", "")
    ha.areas = {"a": {"area_id": "a", "name": "Existing"}}

    async def request(kind):
        if kind == "config/device_registry/list":
            raise HAError("ha_request_rejected")
        return []

    ha.request = request
    with pytest.raises(HAError):
        await ha.registries()
    assert ha.areas["a"]["name"] == "Existing"
