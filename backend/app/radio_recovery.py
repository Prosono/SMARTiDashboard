"""Reconnect retained radio apps after an owner-authorized reset; never pair or reset radios."""

import asyncio
import re
from urllib.parse import quote

from fastapi import HTTPException

from .ha import HAError
from .system_operations import Supervisor

PREFIX = "config/config_entries/flow"


class RadioRecovery:
    def __init__(self, settings, ha, store, setup, supervisor=None):
        self.ha, self.store, self.setup = ha, store, setup
        self.supervisor = supervisor or Supervisor(settings)

    async def ensure(self, reset_id):
        key = "reset_radios:" + reset_id
        if self.store.get(key) == "ready":
            return
        apps = (await self.supervisor.request("GET", "/addons")).get("addons", [])
        zigbee = [a for a in apps if a["slug"].endswith("_zigbee2mqtt")]
        zwave = [a for a in apps if a["slug"].endswith("_zwavejs2mqtt")]
        if len(zigbee) != 1 or len(zwave) != 1:
            raise HAError("radio_apps_missing_or_ambiguous")
        entries = await self.ha.request("config_entries/get")
        domains = {e["domain"] for e in entries}
        # Supervisor discovery supplies current broker credentials. Never reuse a deleted user's password.
        if "mqtt" not in domains and not self.setup.frontend:
            flows = await self.ha.request("config_entries/flow/progress")
            candidates = [
                f
                for f in flows
                if f.get("handler") == "mqtt" and f.get("context", {}).get("source") == "hassio"
            ]
            if len(candidates) != 1:
                raise HAError("mqtt_discovery_unavailable")
            path = PREFIX + "/" + quote(candidates[0]["flow_id"], safe="")
            flow = await self.ha.rest("GET", path)
            if flow.get("step_id") != "hassio_confirm" or flow.get("type") != "form":
                raise HAError("mqtt_confirmation_required")
            result = await self.ha.rest("POST", path, {})
            if result.get("type") != "create_entry":
                raise HAError("mqtt_connection_unconfirmed")
        if "zwave_js" not in domains:
            slug = zwave[0]["slug"]
            if not re.fullmatch(r"[a-z0-9_]+", slug):
                raise HAError("invalid_radio_app")
            info = await self.supervisor.request("GET", f"/addons/{slug}/info")
            host = info.get("hostname", "")
            if not re.fullmatch(r"[a-zA-Z0-9-]+", host) or "3000/tcp" not in info.get("network", {}):
                raise HAError("zwave_endpoint_unavailable")
            # Internal app port, independent of whether a LAN port is published.
            flow_key = key + ":flow"
            flow_id = self.store.get(flow_key)
            if flow_id:
                try:
                    flow = await self.ha.rest("GET", PREFIX + "/" + quote(flow_id, safe=""))
                except HTTPException as exc:
                    if exc.status_code == 404:
                        self.store.set(flow_key, "")
                    raise
            else:
                flow = await self.ha.rest(
                    "POST", PREFIX, {"handler": "zwave_js", "show_advanced_options": False}
                )
                if flow.get("flow_id"):
                    self.store.set(flow_key, flow["flow_id"])
            for _ in range(4):
                if flow.get("type") == "create_entry":
                    break
                step = flow.get("step_id")
                if step == "installation_type" and flow.get("type") == "menu":
                    data = {"next_step_id": "intent_custom"}
                elif step == "on_supervisor" and flow.get("type") == "form":
                    data = {"use_addon": False}
                elif step == "manual" and flow.get("type") == "form":
                    data = {"url": f"ws://{host}:3000"}
                else:
                    raise HAError("zwave_confirmation_required")
                flow = await self.ha.rest("POST", PREFIX + "/" + quote(flow["flow_id"], safe=""), data)
                if flow.get("errors"):
                    raise HAError("zwave_connection_unconfirmed")
            if flow.get("type") != "create_entry":
                raise HAError("zwave_connection_unconfirmed")
        # Integration loading and retained MQTT bridge messages arrive asynchronously.
        for attempt in range(15):
            providers = {p["id"]: p for p in await self.setup.providers()}
            if all(providers.get(p, {}).get("status") == "ready" for p in ("zigbee2mqtt", "zwave_js")):
                self.store.set(key, "ready")
                return
            if attempt < 14:
                await asyncio.sleep(2)
        raise HAError("radio_connections_not_ready")
