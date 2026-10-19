"""Certbot HTTP-01 hooks. Only public challenge proofs leave the hub."""

import json
import os
import re
import sys
import uuid
from pathlib import Path

import httpx

from .remote_access import CLOUD_ORIGIN


def read_identity(path):
    value = json.loads(Path(path).read_text())
    home, credential = value["installation_id"], value["credential"]
    if str(uuid.UUID(home)) != home or not isinstance(credential, str) or len(credential) < 32:
        raise ValueError("Invalid hub identity")
    return home, credential


def run_hook(action, environ=None, transport=None):
    environ = os.environ if environ is None else environ
    home, credential = read_identity(environ["SMARTI_REMOTE_IDENTITY_FILE"])
    identifier = environ.get("CERTBOT_IDENTIFIER", environ.get("CERTBOT_DOMAIN"))
    token = environ["CERTBOT_TOKEN"]
    if identifier != f"{home}.home.smarti.dev" or not re.fullmatch(r"[A-Za-z0-9_-]{22,128}", token):
        raise ValueError("Certificate identifier rejected")
    endpoint = f"{CLOUD_ORIGIN}/api/hubs/{home}/certificate-challenge"
    with httpx.Client(timeout=15, trust_env=False, follow_redirects=False, transport=transport) as client:
        headers = {"Authorization": "Bearer " + credential}
        if action == "auth":
            validation = environ["CERTBOT_VALIDATION"]
            if not re.fullmatch(re.escape(token) + r"\.[A-Za-z0-9_-]{43}", validation):
                raise ValueError("Certificate proof rejected")
            response = client.put(endpoint, headers=headers, json={"token": token, "validation": validation})
        elif action == "cleanup":
            response = client.delete(endpoint + "/" + token, headers=headers)
        else:
            raise ValueError("Unknown certificate hook")
        response.raise_for_status()


def main():
    try:
        run_hook(sys.argv[1])
    except Exception:
        # Certbot captures stdout/stderr. Do not log credential-bearing requests.
        print("SMARTi certificate validation could not be completed.", file=sys.stderr)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
