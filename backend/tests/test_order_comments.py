import sqlite3
import uuid

from app.cloud import create_cloud
from fastapi.testclient import TestClient
from test_cloud import ORIGIN, SECRET
from test_onboarding import factory


def test_order_comments_require_admin_and_csrf(tmp_path):
    _, app, staff, customer, _, hub, home, _, _ = factory(tmp_path)
    url = f"/api/admin/hubs/{home}/order-comments"
    body = {"text": "Pakk med en ekstra kabel.", "request_id": str(uuid.uuid4())}

    anonymous = TestClient(app, base_url=ORIGIN)
    assert anonymous.get(url).status_code == anonymous.post(url, json=body).status_code == 401
    assert customer.get(url).status_code == customer.post(url, json=body).status_code == 403
    assert hub.get(url).status_code == 401
    assert staff.post(url, json=body, headers={"X-CSRF-Token": "wrong"}).status_code == 403
    assert staff.post(url, json=body | {"text": " \n\t "}).status_code == 422
    assert staff.post(url, json=body | {"text": "x" * 2001}).status_code == 422
    assert staff.get(url).json() == []
    missing = "/api/admin/hubs/unknown/order-comments"
    assert staff.get(missing).status_code == staff.post(missing, json=body).status_code == 404


def test_existing_hubs_get_separate_persistent_order_comments(tmp_path):
    path, _, staff, _, _, _, home, _, _ = factory(tmp_path)
    with sqlite3.connect(path) as connection:
        connection.execute("DROP TABLE factory_order_comments")

    def restart():
        return TestClient(
            create_cloud(path, SECRET), base_url=ORIGIN, headers=staff.headers, cookies=staff.cookies
        )

    client = restart()
    base = f"/api/admin/hubs/{home}"
    comments = base + "/order-comments"
    body = {"text": "  Lever med veggfeste.\nMerk esken <A>.  ", "request_id": str(uuid.uuid4())}
    saved = client.post(comments, json=body)
    assert saved.status_code == 200, saved.text
    first = saved.json()
    assert first["text"] == body["text"].strip()
    assert first["author"] == "factory"
    assert first["created"] > 0
    assert client.post(comments, json=body).json() == first
    assert client.post(comments, json=body | {"text": "En annen kommentar."}).status_code == 409
    second = client.post(comments, json={"text": "Pakket.", "request_id": str(uuid.uuid4())}).json()

    other_hub = client.post(
        "/api/admin/hubs", json={"serial": "SMART-002", "model": "Hub One", "hardware": "Zigbee + Z-Wave"}
    ).json()["installation_id"]
    client = restart()
    assert client.get(f"/api/admin/hubs/{other_hub}/order-comments").json() == []
    assert client.get(comments).json() == [second, first]
    assert first["text"] not in client.get("/api/admin/hubs").text
    with sqlite3.connect(path) as connection:
        assert (
            connection.execute(
                "SELECT count(*) FROM admin_audit WHERE action='factory_order_comment_added' AND target=?",
                (home,),
            ).fetchone()[0]
            == 2
        )

    assert client.delete(base).status_code == 200
    assert client.get(comments).status_code == 404
    with sqlite3.connect(path) as connection:
        assert connection.execute("SELECT count(*) FROM factory_order_comments").fetchone()[0] == 0
