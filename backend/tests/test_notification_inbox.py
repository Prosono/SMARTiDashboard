import time
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.mobile_companion import Companion, companion_router
from app.mobile_push import MobilePush
from app.storage import Store


def fixture_store(tmp_path):
    store = Store(tmp_path / "inbox.sqlite")
    with store.connect() as db:
        db.execute("INSERT INTO users VALUES(1,'owner','unused','admin')")
        db.execute("INSERT INTO mobile_devices VALUES('phone',1,'Phone',?,?,0)", (time.time(), time.time()+3600))
    return store


async def test_inbox_persists_before_push_and_tracks_failure(tmp_path):
    store = fixture_store(tmp_path)
    companion = Companion(SimpleNamespace(store=store))
    companion.save("phone", {"push_token": "a" * 64, "push_environment": "production"})
    push = MobilePush(companion, None)
    push.cloud = AsyncMock(side_effect=HTTPException(503, "offline"))
    with pytest.raises(HTTPException):
        await push.deliver("phone", "Door", "Opened")
    with store.connect() as db:
        row = dict(db.execute("SELECT * FROM notification_inbox").fetchone())
    assert row["message"] == "Opened"
    assert row["delivery"] == "failed"
    assert row["read_at"] is None
    assert push.cloud.call_args.args[2]["notification_id"] == row["id"]


def test_inbox_list_read_and_detail_are_scoped_to_phone(tmp_path):
    store = fixture_store(tmp_path)
    with store.connect() as db:
        for id, device, created in [("mine", "phone", 10), ("older", "phone", 5), ("secret", "other", 20)]:
            db.execute("INSERT INTO notification_inbox(id,device_id,title,message,created) VALUES(?,?,?,?,?)", (id, device, "Title", "Message", created))
    app = FastAPI()
    app.include_router(companion_router(SimpleNamespace(store=store), lambda: {"device_id": "phone"}))
    with TestClient(app) as client:
        assert [r["id"] for r in client.get("/api/mobile/v1/inbox").json()] == ["mine", "older"]
        assert [r["id"] for r in client.get("/api/mobile/v1/inbox?before=10").json()] == ["older"]
        for path in ["secret", "missing"]:
            assert client.get(f"/api/mobile/v1/inbox/{path}").status_code == 404
            assert client.put(f"/api/mobile/v1/inbox/{path}/read").status_code == 404
        assert client.put("/api/mobile/v1/inbox/mine/read").status_code == 200
        before = client.get("/api/mobile/v1/inbox/mine").json()["read_at"]
        assert before is not None
        client.put("/api/mobile/v1/inbox/mine/read")
        assert client.get("/api/mobile/v1/inbox/mine").json()["read_at"] == before
