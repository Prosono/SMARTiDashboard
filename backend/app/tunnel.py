"""Bounded TCP multiplexing. Payload is the phone-to-home TLS byte stream.

O + 16-byte stream ID opens a stream; D + ID + bytes forwards data; C + ID closes.
No payload decoding, HTTP headers, credentials, retries or arbitrary destinations.
"""

import asyncio
import contextlib
import secrets

from websockets.exceptions import ConnectionClosed

MAX_STREAMS = 16
CHUNK = 32768


class Tunnel:
    def __init__(self, websocket, target=None):
        self.websocket = websocket
        self.target = target
        self.streams = {}
        self.tasks = set()

    async def send(self, frame):
        await asyncio.wait_for(self.websocket.send(frame), 10)

    async def add(self, reader, writer, stream_id=None):
        if len(self.streams) >= MAX_STREAMS:
            writer.close()
            return
        stream_id = stream_id or secrets.token_bytes(16)
        self.streams[stream_id] = writer
        if self.target is None:
            try:
                await self.send(b"O" + stream_id)
            except BaseException:
                self.streams.pop(stream_id, None)
                writer.close()
                raise
        task = asyncio.create_task(self.pump(stream_id, reader, writer))
        self.tasks.add(task)
        task.add_done_callback(self.tasks.discard)

    async def pump(self, stream_id, reader, writer):
        try:
            async with asyncio.timeout(300):
                while data := await asyncio.wait_for(reader.read(CHUNK), 30):
                    await self.send(b"D" + stream_id + data)
        except (TimeoutError, OSError, ConnectionClosed):
            pass
        finally:
            self.streams.pop(stream_id, None)
            writer.close()
            with contextlib.suppress(TimeoutError, OSError, ConnectionClosed):
                await self.send(b"C" + stream_id)

    async def receive(self):
        try:
            async for frame in self.websocket:
                if not isinstance(frame, bytes) or not 17 <= len(frame) <= CHUNK + 17:
                    await self.websocket.close(1008, "Invalid tunnel frame")
                    break
                kind, stream_id = frame[:1], frame[1:17]
                if kind == b"O" and len(frame) == 17 and self.target is not None:
                    if stream_id in self.streams or len(self.streams) >= MAX_STREAMS:
                        await self.websocket.close(1008, "Stream limit")
                        break
                    try:
                        reader, writer = await asyncio.wait_for(asyncio.open_connection(*self.target), 5)
                    except (OSError, TimeoutError):
                        await self.send(b"C" + stream_id)
                    else:
                        await self.add(reader, writer, stream_id)
                elif kind == b"D":
                    writer = self.streams.get(stream_id)
                    if writer:
                        try:
                            writer.write(frame[17:])
                            await asyncio.wait_for(writer.drain(), 10)
                        except (OSError, TimeoutError):
                            writer.close()
                elif kind == b"C" and len(frame) == 17:
                    writer = self.streams.pop(stream_id, None)
                    if writer:
                        writer.close()
                else:
                    await self.websocket.close(1008, "Invalid tunnel operation")
                    break
        except (OSError, TimeoutError, ConnectionClosed):
            pass
        finally:
            for writer in list(self.streams.values()):
                writer.close()
            tasks = list(self.tasks)
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            self.streams.clear()
