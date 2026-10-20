import base64
import json
from unittest.mock import AsyncMock

import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
from fastapi import HTTPException
from test_cloud import SECRET, account, code, create_cloud, provision

from app.cloud_push import APNs, PushAlert


def test_apns_jwt_is_es256_and_cached(tmp_path, monkeypatch):
    key = ec.generate_private_key(ec.SECP256R1())
    path = tmp_path / "key.p8"
    path.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
        )
    )
    monkeypatch.setenv("SMARTI_APNS_KEY_FILE", str(path))
    monkeypatch.setenv("SMARTI_APNS_KEY_ID", "KEY")
    monkeypatch.setenv("SMARTI_APNS_TEAM_ID", "TEAM")
    provider = APNs()
    token = provider.jwt()
    header, payload, signature = token.split(".")
    def decode(value):
        return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
    assert json.loads(decode(header)) == {"alg": "ES256", "kid": "KEY"}
    assert json.loads(decode(payload))["iss"] == "TEAM"
    sig = decode(signature)
    key.public_key().verify(
        encode_dss_signature(int.from_bytes(sig[:32]), int.from_bytes(sig[32:])),
        (header + "." + payload).encode(),
        ec.ECDSA(hashes.SHA256()),
    )
    assert provider.jwt() == token


def test_gateway_requires_matching_home_and_enforces_limit(tmp_path, monkeypatch):
    send = AsyncMock(return_value={"status": "accepted_by_apple"})
    monkeypatch.setattr(APNs, "send", send)
    app = create_cloud(tmp_path / "cloud.sqlite", SECRET)
    c, home = provision(app, "Home")
    _, other = provision(app, "Other")
    endpoint = f"/api/hubs/{home['installation_id']}/push"
    body = {"token": "a" * 64, "message": "Test"}
    assert c.post(endpoint, json=body).status_code == 403
    assert (
        c.post(endpoint, json=body, headers={"Authorization": "Bearer " + other["credential"]}).status_code
        == 403
    )
    headers = {"Authorization": "Bearer " + home["credential"]}
    assert c.post(endpoint, json=body, headers=headers).status_code == 403
    owner = account(app, "owner")
    owner.post("/api/homes/claim", json={"code": code(c, home)})
    assert c.post(endpoint, json=body, headers=headers).status_code == 200
    import sqlite3

    with sqlite3.connect(tmp_path / "cloud.sqlite") as db:
        db.execute("UPDATE push_limits SET count=500")
    assert c.post(endpoint, json=body, headers=headers).status_code == 429
    assert send.await_count == 1


async def test_unconfigured_apns_fails_closed(monkeypatch):
    monkeypatch.delenv("SMARTI_APNS_KEY_FILE", raising=False)
    with pytest.raises(HTTPException) as failure:
        await APNs().send(PushAlert(token="a" * 64, message="No"))
    assert failure.value.status_code == 503
