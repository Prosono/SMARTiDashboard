"""User-bound HLS relay. HA stream URLs and credentials never reach the browser."""

import asyncio
import re
import secrets
import time
from collections import OrderedDict
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response

from .ha import HAError


class CameraStreams:
    def __init__(self, ha, demo=False):
        self.ha, self.demo = ha, demo
        self.sessions = {}
        self.lock = asyncio.Lock()

    def prune(self):
        now = time.monotonic()
        self.sessions = {
            k: s for k, s in self.sessions.items() if now - s["used"] < 120 and now - s["created"] < 3600
        }

    def upstream_url(self, base, value):
        """Keep HA's canonical API paths behind the configured Supervisor prefix."""
        parsed = urlsplit(urljoin(base, value))
        upstream = urlsplit(self.ha.http_url)
        if (parsed.scheme, parsed.netloc) == (upstream.scheme, upstream.netloc) and parsed.path.startswith(
            "/api/hls/"
        ):
            parsed = parsed._replace(path=upstream.path + parsed.path.removeprefix("/api/"))
        return urlunsplit(parsed)

    async def start(self, entity_id, owner):
        async with self.lock:
            self.prune()
            if self.demo or not self.ha.connected:
                raise HTTPException(503, "live_stream_unavailable")
            if len(self.sessions) >= 32 or sum(s["owner"] == owner for s in self.sessions.values()) >= 4:
                raise HTTPException(429, "stream_limit")
            try:
                result = await self.ha.request("camera/stream", entity_id=entity_id, format="hls")
                source = self.upstream_url(self.ha.http_url, result["url"])
                parsed = urlsplit(source)
                base = urlsplit(self.ha.http_url)
                match = re.fullmatch(
                    r"(" + re.escape(base.path) + r"hls/[a-f0-9]+/)([\w-]+\.m3u8)", parsed.path
                )
                if (
                    (parsed.scheme, parsed.netloc) != (base.scheme, base.netloc)
                    or not match
                    or parsed.fragment
                ):
                    raise ValueError()
            except (HAError, TimeoutError, KeyError, TypeError, ValueError):
                raise HTTPException(503, "live_stream_unavailable") from None
            sid = secrets.token_urlsafe(24)
            now = time.monotonic()
            self.sessions[sid] = {
                "owner": owner,
                "entity_id": entity_id,
                "root": match[1],
                "created": now,
                "used": now,
                "resources": OrderedDict(),
            }
            rid = self.resource(self.sessions[sid], source, source)
            return {"id": sid, "path": f"home/camera-stream/{sid}/{rid}"}

    def session(self, sid, owner):
        self.prune()
        s = self.sessions.get(sid)
        if not s or s["owner"] != owner:
            raise HTTPException(404, "stream_expired")
        s["used"] = time.monotonic()
        return s

    def resource(self, session, base, value):
        url = self.upstream_url(base, value)
        parsed, upstream = urlsplit(url), urlsplit(self.ha.http_url)
        suffix = parsed.path.removeprefix(session["root"])
        if (
            (parsed.scheme, parsed.netloc) != (upstream.scheme, upstream.netloc)
            or not parsed.path.startswith(session["root"])
            or parsed.fragment
            or not re.fullmatch(r"[\w/.-]+\.(?:m3u8|mp4|m4s|ts)", suffix)
            or ".." in suffix
            or parsed.username
        ):
            raise HTTPException(502, "invalid_stream_resource")
        resources = session["resources"]
        for rid, known in resources.items():
            if known == url:
                resources.move_to_end(rid)
                return rid
        rid = secrets.token_urlsafe(18)
        resources[rid] = url
        while len(resources) > 512:
            resources.popitem(last=False)
        return rid

    async def fetch(self, session, rid, query):
        source = session["resources"].get(rid)
        if not source:
            raise HTTPException(404, "stream_resource_expired")
        params = dict(query)
        if any(
            k not in {"_HLS_msn", "_HLS_part", "_HLS_skip"} or not re.fullmatch(r"\d{1,12}|YES|v2", v)
            for k, v in params.items()
        ):
            raise HTTPException(422, "invalid_stream_query")
        parsed = urlsplit(source)
        url = urlunsplit(parsed._replace(query=urlencode(dict(parse_qsl(parsed.query)) | params)))
        playlist = parsed.path.endswith(".m3u8")
        limit = 512_000 if playlist else 16_000_000
        try:
            async with httpx.AsyncClient(timeout=25, follow_redirects=False, trust_env=False) as client:
                async with client.stream(
                    "GET", url, headers={"Authorization": "Bearer " + self.ha.token}
                ) as upstream:
                    if upstream.status_code != 200:
                        raise HAError("stream_unavailable")
                    data = bytearray()
                    async for chunk in upstream.aiter_bytes():
                        data.extend(chunk)
                        if len(data) > limit:
                            raise HAError("stream_too_large")
        except (httpx.HTTPError, HAError):
            raise HTTPException(502, "stream_unavailable") from None
        if not playlist:
            return bytes(data), "video/mp2t" if parsed.path.endswith(".ts") else "video/mp4"
        try:
            manifest = data.decode("utf-8")
            if not manifest.startswith("#EXTM3U"):
                raise ValueError()
            rewritten = []
            for line in manifest.splitlines():
                if line and not line.startswith("#"):
                    line = self.resource(session, source, line.strip())
                elif "URI=" in line:
                    line = re.sub(
                        r'URI="([^"]+)"', lambda m: 'URI="' + self.resource(session, source, m[1]) + '"', line
                    )
                rewritten.append(line)
            return ("\n".join(rewritten) + "\n").encode(), "application/vnd.apple.mpegurl"
        except (UnicodeDecodeError, ValueError):
            raise HTTPException(502, "invalid_stream_playlist") from None


def camera_router(ha, user, settings):
    router = APIRouter(prefix="/api/home")
    streams = CameraStreams(ha, settings.mode == "demo")

    def owner(current):
        return current["id"], current["csrf"]

    def available(entity):
        c = next((c for c in ha.controls() if c.id == entity or c.entity_id == entity), None)
        if not c or c.domain != "camera":
            raise HTTPException(404, "camera_not_found")
        if c.availability != "available" or not ha.connected:
            raise HTTPException(503, "camera_unavailable")
        return c

    @router.post("/camera/{id}/live")
    async def start(id: str, current=Depends(user)):
        return await streams.start(available(id).entity_id, owner(current))

    @router.get("/camera-stream/{sid}/{rid}")
    async def resource(sid: str, rid: str, request: Request, current=Depends(user)):
        session = streams.session(sid, owner(current))
        available(session["entity_id"])
        data, media = await streams.fetch(session, rid, request.query_params)
        return Response(data, media_type=media, headers={"Cache-Control": "private, no-store"})

    @router.delete("/camera-stream/{sid}")
    async def stop(sid: str, current=Depends(user)):
        streams.session(sid, owner(current))
        streams.sessions.pop(sid, None)
        return {"stopped": True}

    return router
