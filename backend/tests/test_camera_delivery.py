import asyncio
from types import SimpleNamespace

import httpx
import pytest
from app.camera_stream import CameraStreams
from fastapi import HTTPException


async def camera():
    async def request(kind, **data):
        assert kind == "camera/stream" and data["_timeout"] == 30
        return {"url": "/api/hls/abcdef/master_playlist.m3u8"}

    streams = CameraStreams(
        SimpleNamespace(
            connected=True, http_url="http://ha/api/", token="private-camera-bearer", request=request
        )
    )
    started = await streams.start("camera.test", (1, "session"))
    session = streams.session(started["id"], (1, "session"))
    rid = streams.resource(session, "http://ha/api/hls/abcdef/master_playlist.m3u8", "segment/1.m4s")
    await streams.client.aclose()
    return streams, session, rid


async def test_media_first_bytes_arrive_before_the_upstream_segment_finishes():
    streams, session, rid = await camera()
    gate, closed = asyncio.Event(), asyncio.Event()

    class Video(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield b"first-fragment"
            await gate.wait()
            yield b"last-fragment"

        async def aclose(self):
            closed.set()

    streams.client = httpx.AsyncClient(
        transport=httpx.MockTransport(lambda _: httpx.Response(200, stream=Video()))
    )
    try:
        response = await streams.media(session, rid, {})
        iterator = response.body_iterator
        assert await asyncio.wait_for(anext(iterator), 0.5) == b"first-fragment"
        assert not gate.is_set()
        await iterator.aclose()
        assert closed.is_set()  # Dismissal releases the upstream socket immediately.
    finally:
        gate.set()
        await streams.close()


async def test_native_and_low_latency_byte_ranges_are_forwarded_without_credentials_leaking():
    streams, session, rid = await camera()
    observed = []

    def reply(request):
        observed.append(request)
        return httpx.Response(206, content=b"init", headers={"Content-Range": "bytes 10-13/100"})

    streams.client = httpx.AsyncClient(transport=httpx.MockTransport(reply))
    try:
        response = await streams.media(session, rid, {"_HLS_part": "1"}, "bytes=10-13")
        assert response.status_code == 206
        assert response.headers["content-range"] == "bytes 10-13/100"
        assert response.headers["cache-control"] == "private, no-store"
        assert b"".join([chunk async for chunk in response.body_iterator]) == b"init"
        assert observed[0].headers["range"] == "bytes=10-13"
        assert observed[0].headers["authorization"] == "Bearer private-camera-bearer"
        assert "private-camera-bearer" not in str(response.headers)
        with pytest.raises(HTTPException) as error:
            await streams.media(session, rid, {}, "bytes=0-1,4-5")
        assert error.value.status_code == 422
        assert len(observed) == 1
    finally:
        await streams.close()


async def test_future_part_not_ready_returns_404_and_invalid_partial_response_is_rejected():
    streams, session, rid = await camera()
    status = 404
    streams.client = httpx.AsyncClient(
        transport=httpx.MockTransport(lambda _: httpx.Response(status, content=b"part"))
    )
    try:
        with pytest.raises(HTTPException) as error:
            await streams.media(session, rid, {})
        assert error.value.status_code == 404
        status = 206
        with pytest.raises(HTTPException) as error:
            await streams.media(session, rid, {}, "bytes=0-3")
        assert error.value.status_code == 502
    finally:
        await streams.close()
