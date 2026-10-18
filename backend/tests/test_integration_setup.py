from test_api import login
from test_management import client  # noqa: F401


def setup_fake(client):  # noqa: F811
    m = client.app.state.management
    m.demo = False
    calls = []

    async def rest(method, path, data=None, frontend_base=None):
        calls.append((method, path, data, frontend_base))
        if path.endswith("flow_handlers?type=integration"):
            return ["reolink"]
        if method == "DELETE":
            return {"message": "Flow aborted"}
        if data and data.get("password") == "correct":
            return {
                "type": "create_entry",
                "flow_id": "abc",
                "title": "Camera",
                "data": {"password": "secret"},
                "result": {"access_token": "secret"},
            }
        return {
            "type": "form",
            "flow_id": "abc",
            "step_id": "user",
            "data_schema": [{"name": "host", "type": "string", "required": True}],
            "errors": {"base": "invalid_auth"} if data and "password" in data else {},
        }

    async def ws(kind, **kwargs):
        return {
            "resources": {
                "component.reolink.title": "Reolink",
                "component.reolink.config.step.user.title": "Koble til",
            }
        }

    m.rest, m.ws = rest, ws
    return calls


def test_real_flow_transport_errors_completion_and_cancel(client):  # noqa: F811
    calls = setup_fake(client)
    assert client.get("/api/manage/integration-setup/catalog").json() == [
        {"domain": "reolink", "name": "Reolink"}
    ]
    assert client.post("/api/manage/integration-setup/flows", json={"domain": "../config"}).status_code == 422
    assert client.post("/api/manage/integration-setup/flows", json={"domain": "missing"}).status_code == 422
    started = client.post("/api/manage/integration-setup/flows", json={"domain": "reolink"}).json()
    assert started["step_id"] == "user"
    assert calls[-1][2] == {"handler": "reolink"}
    assert calls[-1][3] == client.headers["origin"]
    path = "/api/manage/integration-setup/flows/abc"
    assert client.post(path, json={"password": "wrong"}).json()["errors"] == {"base": "invalid_auth"}
    assert client.get(path).json()["type"] == "form"
    result = client.post(path, json={"password": "correct"}).json()
    assert result["type"] == "create_entry"
    assert "secret" not in str(result) and "result" not in result and "data" not in result
    assert client.post(path, json={}).status_code == 409
    before = len(calls)
    assert client.delete(path).status_code == 200
    assert len(calls) == before  # already complete: do not abort HA entry
    assert client.get(path).status_code == 404
    client.post("/api/manage/integration-setup/flows", json={"domain": "reolink"})
    assert client.delete(path).status_code == 200
    assert calls[-1][:2] == ("DELETE", "config/config_entries/flow/abc")


def test_flow_owner_admin_csrf_and_demo(client):  # noqa: F811
    assert client.get("/api/manage/integration-setup/catalog").status_code == 503
    setup_fake(client)
    assert (
        client.post(
            "/api/manage/integration-setup/flows", json={"domain": "reolink"}, headers={"x-csrf-token": "bad"}
        ).status_code
        == 403
    )
    client.post("/api/manage/integration-setup/flows", json={"domain": "reolink"})
    client.post("/api/logout")
    login(client)
    assert client.post("/api/manage/integration-setup/flows/abc", json={}).status_code == 404
    assert client.delete("/api/manage/integration-setup/flows/abc").status_code == 404
    client.post("/api/users", json={"name": "resident", "password": "another long password", "role": "user"})
    client.post("/api/logout")
    login(client, "resident", "another long password")
    assert client.get("/api/manage/integration-setup/catalog").status_code == 403
    assert client.post("/api/manage/integration-setup/flows", json={"domain": "reolink"}).status_code == 403


def test_discoveries_only_claim_discovery_flows_and_preserve_on_close(client):  # noqa: F811
    calls = setup_fake(client)
    m = client.app.state.management
    old_ws = m.ws

    async def ws(kind, **kwargs):
        if kind == "config_entries/flow/progress":
            return [
                {
                    "flow_id": "abc",
                    "handler": "reolink",
                    "context": {
                        "source": "zeroconf",
                        "title_placeholders": {"name": "Front door"},
                        "secret": "hidden",
                    },
                },
                {"flow_id": "manual", "handler": "reolink", "context": {"source": "user"}},
                {"flow_id": "repair", "handler": "reolink", "context": {"source": "reauth"}},
            ]
        return await old_ws(kind, **kwargs)

    m.ws = ws
    result = client.get("/api/manage/integration-setup/discoveries")
    assert result.status_code == 200
    assert result.json() == [{"id": "abc", "domain": "reolink", "name": "Front door", "source": "zeroconf"}]
    base = "/api/manage/integration-setup/"
    assert client.post(base + "discoveries/manual/claim", json={"domain": "reolink"}).status_code == 404
    assert client.post(base + "discoveries/abc/claim", json={"domain": "other"}).status_code == 404
    assert client.post(base + "bluetooth/abc/claim", json={"domain": "reolink"}).status_code == 404
    assert client.post(base + "discoveries/abc/claim", json={"domain": "reolink"}).status_code == 200
    assert client.delete(base + "flows/abc").status_code == 200
    assert not any(c[0] == "DELETE" for c in calls)
    client.post("/api/users", json={"name": "resident", "password": "another long password", "role": "user"})
    client.post("/api/logout")
    login(client, "resident", "another long password")
    assert client.get(base + "discoveries").status_code == 403


def test_all_ha_discovery_sources_are_listed_and_claimable(client):  # noqa: F811
    setup_fake(client)
    m = client.app.state.management
    old_ws = m.ws
    sources = ["integration_discovery", "hardware", "system", "import", "esphome"]

    async def ws(kind, **kwargs):
        if kind == "config_entries/flow/progress":
            return [
                {"flow_id": source, "handler": "reolink", "context": {"source": source}} for source in sources
            ]
        return await old_ws(kind, **kwargs)

    m.ws = ws
    assert [d["source"] for d in client.get("/api/manage/integration-setup/discoveries").json()] == sources
    for source in sources:
        assert (
            client.post(
                f"/api/manage/integration-setup/discoveries/{source}/claim", json={"domain": "reolink"}
            ).status_code
            == 200
        )


def test_reauthentication_is_separate_named_and_resumable(client):  # noqa: F811
    calls = setup_fake(client)
    m = client.app.state.management
    old_ws = m.ws

    async def ws(kind, **kwargs):
        if kind == "config_entries/flow/progress":
            return [
                {
                    "flow_id": "abc",
                    "handler": "reolink",
                    "context": {"source": "reauth", "entry_id": "camera"},
                }
            ]
        if kind == "config_entries/get":
            return [{"entry_id": "camera", "title": "Kamera ved inngangen"}]
        return await old_ws(kind, **kwargs)

    m.ws = ws
    base = "/api/manage/integration-setup/"
    assert client.get(base + "discoveries").json() == []
    assert client.get(base + "attention").json() == [
        {"id": "abc", "domain": "reolink", "source": "reauth", "name": "Kamera ved inngangen"}
    ]
    assert client.post(base + "discoveries/abc/claim", json={"domain": "reolink"}).status_code == 404
    assert client.post(base + "attention/abc/claim", json={"domain": "other"}).status_code == 404
    assert client.post(base + "attention/abc/claim", json={"domain": "reolink"}).status_code == 200
    assert client.delete(base + "flows/abc").status_code == 200
    assert not any(call[0] == "DELETE" for call in calls)
    client.post("/api/users", json={"name": "resident", "password": "another long password", "role": "user"})
    client.post("/api/logout")
    login(client, "resident", "another long password")
    assert client.get(base + "attention").status_code == 403
    assert client.post(base + "attention/abc/claim", json={"domain": "reolink"}).status_code == 403


def test_native_group_options_use_owned_options_flow(client):  # noqa: F811
    setup_fake(client)
    m = client.app.state.management
    m.ha.entities["light.group"] = {"platform": "group", "config_entry_id": "entry-group"}
    calls = []

    async def ws(kind, **kwargs):
        if kind == "config_entries/get":
            return [{"entry_id": "entry-group", "domain": "group"}]
        return {"resources": {"component.group.options.step.light.title": "Gruppemedlemmer"}}

    async def rest(method, path, data=None, frontend_base=None):
        calls.append((method, path, data))
        return {"type": "form", "flow_id": "options-id", "step_id": "light", "data_schema": []}

    m.ws, m.rest = ws, rest
    base = "/api/manage/integration-setup/"
    assert client.post(base + "group-options/light.missing", json={"domain": "group"}).status_code == 409
    response = client.post(base + "group-options/light.group", json={"domain": "group"})
    assert response.status_code == 200
    assert response.json()["translations"]["component.group.config.step.light.title"] == "Gruppemedlemmer"
    assert calls[-1] == ("POST", "config/config_entries/options/flow", {"handler": "entry-group"})
    assert client.post(base + "flows/options-id", json={"entities": ["light.one"]}).status_code == 200
    assert calls[-1][1] == "config/config_entries/options/flow/options-id"
    assert client.get(base + "flows/options-id").status_code == 200
    assert calls[-1][1] == "config/config_entries/options/flow/options-id"
    assert client.delete(base + "flows/options-id").status_code == 200
    assert calls[-1][:2] == ("DELETE", "config/config_entries/options/flow/options-id")
