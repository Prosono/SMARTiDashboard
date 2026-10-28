"""Version-specific release gate for HA Core, OS and Supervisor."""

import asyncio
import re
import time

import httpx

from .certificate_hook import read_identity
from .remote_access import CLOUD_ORIGIN

COMPONENTS = {"core": "SMARTi Core", "os": "SMARTi OS", "supervisor": "SMARTi Supervisor"}


def component(ha, entity_id, attributes):
    entry = getattr(ha, "entities", {}).get(entity_id, {})
    unique = entry.get("unique_id", "")
    if entry.get("platform") == "hassio":
        for key, prefix in (
            ("core", "home_assistant_core"),
            ("os", "home_assistant_os"),
            ("supervisor", "home_assistant_supervisor"),
            ("core", "homeassistant"),
            ("os", "hassos"),
            ("supervisor", "supervisor"),
        ):
            if unique in {prefix, prefix + "_version_latest", prefix + "_update"}:
                return key
    # Legacy registries and default HA display titles. User-assigned friendly names
    # do not replace the integration's title attribute.
    title = str(attributes.get("title", "")).lower().strip()
    return {
        "home assistant core": "core",
        "home assistant operating system": "os",
        "home assistant os": "os",
        "home assistant supervisor": "supervisor",
    }.get(title)


class UpdateApproval:
    def __init__(self, settings, ha, transport=None):
        self.settings, self.ha, self.transport = settings, ha, transport
        self.allowed = set()
        self.checked = 0
        self.lock = asyncio.Lock()

    async def refresh(self, force=False):
        if self.settings.mode == "demo":
            return
        async with self.lock:
            if not force and time.monotonic() - self.checked < 60:
                return
            self.allowed = set()  # Never keep stale approvals after a failed check.
            try:
                async with httpx.AsyncClient(timeout=8, trust_env=False, transport=self.transport) as client:
                    candidates = []
                    installed = {}
                    for eid, state in self.ha.states.items():
                        a = state.get("attributes", {})
                        key = component(self.ha, eid, a) if eid.startswith("update.") else None
                        installed_key = key
                        if eid.startswith("update.") and str(a.get("title", "")).strip().lower() == "smarti":
                            installed_key = "smarti"
                        current = a.get("installed_version")
                        if (
                            installed_key
                            and isinstance(current, str)
                            and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._+\-]{0,99}", current)
                            and current.lower() not in {"unknown", "unavailable"}
                        ):
                            installed[installed_key] = current
                        version = a.get("latest_version")
                        if (
                            key
                            and isinstance(version, str)
                            and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._+\-]{0,99}", version)
                        ):
                            candidates.append({"component": key, "version": version})
                    if self.settings.remote_identity_file:
                        home, credential = read_identity(self.settings.remote_identity_file)
                        report = await client.post(
                            CLOUD_ORIGIN + f"/api/hubs/{home}/update-candidates",
                            headers={"Authorization": "Bearer " + credential},
                            json={
                                "releases": candidates[:10],
                                "installed": [{"component": k, "version": v} for k, v in installed.items()],
                            },
                        )
                        report.raise_for_status()
                    response = await client.get(CLOUD_ORIGIN + "/api/releases/approved")
                    response.raise_for_status()
                    self.allowed = {(r["component"], r["version"]) for r in response.json()["releases"]}
            except (httpx.HTTPError, OSError, ValueError, KeyError, TypeError):
                self.allowed = set()
            self.checked = time.monotonic()

    def approved(self, key, version):
        return self.settings.mode == "demo" or (
            time.monotonic() - self.checked < 120 and (key, version) in self.allowed
        )

    async def run(self):
        while True:
            await self.refresh()
            await asyncio.sleep(60)
