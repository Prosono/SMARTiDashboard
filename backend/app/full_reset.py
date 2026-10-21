"""HAOS reset coordinator. Installed apps and immutable hub identity stay intact."""

import asyncio
import json
import os
import shutil
import uuid
from pathlib import Path

import httpx
import yaml
from cryptography.hazmat.primitives.asymmetric import x25519
from fastapi import HTTPException

from .certificate_hook import read_identity
from .ha_auth_reset import (
    AuthResetError,
    OfflineAuthReset,
    _sync_directory,
    _write_new,
    create_first_owner,
    reset_documents,
)
from .remote_access import CLOUD_ORIGIN
from .reset_credentials import public_key, unseal
from .system_operations import Supervisor

NORMAL_CONFIG = "default_config:\nautomation: !include automations.yaml\nscript: !include scripts.yaml\nscene: !include scenes.yaml\n"
ISOLATED_CONFIG = NORMAL_CONFIG + "http:\n  server_host: [127.0.0.1, 172.30.32.1]\n  server_port: 8123\n"


class FullReset:
    def __init__(
        self, settings, store, root=Path("/homeassistant"), supervisor=None, transport=None, ha_transport=None
    ):
        self.settings, self.store, self.root = settings, store, root
        self.supervisor = supervisor or Supervisor(settings, timeout=180)
        self.transport = transport
        self.ha_transport = ha_transport
        self.state_path = settings.data_dir / "factory-reset-state.json"
        self.key_path = settings.data_dir / "factory-reset-key"
        self.stopped = False

    def state(self):
        return json.loads(self.state_path.read_text()) if self.state_path.exists() else None

    def save(self, state):
        temp = self.state_path.with_suffix(".pending")
        if temp.exists():
            temp.unlink()
        _write_new(temp, json.dumps(state).encode())
        os.replace(temp, self.state_path)
        _sync_directory(self.state_path.parent)

    async def cloud(self, action, body=None):
        home, credential = read_identity(self.settings.remote_identity_file)
        async with httpx.AsyncClient(timeout=20, trust_env=False, transport=self.transport) as client:
            response = await client.request(
                "GET" if body is None else "POST",
                f"{CLOUD_ORIGIN}/api/hubs/{home}/factory-reset/{action}",
                headers={"Authorization": "Bearer " + credential},
                json=body,
            )
            response.raise_for_status()
            return response.json()

    async def preflight(self):
        if not self.settings.ingress or not self.settings.remote_identity_file or not self.root.is_dir():
            raise AuthResetError("full_reset_requires_managed_hub")
        if self.state() and self.state()["phase"] != "completed":
            raise AuthResetError("reset_recovery_required")
        if self.root.is_symlink() or not os.access(self.root, os.W_OK):
            raise AuthResetError("ha_config_mount_required")
        self.inspect_configuration()
        storage = self.root / ".storage"
        if storage.is_symlink():
            raise AuthResetError("ha_storage_symlink")
        docs = {}
        for p in storage.iterdir():
            if p.is_symlink():
                raise AuthResetError("ha_storage_symlink")
            if p.name in {"auth", "onboarding"} or p.name.startswith(("auth_provider.", "auth_module.")):
                docs[p.name] = json.loads(p.read_text())
        reset_documents(docs)
        info = await self.supervisor.request("GET", "/core/info")
        if info.get("port") != 8123 or info.get("ssl") or info.get("ip_address") != "172.30.32.1":
            raise AuthResetError("standard_ha_http_required")
        capability = await self.cloud("capabilities")
        if capability.get("version", 0) < 2:
            raise AuthResetError("cloud_reset_update_required")
        # Ensure SMARTi can resume without Core after an OS reboot.
        own = await self.supervisor.request("GET", "/addons/self/info")
        if own.get("boot") not in {"auto", "manual"}:
            raise AuthResetError("reset_app_boot_unavailable")
        self.host_boot_id()
        return info

    def inspect_configuration(self):
        """Inspect local YAML includes before permitting a destructive reset."""
        root = self.root.resolve()
        seen_files = set()
        active_nodes = set()

        def checked_path(base, value):
            path = base / value
            if path.is_absolute() and not path.is_relative_to(root):
                raise AuthResetError("custom_yaml_requires_review")
            if ".." in path.parts or any(
                p.is_symlink() for p in [path, *path.parents] if p.is_relative_to(root)
            ):
                raise AuthResetError("custom_yaml_requires_review")
            if not path.resolve().is_relative_to(root):
                raise AuthResetError("custom_yaml_requires_review")
            return path

        def read(path, depth):
            if depth > 32 or path in seen_files or len(seen_files) >= 128:
                raise AuthResetError("custom_yaml_requires_review")
            seen_files.add(path)
            if path.stat().st_size > 2_000_000:
                raise AuthResetError("custom_yaml_requires_review")
            try:
                node = yaml.compose(path.read_text())
            except yaml.YAMLError as exc:
                raise AuthResetError("invalid_ha_yaml") from exc
            inspect(node, path.parent, depth)

        def inspect(node, base, depth):
            if node is None:
                return
            if depth > 64 or id(node) in active_nodes:
                raise AuthResetError("custom_yaml_requires_review")
            active_nodes.add(id(node))
            try:
                if node.tag.startswith("!include"):
                    if not isinstance(node, yaml.ScalarNode):
                        raise AuthResetError("custom_yaml_requires_review")
                    target = checked_path(base, node.value)
                    if node.tag == "!include":
                        read(target, depth + 1)
                    elif node.tag in {
                        "!include_dir_named",
                        "!include_dir_merge_named",
                        "!include_dir_list",
                        "!include_dir_merge_list",
                    }:
                        if not target.is_dir():
                            raise AuthResetError("custom_yaml_requires_review")
                        for item in sorted(target.rglob("*")):
                            if item.is_symlink():
                                raise AuthResetError("custom_yaml_requires_review")
                            if item.is_file() and item.suffix in {".yaml", ".yml"}:
                                read(item, depth + 1)
                    else:
                        raise AuthResetError("custom_yaml_requires_review")
                elif isinstance(node, yaml.MappingNode):
                    for key, value in node.value:
                        if not isinstance(key, yaml.ScalarNode):
                            raise AuthResetError("custom_yaml_requires_review")
                        if key.value == "recorder":
                            raise AuthResetError("custom_recorder_or_packages_requires_review")
                        inspect(value, base, depth + 1)
                elif isinstance(node, yaml.SequenceNode):
                    for value in node.value:
                        inspect(value, base, depth + 1)
            finally:
                active_nodes.remove(id(node))

        read(checked_path(root, "configuration.yaml"), 0)

    def host_boot_id(self):
        return Path("/proc/sys/kernel/random/boot_id").read_text().strip()

    async def resume_reboot(self):
        state = self.state()
        if not state or state["phase"] != "awaiting_reboot":
            return
        if self.host_boot_id() != state["host_boot_id"]:
            state["phase"] = "awaiting_owner"
            self.save(state)
            await self.cloud("ready", {"id": state["id"], "report": state["report"]})
            return
        with self.store.connect() as db:
            if (
                db.execute("SELECT 1 FROM sqlite_master WHERE name='factory_resets'").fetchone()
                and db.execute("SELECT 1 FROM factory_resets WHERE status='running'").fetchone()
            ):
                return
        if state.get("reboot_requested"):
            return  # An uncertain reboot request must never create a reboot loop.
        await self.cloud("ready", {"id": state["id"], "report": state["report"], "phase": "rebooting"})
        state["reboot_requested"] = True
        self.save(state)
        try:
            await self.supervisor.request("POST", "/host/reboot")
        except (HTTPException, httpx.HTTPError, TimeoutError):
            state["reboot_unconfirmed"] = True
            self.save(state)

    async def assert_stopped(self):
        if not self.stopped:
            raise AuthResetError("ha_stop_unconfirmed")
        info = await self.supervisor.request("GET", "/core/info")
        if info.get("boot") or info.get("watchdog"):
            raise AuthResetError("ha_restart_not_inhibited")
        # A completed Supervisor stop is authoritative. Also detect an unexpected
        # restart before every write; a transport timeout is not proof of shutdown.
        try:
            reader, writer = await asyncio.wait_for(asyncio.open_connection("127.0.0.1", 8123), 2)
        except ConnectionRefusedError:
            return
        writer.close()
        await writer.wait_closed()
        raise AuthResetError("ha_still_running")

    def replace(self, path, content):
        if path.is_symlink():
            raise AuthResetError("ha_storage_symlink")
        pending = path.with_name(".smarti-" + path.name)
        if pending.exists():
            pending.unlink()
        _write_new(pending, content.encode())
        os.replace(pending, path)
        _sync_directory(path.parent)

    async def execute(self, report=None, ownership="keep_owner"):
        try:
            return await self._execute(report, ownership)
        except BaseException:
            state = self.state()
            if state and state["phase"] not in {"completed", "awaiting_owner", "awaiting_reboot"}:
                state["phase"] = "failed"
                self.save(state)
            raise

    async def _execute(self, report=None, ownership="keep_owner"):
        if ownership not in {"keep_owner", "release_owner"}:
            raise AuthResetError("reset_ownership_invalid")
        info = await self.preflight()
        if ownership == "release_owner" and (await self.cloud("capabilities")).get("version", 0) < 3:
            raise AuthResetError("cloud_reset_update_required")
        reset_id = str(uuid.uuid4())
        private = x25519.X25519PrivateKey.generate()
        if self.key_path.exists():
            self.key_path.unlink()
        _write_new(self.key_path, private.private_bytes_raw())
        state = {
            "id": reset_id,
            "phase": "preparing",
            "ownership": ownership,
            "boot": info["boot"],
            "watchdog": info["watchdog"],
            "report": report or [],
            "host_boot_id": self.host_boot_id(),
        }
        self.save(state)
        # Cloud acknowledgement precedes every destructive write;
        # old plans, member access and support/portal sessions for this home expire.
        await self.cloud("begin", {"id": reset_id, "public_key": public_key(private), "ownership": ownership})
        await self.supervisor.request("POST", "/addons/self/options", {"boot": "auto"})
        own = await self.supervisor.request("GET", "/addons/self/info")
        if own.get("boot") != "auto":
            raise AuthResetError("reset_app_boot_unavailable")
        await self.supervisor.request("POST", "/core/options", {"boot": False, "watchdog": False})
        await self.supervisor.request("POST", "/core/stop")
        self.stopped = True
        await self.assert_stopped()
        self.replace(self.root / "configuration.yaml", ISOLATED_CONFIG)
        state["phase"] = "erasing"
        self.save(state)
        await OfflineAuthReset(
            self.root / ".storage", self.settings.data_dir / ("reset-" + reset_id), self.assert_stopped
        ).execute()
        await self.assert_stopped()
        # Keep HA's system auth, UUID and onboarding metadata only. Installed addons
        # live outside /homeassistant. Custom integration software is not uninstalled.
        keep = {"auth", "auth_provider.homeassistant", "auth_module.totp", "onboarding", "core.uuid"}
        for p in (self.root / ".storage").iterdir():
            if p.name not in keep:
                if p.is_symlink():
                    raise AuthResetError("ha_storage_symlink")
                if p.is_dir():
                    shutil.rmtree(p)
                else:
                    p.unlink()
        # Remove customer files as well as the recorder database; retain only
        # installed integration/blueprint software and the reset auth metadata.
        for p in self.root.iterdir():
            if p.name in {
                ".storage",
                "custom_components",
                "blueprints",
                "zigbee2mqtt",
                "zwave_js",
                "zwavejs2mqtt",
            }:
                continue
            if p.is_symlink() or p.is_file():
                p.unlink()
            elif p.is_dir():
                shutil.rmtree(p)
            else:
                raise AuthResetError("ha_config_file_unsupported")
        for name, content in [
            ("configuration.yaml", ISOLATED_CONFIG),
            ("automations.yaml", "[]\n"),
            ("scripts.yaml", "{}\n"),
            ("scenes.yaml", "[]\n"),
            ("secrets.yaml", "{}\n"),
        ]:
            self.replace(self.root / name, content)
        _sync_directory(self.root / ".storage")
        _sync_directory(self.root)
        with self.store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            for table in (
                "sessions",
                "favorites",
                "dashboards",
                "notification_inbox",
                "mobile_access",
                "mobile_refresh",
                "mobile_pairings",
                "mobile_devices",
                "mobile_audit",
                "attempts",
                "users",
                "settings",
            ):
                db.execute("DELETE FROM " + table)
        state["phase"] = "awaiting_reboot"
        self.save(state)
        await self.cloud("ready", {"id": reset_id, "report": state["report"], "phase": "rebooting"})
        return "done", ""

    async def bootstrap(self, plan):
        state = self.state()
        if not state or state["phase"] == "completed":
            return
        if state["phase"] not in {"awaiting_owner", "creating_owner", "owner_created"}:
            raise AuthResetError("reset_requires_recovery")
        if plan.get("reset_id") != state["id"] or not plan.get("ha_credentials"):
            raise AuthResetError("reset_plan_mismatch")
        private = x25519.X25519PrivateKey.from_private_bytes(self.key_path.read_bytes())
        credentials = unseal(private, state["id"], plan["ha_credentials"])
        if credentials["username"] != plan["username"]:
            raise AuthResetError("reset_plan_mismatch")
        if state["phase"] == "awaiting_owner":
            # Bind only loopback and the private Supervisor bridge, never LAN.
            # The bridge allows Supervisor health checks during startup.
            if (self.root / "configuration.yaml").read_text() != ISOLATED_CONFIG:
                raise AuthResetError("ha_isolation_config_changed")
            await self.supervisor.request("POST", "/core/start")
            async with httpx.AsyncClient(
                base_url="http://127.0.0.1:8123", timeout=15, trust_env=False, transport=self.ha_transport
            ) as client:
                async with asyncio.timeout(120):
                    while True:
                        try:
                            response = await client.get("/api/onboarding")
                            if response.status_code == 200:
                                break
                        except httpx.HTTPError:
                            pass
                        await asyncio.sleep(2)
                state["phase"] = "creating_owner"
                self.save(state)
                await create_first_owner(
                    client,
                    name=plan.get("profile", {}).get("full_name", plan["username"]),
                    username=credentials["username"],
                    password=credentials["password"],
                    client_id="http://localhost:8123/",
                )
            state["phase"] = "owner_created"
            self.save(state)
        elif state["phase"] == "creating_owner":
            # Never replay an uncertain user-creation POST.
            raise AuthResetError("ha_owner_creation_requires_recovery")
        await self.supervisor.request("POST", "/core/stop")
        self.stopped = True
        await self.assert_stopped()
        self.replace(self.root / "configuration.yaml", NORMAL_CONFIG)
        await self.supervisor.request("POST", "/core/start")
        await self.supervisor.request(
            "POST", "/core/options", {"boot": state["boot"], "watchdog": state["watchdog"]}
        )
        state["phase"] = "completed"
        self.save(state)
        self.key_path.unlink(missing_ok=True)
