import pytest
from app.cloud import create_cloud
from fastapi.testclient import TestClient
from test_cloud import ORIGIN, SECRET, account, code, provision

CURRENT = "12345678-1234-4123-8234-123456789abc"
OTHER = "abcdef01-2345-4678-9876-123456789abc"


def test_only_switcher_frame_route_allows_exact_home_ancestor(tmp_path):
    app = create_cloud(tmp_path / "cloud.sqlite", SECRET)
    with TestClient(app, base_url=ORIGIN) as client:
        frame = client.get(f"/home-switcher?current={CURRENT}&lang=en&theme=dark")
        assert frame.status_code == 200
        assert (
            f"frame-ancestors https://{CURRENT}.home.smarti.dev;" in frame.headers["content-security-policy"]
        )
        assert frame.headers["cache-control"] == "no-store"
        assert frame.headers["referrer-policy"] == "no-referrer"
        assert "access-control-allow-origin" not in frame.headers
        for route in ("/", "/api/session", "/assets/home-switcher.html", "/assets/home-switcher.js"):
            response = client.get(f"{route}?current={CURRENT}")
            assert "frame-ancestors 'none';" in response.headers["content-security-policy"]


@pytest.mark.parametrize(
    "query",
    (
        f"current={CURRENT}&current={OTHER}",
        f"current={CURRENT}&open={OTHER}",
        f"current={CURRENT}&lang=en&lang=nb",
        f"current={CURRENT}&theme=invalid",
        f"current={CURRENT}%27%3Bframe-src%20%2A",
        "current=not-a-home",
        f"open={OTHER}",
    ),
)
def test_unexpected_switcher_targets_remain_unembeddable(tmp_path, query):
    app = create_cloud(tmp_path / "cloud.sqlite", SECRET)
    with TestClient(app, base_url=ORIGIN) as client:
        response = client.get(f"/home-switcher?{query}")
        assert "frame-ancestors 'none';" in response.headers["content-security-policy"]


def test_direct_or_unactivated_launch_requires_user_action(tmp_path):
    app = create_cloud(tmp_path / "cloud.sqlite", SECRET)
    with TestClient(app, base_url=ORIGIN) as client:
        path = f"/home-switcher?open={OTHER}&lang=en&theme=light"
        for headers in (
            {},
            {"Sec-Fetch-Site": "cross-site", "Sec-Fetch-User": "?1"},
            {"Sec-Fetch-Site": "same-origin"},
        ):
            response = client.get(path, headers=headers)
            assert 'data-auto-open="false"' in response.text
        response = client.get(path, headers={"Sec-Fetch-Site": "same-origin", "Sec-Fetch-User": "?1"})
        assert 'data-auto-open="true"' in response.text
        assert "frame-ancestors 'none';" in response.headers["content-security-policy"]
        assert client.post(f"/api/customer/homes/{OTHER}/open").status_code == 401


def test_switcher_keeps_portal_membership_and_csrf_on_home_open(tmp_path):
    app = create_cloud(tmp_path / "cloud.sqlite", SECRET)
    alice = account(app, "alice")
    bob = account(app, "bob")
    hub, home = provision(app, "Hytta")
    home_id = home["installation_id"]
    assert alice.post("/api/homes/claim", json={"code": code(hub, home)}).status_code == 200
    route = f"/api/customer/homes/{home_id}/open"
    assert alice.post(route, headers={"X-CSRF-Token": "invalid"}).status_code == 403
    assert alice.post(route, headers={"Origin": f"https://{CURRENT}.home.smarti.dev"}).status_code == 403
    assert bob.post(route).status_code == 404
    response = alice.post(route, headers={"X-SMARTi-Language": "en"})
    assert response.status_code == 200
    assert response.json()["url"].startswith(f"https://{home_id}.home.smarti.dev/_account?lang=en#")
