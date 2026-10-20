import json
from unittest.mock import AsyncMock

import httpx
import pytest
from app.ha_auth_reset import AuthResetError, OfflineAuthReset, create_first_owner, reset_documents


def fixture_documents():
    def doc(key, version, data):
        return {"key": key, "version": version, "minor_version": 1, "data": data}

    return {
        "auth": doc(
            "auth",
            1,
            {
                "users": [
                    {"id": "owner", "system_generated": False, "is_owner": True},
                    {"id": "supervisor", "system_generated": True, "is_owner": False},
                ],
                "groups": [{"id": "system-admin"}],
                "credentials": [{"user_id": "owner", "auth_provider_type": "homeassistant"}],
                "refresh_tokens": [
                    {"user_id": "owner", "token": "old-secret"},
                    {"user_id": "supervisor", "token": "service-secret"},
                ],
            },
        ),
        "auth_provider.homeassistant": doc(
            "auth_provider.homeassistant", 1, {"users": [{"username": "old", "password": "hash"}]}
        ),
        "onboarding": doc("onboarding", 4, {"done": ["user", "core_config", "integration", "analytics"]}),
        "auth_module.totp": doc("auth_module.totp", 1, {"users": {"owner": "mfa-secret"}}),
    }


def test_revoke_human_credentials_preserve_infrastructure_and_input():
    original = fixture_documents()
    result = reset_documents(original)
    assert len(original["auth"]["data"]["users"]) == 2
    auth = result["auth"]["data"]
    assert [u["id"] for u in auth["users"]] == ["supervisor"]
    assert auth["refresh_tokens"] == [{"user_id": "supervisor", "token": "service-secret"}]
    assert auth["credentials"] == []
    assert result["auth_provider.homeassistant"]["data"]["users"] == []
    assert result["auth_module.totp"]["data"]["users"] == {}
    assert result["onboarding"]["data"]["done"] == ["core_config", "integration", "analytics"]


@pytest.mark.parametrize("change", ["version", "provider", "missing", "unknown-field"])
def test_unknown_layout_fails_closed(change):
    docs = fixture_documents()
    if change == "version":
        docs["auth"]["version"] = 99
    elif change == "provider":
        docs["auth_provider.custom"] = {}
    elif change == "missing":
        del docs["onboarding"]
    else:
        docs["auth"]["data"]["future_credentials"] = []
    with pytest.raises(AuthResetError):
        reset_documents(docs)


def prepare(tmp_path):
    storage = tmp_path / ".storage"
    storage.mkdir()
    for name, doc in fixture_documents().items():
        (storage / name).write_text(json.dumps(doc))
    (storage / "core.config_entries").write_text("keep integrations")
    (tmp_path / "configuration.yaml").write_text("keep configuration")
    return storage


@pytest.mark.asyncio
async def test_offline_reset_preserves_apps_config_and_records_pending_owner(tmp_path):
    storage = prepare(tmp_path)
    journal = tmp_path / "journal"
    reset = OfflineAuthReset(storage, journal, AsyncMock())
    assert await reset.execute() == {"status": "awaiting_owner", "customer_users": 0}
    assert (storage / "core.config_entries").read_text() == "keep integrations"
    assert (tmp_path / "configuration.yaml").read_text() == "keep configuration"
    assert (journal / "accounts-cleared").read_text() == "awaiting-owner"
    assert (storage / "auth").stat().st_mode & 0o777 == 0o600
    assert all("secret" not in f.read_text() for f in journal.iterdir())
    with pytest.raises(AuthResetError, match="requires_recovery"):
        await reset.execute()


@pytest.mark.asyncio
async def test_running_ha_or_unprotected_network_cannot_mutate(tmp_path):
    storage = prepare(tmp_path)
    original = (storage / "auth").read_bytes()
    reset = OfflineAuthReset(
        storage, tmp_path / "journal", AsyncMock(side_effect=AuthResetError("not_isolated"))
    )
    with pytest.raises(AuthResetError, match="not_isolated"):
        await reset.execute()
    assert (storage / "auth").read_bytes() == original
    assert not reset.journal.exists()


@pytest.mark.asyncio
async def test_symlink_storage_is_rejected(tmp_path):
    storage = prepare(tmp_path)
    (storage / "auth").unlink()
    (storage / "auth").symlink_to(tmp_path / "configuration.yaml")
    with pytest.raises(AuthResetError, match="storage_invalid"):
        await OfflineAuthReset(storage, tmp_path / "journal", AsyncMock()).execute()
    assert (tmp_path / "configuration.yaml").read_text() == "keep configuration"


@pytest.mark.asyncio
async def test_interruption_blocks_replay(tmp_path):
    storage = prepare(tmp_path)
    guard = AsyncMock(side_effect=[None, None, None, AuthResetError("isolation_lost")])
    reset = OfflineAuthReset(storage, tmp_path / "journal", guard)
    with pytest.raises(AuthResetError, match="isolation_lost"):
        await reset.execute()
    assert (reset.journal / "state").exists()
    assert not (reset.journal / "accounts-cleared").exists()
    reset.guard = AsyncMock()
    with pytest.raises(AuthResetError, match="requires_recovery"):
        await reset.execute()


@pytest.mark.asyncio
@pytest.mark.parametrize("scenario", ["ok", "already_done", "lost_response", "not_confirmed"])
async def test_owner_creation_checked_no_blind_retry_or_secret_return(scenario):
    posts = []

    def handle(request):
        if request.method == "POST":
            posts.append(json.loads(request.content))
            if scenario == "lost_response":
                raise httpx.ReadTimeout("password must not escape", request=request)
            return httpx.Response(200, json={"auth_code": "secret-code"})
        done = scenario == "already_done" or (bool(posts) and scenario != "not_confirmed")
        return httpx.Response(200, json=[{"step": "user", "done": done}])

    async with httpx.AsyncClient(base_url="http://ha.test", transport=httpx.MockTransport(handle)) as client:
        if scenario == "ok":
            assert await create_first_owner(
                client, name="Owner", username="owner", password="new-secret", client_id="http://ha.test/"
            ) == {"status": "owner_created"}
        else:
            with pytest.raises(AuthResetError) as error:
                await create_first_owner(
                    client, name="Owner", username="owner", password="new-secret", client_id="http://ha.test/"
                )
            assert "secret" not in str(error.value)
        assert len(posts) == (0 if scenario == "already_done" else 1)
