"""Bonjour presence only; all authentication and setup remain on the HTTPS portal."""

import logging

from zeroconf import ServiceInfo
from zeroconf.asyncio import AsyncZeroconf

log = logging.getLogger(__name__)
SERVICE = "_smarti-setup._tcp.local."


class HubAdvertisement:
    def __init__(self):
        self.zeroconf = None
        self.info = None

    async def update(self, discovery):
        if not discovery:
            await self.close()
            return
        try:
            if self.zeroconf is None:
                self.zeroconf = AsyncZeroconf()
            # iPhone reads TXT via DNS-SD; it never connects to this HTTP port.
            info = ServiceInfo(
                SERVICE,
                f"SMARTi-{discovery['id']}.{SERVICE}",
                port=8099,
                server=f"smarti-{discovery['id']}.local.",
                properties={
                    "v": "1",
                    "state": "ready",
                    **{
                        k: v.encode("utf-8")[:180].decode("utf-8", errors="ignore")
                        for k, v in discovery.items()
                    },
                },
                host_ttl=60,
                other_ttl=60,
            )
            if self.info and self.info.name == info.name:
                await self.zeroconf.async_update_service(info)
            else:
                if self.info:
                    await self.zeroconf.async_unregister_service(self.info)
                await self.zeroconf.async_register_service(info)
            self.info = info
        except Exception:
            # Discovery must not stop cloud heartbeat or an approved setup operation.
            log.warning("Local discovery unavailable; QR setup remains available")
            await self.close()

    async def close(self):
        zc, self.zeroconf = self.zeroconf, None
        self.info = None
        if zc:
            await zc.async_close()
