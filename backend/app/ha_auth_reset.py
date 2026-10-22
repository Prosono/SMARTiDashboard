"""Offline HA account reset primitive.

Deliberately not wired to the live reset route: the host adapter must enforce
exclusive Core shutdown and network isolation until owner creation is verified.
Only the known storage schemas are accepted. No app/configuration directory is
removed. A partial write leaves a durable marker and must not restart Core.
"""

import copy
import json
import os
import stat
from pathlib import Path

import httpx


class AuthResetError(Exception):
    """Credential-free error suitable for a reset journal."""


VERSIONS = {"auth": 1, "auth_provider.homeassistant": 1, "onboarding": 4, "auth_module.totp": 1}


def reset_documents(documents):
    """Pure transformation; preserve HA's Supervisor/system accounts."""
    if not {"auth", "auth_provider.homeassistant", "onboarding"} <= documents.keys():
        raise AuthResetError("ha_auth_storage_missing")
    result = copy.deepcopy(documents)
    for name, doc in result.items():
        if name not in VERSIONS or not isinstance(doc, dict):
            raise AuthResetError("ha_auth_schema_unsupported")
        if doc.get("key") != name or doc.get("version") != VERSIONS[name] or doc.get("minor_version", 1) != 1:
            raise AuthResetError("ha_auth_schema_unsupported")
        if not isinstance(doc.get("data"), dict):
            raise AuthResetError("ha_auth_schema_unsupported")
    auth = result["auth"]["data"]
    if set(auth) != {"users", "groups", "credentials", "refresh_tokens"}:
        raise AuthResetError("ha_auth_schema_unsupported")
    if any(not isinstance(auth[k], list) for k in auth):
        raise AuthResetError("ha_auth_schema_unsupported")
    users = auth["users"]
    if any(
        not isinstance(u, dict)
        or not isinstance(u.get("id"), str)
        or type(u.get("system_generated")) is not bool
        or type(u.get("is_owner")) is not bool
        for u in users
    ):
        raise AuthResetError("ha_auth_schema_unsupported")
    if len({u["id"] for u in users}) != len(users) or any(
        u["is_owner"] and u["system_generated"] for u in users
    ):
        raise AuthResetError("ha_auth_schema_unsupported")
    keep = {u["id"] for u in users if u["system_generated"]}
    auth["users"] = [u for u in users if u["id"] in keep]
    for key in ("credentials", "refresh_tokens"):
        if any(
            not isinstance(r, dict) or r.get("user_id") not in {u["id"] for u in users} for r in auth[key]
        ):
            raise AuthResetError("ha_auth_schema_unsupported")
        auth[key] = [r for r in auth[key] if r["user_id"] in keep]
    # A system user using a personal password provider is not a supported layout.
    if any(c.get("auth_provider_type") == "homeassistant" for c in auth["credentials"]):
        raise AuthResetError("ha_system_password_account_unsupported")
    provider = result["auth_provider.homeassistant"]["data"]
    if set(provider) != {"users"} or not isinstance(provider["users"], list):
        raise AuthResetError("ha_auth_schema_unsupported")
    provider["users"] = []
    onboarding = result["onboarding"]["data"]
    if set(onboarding) != {"done"} or not isinstance(onboarding["done"], list):
        raise AuthResetError("ha_auth_schema_unsupported")
    if any(s not in {"user", "core_config", "integration", "analytics"} for s in onboarding["done"]):
        raise AuthResetError("ha_auth_schema_unsupported")
    # Reopen only user creation. Keep infrastructure onboarding steps intact.
    onboarding["done"] = [s for s in onboarding["done"] if s != "user"]
    if "auth_module.totp" in result:
        totp = result["auth_module.totp"]["data"]
        if set(totp) != {"users"} or not isinstance(totp["users"], dict):
            raise AuthResetError("ha_auth_schema_unsupported")
        totp["users"] = {k: v for k, v in totp["users"].items() if k in keep}
    return result


def _sync_directory(path):
    fd = os.open(path, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def _write_new(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())


class OfflineAuthReset:
    def __init__(self, storage: Path, journal: Path, assert_stopped_and_isolated):
        self.storage, self.journal = storage, journal
        self.guard = assert_stopped_and_isolated

    async def execute(self):
        # The guard must check actual host state, not a caller-supplied checkbox.
        await self.guard()
        if self.storage.is_symlink() or not self.storage.is_dir():
            raise AuthResetError("ha_storage_unavailable")
        if self.journal.exists():
            raise AuthResetError("ha_auth_reset_requires_recovery")
        names = {
            p.name
            for p in self.storage.iterdir()
            if p.name == "auth"
            or p.name == "onboarding"
            or p.name.startswith(("auth_provider.", "auth_module."))
        }
        documents, original = {}, {}
        for name in names:
            path = self.storage / name
            if not stat.S_ISREG(path.lstat().st_mode) or path.stat().st_size > 16_000_000:
                raise AuthResetError("ha_auth_storage_invalid")
            original[name] = path.read_bytes()
            try:
                documents[name] = json.loads(original[name])
            except (ValueError, UnicodeError):
                raise AuthResetError("ha_auth_storage_invalid") from None
        replacements = reset_documents(documents)  # Validate everything before any write.
        await self.guard()
        self.journal.mkdir(mode=0o700)  # Exclusive, durable interruption marker; contains no credentials.
        _write_new(self.journal / "state", b"writing")
        _sync_directory(self.journal)
        _sync_directory(self.journal.parent)
        try:
            for name, doc in replacements.items():
                await self.guard()
                path = self.storage / name
                if path.is_symlink() or path.read_bytes() != original[name]:
                    raise AuthResetError("ha_auth_storage_changed")
                pending = self.storage / (".smarti-reset-" + name)
                _write_new(pending, json.dumps(doc).encode())
                os.replace(pending, path)
                _sync_directory(self.storage)
            for name, doc in replacements.items():
                if json.loads((self.storage / name).read_bytes()) != doc:
                    raise AuthResetError("ha_auth_reset_unconfirmed")
            _write_new(self.journal / "accounts-cleared", b"awaiting-owner")
            _sync_directory(self.journal)
        except BaseException:
            # Do not roll back revoked credentials or restart HA automatically.
            # The host must retain isolation and surface recovery-required.
            raise
        return {"status": "awaiting_owner", "customer_users": 0}


async def create_first_owner(client: httpx.AsyncClient, *, name, username, password, client_id):
    """Called only inside the host's isolated, owner-authorized setup session.

    No retry of the POST: a lost response may already have created the account.
    Password/auth_code never leave this function through return values or errors.
    """
    try:
        response = await client.get("/api/onboarding")
        response.raise_for_status()
        steps = response.json()
        if not isinstance(steps, list) or not any(
            s.get("step") == "user" and s.get("done") is False for s in steps
        ):
            raise AuthResetError("ha_owner_setup_not_available")
        response = await client.post(
            "/api/onboarding/users",
            json={
                "name": name,
                "username": username.strip().casefold(),
                "password": password,
                "client_id": client_id,
                "language": "nb",
            },
        )
        response.raise_for_status()
        response = await client.get("/api/onboarding")
        response.raise_for_status()
        steps = response.json()
        if not isinstance(steps, list) or not any(
            s.get("step") == "user" and s.get("done") is True for s in steps
        ):
            raise AuthResetError("ha_owner_creation_unconfirmed")
    except (httpx.HTTPError, ValueError, TypeError, AttributeError):
        raise AuthResetError("ha_owner_creation_unconfirmed") from None
    return {"status": "owner_created"}
