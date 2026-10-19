import json
import sqlite3
import time
import uuid

import httpx
import pytest
from app.certificate_hook import run_hook
from app.certificates import PRODUCTION, STAGING, Certificates
from app.cloud import create_cloud
from test_cloud import SECRET, account, code, provision

TOKEN = "t" * 43
PROOF = TOKEN + "." + "p" * 43


def test_challenge_is_bound_to_claimed_enabled_home_and_expires(tmp_path):
    path = tmp_path / "cloud.sqlite"
    app = create_cloud(path, SECRET)
    owner = account(app, "owner")
    c, home = provision(app, "Home")
    _, other = provision(app, "Other")
    home_id = home["installation_id"]
    endpoint = f"/api/hubs/{home_id}/certificate-challenge"
    headers = {"Authorization": "Bearer " + home["credential"]}
    body = {"token": TOKEN, "validation": PROOF}
    assert c.put(endpoint, headers=headers, json=body).status_code == 403
    assert owner.post("/api/homes/claim", json={"code": code(c, home)}).status_code == 200
    assert (
        c.put(endpoint, headers={"Authorization": "Bearer " + other["credential"]}, json=body).status_code
        == 403
    )
    assert (
        c.put(endpoint, headers=headers, json={**body, "validation": "x" * 43 + "." + "p" * 43}).status_code
        == 422
    )
    assert c.put(endpoint, headers=headers, json=body).status_code == 200
    public = f"http://{home_id}.home.smarti.dev/.well-known/acme-challenge/{TOKEN}"
    response = c.get(public)
    assert response.text == PROOF
    assert response.headers["content-type"].startswith("text/plain")
    assert c.get(public.replace(home_id, other["installation_id"])).status_code == 404
    assert (
        c.get(
            "/.well-known/acme-challenge/" + TOKEN, headers={"X-Forwarded-Host": home_id + ".home.smarti.dev"}
        ).status_code
        == 404
    )
    assert c.delete(endpoint + "/old-token", headers=headers).status_code == 200
    assert c.get(public).text == PROOF
    assert owner.delete(f"/api/homes/{home_id}/remote").status_code == 200
    assert c.get(public).status_code == 404
    assert c.put(endpoint, headers=headers, json=body).status_code == 403
    assert c.put(f"/api/hubs/{home_id}/remote", headers=headers).status_code == 200
    with sqlite3.connect(path) as db:
        db.execute("UPDATE certificate_challenges SET expires=?", (time.time() - 1,))
    assert c.get(public).status_code == 404
    assert c.put(endpoint, headers=headers, json=body).status_code == 200
    assert c.delete(endpoint + "/" + TOKEN, headers=headers).status_code == 200
    assert c.get(public).status_code == 404


def test_hook_has_fixed_destination_and_rejects_foreign_identifier(tmp_path):
    home = str(uuid.uuid4())
    identity = tmp_path / "identity.json"
    identity.write_text(json.dumps({"installation_id": home, "credential": "s" * 48}))
    env = {
        "SMARTI_REMOTE_IDENTITY_FILE": str(identity),
        "CERTBOT_IDENTIFIER": home + ".home.smarti.dev",
        "CERTBOT_TOKEN": TOKEN,
        "CERTBOT_VALIDATION": PROOF,
    }
    calls = []

    def handle(request):
        calls.append(request)
        assert str(request.url).startswith("https://home.smarti.dev/api/hubs/" + home + "/")
        assert request.headers["Authorization"] == "Bearer " + "s" * 48
        return httpx.Response(200, json={})

    transport = httpx.MockTransport(handle)
    run_hook("auth", env, transport)
    assert json.loads(calls[0].content) == {"token": TOKEN, "validation": PROOF}
    run_hook("cleanup", env, transport)
    assert calls[-1].method == "DELETE"
    with pytest.raises(ValueError):
        run_hook("auth", {**env, "CERTBOT_IDENTIFIER": "other.home.smarti.dev"}, transport)
    with pytest.raises(ValueError):
        run_hook("auth", {**env, "CERTBOT_TOKEN": "../bad"}, transport)
    assert len(calls) == 2
    production = Certificates(identity, tmp_path / "certs")
    staging = Certificates(identity, tmp_path / "certs", staging=True)
    assert PRODUCTION in production.command()
    assert STAGING in staging.command()
    assert production.cert != staging.cert
    assert "s" * 48 not in str(production.command())
    assert production.command().count("-d") == 1
    assert "--keep-until-expiring" in production.command()
