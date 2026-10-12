# ruff: noqa: F811
import pytest
from app.radio_status import controller_status
from fastapi import HTTPException
from test_setup import setup  # noqa: F401


@pytest.mark.parametrize(
    "raw, expected",
    [
        (0, "idle"),
        (4, "smart_start"),
        ("Idle", "idle"),
        ("SmartStart", "smart_start"),
        (1, "including"),
        (2, "excluding"),
        (3, "busy"),
        (None, "unknown"),
        (True, "unknown"),
        ("unexpected", "unknown"),
    ],
)
def test_controller_schema(raw, expected):
    state = controller_status(
        {"client": {"state": "connected", "ws_server_url": "secret"}, "controller": {"inclusion_state": raw}}
    )
    assert state["state"] == expected
    assert state["ready"] == (expected in ["idle", "smart_start"])
    assert "secret" not in str(state)
    assert not controller_status({"controller": {"inclusion_state": 0}})["ready"]


@pytest.mark.asyncio
async def test_explicit_recovery_without_owned_session(setup):
    setup.ha.controller_state = 1
    try:
        result = await setup.recover_controller("zwave", 1)
        assert result["ready"]
        assert setup.snapshot()["status"] == "stopped"
        assert any(k == "zwave_js/stop_inclusion" for k, _ in setup.ha.calls)
        assert not any(k == "zwave_js/add_node" for k, _ in setup.ha.calls)
        assert (await setup.start("zwave_js", "zwave", 1))["status"] == "searching"
    finally:
        await setup.close()


@pytest.mark.asyncio
async def test_disconnected_unknown_not_misreported_as_busy(setup):
    for network, code in [
        ({}, "controller_disconnected"),
        ({"client": {"state": "connected"}, "controller": {}}, "controller_state_unknown"),
    ]:
        with pytest.raises(HTTPException) as error:
            setup.require_ready(network)
        assert error.value.detail == code
    original = setup.ha.request

    async def request(kind, **data):
        if kind == "zwave_js/network_status":
            return {"client": {"state": "connected"}, "controller": {"inclusion_state": "unexpected"}}
        return await original(kind, **data)

    setup.ha.request = request
    with pytest.raises(HTTPException) as error:
        await setup.recover_controller("zwave", 1)
    assert error.value.detail == "controller_state_unknown"
    assert not any(k.startswith("zwave_js/stop") for k, _ in setup.ha.calls)
