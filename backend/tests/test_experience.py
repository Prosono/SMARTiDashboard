from test_access import resident, sign_in
from test_api import app, client, login  # noqa: F401


def test_experience_is_personal_and_validated(client):  # noqa: F811
    resident(client)
    assert client.get("/api/home/experience").json() == {"mode": "advanced"}
    assert client.put("/api/home/experience", json={"mode": "simple"}).status_code == 200
    assert client.put("/api/home/experience", json={"mode": "invalid"}).status_code == 422
    sign_in(client)
    assert client.get("/api/home/experience").json() == {"mode": "advanced"}
    assert client.put("/api/home/experience", json={"mode": "normal"}).json() == {"mode": "normal"}
    login(client)
    assert client.get("/api/home/experience").json() == {"mode": "simple"}


def test_restricted_user_can_choose_mode_without_gaining_permissions(client):  # noqa: F811
    id = resident(client)
    client.put(
        f"/api/manage/accounts/{id}/access", json={"profile": "custom", "permissions": ["lights.view"]}
    )
    sign_in(client)
    for mode in ["simple", "normal", "advanced"]:
        assert client.put("/api/home/experience", json={"mode": mode}).status_code == 200
        assert client.get("/api/home").json()["permissions"] == ["lights.view"]
        assert client.get("/api/manage/accounts").status_code == 403
    client.headers.pop("x-csrf-token")
    assert client.put("/api/home/experience", json={"mode": "simple"}).status_code == 403


def test_language_is_personal_and_validated(client):  # noqa: F811
    resident(client)
    assert client.get("/api/home/language").json() == {"language": "nb"}
    assert client.put("/api/home/language", json={"language": "en"}).status_code == 200
    assert client.put("/api/home/language", json={"language": "bad"}).status_code == 422
    sign_in(client)
    assert client.get("/api/home/language").json() == {"language": "nb"}
    login(client)
    assert client.get("/api/home/language").json() == {"language": "en"}
    client.headers.pop("x-csrf-token")
    assert client.put("/api/home/language", json={"language": "nb"}).status_code == 403
