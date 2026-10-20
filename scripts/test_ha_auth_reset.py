#!/usr/bin/env python3
"""Destructive integration test ONLY in a disposable, network-isolated HA container.

Run with .venv/bin/python scripts/test_ha_auth_reset.py after pulling the image.
Never accepts a hub hostname, existing container or existing configuration path.
"""

import asyncio
import json
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app.ha_auth_reset import create_first_owner
from app.full_reset import FullReset
from app.config import Settings
from app.storage import Store
from app.reset_credentials import seal

IMAGE = "ghcr.io/home-assistant/home-assistant:2026.10.2"
HTTP = """import json,sys,urllib.request,urllib.error
v=json.load(sys.stdin)
r=urllib.request.Request("http://127.0.0.1:8123"+v["path"],data=v["body"].encode() if v["body"] else None,method=v["method"],headers={"Content-Type":"application/json"})
try:
 with urllib.request.urlopen(r,timeout=10) as s: print(json.dumps({"status":s.status,"body":s.read().decode()}))
except urllib.error.HTTPError as e: print(json.dumps({"status":e.code,"body":e.read().decode()}))
"""


def docker(*args, input=None, check=True):
    return subprocess.run(
        ["docker", *args], input=input, text=True, capture_output=True, check=check
    )


async def main():
    name = "smarti-reset-test-" + uuid.uuid4().hex[:12]
    network = name + "-net"
    with tempfile.TemporaryDirectory(prefix="smarti-ha-reset-") as work:
        root = Path(work)
        config = root / "config"
        config.mkdir()
        (config / "configuration.yaml").write_text("default_config:\n")
        created = False
        network_created = False
        try:
            docker(
                "network",
                "create",
                "--internal",
                "--subnet",
                "172.30.32.0/23",
                "--gateway",
                "172.30.33.254",
                network,
            )
            network_created = True
            docker(
                "create",
                "--name",
                name,
                "--network",
                network,
                "--ip",
                "172.30.32.1",
                "--mount",
                f"type=bind,source={config},target=/config",
                IMAGE,
            )
            created = True
            docker("start", name)

            def request(request):
                result = docker(
                    "exec",
                    "-i",
                    name,
                    "python3",
                    "-c",
                    HTTP,
                    input=json.dumps(
                        {
                            "method": request.method,
                            "path": request.url.raw_path.decode(),
                            "body": request.content.decode(),
                        }
                    ),
                    check=False,
                )
                if result.returncode:
                    raise httpx.ConnectError("isolated_ha_not_ready")
                data = json.loads(result.stdout)
                return httpx.Response(data["status"], content=data["body"])

            async with httpx.AsyncClient(
                base_url="http://ha.test", transport=httpx.MockTransport(request)
            ) as client:

                async def ready():
                    deadline = time.monotonic() + 180
                    while time.monotonic() < deadline:
                        try:
                            r = await client.get("/api/onboarding")
                            if r.status_code == 200:
                                return
                        except httpx.HTTPError:
                            pass
                        await asyncio.sleep(2)
                    raise RuntimeError("Isolated HA did not start within 180 seconds")

                await ready()
                await create_first_owner(
                    client,
                    name="Disposable old owner",
                    username="oldowner",
                    password=uuid.uuid4().hex,
                    client_id="http://localhost:8123/",
                )
                docker("stop", "--time", "30", name)
                storage = config / ".storage"
                before = json.loads((storage / "auth").read_text())
                old_ids = {
                    u["id"]
                    for u in before["data"]["users"]
                    if not u["system_generated"]
                }
                assert old_ids

                async def guard():
                    info = json.loads(docker("inspect", name).stdout)[0]
                    if (
                        info["State"]["Running"]
                        or info["HostConfig"]["NetworkMode"] != network
                    ):
                        raise RuntimeError("HA must be stopped and network-isolated")

                # Model a configured hub with completed HA onboarding.
                onboarding = json.loads((storage / "onboarding").read_text())
                onboarding["data"]["done"] = [
                    "user",
                    "core_config",
                    "integration",
                    "analytics",
                ]
                (storage / "onboarding").write_text(json.dumps(onboarding))

                class DockerSupervisor:
                    def __init__(self):
                        self.info = {
                            "boot": True,
                            "watchdog": True,
                            "port": 8123,
                            "ssl": False,
                            "ip_address": "172.30.32.1",
                        }

                    async def request(self, method, path, data=None):
                        if path == "/core/options":
                            self.info.update(data)
                        if path == "/core/start":
                            docker("start", name)
                        if path == "/core/stop":
                            docker("stop", "--time", "30", name)
                        return dict(self.info)

                settings = Settings(
                    _env_file=None,
                    ingress=True,
                    data_dir=root / "smarti",
                    remote_identity_file=root / "identity",
                )
                store = Store(settings.database)
                with store.connect() as db:
                    db.execute(
                        "INSERT INTO users VALUES(1,'oldowner','oldhash','admin')"
                    )
                    db.execute(
                        "INSERT INTO sessions VALUES('old-session',1,'csrf',9999999999)"
                    )
                coordinator = FullReset(
                    settings,
                    store,
                    config,
                    DockerSupervisor(),
                    ha_transport=httpx.MockTransport(request),
                )
                coordinator.assert_stopped = guard
                messages = {}

                async def cloud(action, body=None):
                    messages[action] = body
                    return {"version": 1, "acknowledged": True}

                coordinator.cloud = cloud
                assert await coordinator.execute() == ("done", "")
                assert coordinator.state()["phase"] == "awaiting_owner"
                assert not json.loads(docker("inspect", name).stdout)[0]["State"][
                    "Running"
                ]
                with store.connect() as db:
                    assert db.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0
                reset_id = coordinator.state()["id"]
                plan = {
                    "reset_id": reset_id,
                    "username": "newowner",
                    "ha_credentials": seal(
                        messages["begin"]["public_key"],
                        reset_id,
                        "newowner",
                        uuid.uuid4().hex,
                    ),
                }
                await coordinator.bootstrap(plan)
                assert coordinator.state()["phase"] == "completed"
                docker("stop", "--time", "30", name)
                after = json.loads((storage / "auth").read_text())["data"]
                assert not old_ids & {u["id"] for u in after["users"]}
                assert len([u for u in after["users"] if u["is_owner"]]) == 1
                assert all(t["user_id"] not in old_ids for t in after["refresh_tokens"])
                accounts = json.loads(
                    (storage / "auth_provider.homeassistant").read_text()
                )["data"]["users"]
                assert [u["username"] for u in accounts] == ["newowner"]
                print(
                    "PASS: full coordinator erased HA and SMARTi users, restarted isolated HA, created a new owner and restored normal startup.",
                    flush=True,
                )
        finally:
            if created:
                docker("rm", "-f", name, check=False)
            if network_created:
                docker("network", "rm", network, check=False)


if __name__ == "__main__":
    asyncio.run(main())
