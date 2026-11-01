"""Ephemeral HTTPS portal harness. Never opens a live database or provisioning key."""

import os
import secrets
import sqlite3
import subprocess
import tempfile
import uuid
from pathlib import Path

import uvicorn
from app.cloud import PASSWORDS, create_cloud

port = int(os.environ.get("SMARTI_TEST_CLOUD_PORT", "8770"))
origin = f"https://localhost:{port}"
with tempfile.TemporaryDirectory(prefix="smarti-cloud-e2e-") as directory:
    root = Path(directory)
    key, cert = root / "localhost.key", root / "localhost.crt"
    subprocess.run(
        [
            "openssl",
            "req",
            "-x509",
            "-newkey",
            "rsa:2048",
            "-nodes",
            "-days",
            "1",
            "-keyout",
            str(key),
            "-out",
            str(cert),
            "-subj",
            "/CN=localhost",
            "-addext",
            "subjectAltName=DNS:localhost,IP:127.0.0.1",
        ],
        check=True,
        capture_output=True,
    )
    database = root / "cloud.sqlite"
    app = create_cloud(database, secrets.token_urlsafe(48), origin=origin)
    with sqlite3.connect(database) as db:
        for name in ["factory-test", "customer-test"]:
            account_id = str(uuid.uuid4())
            db.execute(
                "INSERT INTO accounts(id,username,password) VALUES(?,?,?)",
                (
                    account_id,
                    name,
                    PASSWORDS.hash("isolated-factory-password-not-live"),
                ),
            )
            if name == "factory-test":
                db.execute(
                    "INSERT INTO portal_admins(account) VALUES(?)", (account_id,)
                )
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        ssl_keyfile=str(key),
        ssl_certfile=str(cert),
        access_log=False,
    )
