"""One-time, journaled Z-Wave JS UI keys for a QR-bound production clone."""

import asyncio
import copy
import hashlib
import json
import re
import secrets

import httpx
from fastapi import HTTPException

from .ha import HAError
from .production_mode import save
from .radio_status import controller_status
from .system_operations import Supervisor

CLASSIC = ("S0_Legacy", "S2_Unauthenticated", "S2_Authenticated", "S2_AccessControl")
LONG_RANGE = ("S2_Authenticated", "S2_AccessControl")


def keys(config):
    return {k: config.get(k) for k in ("networkKey", "securityKeys", "securityKeysLongRange")}


def digest(config):
    return hashlib.sha256(json.dumps(keys(config), sort_keys=True).encode()).hexdigest()


class ZWaveKeys:
    def __init__(self, settings, ha, store, setup, supervisor=None, transport=None):
        self.settings, self.ha, self.store, self.setup = settings, ha, store, setup
        self.supervisor = supervisor or Supervisor(settings, timeout=90)
        self.transport = transport
        self.journal = settings.data_dir / "zwave-production-keys.json"

    async def network(self):
        entries = [
            e
            for e in await self.ha.request("config_entries/get", domain="zwave_js")
            if e.get("domain") == "zwave_js" and not e.get("disabled_by")
        ]
        if len(entries) != 1 or entries[0].get("state") != "loaded":
            raise HAError("zwave_keys_unavailable")
        network = await self.ha.request("zwave_js/network_status", entry_id=entries[0]["entry_id"])
        status = controller_status(network)
        if not status["connected"] or status["state"] != "idle":
            raise HAError("zwave_keys_unavailable")
        controller = network.get("controller") or {}
        nodes = controller.get("nodes")
        if not isinstance(nodes, list) or not nodes or not controller.get("home_id"):
            raise HAError("zwave_keys_unavailable")
        if len(nodes) != 1 or nodes[0].get("is_controller_node") is not True:
            raise HAError("zwave_keys_existing_devices")
        return controller["home_id"]

    async def ensure(self, state):
        if not state or not state.get("factory_image"):
            return
        checkpoint = "production_zwave_keys:" + state["id"]
        if self.store.get(checkpoint) == "ready":
            self.journal.unlink(missing_ok=True)
            return
        try:
            async with self.setup.lock:
                if self.setup.session and self.setup.session.get("radio_open"):
                    raise HAError("zwave_keys_unavailable")
                await self.rotate(state["id"], checkpoint)
        except (
            httpx.HTTPError,
            HTTPException,
            OSError,
            ValueError,
            KeyError,
            TypeError,
            AttributeError,
            TimeoutError,
        ):
            # Do not expose responses/settings/security keys to logs or the cloud.
            raise HAError("zwave_keys_unavailable") from None

    async def rotate(self, reset_id, checkpoint):
        home_id = await self.network()
        apps = (await self.supervisor.request("GET", "/addons")).get("addons", [])
        candidates = [a for a in apps if a.get("slug", "").endswith("_zwavejs2mqtt")]
        if len(candidates) != 1:
            raise HAError("zwave_keys_unavailable")
        slug = candidates[0]["slug"]
        if not re.fullmatch(r"[a-z0-9_]+", slug):
            raise HAError("zwave_keys_unavailable")
        info = await self.supervisor.request("GET", f"/addons/{slug}/info")
        # Community app's documented internal listener, never a user-supplied URL.
        host = info.get("hostname", "")
        if host != slug.replace("_", "-") or info.get("state") != "started":
            raise HAError("zwave_keys_unavailable")
        async with httpx.AsyncClient(
            base_url=f"http://{host}:44920",
            timeout=30,
            trust_env=False,
            follow_redirects=False,
            transport=self.transport,
        ) as client:

            async def read():
                response = await client.get("/api/settings")
                response.raise_for_status()
                data = response.json()
                if (
                    not isinstance(data, dict)
                    or data.get("success") is not True
                    or not isinstance(data.get("settings"), dict)
                    or not isinstance(data["settings"].get("zwave"), dict)
                ):
                    raise HAError("zwave_keys_unavailable")
                if any(
                    p.startswith(("zwave.securityKeys", "zwave.networkKey"))
                    for p in data.get("managedExternally", [])
                ):
                    raise HAError("zwave_keys_unavailable")
                return data["settings"]

            config = await read()
            if self.journal.exists():
                journal = json.loads(self.journal.read_text())
                if (
                    journal["reset_id"] != reset_id
                    or journal["home_id"] != home_id
                    or journal["slug"] != slug
                ):
                    raise HAError("zwave_keys_unavailable")
            else:
                journal = {
                    "reset_id": reset_id,
                    "home_id": home_id,
                    "slug": slug,
                    "before": digest(config["zwave"]),
                    "securityKeys": {k: secrets.token_hex(16) for k in CLASSIC},
                    "securityKeysLongRange": {k: secrets.token_hex(16) for k in LONG_RANGE},
                }
                save(self.journal, journal)
            expected = {
                "securityKeys": journal["securityKeys"],
                "securityKeysLongRange": journal["securityKeysLongRange"],
            }
            if digest(config["zwave"]) != digest(expected):
                if digest(config["zwave"]) != journal["before"]:
                    raise HAError("zwave_keys_unavailable")
                changed = copy.deepcopy(config)
                changed["zwave"].pop("networkKey", None)
                changed["zwave"].update(expected)
                # Check again immediately before saving; never remove/exclude nodes.
                if await self.network() != home_id:
                    raise HAError("zwave_keys_unavailable")
                response = await client.post("/api/settings", json=changed)
                response.raise_for_status()
                if response.json().get("success") is not True:
                    raise HAError("zwave_keys_unavailable")
            if digest((await read())["zwave"]) != digest(expected):
                raise HAError("zwave_keys_unavailable")
            # Required for both older auto-restarting and newer save-only UI versions.
            # Retrying an uncertain restart is safe; the same keys are reused.
            await self.supervisor.request("POST", f"/addons/{slug}/restart")
            for attempt in range(30):
                try:
                    if (
                        digest((await read())["zwave"]) == digest(expected)
                        and await self.network() == home_id
                    ):
                        self.store.set(checkpoint, "ready")
                        self.journal.unlink(missing_ok=True)
                        return
                except (httpx.HTTPError, HAError, HTTPException):
                    pass
                if attempt < 29:
                    await asyncio.sleep(2)
            raise HAError("zwave_keys_unavailable")
