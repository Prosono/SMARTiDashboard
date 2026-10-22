import asyncio
import copy
import json
from types import SimpleNamespace

import httpx
import pytest

from app.ha import HAError
from app.zwave_keys import CLASSIC, LONG_RANGE, ZWaveKeys


class HA:
    paired = False

    async def request(self, command, **kwargs):
        if command == "config_entries/get":
            return [{"domain": "zwave_js", "entry_id": "zw", "state": "loaded"}]
        return {
            "client": {"state": "connected"},
            "controller": {
                "home_id": 123,
                "inclusion_state": 0,
                "nodes": [{"is_controller_node": True}] + ([{"node_id": 2}] if self.paired else []),
            },
        }


class Supervisor:
    def __init__(self):
        self.restarts = 0

    async def request(self, method, path):
        if path == "/addons":
            return {"addons": [{"slug": "a0d7b954_zwavejs2mqtt"}]}
        if path.endswith("/info"):
            return {"hostname": "a0d7b954-zwavejs2mqtt", "state": "started"}
        assert path.endswith("/restart")
        self.restarts += 1
        return {}


@pytest.fixture
def rig(tmp_path):
    config = {"zwave": {"port": "/dev/serial/test", "networkKey": "old"}, "mqtt": {"disabled": True}}
    state = {"factory_image": True, "id": "clone-1"}
    store = {}
    r = SimpleNamespace(
        config=config, posts=0, timeout=False, denied=False, managed=[], state=state, store=store
    )

    def handler(request):
        assert request.headers["accept"] == "application/json"
        # The UI redirects requests without the canonical trailing slash.
        # Never follow arbitrary redirects while sending security keys.
        if request.url.path == "/api/settings":
            return httpx.Response(301, headers={"Location": "/api/settings/"})
        assert request.url.path == "/api/settings/"
        if r.denied:
            return httpx.Response(401)
        if request.method == "POST":
            r.posts += 1
            r.config = json.loads(request.content)
            if r.timeout:
                r.timeout = False
                raise httpx.ReadTimeout("uncertain write")
            return httpx.Response(200, json={"success": True})
        return httpx.Response(
            200, json={"success": True, "settings": r.config, "managedExternally": r.managed}
        )

    r.ha, r.supervisor = HA(), Supervisor()
    r.worker = ZWaveKeys(
        SimpleNamespace(data_dir=tmp_path),
        r.ha,
        SimpleNamespace(get=store.get, set=store.__setitem__),
        SimpleNamespace(lock=asyncio.Lock(), session=None),
        supervisor=r.supervisor,
        transport=httpx.MockTransport(handler),
    )
    return r


@pytest.mark.asyncio
async def test_rotate_once_preserves_settings(rig):
    r = rig
    await r.worker.ensure(r.state)
    assert r.config["mqtt"] == {"disabled": True}
    assert r.config["zwave"]["port"] == "/dev/serial/test"
    assert "networkKey" not in r.config["zwave"]
    z = r.config["zwave"]
    assert set(z["securityKeys"]) == set(CLASSIC)
    assert set(z["securityKeysLongRange"]) == set(LONG_RANGE)
    values = list(z["securityKeys"].values()) + list(z["securityKeysLongRange"].values())
    assert len(set(values)) == 6
    assert all(len(bytes.fromhex(v)) == 16 for v in values)
    assert r.supervisor.restarts == 1
    assert not r.worker.journal.exists()
    r.ha.paired = True
    await r.worker.ensure(r.state)
    assert r.posts == 1
    assert r.supervisor.restarts == 1


@pytest.mark.asyncio
async def test_uncertain_save_reuses_keys(rig):
    r = rig
    r.timeout = True
    with pytest.raises(HAError, match="zwave_keys_unavailable"):
        await r.worker.ensure(r.state)
    saved = copy.deepcopy(r.config)
    assert r.worker.journal.stat().st_mode & 0o777 == 0o600
    assert not r.store
    await r.worker.ensure(r.state)
    assert r.config == saved
    assert r.posts == 1
    assert r.supervisor.restarts == 1


@pytest.mark.asyncio
async def test_paired_controller_rotates_and_completes_without_removing_nodes(rig):
    rig.ha.paired = True
    await rig.worker.ensure(rig.state)
    assert rig.posts == 1
    assert rig.supervisor.restarts == 1
    assert rig.store["production_zwave_keys:clone-1"] == "ready"
    assert rig.ha.paired is True
    assert "networkKey" not in rig.config["zwave"]
    assert len(rig.config["zwave"]["securityKeys"]) == 4
    assert not rig.worker.journal.exists()
    await rig.worker.ensure(rig.state)
    assert rig.posts == 1


@pytest.mark.asyncio
async def test_normal_reset_does_not_rotate(rig):
    await rig.worker.ensure({"id": "ordinary-reset"})
    assert rig.posts == 0
    assert not rig.store


@pytest.mark.asyncio
@pytest.mark.parametrize("block", ["denied", "managed"])
async def test_unavailable_settings_fail_closed(rig, block):
    if block == "denied":
        rig.denied = True
    else:
        rig.managed = ["zwave.securityKeys.S0_Legacy"]
    with pytest.raises(HAError, match="zwave_keys_unavailable"):
        await rig.worker.ensure(rig.state)
    assert rig.posts == 0
    assert not rig.store


@pytest.mark.asyncio
async def test_next_production_cycle_gets_different_keys(rig):
    await rig.worker.ensure(rig.state)
    previous = copy.deepcopy(rig.config["zwave"]["securityKeys"])
    await rig.worker.ensure({"factory_image": True, "id": "clone-2"})
    assert all(value != previous[key] for key, value in rig.config["zwave"]["securityKeys"].items())
    assert rig.posts == 2


@pytest.mark.asyncio
async def test_uncertain_save_does_not_overwrite_external_key_change(rig):
    rig.timeout = True
    with pytest.raises(HAError):
        await rig.worker.ensure(rig.state)
    rig.config["zwave"]["securityKeys"]["S0_Legacy"] = "ab" * 16
    with pytest.raises(HAError, match="zwave_keys_unavailable"):
        await rig.worker.ensure(rig.state)
    assert rig.posts == 1
    assert not rig.store
