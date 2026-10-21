"""First boot of an operator-sealed SSD image. No HTTP interface."""

import json
import secrets
import uuid
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric import x25519

from .ha_auth_reset import _sync_directory, _write_new
from .reset_credentials import public_key


def physical_addresses(root=Path("/sys/class/net")):
    return {
        p.joinpath("address").read_text().strip().lower()
        for p in root.iterdir()
        if (p / "device").exists() and (p / "address").is_file()
    }


def initialize(data_dir, addresses=None):
    marker = data_dir / "factory-image.json"
    if not marker.exists():
        return
    template = json.loads(marker.read_text())
    addresses = physical_addresses() if addresses is None else addresses
    if not addresses:
        raise RuntimeError("Produksjonsimage: fysisk nettverkskort kunne ikke bekreftes.")
    if template["source_mac"] in addresses:
        raise RuntimeError(
            "Master-image er forseglet. Slå av masteren og kopier SSDen. SMARTi starter ikke her."
        )
    if template.get("version") != 1:
        raise RuntimeError("Ukjent produksjonsimage-format.")
    # A journal makes a partially completed first boot repeatable. Never carry
    # this generated journal into the golden image: the source machine is blocked.
    journal = data_dir / "factory-image-first-boot.json"
    if not journal.exists():
        key = x25519.X25519PrivateKey.generate()
        state = {
            "id": str(uuid.uuid4()),
            "phase": "awaiting_owner",
            "ownership": "keep_owner",
            "boot": True,
            "watchdog": True,
            "report": [],
            "recovery_user": template["recovery_user"],
            "factory_image": True,
        }
        _write_new(
            journal,
            json.dumps(
                {
                    "state": state,
                    "key": key.private_bytes_raw().hex(),
                    "device": uuid.uuid4().hex,
                    "secret": secrets.token_urlsafe(48),
                }
            ).encode(),
        )
        _sync_directory(data_dir)
    seed = json.loads(journal.read_text())
    for name, content in [
        ("factory-device-id", seed["device"].encode()),
        ("enrollment-secret", seed["secret"].encode()),
        ("factory-reset-key", bytes.fromhex(seed["key"])),
        ("factory-reset-state.json", json.dumps(seed["state"]).encode()),
    ]:
        path = data_dir / name
        if not path.exists():
            _write_new(path, content)
        elif path.read_bytes() != content:
            raise RuntimeError("Produksjonsimage har uventet identitet. Oppstart stoppet.")
    _sync_directory(data_dir)
    marker.unlink()
    _sync_directory(data_dir)
    journal.unlink(missing_ok=True)


def enrollment_bootstrap(data_dir):
    path = data_dir / "factory-reset-state.json"
    if not path.exists():
        return None
    state = json.loads(path.read_text())
    if not state.get("factory_image") or state["phase"] != "awaiting_owner":
        return None
    key = x25519.X25519PrivateKey.from_private_bytes((data_dir / "factory-reset-key").read_bytes())
    return {"id": state["id"], "public_key": public_key(key)}
