"""Personal card configuration shares atomic layout persistence and view permissions."""

import pytest
from test_api import login
from test_home_layout import card
from test_management import client  # noqa: F401


@pytest.mark.parametrize(
    "image",
    [
        "equipment-movement",
        "equipment-presence",
        "equipment-window-closed",
        "equipment-window-open",
        "equipment-calendar",
    ],
)
@pytest.mark.parametrize("suffix", ["", "?surface=mobile"])
def test_shared_artwork_choices_round_trip_on_both_dashboard_surfaces(client, image, suffix):  # noqa: F811
    source = client.get("/api/home").json()["controls"][0]["entity_id"]
    path = "/api/home/layout/overview" + suffix
    saved = client.put(
        path,
        json={"revision": 0, "items": [card("custom:art", config={"sources": [source], "image": image})]},
    )
    assert saved.status_code == 200
    assert client.get(path).json()["items"][0]["config"]["image"] == image


@pytest.mark.parametrize("kind", ["clock", "horizon", "daylight", "moon", "date"])
def test_time_and_sky_cards_need_no_device_binding_and_preserve_private_options(client, kind):  # noqa: F811
    before = client.get("/api/home/preferences").json()
    config = {"type": kind, "title": "Klokke og himmel", "sources": []}
    if kind == "clock":
        config.update(clock_style="orbital", show_seconds=False, time_format="12h")
    item = card("custom:ambient", config=config)
    response = client.put("/api/home/layout/overview", json={"revision": 0, "items": [item]})
    assert response.status_code == 200
    assert response.json()["items"][0]["config"] | config == response.json()["items"][0]["config"]
    assert client.get("/api/home/layout/overview").json() == response.json()
    assert client.get("/api/home/preferences").json() == before
    assert client.get("/api/home/layout/lights").json()["items"] is None


@pytest.mark.parametrize(
    "config",
    [
        {"type": "clock", "sources": ["light.living_pendant"]},
        {"type": "clock", "clock_style": "invalid"},
        {"type": "clock", "show_seconds": 1},
        {"type": "clock", "time_format": "25h"},
        {"type": "moon", "clock_style": "analog"},
        {"type": "horizon", "sources": ["sensor.test"]},
    ],
)
def test_ambient_options_are_bounded_and_cannot_bind_devices(client, config):  # noqa: F811
    assert (
        client.put(
            "/api/home/layout/overview",
            json={"revision": 0, "items": [card("custom:bad-clock", config=config)]},
        ).status_code
        == 422
    )


def test_card_options_round_trip_without_changing_device_appearance(client):  # noqa: F811
    home = client.get("/api/home").json()
    before = client.get("/api/home/preferences").json()
    source = next(c for c in home["controls"] if c["domain"] == "light")
    item = card(
        "custom:reading",
        config={"sources": [source["entity_id"]], "title": "Lesekroken", "icon": "light", "image": "office"},
    )
    saved = client.put("/api/home/layout/lights", json={"revision": 0, "items": [item]})
    assert saved.status_code == 200
    assert saved.json()["items"][0]["config"] == {
        "type": "auto",
        "title": "Lesekroken",
        "icon": "light",
        "image": "office",
        "sources": [source["entity_id"]],
        "period": "24",
    }
    assert client.get("/api/home/layout/lights").json() == saved.json()
    assert client.get("/api/home/preferences").json() == before
    assert client.get("/api/home").json()["controls"] == home["controls"]
    assert client.put("/api/home/layout/lights", json={"revision": 0, "items": []}).status_code == 409


def test_graph_sources_and_missing_entities_survive_a_layout_round_trip(client):  # noqa: F811
    item = card(
        "custom:graph",
        w=2,
        h=3,
        config={
            "type": "graph",
            "sources": ["sensor.bedroom_temperature", "sensor.removed_temperature"],
            "period": "168",
            "image": "none",
            "icon": "graph",
        },
    )
    saved = client.put("/api/home/layout/overview", json={"revision": 0, "items": [item]})
    assert saved.status_code == 200
    config = saved.json()["items"][0]["config"]
    assert config["sources"] == item["config"]["sources"]
    assert config["period"] == "168"
    assert client.get("/api/home/layout/media").json()["items"] is None


@pytest.mark.parametrize(
    "config",
    [
        {"type": "javascript"},
        {"icon": "https://example.org/icon.svg"},
        {"image": "data:image/svg+xml,script"},
        {"title": "bad\nname"},
        {"title": "x" * 81},
        {"sources": ["sensor.a", "sensor.a"], "type": "graph"},
        {"sources": [f"sensor.s{i}" for i in range(7)], "type": "graph"},
        {"sources": ["../../secret"]},
        {"sources": [True]},
        {"type": "graph", "sources": []},
        {"type": "picture", "sources": []},
        {"type": "compact", "sources": ["sensor.a", "sensor.b"]},
        {"period": "8760"},
        {"hidden_admin_field": True},
    ],
)
def test_invalid_card_options_do_not_replace_layout(client, config):  # noqa: F811
    assert (
        client.put(
            "/api/home/layout/lights", json={"revision": 0, "items": [card(config=config)]}
        ).status_code
        == 422
    )
    assert client.get("/api/home/layout/lights").json()["revision"] == 0


def test_custom_cards_need_sources_and_restricted_accounts_cannot_bind_forbidden_entities(client):  # noqa: F811
    assert (
        client.put(
            "/api/home/layout/lights", json={"revision": 0, "items": [card("custom:empty")]}
        ).status_code
        == 422
    )
    home = client.get("/api/home").json()
    forbidden = next(c for c in home["controls"] if c["domain"] == "climate")
    allowed = next(c for c in home["controls"] if c["domain"] == "light")
    client.post(
        "/api/users", json={"name": "card-reader", "password": "another-long-card-password", "role": "user"}
    )
    resident = next(
        account for account in client.get("/api/manage/accounts").json() if account["name"] == "card-reader"
    )
    client.put(
        f"/api/manage/accounts/{resident['id']}/access",
        json={"profile": "custom", "permissions": ["lights.view"]},
    )
    client.post("/api/logout")
    login(client, "card-reader", "another-long-card-password")
    body = {"revision": 0, "items": [card("custom:own", config={"sources": [forbidden["entity_id"]]})]}
    assert client.put("/api/home/layout/lights", json=body).status_code == 403
    body["items"][0]["config"]["sources"] = [allowed["entity_id"]]
    assert client.put("/api/home/layout/lights", json=body).status_code == 200
    client.post("/api/logout")
    login(client)
    assert client.get("/api/home/layout/lights").json()["items"] is None
