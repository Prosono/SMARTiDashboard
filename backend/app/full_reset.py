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
        self.production_allowed = bool(capability.get("production_allowed"))
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

    async def execute(self, report=None, ownership="keep_owner", production=False):
        try:
            return await self._execute(report, ownership, production)
        except BaseException:
            state = self.state()
            if state and state["phase"] not in {"completed", "awaiting_owner", "awaiting_reboot"}:
                state["phase"] = "failed"
                self.save(state)
            raise

    async def _execute(self, report=None, ownership="keep_owner", production=False):
        if ownership not in {"keep_owner", "release_owner"}:
            raise AuthResetError("reset_ownership_invalid")
        info = await self.preflight()
        if ownership == "release_owner" and (await self.cloud("capabilities")).get("version", 0) < 3:
            raise AuthResetError("cloud_reset_update_required")
        if production and (not self.production_allowed or ownership != "release_owner"):
            raise AuthResetError("production_access_required")
        reset_id = str(uuid.uuid4())
        private = x25519.X25519PrivateKey.generate()
        if self.key_path.exists():
            self.key_path.unlink()
        _write_new(self.key_path, private.private_bytes_raw())
        state = {
            "id": reset_id,
            "phase": "preparing",
            "ownership": ownership,
            "production": production,
            "boot": info["boot"],
            "watchdog": info["watchdog"],
            "report": report or [],
            "host_boot_id": self.host_boot_id(),
        }
        self.save(state)
        # Cloud acknowledgement precedes every destructive write;
        # old plans, member access and support/portal sessions for this home expire.
        await self.cloud(
            "begin",
            {
                "id": reset_id,
                "public_key": public_key(private),
                "ownership": ownership,
                **({"production": True} if production else {}),
            },
        )
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
        await self.install_recovery_owner(state)
        state["phase"] = "awaiting_reboot"
        self.save(state)
        await self.cloud("ready", {"id": reset_id, "report": state["report"], "phase": "rebooting"})
        return "done", ""

    async def isolated_owner(self, *, name, username, password, before_create=None):
        """Create an owner while HA is inaccessible from the LAN."""
        if (self.root / "configuration.yaml").read_text() != ISOLATED_CONFIG:
            raise AuthResetError("ha_isolation_config_changed")
        await self.supervisor.request("POST", "/core/start")
        self.stopped = False
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
            if before_create:
                before_create()
            await create_first_owner(
                client, name=name, username=username, password=password, client_id="http://localhost:8123/"
            )

    async def install_recovery_owner(self, state):
        state["phase"] = "creating_recovery_owner"
        self.save(state)
        await self.isolated_owner(name="SMARTi gjenoppretting", username="admin", password="admin123")
        await self.supervisor.request("POST", "/core/stop")
        self.stopped = True
        await self.assert_stopped()
        # Validate the known schema and the exact account created above before
        # exposing HA. Never infer an account by display name alone.
        storage = self.root / ".storage"
        docs = {
            name: json.loads((storage / name).read_text())
            for name in ("auth", "auth_provider.homeassistant", "onboarding")
        }
        reset_documents(docs)
        auth = docs["auth"]["data"]
        humans = [u for u in auth["users"] if not u["system_generated"]]
        if len(humans) != 1 or not humans[0]["is_owner"]:
            raise AuthResetError("ha_recovery_owner_unconfirmed")
        owner = humans[0]
        credentials = [c for c in auth["credentials"] if c["user_id"] == owner["id"]]
        if (
            len(credentials) != 1
            or credentials[0].get("auth_provider_type") != "homeassistant"
            or credentials[0].get("data") != {"username": "admin"}
        ):
            raise AuthResetError("ha_recovery_owner_unconfirmed")
        owner["local_only"] = True
        # Revoke even the onboarding token before starting recovery access.
        auth["refresh_tokens"] = [t for t in auth["refresh_tokens"] if t["user_id"] != owner["id"]]
        self.replace(storage / "auth", json.dumps(docs["auth"]))
        state["recovery_user"] = owner["id"]
        self.save(state)
        self.replace(self.root / "configuration.yaml", NORMAL_CONFIG)
        await self.supervisor.request("POST", "/core/options", {"boot": True, "watchdog": False})
        await self.supervisor.request("POST", "/core/start")
        self.stopped = False

    async def remove_recovery_owner(self, state):
        # Stop HA and revoke ALL recovery sessions before the real owner is
        # created. A failed removal must never enable normal onboarding/access.
        await self.supervisor.request("POST", "/core/options", {"boot": False, "watchdog": False})
        await self.supervisor.request("POST", "/core/stop")
        self.stopped = True
        await self.assert_stopped()
        self.replace(self.root / "configuration.yaml", ISOLATED_CONFIG)
        journal = self.settings.data_dir / ("recovery-" + state["id"])
        if (journal / "accounts-cleared").exists():
            # A crash after the durable removal but before save is safe to resume
            # only when no human account/credential has reappeared.
            storage = self.root / ".storage"
            docs = {
                p.name: json.loads(p.read_text())
                for p in storage.iterdir()
                if p.name in {"auth", "onboarding"} or p.name.startswith(("auth_provider.", "auth_module."))
            }
            if reset_documents(docs) != docs:
                raise AuthResetError("ha_recovery_removal_unconfirmed")
        else:
            await OfflineAuthReset(self.root / ".storage", journal, self.assert_stopped).execute()
        state.pop("recovery_user", None)
        self.save(state)

    async def bootstrap(self, plan):
        state = self.state()
        if not state or state["phase"] == "completed":
            return
        # Older startup code marked an interrupted owner POST as failed. The
        # durable recovery-removal marker proves this had reached onboarding,
        # rather than failing partway through erasing the home.
        interrupted_owner = (
            state["phase"] == "failed"
            and not state.get("recovery_user")
            and (self.settings.data_dir / ("recovery-" + state["id"]) / "accounts-cleared").is_file()
        )
        if (
            state["phase"] not in {"awaiting_owner", "creating_owner", "owner_created"}
            and not interrupted_owner
        ):
            raise AuthResetError("reset_requires_recovery")
        if plan.get("reset_id") != state["id"] or not plan.get("ha_credentials"):
            raise AuthResetError("reset_plan_mismatch")
        private = x25519.X25519PrivateKey.from_private_bytes(self.key_path.read_bytes())
        credentials = unseal(private, state["id"], plan["ha_credentials"])
        if credentials["username"] != plan["username"]:
            raise AuthResetError("reset_plan_mismatch")
        if state["phase"] == "creating_owner" or interrupted_owner:
            # A failed response is ambiguous. Resume only after stopping Core and
            # proving that no human account, password or completed user step exists.
            if (self.root / "configuration.yaml").read_text() != ISOLATED_CONFIG:
                raise AuthResetError("ha_owner_creation_requires_recovery")
            await self.supervisor.request("POST", "/core/options", {"boot": False, "watchdog": False})
            await self.supervisor.request("POST", "/core/stop")
            self.stopped = True
            await self.assert_stopped()
            storage = self.root / ".storage"
            if storage.is_symlink():
                raise AuthResetError("ha_storage_symlink")
            docs = {}
            for path in storage.iterdir():
                if path.name in {"auth", "onboarding"} or path.name.startswith(
                    ("auth_provider.", "auth_module.")
                ):
                    if path.is_symlink() or not path.is_file():
                        raise AuthResetError("ha_auth_storage_invalid")
                    docs[path.name] = json.loads(path.read_text())
            if reset_documents(docs) != docs:
                raise AuthResetError("ha_owner_creation_requires_recovery")
            state["phase"] = "awaiting_owner"
            self.save(state)
        if state["phase"] == "awaiting_owner":
            if state.get("recovery_user"):
                await self.remove_recovery_owner(state)

            def creating_owner():
                state["phase"] = "creating_owner"
                self.save(state)

            await self.isolated_owner(
                name=plan.get("profile", {}).get("full_name", plan["username"]),
                username=credentials["username"],
                password=credentials["password"],
                before_create=creating_owner,
            )
            state["phase"] = "owner_created"
            self.save(state)
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
