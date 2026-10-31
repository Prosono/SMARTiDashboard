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
    assert client.get("/api/home/layout/energy").status_code == 422


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
        "/api/home/layout/lights", json={"revision": 0, "items": [card("device:light.living_pendant")]}
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
    assert client.get("/api/home/layout/lights").json()["items"] is None
    assert (
        client.put("/api/home/layout/lights", json={"revision": 0, "items": [card("own")]}).status_code == 200
    )
    client.post("/api/logout")
    login(client)
    assert client.get("/api/home/layout/lights").json() == saved
