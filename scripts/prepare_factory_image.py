"""Internal production tool; intentionally excluded from the HA runtime payload.

Run against the SMARTi /data directory on an OFFLINE mounted master SSD,
never against a running hub. This is not a customer factory-reset action.
"""

import argparse
import json
import os
import re
import shutil
import sqlite3
import tempfile
from pathlib import Path


def prepare(data, source_mac, apply=False):
    data = Path(data)
    if (
        not data.is_absolute()
        or data == Path("/")
        or data.is_symlink()
        or not data.is_dir()
    ):
        raise ValueError(
            "Oppgi absolutt sti til SMARTis data-mappe på den frakoblede master-SSDen."
        )
    if any(p.is_symlink() for p in data.rglob("*")):
        raise ValueError("Datamappen inneholder symbolske lenker. Stoppet.")
    source_mac = source_mac.lower()
    if (
        not re.fullmatch(r"(?:[0-9a-f]{2}:){5}[0-9a-f]{2}", source_mac)
        or source_mac == "00:00:00:00:00:00"
    ):
        raise ValueError(
            "Oppgi den fysiske MAC-adressen til masterhubens nettverkskort."
        )
    state = json.loads((data / "factory-reset-state.json").read_text())
    if (
        state.get("phase") != "awaiting_owner"
        or state.get("ownership") != "release_owner"
        or not state.get("recovery_user")
    ):
        raise ValueError(
            "Krever fullført reset med frigitt eierskap, omstart og gjenopprettingskonto."
        )
    database = data / "smarti-live.sqlite3"
    if not database.is_file():
        raise ValueError("SMARTi-databasen mangler.")
    with sqlite3.connect(database.as_uri() + "?mode=ro", uri=True) as db:
        if db.execute("SELECT COUNT(*) FROM users").fetchone()[0]:
            raise ValueError("Huben inneholder brukere. Kjør full reset først.")
    options = json.loads((data / "options.json").read_text())
    # Retain only non-secret infrastructure preferences. Supervisor options must
    # also be cleared before shutdown; otherwise Supervisor may restore them.
    for key in ("remote_installation_id", "remote_credential", "bootstrap_secret"):
        if options.get(key):
            raise ValueError(
                "Fjern Hub-ID, tilkoblingsnøkkel og bootstrap_secret i HA-appens konfigurasjon først."
            )
    if not apply:
        return
    # Commit a startup barrier before erasing anything. A crash leaves the source
    # blocked and a clone fail-closed until the preparation is rerun/completed.
    marker = {"version": 0, "source_mac": source_mac}
    with (data / "factory-image.json").open("w") as barrier:
        json.dump(marker, barrier)
        barrier.flush()
        os.fsync(barrier.fileno())
    os.chmod(data / "factory-image.json", 0o600)
    directory = os.open(data, os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)
    for path in data.iterdir():
        if path.name in {"options.json", "factory-image.json"}:
            continue
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink()
    marker.update(version=1, recovery_user=state["recovery_user"])
    fd, temp = tempfile.mkstemp(dir=data, prefix=".factory-image-")
    with os.fdopen(fd, "w") as out:
        json.dump(marker, out)
        out.flush()
        os.fsync(out.fileno())
    os.replace(temp, data / "factory-image.json")
    directory = os.open(data, os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--source-mac", required=True)
    parser.add_argument("--prepare-master-image", action="store_true")
    parser.add_argument("--confirm-offline-ssd", action="store_true")
    args = parser.parse_args()
    if args.prepare_master_image and not args.confirm_offline_ssd:
        parser.error(
            "Skriving krever --confirm-offline-ssd. Huben skal være avslått og SSDen montert separat."
        )
    try:
        prepare(args.data_dir, args.source_mac, args.prepare_master_image)
    except (ValueError, OSError, sqlite3.Error, KeyError) as exc:
        raise SystemExit(str(exc)) from None
    print(
        "Master-image er forseglet. Ta SSD-kopi nå."
        if args.prepare_master_image
        else "Kontroll OK. Ingen filer endret."
    )


if __name__ == "__main__":
    main()
