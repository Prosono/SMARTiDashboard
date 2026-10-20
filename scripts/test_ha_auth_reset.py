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
from app.ha_auth_reset import OfflineAuthReset, create_first_owner

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
    with tempfile.TemporaryDirectory(prefix="smarti-ha-reset-") as work:
        root = Path(work)
        config = root / "config"
        config.mkdir()
        (config / "configuration.yaml").write_text("default_config:\n")
        created = False
        try:
            docker(
                "create",
                "--name",
                name,
                "--network",
                "none",
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
                        or info["HostConfig"]["NetworkMode"] != "none"
                    ):
                        raise RuntimeError("HA must be stopped and network-isolated")

                result = await OfflineAuthReset(
                    storage, root / "journal", guard
                ).execute()
                assert result["status"] == "awaiting_owner"
                docker("start", name)
                await ready()
                await create_first_owner(
                    client,
                    name="Disposable new owner",
                    username="newowner",
                    password=uuid.uuid4().hex,
                    client_id="http://localhost:8123/",
                )
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
                    "PASS: HA restarted, old owner/credentials removed, exactly one new owner created.",
                    flush=True,
                )
        finally:
            if created:
                docker("rm", "-f", name, check=False)


if __name__ == "__main__":
    asyncio.run(main())
