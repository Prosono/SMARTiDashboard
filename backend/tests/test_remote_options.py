import json
import stat
import uuid

import pytest
from app.remote_options import configure_remote_identity


def test_supervisor_options_write_private_identity_and_support_rotation(tmp_path):
    home = str(uuid.uuid4())
    options = {"remote_installation_id": " " + home + " ", "remote_credential": "k" * 64}
    path = configure_remote_identity(options, tmp_path)
    assert json.loads(path.read_text()) == {"installation_id": home, "credential": "k" * 64}
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert configure_remote_identity({}, tmp_path) == path
    configure_remote_identity({**options, "remote_credential": "r" * 64}, tmp_path)
    assert json.loads(path.read_text())["credential"] == "r" * 64
    assert list(tmp_path.glob(".remote-identity-*")) == []


@pytest.mark.parametrize(
    "home,key",
    [
        ("", "x" * 64),
        (str(uuid.uuid4()), ""),
        ("../other", "x" * 64),
        (str(uuid.uuid4()), "bad\nkey"),
        (None, "x" * 64),
    ],
)
def test_invalid_options_do_not_replace_existing_identity(tmp_path, home, key):
    path = tmp_path / "remote-identity.json"
    path.write_text("existing")
    with pytest.raises(ValueError) as error:
        configure_remote_identity({"remote_installation_id": home, "remote_credential": key}, tmp_path)
    if key:
        assert key not in str(error.value)
    assert path.read_text() == "existing"


def test_failed_replace_preserves_identity_and_removes_temporary_key(tmp_path, monkeypatch):
    path = tmp_path / "remote-identity.json"
    path.write_text("existing")

    def fail(*args):
        raise OSError("test disk failure")

    monkeypatch.setattr("app.remote_options.os.replace", fail)
    with pytest.raises(OSError):
        configure_remote_identity(
            {"remote_installation_id": str(uuid.uuid4()), "remote_credential": "k" * 64}, tmp_path
        )
    assert path.read_text() == "existing"
    assert list(tmp_path.glob(".remote-identity-*")) == []


def test_unconfigured_upgrade_does_not_create_identity(tmp_path):
    assert configure_remote_identity({}, tmp_path) is None
    assert not (tmp_path / "remote-identity.json").exists()
