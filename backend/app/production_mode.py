"""Opt-in production onboarding, armed only by a centrally authorized full reset."""

import hashlib
import json
import os
import shutil
import sqlite3
import uuid
from pathlib import Path

import httpx

from .certificate_hook import read_identity
from .factory_image import enrollment_bootstrap, initialize, physical_addresses
from .ha_auth_reset import _sync_directory, _write_new
from .remote_access import CLOUD_ORIGIN
from .remote_options import configure_remote_identity


def save(path, value):
    temp = path.with_suffix(".pending")
    temp.unlink(missing_ok=True)
    _write_new(temp, json.dumps(value).encode())
    os.replace(temp, path)
    _sync_directory(path.parent)


def start(data, *, addresses=None, boot_id=None, transport=None, supervisor_token=None):
    marker = data / "production-onboarding.json"
    reset_file = data / "factory-reset-state.json"
    if not marker.exists():
        if not reset_file.exists():
            return
        state = json.loads(reset_file.read_text())
        if not state.get("production") or state["phase"] != "awaiting_reboot":
            return
        boot_id = boot_id or Path("/proc/sys/kernel/random/boot_id").read_text().strip()
        if boot_id == state["host_boot_id"]:
            return  # The existing reset coordinator still needs to reboot the host.
        if state["ownership"] != "release_owner" or not state.get("recovery_user"):
            raise RuntimeError("Produksjonsreset er ikke fullført.")
        home, credential = read_identity(data / "remote-identity.json")
        with httpx.Client(timeout=30, trust_env=False, transport=transport) as client:
            # Ownership must be released before discarding the only hub credential.
            result = client.post(
                CLOUD_ORIGIN + f"/api/hubs/{home}/factory-reset/ready",
                headers={"Authorization": "Bearer " + credential},
                json={"id": state["id"], "report": state.get("report", []), "phase": "awaiting_owner"},
            )
            result.raise_for_status()
            options = json.loads((data / "options.json").read_text())
            for key in ("remote_installation_id", "remote_credential", "bootstrap_secret"):
                options[key] = ""
            token = supervisor_token or os.environ.get("SUPERVISOR_TOKEN", "")
            if not token:
                raise RuntimeError("Supervisor-tilgang kreves for produksjonsreset.")
            result = client.post(
                "http://supervisor/addons/self/options",
                headers={"Authorization": "Bearer " + token},
                json={"options": options},
            )
            result.raise_for_status()
            if result.json().get("result") != "ok":
                raise RuntimeError("Supervisor kunne ikke fjerne tilkoblingsinnstillingene.")
            save(data / "options.json", options)
        save(marker, {"version": 1, "stage": "clearing", "recovery_user": state["recovery_user"]})
    mode = json.loads(marker.read_text())
    if mode.get("version") != 1 or mode.get("stage") not in {"clearing", "waiting"}:
        raise RuntimeError("Ukjent produksjonsmodus.")
    addresses = physical_addresses() if addresses is None else addresses
    if not addresses:
        raise RuntimeError("Kan ikke bekrefte fysisk nettverkskort for produksjonsmodus.")
    hardware = hashlib.sha256("|".join(sorted(addresses)).encode()).hexdigest()
    if mode["stage"] == "waiting":
        if (data / "remote-identity.json").exists():
            if mode["hardware"] != hardware:
                raise RuntimeError("Kopien er allerede QR-koblet. Bruk et ukoblet master-image.")
            marker.unlink()  # Durable identity is authoritative, including a crash during bind.
            _sync_directory(data)
            return
        database = data / "smarti-live.sqlite3"
        if database.exists():
            with sqlite3.connect(database.as_uri() + "?mode=ro", uri=True) as db:
                if db.execute("SELECT COUNT(*) FROM users").fetchone()[0]:
                    raise RuntimeError(
                        "Produksjonsmodus fant lokale brukere. Automatisk sletting er stoppet."
                    )
        if mode["hardware"] == hardware:
            # A QR claim may have committed just before power loss. Recover its
            # delivery BEFORE rotating any keys. Never poll a copied device ID
            # on different hardware.
            secret = (data / "enrollment-secret").read_text().strip()
            device = str(uuid.UUID(bytes=hashlib.sha256(secret.encode()).digest()[:16], version=4))
            body = {
                "device": device,
                "secret": secret,
                "fingerprint": hashlib.sha256((data / "factory-device-id").read_bytes()).hexdigest(),
                "version": "1.35.85",
                "users": 0,
                "ha_connected": False,
                "bootstrap": enrollment_bootstrap(data),
                "retire": True,
            }
            try:
                with httpx.Client(timeout=15, trust_env=False, transport=transport) as client:
                    response = client.post(CLOUD_ORIGIN + "/api/enrollment/poll", json=body)
                    response.raise_for_status()
                    identity = response.json().get("identity")
            except httpx.HTTPError:
                return  # Offline: retain this physical hub's identity; enrollment can resume later.
            if identity:
                configure_remote_identity(
                    {
                        "remote_installation_id": identity["installation_id"],
                        "remote_credential": identity["credential"],
                    },
                    data,
                    exclusive=True,
                )
                marker.unlink()
                _sync_directory(data)
                return
        mode["stage"] = "clearing"
        save(marker, mode)
    # No SMARTi process is running yet. A clearing marker survives interruption.
    for path in data.iterdir():
        if path.name in {"options.json", marker.name}:
            continue
        if path.is_dir() and not path.is_symlink():
            shutil.rmtree(path)
        else:
            path.unlink()
    save(
        data / "factory-image.json",
        {"version": 1, "source_mac": "00:00:00:00:00:00", "recovery_user": mode["recovery_user"]},
    )
    initialize(data, addresses)
    mode.update(stage="waiting", hardware=hardware)
    save(marker, mode)


def bound(data):
    """Called only after the QR-issued remote identity was durably installed."""
    (data / "production-onboarding.json").unlink(missing_ok=True)
    _sync_directory(data)
