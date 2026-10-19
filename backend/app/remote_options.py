"""Read installer-controlled Supervisor options without exposing keys to the UI."""

import json
import os
import re
import tempfile
import uuid
from pathlib import Path


def configure_remote_identity(options, data_dir):
    path = Path(data_dir) / "remote-identity.json"
    home = options.get("remote_installation_id", "")
    key = options.get("remote_credential", "")
    if not isinstance(home, str) or not isinstance(key, str):
        raise ValueError("Invalid remote configuration")
    home, key = home.strip(), key.strip()
    if not home and not key:
        return path if path.is_file() else None  # Preserve installer-provisioned hubs.
    try:
        valid = str(uuid.UUID(home)) == home and re.fullmatch(r"[A-Za-z0-9_-]{32,256}", key)
    except ValueError:
        valid = False
    if not valid:
        raise ValueError("Both a valid hub ID and connection key are required")
    content = json.dumps({"installation_id": home, "credential": key})
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temporary = tempfile.mkstemp(prefix=".remote-identity-", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)
    return path
