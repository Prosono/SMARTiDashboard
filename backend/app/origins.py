"""Exact local browser origins learned only from the authenticated Supervisor.

Never derive trust from Host/Forwarded/Origin headers or from an entire subnet.
Supervisor API: /core/info (port, ssl), /host/info, /network/info.
"""

import asyncio
import ipaddress
import logging
import re
import time
from urllib.parse import urlsplit

from fastapi import HTTPException

from .system_operations import Supervisor

_LAN = tuple(ipaddress.ip_network(n) for n in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fc00::/7"))
_LABEL = r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?"
_HOST = re.compile(rf"{_LABEL}(?:\.{_LABEL})*", re.ASCII)
log = logging.getLogger(__name__)


def canonical_origin(value):
    if not isinstance(value, str) or not value or len(value) > 2048:
        return None
    if any(c.isspace() or ord(c) < 33 or ord(c) == 127 for c in value) or any(c in value for c in "\\%?#"):
        return None
    try:
        url = urlsplit(value)
        host = url.hostname
        port = url.port
        if (
            url.scheme not in {"http", "https"}
            or not host
            or url.path
            or url.username is not None
            or url.password is not None
            or port == 0
            or url.netloc.endswith(":")
        ):
            return None
        try:
            address = ipaddress.ip_address(host)
            host = f"[{address}]" if address.version == 6 else str(address)
        except ValueError:
            if not _HOST.fullmatch(host):
                return None
        suffix = f":{port}" if port and port != (443 if url.scheme == "https" else 80) else ""
        return f"{url.scheme}://{host}{suffix}"
    except ValueError:
        return None


def local_origins(core, host, network):
    if not all(isinstance(v, dict) for v in (core, host, network)):
        return set()
    port, tls = core.get("port"), core.get("ssl")
    if type(port) is not int or not 1 <= port <= 65535 or type(tls) is not bool:
        return set()
    hosts = set()
    interfaces = network.get("interfaces")
    if not isinstance(interfaces, list):
        return set()
    for interface in interfaces:
        if (
            not isinstance(interface, dict)
            or interface.get("enabled") is not True
            or interface.get("connected") is not True
        ):
            continue
        if interface.get("type") not in ("ethernet", "wireless", "vlan"):
            continue
        for version in ("ipv4", "ipv6"):
            config = interface.get(version)
            addresses = config.get("address", []) if isinstance(config, dict) else []
            if not isinstance(addresses, list):
                continue
            for value in addresses:
                if not isinstance(value, str) or "%" in value:
                    continue
                try:
                    address = ipaddress.ip_interface(value).ip
                except ValueError:
                    continue
                if any(address in subnet for subnet in _LAN if address.version == subnet.version):
                    hosts.add(f"[{address}]" if address.version == 6 else str(address))
    # Only local names, and only when an active LAN interface was reported.
    if hosts:
        for key in ("hostname", "llmnr_hostname"):
            name = host.get(key)
            if isinstance(name, str) and _HOST.fullmatch(name.lower()):
                name = name.lower()
                if name in {"localhost", "localhost.local"}:
                    continue
                if "." not in name:
                    hosts.update((name, name + ".local"))
                elif name.endswith(".local"):
                    hosts.add(name)
    scheme = "https" if tls else "http"
    return {origin for h in hosts if (origin := canonical_origin(f"{scheme}://{h}:{port}"))}


class OriginPolicy:
    refresh_seconds = 60
    cache_seconds = 300

    def __init__(self, settings):
        self.settings = settings
        self.supervisor = Supervisor(settings)
        self.learned = set()
        self.expires = 0
        self.failed = False

    @property
    def enabled(self):
        return self.settings.ingress and self.settings.mode == "live" and self.settings.auto_local_origins

    def accepts(self, origin):
        if origin in self.settings.allowed_origins:
            return True
        return bool(
            self.enabled and time.monotonic() < self.expires and canonical_origin(origin) in self.learned
        )

    async def refresh(self):
        if not self.enabled:
            return
        try:
            values = await asyncio.wait_for(
                asyncio.gather(
                    *(
                        self.supervisor.request("GET", path)
                        for path in ("/core/info", "/host/info", "/network/info")
                    ),
                    return_exceptions=True,
                ),
                timeout=6,
            )
            if any(isinstance(value, BaseException) for value in values):
                raise HTTPException(503, "local_discovery_unavailable")
            self.learned = local_origins(*values)
            self.expires = time.monotonic() + self.cache_seconds
            self.failed = False
        except (HTTPException, TimeoutError, TypeError, ValueError, AttributeError):
            if not self.failed:
                log.warning("Local address discovery unavailable; explicit origins remain active")
            self.failed = True

    async def run(self):
        while True:
            await asyncio.sleep(self.refresh_seconds)
            await self.refresh()
