"""One-reset credentials encrypted for the hub; never stored as plaintext in cloud."""

import base64
import json
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import x25519
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF


def public_key(private):
    return base64.b64encode(private.public_key().public_bytes_raw()).decode()


def derive(shared, reset_id):
    return HKDF(
        algorithm=hashes.SHA256(), length=32, salt=None, info=("smarti-reset:" + reset_id).encode()
    ).derive(shared)


def seal(public, reset_id, username, password):
    target = x25519.X25519PublicKey.from_public_bytes(base64.b64decode(public, validate=True))
    ephemeral = x25519.X25519PrivateKey.generate()
    nonce = os.urandom(12)
    encrypted = AESGCM(derive(ephemeral.exchange(target), reset_id)).encrypt(
        nonce, json.dumps({"username": username, "password": password}).encode(), reset_id.encode()
    )
    return base64.b64encode(ephemeral.public_key().public_bytes_raw() + nonce + encrypted).decode()


def unseal(private, reset_id, envelope):
    raw = base64.b64decode(envelope, validate=True)
    peer = x25519.X25519PublicKey.from_public_bytes(raw[:32])
    try:
        return json.loads(
            AESGCM(derive(private.exchange(peer), reset_id)).decrypt(raw[32:44], raw[44:], reset_id.encode())
        )
    except InvalidTag:
        raise ValueError("invalid_reset_credentials") from None
