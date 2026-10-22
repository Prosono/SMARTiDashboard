"""One-time, journaled Z-Wave JS UI keys for a QR-bound production clone."""

import asyncio
import copy
import hashlib
import json
import logging
import re
import secrets

import httpx
from fastapi import HTTPException

from .ha import HAError
from .production_mode import save
from .radio_status import controller_status
from .system_operations import Supervisor

log = logging.getLogger(__name__)

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
        # RESTORE WIPE explicitly authorizes replacing keys even when old nodes remain.
        # Keep the controller/network intact; old secure nodes may need manual re-pairing.
        return controller["home_id"]

    async def ensure(self, state):
        if not state or not state.get("factory_image"):
            return
        checkpoint = "production_zwave_keys:" + state["id"]
        if self.store.get(checkpoint) == "ready":
            self.journal.unlink(missing_ok=True)
            return
        self.diagnostic_stage = "controller_status"
        try:
            async with self.setup.lock:
                if self.setup.session and self.setup.session.get("radio_open"):
                    raise HAError("zwave_keys_unavailable")
                await self.rotate(state["id"], checkpoint)
        except HAError:
            log.warning(
                "Z-Wave key setup failed at %s (controller or settings validation)", self.diagnostic_stage
            )
            raise
        except (
            httpx.HTTPError,
            HTTPException,
            OSError,
            ValueError,
            KeyError,
            TypeError,
            AttributeError,
            TimeoutError,
        ) as exc:
            log.warning("Z-Wave key setup failed at %s (%s)", self.diagnostic_stage, type(exc).__name__)
            # Do not expose responses/settings/security keys to logs or the cloud.
            raise HAError("zwave_keys_unavailable") from None

    async def rotate(self, reset_id, checkpoint):
        home_id = await self.network()
        self.diagnostic_stage = "app_discovery"
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
        self.diagnostic_stage = "settings_read"
        async with httpx.AsyncClient(
            base_url=f"http://{host}:44920",
            headers={"Accept": "application/json"},
            timeout=30,
            trust_env=False,
            follow_redirects=False,
            transport=self.transport,
        ) as client:

            async def read():
                response = await client.get("/api/settings/")
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
            self.diagnostic_stage = "journal_validation"
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
                self.diagnostic_stage = "settings_write"
                response = await client.post("/api/settings/", json=changed)
                response.raise_for_status()
                if response.json().get("success") is not True:
                    raise HAError("zwave_keys_unavailable")
            self.diagnostic_stage = "settings_verify"
            if digest((await read())["zwave"]) != digest(expected):
                raise HAError("zwave_keys_unavailable")
            # Required for both older auto-restarting and newer save-only UI versions.
            # Retrying an uncertain restart is safe; the same keys are reused.
            self.diagnostic_stage = "app_restart"
            await self.supervisor.request("POST", f"/addons/{slug}/restart")
            self.diagnostic_stage = "controller_reconnect"
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
