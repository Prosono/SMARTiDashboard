"""Actual HTTPS handshake with a temporary test CA; never disables verification."""

import json
import shutil
import socket
import ssl
import subprocess
import sys
import time

import httpx
import pytest


def test_https_transport_and_secure_session(tmp_path):
    if not shutil.which("openssl"):
        pytest.skip("OpenSSL is needed to generate the isolated TLS fixture")
    cert, key = tmp_path / "server.crt", tmp_path / "server.key"
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
            "subjectAltName=DNS:localhost",
        ],
        check=True,
        capture_output=True,
    )
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    origin = f"https://localhost:{port}"
    config = {
        "mode": "demo",
        "development": False,
        "ingress": False,
        "origin": origin,
        "data_dir": str(tmp_path / "db"),
        "bootstrap_secret": "tls-fixture-secret-at-least-24",
    }
    code = (
        "import uvicorn; from app.config import Settings; from app.main import create_app;"
        f"s = Settings(_env_file=None, **{config!r});"
        f'uvicorn.run(create_app(s), host="127.0.0.1", port={port},'
        f"ssl_certfile={str(cert)!r}, ssl_keyfile={str(key)!r}, access_log=False)"
    )
    process = subprocess.Popen(
        [sys.executable, "-c", code], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    try:
        context = ssl.create_default_context(cafile=str(cert))
        with httpx.Client(
            base_url=origin, verify=context, trust_env=False, headers={"origin": origin}
        ) as client:
            for _ in range(60):
                try:
                    assert client.get("/healthz").status_code == 200
                    break
                except httpx.ConnectError:
                    time.sleep(0.05)
            else:
                pytest.fail("HTTPS fixture did not start")
            assert client.get("/api/home").status_code == 401
            body = {"name": "owner", "password": "tls fixture password"}
            assert (
                client.post("/api/bootstrap", json=body | {"secret": config["bootstrap_secret"]}).status_code
                == 200
            )
            response = client.post("/api/login", json=body)
            assert response.status_code == 200
            assert "Secure" in response.headers["set-cookie"]
            assert client.get("/api/home").status_code == 200
            assert "ha_token" not in json.dumps(client.get("/api/home").json())
    finally:
        process.terminate()
        process.wait(timeout=10)
