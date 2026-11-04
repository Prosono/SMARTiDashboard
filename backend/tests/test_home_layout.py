"""Personal grid persistence, validation and concurrent edit protection."""

import pytest
from test_api import login
from test_management import client  # noqa: F401


def card(id="weather", **changes):
    return {"id": id, "x": 0, "y": 0, "w": 1, "h": 2, **changes}


def test_personal_grid_is_versioned_and_separate_for_each_page(client):  # noqa: F811
    assert client.get("/api/home/layout/overview").json() == {"revision": 0, "items": None}
    original = client.get("/api/home/preferences").json()
    layout = {"revision": 0, "items": [card(), card("routines", x=1)]}
    response = client.put("/api/home/layout/overview", json=layout)
    assert response.status_code == 200
    assert response.json() == {**layout, "revision": 1}
    assert client.get("/api/home/layout/overview").json() == response.json()
    assert client.get("/api/home/layout/lights").json()["items"] is None
    assert client.get("/api/home/preferences").json() == original
    assert client.put("/api/home/layout/overview", json=layout).status_code == 409
    assert client.get("/api/home/layout/overview").json() == response.json()
    assert client.put("/api/home/layout/overview", json={"revision": 1, "items": []}).json() == {
        "revision": 2,
        "items": [],
    }
    assert client.get("/api/home/layout/not-a-page").status_code == 422


@pytest.mark.parametrize(
    "items",
    [
        [card(), card()],
        [card(), card("other")],
        [card(x=2, w=2)],
        [card(y=-1)],
        [card(w=0)],
        [card(h=5)],
        [card(x=0.5)],
        [card(w=True)],
        [card(id="bad\nidentifier")],
        [card(id="x" * 251)],
        [card(extra=True)],
        [card(str(i), y=i * 2) for i in range(301)],
    ],
)
def test_invalid_layouts_do_not_replace_saved_data(client, items):  # noqa: F811
    assert client.put("/api/home/layout/lights", json={"revision": 0, "items": items}).status_code == 422
    assert client.get("/api/home/layout/lights").json()["revision"] == 0


def test_layout_is_authenticated_csrf_protected_and_private_to_each_account(client):  # noqa: F811
    saved = client.put(
        "/api/home/layout/lights",
        json={"revision": 0, "items": [card("device:light.living_pendant")], "group_by_room": False},
    ).json()
    assert (
        client.put(
            "/api/home/layout/lights", json={"revision": 1, "items": []}, headers={"x-csrf-token": "bad"}
        ).status_code
        == 403
    )
    client.post(
        "/api/users", json={"name": "grid-resident", "password": "another-long-grid-password", "role": "user"}
    )
    resident = next(
        account for account in client.get("/api/manage/accounts").json() if account["name"] == "grid-resident"
    )
    client.put(
        f"/api/manage/accounts/{resident['id']}/access",
        json={"profile": "custom", "permissions": ["lights.view"]},
    )
    client.post("/api/logout")
    assert client.get("/api/home/layout/lights").status_code == 401
    login(client, "grid-resident", "another-long-grid-password")
    assert client.get("/api/home/layout/lights").json() == {"revision": 0, "items": None}
    assert (
        client.put("/api/home/layout/lights", json={"revision": 0, "items": [card("own")]}).status_code == 200
    )
    client.post("/api/logout")
    login(client)
    assert client.get("/api/home/layout/lights").json() == saved


def test_room_grouping_saves_atomically_with_clear_and_legacy_clients_preserve_it(client):  # noqa: F811
    initial = {"revision": 0, "items": [card()], "group_by_room": False}
    response = client.put("/api/home/layout/lights", json=initial)
    assert response.status_code == 200
    assert response.json() == {**initial, "revision": 1}
    assert client.get("/api/home/layout/climate").json() == {"revision": 0, "items": None}
    # Older clients omit this optional field; they must not reset the resident's choice.
    legacy = client.put("/api/home/layout/lights", json={"revision": 1, "items": [card()]})
    assert legacy.json()["group_by_room"] is False
    cleared = client.put("/api/home/layout/lights", json={"revision": 2, "items": [], "group_by_room": True})
    assert cleared.json() == {"revision": 3, "items": [], "group_by_room": True}
    assert (
        client.put(
            "/api/home/layout/lights", json={"revision": 2, "items": [card()], "group_by_room": False}
        ).status_code
        == 409
    )
    assert client.get("/api/home/layout/lights").json() == cleared.json()


@pytest.mark.parametrize("value", [1, 0, "true", "false", [], {}])
def test_room_grouping_is_a_strict_boolean(client, value):  # noqa: F811
    assert (
        client.put(
            "/api/home/layout/lights", json={"revision": 0, "items": [], "group_by_room": value}
        ).status_code
        == 422
    )
    assert client.get("/api/home/layout/lights").json() == {"revision": 0, "items": None}


@pytest.mark.parametrize("page", ["lights", "misc", "climate", "security", "media"])
def test_room_grouping_is_available_on_each_category(client, page):  # noqa: F811
    result = client.put(f"/api/home/layout/{page}", json={"revision": 0, "items": [], "group_by_room": True})
    assert result.status_code == 200
    assert client.get(f"/api/home/layout/{page}").json() == result.json()


@pytest.mark.parametrize("page", ["overview", "overview_simple"])
def test_overview_keeps_its_free_layout(client, page):  # noqa: F811
    assert (
        client.put(
            f"/api/home/layout/{page}", json={"revision": 0, "items": [], "group_by_room": True}
        ).status_code
        == 422
    )


@pytest.mark.parametrize(
    "kind",
    [
        "leak",
        "motion",
        "charger",
        "switch",
        "strip",
        "outdoor",
        "spot",
        "track",
        "ceiling",
        "smoke",
        "bulb",
        "floor",
        "desk",
    ],
)
def test_equipment_portrait_choices_persist_without_changing_sources(client, kind):  # noqa: F811
    image = "equipment-" + kind
    config = {"type": "auto", "image": image, "sources": ["light.living_pendant"]}
    response = client.put(
        "/api/home/layout/overview", json={"revision": 0, "items": [card("custom:equipment", config=config)]}
    )
    assert response.status_code == 200
    saved = client.get("/api/home/layout/overview").json()["items"][0]["config"]
    assert saved["image"] == image
    assert saved["sources"] == config["sources"]


@pytest.mark.parametrize("page", ["energy", "energy_history", "energy_control"])
def test_energy_layouts_are_personal_versioned_and_independent(client, page):  # noqa: F811
    other = "energy_history" if page == "energy" else "energy"
    original = client.get("/api/home/preferences").json()
    assert client.get(f"/api/home/layout/{page}").json() == {"revision": 0, "items": None}
    layout = {"revision": 0, "items": [card("energy:flow", w=3, h=4)]}
    saved = client.put(f"/api/home/layout/{page}", json=layout)
    assert saved.status_code == 200
    assert saved.json()["revision"] == 1
    assert client.get(f"/api/home/layout/{page}").json() == saved.json()
    assert client.get(f"/api/home/layout/{other}").json()["items"] is None
    assert client.get("/api/home/layout/overview").json()["items"] is None
    assert client.put(f"/api/home/layout/{page}", json=layout).status_code == 409
    assert (
        client.put(
            f"/api/home/layout/{page}", json={"revision": 1, "items": [], "group_by_room": True}
        ).status_code
        == 422
    )
    assert client.get("/api/home/preferences").json() == original
    assert client.put(f"/api/home/layout/{page}", json={"revision": 1, "items": []}).json()["items"] == []


def test_combined_energy_layout_is_a_read_only_migration_until_saved(client):  # noqa: F811
    overview = client.put(
        "/api/home/layout/energy", json={"revision": 0, "items": [card("energy:flow", w=3, h=4)]}
    ).json()
    history = client.put(
        "/api/home/layout/energy_history", json={"revision": 0, "items": [card("energy:history", w=2, h=3)]}
    ).json()
    merged = client.get("/api/home/layout/energy_control").json()
    assert merged["revision"] == 0
    assert {item["id"] for item in merged["items"]} == {
        "energy:flow",
        "energy:history",
        "energy:capacity",
        "energy:tariff",
        "energy:price-hours",
    }
    assert client.get("/api/home/layout/energy").json() == overview
    assert client.get("/api/home/layout/energy_history").json() == history
    saved = client.put("/api/home/layout/energy_control", json=merged)
    assert saved.status_code == 200
    assert client.put("/api/home/layout/energy_control", json=merged).status_code == 409
    assert client.get("/api/home/layout/energy_control").json() == saved.json()
    assert client.get("/api/home/layout/energy").json() == overview
    client.post(
        "/api/users",
        json={"name": "energy-resident", "password": "a different long password", "role": "user"},
    )
    client.post("/api/logout")
    login(client, "energy-resident", "a different long password")
    assert client.get("/api/home/layout/energy_control").json() == {"revision": 0, "items": None}


@pytest.mark.parametrize(
    "page",
    [
        "overview",
        "overview_simple",
        "lights",
        "climate",
        "security",
        "media",
        "misc",
        "energy",
        "energy_history",
        "energy_control",
    ],
)
def test_mobile_and_desktop_layouts_have_independent_revisions_and_content(client, page):  # noqa: F811
    desktop = f"/api/home/layout/{page}"
    mobile = desktop + "?surface=mobile"
    first = client.put(desktop, json={"revision": 0, "items": [card("desktop")]})
    assert first.status_code == 200
    assert client.get(mobile).json() == {"revision": 0, "items": None}
    second = client.put(mobile, json={"revision": 0, "items": [card("phone", w=2, h=3)]})
    assert second.status_code == 200
    assert second.json()["revision"] == 1
    assert client.get(desktop).json() == first.json()
    assert client.get(desktop + "?surface=desktop").json() == first.json()
    desktop_edit = client.put(desktop, json={"revision": 1, "items": []})
    assert desktop_edit.status_code == 200
    assert client.get(mobile).json() == second.json()
    assert client.put(mobile, json={"revision": 0, "items": []}).status_code == 409
    assert client.get(mobile).json() == second.json()
    assert client.put(mobile, json={"revision": 1, "items": []}).status_code == 200
    assert client.get(desktop).json() == desktop_edit.json()
    assert client.get(desktop + "?surface=tablet").status_code == 422
    assert client.put(desktop + "?surface=tablet", json={"revision": 0, "items": []}).status_code == 422


def test_surface_migration_copies_existing_layouts_once_without_overwriting_phone_data(tmp_path):
    import json

    from app.storage import MIGRATIONS, Store

    path = tmp_path / "surfaces.sqlite"
    store = Store(path)
    original = {
        "revision": 7,
        "items": [
            card(
                "custom:old",
                config={
                    "type": "auto",
                    "title": "Old",
                    "sources": ["light.old"],
                    "icon": "light",
                    "image": "auto",
                    "period": "24",
                },
            )
        ],
        "group_by_room": False,
    }
    empty = {"revision": 3, "items": []}
    existing_mobile = {"revision": 4, "items": [card("phone")]}
    store.set("home_layout:1:overview", json.dumps(original))
    store.set("home_layout:2:overview", json.dumps(empty))
    store.set("home_layout:1:lights", json.dumps(original))
    store.set("home_layout_mobile:1:lights", json.dumps(existing_mobile))
    with store.connect() as db:
        db.execute(f"PRAGMA user_version={len(MIGRATIONS) - 1}")
    store = Store(path)
    assert json.loads(store.get("home_layout_mobile:1:overview")) == original
    assert json.loads(store.get("home_layout_mobile:2:overview")) == empty
    assert json.loads(store.get("home_layout_mobile:1:lights")) == existing_mobile
    store.set("home_layout:1:overview", json.dumps(empty))
    store.set("home_layout:3:overview", json.dumps(original))
    store = Store(path)
    assert json.loads(store.get("home_layout_mobile:1:overview")) == original
    assert store.get("home_layout_mobile:3:overview") == ""
    assert json.loads(store.get("home_layout:1:overview")) == empty


def test_energy_combination_only_reads_its_own_surface(client):  # noqa: F811
    client.put("/api/home/layout/energy", json={"revision": 0, "items": [card("energy:flow")]})
    assert client.get("/api/home/layout/energy_control?surface=mobile").json()["items"] is None
    client.put(
        "/api/home/layout/energy_history?surface=mobile",
        json={"revision": 0, "items": [card("energy:history")]},
    )
    desktop = client.get("/api/home/layout/energy_control").json()
    mobile = client.get("/api/home/layout/energy_control?surface=mobile").json()
    assert "energy:flow" in {item["id"] for item in desktop["items"]}
    assert "energy:history" not in {item["id"] for item in desktop["items"]}
    assert "energy:history" in {item["id"] for item in mobile["items"]}
    assert "energy:flow" not in {item["id"] for item in mobile["items"]}


def test_phone_surface_is_private_and_csrf_protected(client):  # noqa: F811
    path = "/api/home/layout/lights?surface=mobile"
    saved = client.put(path, json={"revision": 0, "items": [card("private")]})
    assert saved.status_code == 200
    assert (
        client.put(path, json={"revision": 1, "items": []}, headers={"x-csrf-token": "invalid"}).status_code
        == 403
    )
    client.post(
        "/api/users", json={"name": "phone-owner", "password": "another very long password", "role": "user"}
    )
    client.post("/api/logout")
    assert client.get(path).status_code == 401
    login(client, "phone-owner", "another very long password")
    assert client.get(path).json() == {"revision": 0, "items": None}
    client.post("/api/logout")
    login(client)
    assert client.get(path).json() == saved.json()
