import base64

import pytest
from test_api import login
from test_management import client as home_client  # noqa: F401


@pytest.fixture
def client(home_client):  # noqa: F811
    return home_client


def test_header_choice_uses_personal_settings_and_preserves_other_preferences(client):
    assert client.get("/api/home/appearance").json() == {
        "background": "auto",
        "has_custom": False,
        "image_version": None,
    }
    client.put("/api/home/preferences", json={"rooms": ["living"]})
    before = client.get("/api/home/preferences").json()
    for background in ["living", "outdoor", "kitchen", "bedroom", "office", "none", "auto"]:
        assert client.put("/api/home/appearance", json={"background": background}).status_code == 200
        assert client.get("/api/home/appearance").json()["background"] == background
    assert client.get("/api/home/preferences").json() == before
    assert client.put("/api/home/appearance", json={"background": "../../secret"}).status_code == 422
    assert client.put("/api/home/appearance", json={"background": "custom"}).status_code == 422


def test_header_upload_is_bounded_raster_authenticated_and_csrf_protected(client):
    for raw in [b"<svg onload='alert(1)'/>", b"not an image", b"\xff\xd8\xff" + b"x" * 1_000_000]:
        assert (
            client.put(
                "/api/home/appearance/image", json={"data": base64.b64encode(raw).decode()}
            ).status_code
            == 422
        )
    assert client.put("/api/home/appearance/image", json={"data": "%%%"}).status_code == 422
    raw = b"\x89PNG\r\n\x1a\nprivate-test-photo"
    encoded = base64.b64encode(raw).decode()
    assert (
        client.put(
            "/api/home/appearance/image", json={"data": encoded}, headers={"x-csrf-token": "bad"}
        ).status_code
        == 403
    )
    result = client.put("/api/home/appearance/image", json={"data": encoded})
    assert result.status_code == 200
    assert result.json()["background"] == "custom"
    assert result.json()["has_custom"] is True
    assert result.json()["image_version"]
    assert encoded not in client.get("/api/home/appearance").text
    response = client.get("/api/home/appearance/image")
    assert response.content == raw
    assert response.headers["content-type"] == "image/png"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert "no-store" in response.headers["cache-control"]
    client.post("/api/logout")
    assert client.get("/api/home/appearance").status_code == 401
    assert client.get("/api/home/appearance/image").status_code == 401


def test_each_resident_can_use_their_own_photo_without_reading_another_residents_photo(client):
    owner_photo = base64.b64encode(b"\xff\xd8\xffowner-photo").decode()
    client.put("/api/home/appearance/image", json={"data": owner_photo})
    owner_version = client.get("/api/home/appearance").json()["image_version"]
    client.post("/api/users", json={"name": "resident", "password": "another long password", "role": "user"})
    client.post("/api/logout")
    login(client, "resident", "another long password")
    assert client.get("/api/home/appearance").json()["background"] == "auto"
    assert client.get("/api/home/appearance/image").status_code == 404
    assert client.put("/api/home/appearance", json={"background": "custom"}).status_code == 422
    resident_photo = base64.b64encode(b"\xff\xd8\xffresident-photo").decode()
    assert client.put("/api/home/appearance/image", json={"data": resident_photo}).status_code == 200
    assert client.get("/api/home/appearance").json()["image_version"] != owner_version
    client.post("/api/logout")
    login(client)
    assert client.get("/api/home/appearance/image").content == base64.b64decode(owner_photo)
    client.put("/api/home/appearance", json={"background": "outdoor"})
    assert client.get("/api/home/appearance").json()["has_custom"] is True
    assert client.put("/api/home/appearance/image", json={"data": ""}).json()["background"] == "auto"
    assert client.get("/api/home/appearance/image").status_code == 404
