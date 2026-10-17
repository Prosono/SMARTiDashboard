import asyncio
import copy

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.requests import Request

from app.config import Settings
from app.demo import Demo
from app.main import create_app
from app.origins import OriginPolicy, canonical_origin, local_origins
from app.system_operations import Supervisor

CORE = {"port": 8123, "ssl": False, "ip_address": "172.30.32.1"}
HOST = {"hostname": "homeassistant"}
NETWORK = {
    "interfaces": [
        {
            "type": "ethernet",
            "enabled": True,
            "connected": True,
            "ipv4": {"address": ["192.168.1.20/24"], "gateway": "192.168.1.1"},
            "ipv6": {"address": ["fd12::20/64"]},
        }
    ],
    "docker": {"address": "172.30.32.0/23"},
}
LOCAL = "http://192.168.1.20:8123"
SECRET = "test-origin-bootstrap-secret-24"


def test_exact_addresses_not_subnets_gateways_or_container_addresses():
    assert local_origins(CORE, HOST, NETWORK) == {
        LOCAL,
        "http://[fd12::20]:8123",
        "http://homeassistant:8123",
        "http://homeassistant.local:8123",
    }
    assert local_origins({"port": 443, "ssl": True}, HOST, NETWORK) == {
        "https://192.168.1.20",
        "https://[fd12::20]",
        "https://homeassistant",
        "https://homeassistant.local",
    }


@pytest.mark.parametrize(
    "value",
    [
        None,
        "null",
        "\x00http://host",
        "http://host/",
        "http://host?",
        "http://host#",
        "http://user@host",
        "http://host:bad",
        "http://host:0",
        "http://host:",
        "http://host:99999",
        "http://*.local",
        "http://a\\b",
        "http://[fd12::1%25eth0]",
        " http://host",
        "http://a\nb",
    ],
)
def test_reject_ambiguous_origins(value):
    assert canonical_origin(value) is None


def test_canonical_browser_ports_and_ipv6():
    assert canonical_origin("https://HOMEASSISTANT.local:443") == "https://homeassistant.local"
    assert canonical_origin("http://[fd12:0:0::20]:8123") == "http://[fd12::20]:8123"


@pytest.mark.parametrize("change", [{"enabled": False}, {"connected": False}, {"type": "bridge"}])
def test_inactive_or_internal_interfaces_do_not_grant_access(change):
    network = copy.deepcopy(NETWORK)
    network["interfaces"][0].update(change)
    assert local_origins(CORE, HOST, network) == set()


def test_malformed_and_nonlocal_data_fail_closed():
    for core in ({}, {"port": True, "ssl": False}, {"port": 8123}, {"port": 8123, "ssl": "false"}):
        assert local_origins(core, HOST, NETWORK) == set()
    network = copy.deepcopy(NETWORK)
    network["interfaces"][0]["ipv4"]["address"] = ["8.8.8.8/24", "127.0.0.1/8", "bad", "169.254.1.1/16"]
    network["interfaces"][0]["ipv6"] = None
    assert local_origins(CORE, HOST, network) == set()
    assert "http://localhost:8123" not in local_origins(CORE, {"hostname": "localhost"}, NETWORK)
    assert "http://external.example:8123" not in local_origins(
        CORE, {"hostname": "external.example"}, NETWORK
    )


def settings(tmp_path, **changes):
    return Settings(
        _env_file=None,
        mode="live",
        data_dir=tmp_path,
        ingress=True,
        ingress_proxy="testclient",
        origin="https://remote.example",
        bootstrap_secret=SECRET,
        **changes,
    )


def fake_supervisor(monkeypatch, values):
    async def request(self, method, path, data=None):
        assert method == "GET"
        if isinstance(values.get(path), Exception):
            raise values[path]
        return values[path]

    monkeypatch.setattr(Supervisor, "request", request)


def test_two_tablets_login_with_discovered_origin_and_keep_auth_csrf(tmp_path, monkeypatch):
    fake_supervisor(monkeypatch, {"/core/info": CORE, "/host/info": HOST, "/network/info": NETWORK})
    app = create_app(settings(tmp_path), Demo())
    app.state.auth.bootstrap("owner", "correct horse battery", SECRET)
    with TestClient(app, base_url=LOCAL) as client:
        for _ in range(2):
            client.cookies.clear()
            client.headers.update({"origin": LOCAL, "x-ingress-path": "/api/hassio_ingress/example"})
            assert (
                client.post(
                    "/api/login", json={"name": "owner", "password": "wrong password long"}
                ).status_code
                == 401
            )
            login = client.post("/api/login", json={"name": "owner", "password": "correct horse battery"})
            assert login.status_code == 200
            cookie = login.cookies.get("smarti_session")
            assert "Secure" not in login.headers["set-cookie"]
            assert "HttpOnly" in login.headers["set-cookie"]
            assert "SameSite=strict" in login.headers["set-cookie"]
            # Real ingress strips the prefix before forwarding to this application.
            client.cookies.clear()
            client.cookies.set("smarti_session", cookie)
            assert client.get("/api/session").status_code == 200
            assert (
                client.put("/api/favorites/light.living_pendant", headers={"x-csrf-token": "bad"}).status_code
                == 403
            )
            assert (
                client.put(
                    "/api/favorites/light.living_pendant", headers={"x-csrf-token": login.json()["csrf"]}
                ).status_code
                == 200
            )
        for bad in [
            "http://192.168.1.21:8123",
            "http://192.168.1.20:80",
            "https://192.168.1.20:8123",
            "http://evil.local:8123",
            "http://homeassistant.local.evil.example:8123",
            "null",
        ]:
            spoof = {"origin": bad, "host": "192.168.1.20:8123", "x-forwarded-host": "192.168.1.20:8123"}
            assert client.post(
                "/api/login", json={"name": "owner", "password": "correct horse battery"}, headers=spoof
            ).json() == {"detail": "origin_rejected"}
            assert client.get("/api/events", headers=spoof).status_code == 403
        assert (
            client.post(
                "/api/login",
                headers=[("Origin", LOCAL), ("Origin", "https://evil.example")],
                json={"name": "owner", "password": "correct horse battery"},
            ).status_code
            == 403
        )
        # Both event streams and writes must use the same policy. Don't consume the infinite stream.
        endpoint = next(
            route.endpoint for route in app.routes if getattr(route, "path", None) == "/api/events"
        )
        request = Request(
            {"type": "http", "method": "GET", "path": "/api/events", "headers": [(b"origin", LOCAL.encode())]}
        )
        assert asyncio.run(endpoint(request, current={"id": 1})).status_code == 200


def test_https_discovery_keeps_secure_cookie_and_proxy_boundary(tmp_path, monkeypatch):
    fake_supervisor(
        monkeypatch, {"/core/info": {"port": 8123, "ssl": True}, "/host/info": HOST, "/network/info": NETWORK}
    )
    app = create_app(settings(tmp_path), Demo())
    app.state.auth.bootstrap("owner", "correct horse battery", SECRET)
    origin = "https://192.168.1.20:8123"
    with TestClient(app, base_url=origin) as client:
        assert (
            "Secure"
            in client.post(
                "/api/login",
                headers={"origin": origin},
                json={"name": "owner", "password": "correct horse battery"},
            ).headers["set-cookie"]
        )
        app.state.origins.settings.ingress_proxy = "172.30.32.2"
        assert client.post(
            "/api/login",
            headers={"origin": origin},
            json={"name": "owner", "password": "correct horse battery"},
        ).json() == {"detail": "ingress_rejected"}


@pytest.mark.asyncio
async def test_refresh_replaces_addresses_and_failure_expires_cache(tmp_path, monkeypatch):
    now = [100]
    monkeypatch.setattr("app.origins.time.monotonic", lambda: now[0])
    values = {"/core/info": CORE, "/host/info": HOST, "/network/info": copy.deepcopy(NETWORK)}
    fake_supervisor(monkeypatch, values)
    policy = OriginPolicy(settings(tmp_path))
    assert not policy.accepts(LOCAL)
    await policy.refresh()
    assert policy.accepts(LOCAL)
    values["/network/info"]["interfaces"][0]["ipv4"]["address"] = ["192.168.1.30/24"]
    await policy.refresh()
    assert not policy.accepts(LOCAL)
    assert policy.accepts("http://192.168.1.30:8123")
    values["/network/info"] = HTTPException(502)
    await policy.refresh()
    assert policy.accepts("http://192.168.1.30:8123")
    now[0] += 301
    assert not policy.accepts("http://192.168.1.30:8123")
    assert policy.accepts("https://remote.example")


@pytest.mark.asyncio
async def test_opt_out_and_standalone_never_discover(tmp_path):
    for config in [settings(tmp_path, auto_local_origins=False), Settings(_env_file=None, data_dir=tmp_path)]:
        policy = OriginPolicy(config)

        async def forbidden(*args):
            pytest.fail("Discovery must not run")

        policy.supervisor.request = forbidden
        await policy.refresh()
        policy.learned = {LOCAL}
        policy.expires = float("inf")
        assert not policy.accepts(LOCAL)
        assert policy.accepts(config.origin)
