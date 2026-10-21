import importlib.util
import json
from pathlib import Path

import pytest

from app.factory_image import enrollment_bootstrap, initialize
from app.storage import Store

spec = importlib.util.spec_from_file_location(
    "prepare_factory_image", Path(__file__).parents[2] / "scripts/prepare_factory_image.py"
)
production = importlib.util.module_from_spec(spec)
spec.loader.exec_module(production)
MAC = "02:11:22:33:44:55"


def master(path):
    path.mkdir()
    Store(path / "smarti-live.sqlite3")
    (path / "options.json").write_text("{}")
    (path / "factory-reset-state.json").write_text(
        json.dumps({"phase": "awaiting_owner", "ownership": "release_owner", "recovery_user": "recovery"})
    )
    (path / "remote-identity.json").write_text("old credentials")
    (path / "enrollment-secret").write_text("old enrollment")
    return path


def test_operator_sealing_and_independent_clones(tmp_path):
    import shutil

    path = master(tmp_path / "master")
    production.prepare(path, MAC)
    assert (path / "remote-identity.json").exists()
    production.prepare(path, MAC, True)
    assert not (path / "remote-identity.json").exists()
    with pytest.raises(RuntimeError, match="Master-image"):
        initialize(path, {MAC})
    clones = [tmp_path / "one", tmp_path / "two"]
    for clone in clones:
        shutil.copytree(path, clone)
        initialize(clone, {"02:aa:bb:cc:dd:ee"})
    assert (clones[0] / "enrollment-secret").read_bytes() != (clones[1] / "enrollment-secret").read_bytes()
    assert enrollment_bootstrap(clones[0]) != enrollment_bootstrap(clones[1])
    before = {p.name: p.read_bytes() for p in clones[0].iterdir()}
    initialize(clones[0], {"02:aa:bb:cc:dd:ee"})
    assert before == {p.name: p.read_bytes() for p in clones[0].iterdir()}


def test_refuse_customer_or_unknown_hardware(tmp_path):
    path = master(tmp_path / "master")
    (path / "options.json").write_text('{"remote_credential":"secret"}')
    with pytest.raises(ValueError, match="konfigurasjon"):
        production.prepare(path, MAC, True)
    assert (path / "remote-identity.json").exists()
    (path / "options.json").write_text("{}")
    production.prepare(path, MAC, True)
    with pytest.raises(RuntimeError, match="nettverkskort"):
        initialize(path, set())


def test_preparation_rejects_users_and_retained_owner(tmp_path):
    path = master(tmp_path / "master")
    store = Store(path / "smarti-live.sqlite3")
    with store.connect() as db:
        db.execute("INSERT INTO users(name,password,role) VALUES('customer','hash','admin')")
    with pytest.raises(ValueError, match="brukere"):
        production.prepare(path, MAC, True)
    assert (path / "remote-identity.json").exists()
    with store.connect() as db:
        db.execute("DELETE FROM users")
    state = json.loads((path / "factory-reset-state.json").read_text())
    state["ownership"] = "keep_owner"
    (path / "factory-reset-state.json").write_text(json.dumps(state))
    with pytest.raises(ValueError, match="frigitt"):
        production.prepare(path, MAC, True)


def test_interrupted_first_boot_keeps_same_keys(tmp_path, monkeypatch):
    import app.factory_image as module

    path = master(tmp_path / "master")
    production.prepare(path, MAC, True)
    real_write = module._write_new

    def interrupted(file, content):
        if file.name == "factory-reset-key":
            raise OSError("power loss")
        real_write(file, content)

    monkeypatch.setattr(module, "_write_new", interrupted)
    with pytest.raises(OSError):
        initialize(path, {"02:aa:bb:cc:dd:ee"})
    secret = (path / "enrollment-secret").read_bytes()
    monkeypatch.setattr(module, "_write_new", real_write)
    initialize(path, {"02:aa:bb:cc:dd:ee"})
    assert (path / "enrollment-secret").read_bytes() == secret
    assert enrollment_bootstrap(path)
