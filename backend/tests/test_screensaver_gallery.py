import base64

import pytest
from app.config import Settings
from app.demo import Demo
from app.main import create_app
from app.screensaver_gallery import PHOTO_PATH, clear_screensaver_gallery, screensaver_gallery_router
from app.storage import Store
from fastapi import FastAPI
from fastapi.testclient import TestClient
from test_api import ORIGIN, SECRET, app, client, login  # noqa: F401

IMAGE = b"\xff\xd8\xffimage\xff\xd9"
THUMBNAIL = b"\xff\xd8\xffthumbnail\xff\xd9"


def encoded(data):
    return base64.b64encode(data).decode()


def photo(number=1):
    return {
        "id": f"{number:032x}",
        "name": f"Bilde {number}.jpg",
        "data": encoded(IMAGE),
        "thumbnail": encoded(THUMBNAIL),
    }


def test_gallery_is_shared_by_authenticated_home_members_and_can_be_edited_only_by_admin(client):  # noqa: F811
    upload = photo()
    item_path = f"{PHOTO_PATH}/{upload['id']}"
    anonymous = TestClient(client.app)
    assert anonymous.get(PHOTO_PATH).status_code == 401
    assert anonymous.get(item_path).status_code == 401
    login(client)
    assert client.get(PHOTO_PATH).json() == {"photos": []}
    assert client.post(PHOTO_PATH, json=upload, headers={"X-CSRF-Token": "wrong"}).status_code == 403
    assert (
        client.post(PHOTO_PATH, json=upload, headers={"Origin": "https://wrong.invalid"}).status_code == 403
    )
    saved = client.post(PHOTO_PATH, json=upload)
    assert saved.status_code == 200
    metadata = {"photos": [{"id": upload["id"], "name": upload["name"]}]}
    assert saved.json() == metadata
    assert client.get(PHOTO_PATH).json() == metadata

    full = client.get(item_path)
    thumb = client.get(item_path + "?thumbnail=1")
    assert full.content == IMAGE and thumb.content == THUMBNAIL
    assert full.headers["content-type"] == "image/jpeg"
    assert full.headers["cache-control"] == "private, no-cache"
    assert full.headers["vary"] == "Cookie"
    assert full.headers["etag"] != thumb.headers["etag"]
    assert client.get(item_path, headers={"If-None-Match": full.headers["etag"]}).status_code == 304
    assert anonymous.get(item_path, headers={"If-None-Match": full.headers["etag"]}).status_code == 401

    assert (
        client.post("/api/users", json={"name": "viewer", "password": "another safe password"}).status_code
        == 200
    )
    with client.app.state.store.connect() as db:
        viewer_id = db.execute("SELECT id FROM users WHERE name='viewer'").fetchone()[0]
    client.app.state.store.set(f"access:{viewer_id}", '{"profile":"viewer"}')
    viewer = TestClient(client.app, headers={"Origin": ORIGIN})
    login(viewer, "viewer", "another safe password")
    assert viewer.get(PHOTO_PATH).json() == metadata
    assert viewer.get(item_path).content == IMAGE
    assert viewer.post(PHOTO_PATH, json=photo(2)).status_code == 403
    assert viewer.delete(item_path).status_code == 403

    assert client.delete(item_path).json() == {"photos": []}
    assert client.get(item_path, headers={"If-None-Match": full.headers["etag"]}).status_code == 404
    assert client.delete(item_path).json() == {"photos": []}


def test_upload_validation_limit_and_idempotent_retry(client, monkeypatch):  # noqa: F811
    monkeypatch.setattr("app.screensaver_gallery.MAX_PHOTOS", 2)
    login(client)
    upload = photo()
    assert client.post(PHOTO_PATH, json=upload | {"id": "not-a-hex-id"}).status_code == 422
    assert client.post(PHOTO_PATH, json=upload | {"data": "!!!"}).status_code == 422
    assert client.post(PHOTO_PATH, json=upload | {"data": encoded(b"<svg/>")}).status_code == 422
    assert client.post(PHOTO_PATH, json=upload | {"thumbnail": encoded(bytes(150_001))}).status_code == 413
    assert client.post(PHOTO_PATH, content=b" " * 2_870_001).status_code == 413
    assert client.post(PHOTO_PATH, json=upload).status_code == 200
    saved = client.post(PHOTO_PATH, json=photo(2)).json()
    assert [row["id"] for row in saved["photos"]] == [photo(1)["id"], photo(2)["id"]]
    assert client.post(PHOTO_PATH, json=upload).json() == saved
    assert client.post(PHOTO_PATH, json=photo(3)).json() == {"detail": "screensaver_gallery_full"}
    assert client.post(PHOTO_PATH, json=upload | {"name": "Other.jpg"}).json() == {
        "detail": "screensaver_photo_conflict"
    }


def test_storage_reopens_and_reset_clears_gallery(tmp_path):
    path = tmp_path / "gallery.sqlite"
    reset_active = False

    def create():
        store = Store(path)
        demo_api = FastAPI()

        def member():
            return {"role": "admin"}

        demo_api.include_router(screensaver_gallery_router(store, member, member, lambda: reset_active))
        return TestClient(demo_api), store

    gallery_client, _ = create()
    assert gallery_client.post(PHOTO_PATH, json=photo()).status_code == 200
    gallery_client, store = create()
    assert gallery_client.get(PHOTO_PATH).json()["photos"][0]["id"] == photo()["id"]
    reset_active = True
    assert gallery_client.get(PHOTO_PATH).status_code == 423
    assert gallery_client.get(f"{PHOTO_PATH}/{photo()['id']}").status_code == 423
    assert gallery_client.delete(f"{PHOTO_PATH}/{photo()['id']}").status_code == 423
    assert gallery_client.post(PHOTO_PATH, json=photo(2)).status_code == 423
    with store.connect() as db:
        db.execute("BEGIN IMMEDIATE")
        clear_screensaver_gallery(db)
    reset_active = False
    assert gallery_client.get(PHOTO_PATH).json() == {"photos": []}


def test_support_session_cannot_access_gallery(tmp_path):
    def member():
        return {"role": "admin", "support": {"ticket": "test"}}

    demo_api = FastAPI()
    demo_api.include_router(
        screensaver_gallery_router(Store(tmp_path / "gallery.sqlite"), member, member, lambda: False)
    )
    visitor = TestClient(demo_api)
    assert visitor.get(PHOTO_PATH).status_code == 403
    assert visitor.get(f"{PHOTO_PATH}/{photo()['id']}").status_code == 403
    assert visitor.post(PHOTO_PATH, json=photo()).status_code == 403


@pytest.mark.parametrize("remote", [False, True])
def test_gallery_uses_existing_ingress_and_remote_browser_sessions(tmp_path, remote):
    origin = "https://hub.example"
    settings = Settings(
        _env_file=None,
        mode="demo",
        origin=origin,
        data_dir=tmp_path,
        bootstrap_secret=SECRET,
        auto_local_origins=False,
        ingress=not remote,
        ingress_proxy="testclient",
    )
    local_api = create_app(settings, Demo())
    headers = {"Origin": origin}
    if remote:
        login(TestClient(local_api, base_url=origin, headers=headers))
        browser = TestClient(
            create_app(settings, Demo(), remote_surface=True), base_url=origin, headers=headers
        )
        login(browser)
    else:
        headers["X-Ingress-Path"] = "/api/hassio_ingress/test"
        browser = TestClient(local_api, base_url=origin, headers=headers)
        session = login(browser)
        # The Supervisor removes the path prefix before forwarding the request.
        browser.headers["Cookie"] = "smarti_session=" + session.cookies["smarti_session"]
    created = browser.post(PHOTO_PATH, json=photo())
    assert created.status_code == 200, created.text
    assert browser.get(f"{PHOTO_PATH}/{photo()['id']}").content == IMAGE
