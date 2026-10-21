"""Best-effort reset through public HA APIs; never uninstall apps or wipe disks."""

from urllib.parse import quote

import httpx
from fastapi import HTTPException

from .full_reset import FullReset
from .ha import HAError
from .ha_auth_reset import AuthResetError

RESET_BLOCKERS = {
    "full_reset_requires_managed_hub",
    "reset_recovery_required",
    "ha_config_mount_required",
    "invalid_ha_yaml",
    "custom_yaml_requires_review",
    "custom_recorder_or_packages_requires_review",
    "ha_storage_symlink",
    "ha_auth_storage_missing",
    "ha_auth_schema_unsupported",
    "ha_system_password_account_unsupported",
    "standard_ha_http_required",
    "cloud_reset_update_required",
    "reset_app_boot_unavailable",
}


class HomeResetProvider:
    def __init__(self, ha, setup, settings, store):
        self.ha, self.setup, self.settings, self.store = ha, setup, settings, store
        self.full = FullReset(settings, store) if getattr(settings, "ingress", False) else None

    async def preflight(self):
        if self.settings.mode != "live" or not self.ha.connected:
            return {"ready": False, "blockers": ["live_hub_required"]}
        if self.setup.session and self.setup.session.get("radio_open"):
            return {"ready": False, "blockers": ["pairing_active"]}
        if self.full:
            try:
                await self.full.preflight()
            except AuthResetError as exc:
                code = str(exc)
                return {
                    "ready": False,
                    "blockers": [code if code in RESET_BLOCKERS else "full_reset_preflight_failed"],
                    "full": True,
                }
            except HTTPException:
                return {"ready": False, "blockers": ["reset_supervisor_unavailable"], "full": True}
            except httpx.HTTPError:
                return {"ready": False, "blockers": ["reset_cloud_unavailable"], "full": True}
            except (OSError, ValueError):
                return {"ready": False, "blockers": ["reset_storage_unreadable"], "full": True}
        return {
            "full": self.full is not None,
            "ready": True,
            "blockers": [],
            "warnings": ["pairings_may_remain", "manual_cleanup_may_be_required"],
        }

    async def plan(self):
        """Finish read-only inventory before the first destructive operation."""
        ha = self.ha
        if self.full:
            # Reset never invokes radio exclusion or removes paired devices.
            return [
                {
                    "kind": "manual",
                    "id": "pairings",
                    "name": "Enhetsparinger beholdes",
                    "reason": "pairings_not_removed",
                },
                {"kind": "full_reset", "id": "full", "name": "Brukere, oppsett og omstart av huben"},
            ]
        states = list(self.ha.states.items())
        entries = await ha.request("config_entries/get")
        devices = await ha.request("config/device_registry/list")
        people = await ha.request("person/list")
        zones = await ha.request("zone/list")
        areas = await ha.request("config/area_registry/list")
        floors = await ha.request("config/floor_registry/list")
        users = await ha.request("config/auth/list")
        statistics = await ha.request("recorder/list_statistic_ids")
        operations = []

        def add(kind, id, name, **data):
            operations.append({"kind": kind, "id": str(id), "name": str(name)[:160], **data})

        for eid, state in states:
            if eid.startswith(("automation.", "script.")):
                add(
                    "pause",
                    eid,
                    state.get("attributes", {}).get("friendly_name", eid),
                    domain=eid.split(".")[0],
                )
        zigbee = await self.setup.inventory.list("zigbee2mqtt")
        if zigbee["status"] == "ready":
            add("close_zigbee", "zigbee", "Zigbee")
            for d in zigbee["devices"]:
                if not d.get("controller"):
                    add("zigbee", d["id"], d["name"])
        else:
            add("manual", "zigbee", "Zigbee", reason="radio_inventory_unavailable")
        # Never start blind Z-Wave exclusion: a different physically activated
        # node could be removed. Integration removal must affirm the exact device.
        domains = {e["entry_id"]: e["domain"] for e in entries}
        for d in devices:
            ids = d.get("config_entries", []) or ([d["config_entry_id"]] if d.get("config_entry_id") else [])
            for entry in ids:
                if domains.get(entry) == "matter":
                    add("device", d["id"], d.get("name_by_user") or d.get("name") or d["id"], entry=entry)
                elif domains.get(entry) == "zwave_js":
                    add(
                        "manual",
                        d["id"],
                        d.get("name_by_user") or d.get("name") or "Z-Wave",
                        reason="zwave_exclusion_required",
                    )
                elif domains.get(entry) not in {"mqtt", "hassio"}:
                    add(
                        "manual",
                        d["id"],
                        d.get("name_by_user") or d.get("name") or d["id"],
                        reason="integration_cleanup_required",
                    )
        for eid, state in states:
            domain = eid.split(".")[0]
            if domain in {"automation", "scene", "script"}:
                id = state.get("attributes", {}).get("id") if domain != "script" else eid.split(".", 1)[1]
                if id:
                    add("config", id, state.get("attributes", {}).get("friendly_name", eid), domain=domain)
                else:
                    add("manual", eid, eid, reason="yaml_cleanup_required")
        for p in people.get("storage", []):
            add("person", p["id"], p["name"])
        for p in people.get("config", []):
            add("manual", p["id"], p["name"], reason="yaml_cleanup_required")
        for z in zones:
            add("zone", z["id"], z["name"])
        for a in areas:
            add("area", a["area_id"], a["name"])
        for f in floors:
            add("floor", f["floor_id"], f["name"])
        for u in users:
            if u.get("system_generated"):
                continue
            if u.get("is_owner"):
                add("manual", u["id"], "Home Assistant-eier", reason="ha_owner_cleanup_required")
            else:
                add("user", u["id"], u.get("name") or "Home Assistant-bruker")
        if statistics:
            add("statistics", "statistics", "Langtidshistorikk", ids=[s["statistic_id"] for s in statistics])
        add("history", "history", "Historikk")
        # These must not be represented as erased through a registry-only cleanup.
        add(
            "manual",
            "remaining_configuration",
            "Øvrig HA-oppsett og tilganger",
            reason="configuration_review_required",
        )
        add("local", "smarti", "SMARTi-visning og varslingshistorikk")
        return [op for op in operations if op["kind"] not in {"zigbee", "device", "close_zigbee"}]

    async def execute(self, op):
        ha, kind, id = self.ha, op["kind"], op["id"]
        if kind == "full_reset":
            result = await self.full.execute(op.get("report", []))
            self.ha.states.clear()
            return result
        if kind == "manual":
            return "manual", op["reason"]
        if kind == "pause":
            await ha.request(
                "call_service",
                domain=op["domain"],
                service="turn_off",
                service_data={
                    "entity_id": id,
                    **({"stop_actions": True} if op["domain"] == "automation" else {}),
                },
            )
        elif kind == "close_zigbee":
            await self.setup.permit(0)
        elif kind == "zigbee":
            await self.setup.mqtt_command("device/remove", {"id": id, "force": False, "block": False}, 30)
            inventory = await self.setup.inventory.list("zigbee2mqtt")
            if inventory["status"] != "ready" or any(d["id"] == id for d in inventory["devices"]):
                return "unconfirmed", "removal_unconfirmed"
        elif kind == "device":
            await ha.request(
                "config/device_registry/remove_config_entry", device_id=id, config_entry_id=op["entry"]
            )
            if any(d["id"] == id for d in await ha.request("config/device_registry/list")):
                return "unconfirmed", "removal_unconfirmed"
        elif kind == "config":
            await ha.rest("DELETE", "config/" + op["domain"] + "/config/" + quote(id, safe=""))
        elif kind in {"area", "floor"}:
            await ha.request("config/" + kind + "_registry/delete", **{kind + "_id": id})
        elif kind in {"person", "zone"}:
            await ha.request(kind + "/delete", **{kind + "_id": id})
        elif kind == "user":
            await ha.request("config/auth/delete", user_id=id)
        elif kind == "statistics":
            await ha.request("recorder/clear_statistics", statistic_ids=op["ids"])
        elif kind == "history":
            await ha.request(
                "call_service",
                domain="recorder",
                service="purge",
                service_data={"keep_days": 0, "repack": True},
                return_response=False,
            )
            return "unconfirmed", "history_purge_requested"
        elif kind == "local":
            with self.store.connect() as db:
                for table in ["favorites", "dashboards", "notification_inbox"]:
                    db.execute("DELETE FROM " + table)
                db.execute("DELETE FROM settings WHERE key LIKE 'dashboard:%' OR key LIKE 'device_image:%'")
        else:
            raise HAError("unsupported_reset_operation")
        return "done", ""
