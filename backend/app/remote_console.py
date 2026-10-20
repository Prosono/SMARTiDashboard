"""Isolated HA browser origin, reached only after a local SMARTi admin handoff.

The relay still carries opaque TLS. No Supervisor token is injected into browser
requests; HA's own authentication and ingress session remain required.
"""

import asyncio
import contextlib
import secrets
import time
from http.cookies import SimpleCookie
from urllib.parse import urlsplit

import httpx
from fastapi import HTTPException
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, StreamingResponse
from starlette.websockets import WebSocket, WebSocketDisconnect
from websockets.asyncio.client import connect
from websockets.exceptions import WebSocketException

COOKIE = "__Host-smarti_console"
HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "host",
    "content-length",
}
LAUNCH = """<!doctype html><html lang="nb"><meta charset="utf-8"><title>SMARTi · Home Assistant</title>
<body><p id="status">Kobler til Home Assistant …</p><script nonce="NONCE">
(async()=>{const ticket=location.hash.slice(1);history.replaceState(null,'','/_smarti/launch');
try {const r=await fetch('/_smarti/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticket})});
if(!r.ok)throw Error();const v=await r.json();location.replace(v.path);}
catch {document.getElementById('status').textContent='Tilgangen har utløpt. Lukk visningen og åpne den på nytt fra SMARTi.';}})();
</script></body></html>"""


class RemoteConsole:
    def __init__(self, home_origin, auth, *, upstream="http://homeassistant:8123", transport=None):
        self.home_origin, self.auth = home_origin, auth
        self.origin = home_origin.replace("https://", "https://ha-", 1)
        self.upstream = upstream.rstrip("/")
        self.transport = transport
        self.tickets, self.sessions = {}, {}
        self.customer_validator = None

    def prune(self):
        for entries in (self.tickets, self.sessions):
            for key, value in list(entries.items()):
                if value[0] < time.time():
                    entries.pop(key, None)

    def admin(self, token):
        if self.auth.session(token)["role"] != "admin":
            raise HTTPException(403, "admin_required")

    async def validate(self, token):
        if isinstance(token, tuple) and token[0] == "customer":
            if self.customer_validator is None:
                raise HTTPException(401, "customer_session_expired")
            await self.customer_validator(token[1])
        else:
            self.admin(token)

    async def launch_customer(self, token, path):
        principal = ("customer", token)
        await self.validate(principal)
        return self.ticket(principal, path)

    def launch(self, token, path):
        self.admin(token)
        return self.ticket(token, path)

    def ticket(self, token, path):
        self.prune()
        if len(self.tickets) >= 128:
            raise HTTPException(429, "too_many_console_requests")
        ticket = secrets.token_urlsafe(32)
        self.tickets[ticket] = (time.time() + 60, token, path)
        return self.origin + "/_smarti/launch#" + ticket

    async def authorize(self, cookies):
        self.prune()
        value = self.sessions.get(cookies.get(COOKIE, ""))
        if not value:
            raise HTTPException(401, "console_session_expired")
        await self.validate(value[1])
        return value[1]

    def headers(self, incoming):
        blocked = HOP | {"origin", "referer", "cookie"}
        result = [
            (k, v)
            for k, v in incoming.items()
            if k.lower() not in blocked
            and not k.lower().startswith(("x-forwarded-", "x-ingress-", "x-smarti-", "sec-websocket-"))
            and k.lower() != "forwarded"
        ]
        cookie = SimpleCookie()
        cookie.load(incoming.get("cookie", ""))
        safe = "; ".join(
            m.OutputString()
            for k, m in cookie.items()
            if not k.lower().startswith(("smarti", "__host-smarti"))
        )
        if safe:
            result.append(("cookie", safe))
        return result

    async def __call__(self, scope, receive, send):
        if scope["type"] == "websocket":
            await self.websocket(scope, receive, send)
            return
        request = Request(scope, receive)
        try:
            if request.url.scheme != "https" or request.headers.getlist("host") != [
                urlsplit(self.origin).netloc
            ]:
                raise HTTPException(403, "console_transport_rejected")
            if request.method not in {"GET", "HEAD", "OPTIONS"} and request.headers.getlist("origin") != [
                self.origin
            ]:
                raise HTTPException(403, "console_origin_rejected")
            path = request.url.path
            if path == "/_smarti/launch" and request.method == "GET":
                nonce = secrets.token_urlsafe(24)
                response = HTMLResponse(
                    LAUNCH.replace("NONCE", nonce),
                    headers={
                        "Content-Security-Policy": f"default-src 'none'; script-src 'nonce-{nonce}'; connect-src 'self'; frame-ancestors {self.home_origin}; base-uri 'none'",
                    },
                )
            elif path == "/_smarti/session" and request.method == "POST":
                body = bytearray()
                async for chunk in request.stream():
                    body.extend(chunk)
                    if len(body) > 1024:
                        raise HTTPException(413, "request_too_large")
                try:
                    import json

                    ticket = json.loads(body).get("ticket", "")
                    value = self.tickets.pop(ticket, None)
                except (ValueError, AttributeError, TypeError):
                    value = None
                if not value or value[0] < time.time():
                    raise HTTPException(401, "console_ticket_expired")
                await self.validate(value[1])
                self.prune()
                if len(self.sessions) >= 128:
                    raise HTTPException(429, "too_many_console_sessions")
                key = secrets.token_urlsafe(48)
                self.sessions[key] = (time.time() + 3600, value[1])
                response = JSONResponse({"path": value[2]})
                response.set_cookie(
                    COOKIE, key, secure=True, httponly=True, samesite="strict", max_age=3600, path="/"
                )
            else:
                await self.authorize(request.cookies)
                response = await self.proxy(request)
        except HTTPException as exc:
            response = JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
        response.headers["Cache-Control"] = "no-store"
        response.headers["Referrer-Policy"] = "no-referrer"
        await response(scope, receive, send)

    async def proxy(self, request):
        client = httpx.AsyncClient(
            transport=self.transport,
            trust_env=False,
            follow_redirects=False,
            timeout=httpx.Timeout(30, read=120),
        )
        url = self.upstream + request.url.path + ("?" + request.url.query if request.url.query else "")
        headers = self.headers(request.headers) + [("host", urlsplit(self.origin).netloc)]
        if request.headers.get("origin"):
            headers.append(("origin", self.origin))
        try:
            upstream = await client.send(
                client.build_request(request.method, url, headers=headers, content=request.stream()),
                stream=True,
            )
        except httpx.HTTPError:
            await client.aclose()
            raise HTTPException(502, "home_assistant_unavailable") from None

        async def body():
            try:
                async for chunk in upstream.aiter_raw():
                    yield chunk
            finally:
                await upstream.aclose()
                await client.aclose()

        response = StreamingResponse(body(), status_code=upstream.status_code)
        response.raw_headers = [
            (k, v)
            for k, v in upstream.headers.raw
            if k.decode().lower()
            not in HOP | {"x-frame-options", "content-security-policy", "set-cookie", "location"}
        ]
        for cookie in upstream.headers.get_list("set-cookie"):
            parsed = SimpleCookie()
            parsed.load(cookie)
            for name, morsel in parsed.items():
                if name.lower().startswith(("smarti", "__host-smarti")):
                    continue
                morsel["domain"] = ""
                morsel["secure"] = True
                response.headers.append("set-cookie", morsel.OutputString())
        if "location" in upstream.headers:
            location = upstream.headers["location"]
            if location.startswith(self.upstream + "/"):
                location = self.origin + location[len(self.upstream) :]
            response.headers["location"] = location
        response.headers["Content-Security-Policy"] = f"frame-ancestors 'self' {self.home_origin}"
        return response

    async def websocket(self, scope, receive, send):
        ws = WebSocket(scope, receive, send)
        try:
            if (
                ws.url.scheme != "wss"
                or ws.headers.getlist("host") != [urlsplit(self.origin).netloc]
                or ws.headers.getlist("origin") != [self.origin]
            ):
                raise HTTPException(403)
            await self.authorize(ws.cookies)
        except HTTPException:
            await ws.close(code=1008)
            return
        url = (
            self.upstream.replace("http", "ws", 1)
            + ws.url.path
            + ("?" + ws.url.query if ws.url.query else "")
        )
        try:
            async with connect(
                url,
                proxy=None,
                origin=self.origin,
                additional_headers=self.headers(ws.headers),
                subprotocols=scope.get("subprotocols") or None,
                max_size=8 * 1024 * 1024,
                open_timeout=15,
                close_timeout=3,
            ) as upstream:
                await ws.accept(subprotocol=upstream.subprotocol)

                async def outward():
                    while True:
                        event = await ws.receive()
                        if event["type"] == "websocket.disconnect":
                            return
                        await self.authorize(ws.cookies)
                        await upstream.send(
                            event.get("text") if event.get("text") is not None else event["bytes"]
                        )

                async def inward():
                    async for message in upstream:
                        await self.authorize(ws.cookies)
                        if isinstance(message, bytes):
                            await ws.send_bytes(message)
                        else:
                            await ws.send_text(message)

                async def validity():
                    while True:
                        await asyncio.sleep(5)
                        await self.authorize(ws.cookies)

                tasks = [asyncio.create_task(fn()) for fn in (outward, inward, validity)]
                try:
                    done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                    for task in done:
                        task.result()
                finally:
                    for task in tasks:
                        task.cancel()
                    await asyncio.gather(*tasks, return_exceptions=True)
        except (HTTPException, OSError, WebSocketException, WebSocketDisconnect, RuntimeError):
            pass
        finally:
            with contextlib.suppress(RuntimeError, OSError):
                await ws.close(code=1000)


class ConsoleRouter:
    def __init__(self, app, console):
        self.app, self.console = app, console

    async def __call__(self, scope, receive, send):
        host = dict(scope.get("headers", [])).get(b"host", b"").decode()
        target = self.console if host == urlsplit(self.console.origin).netloc else self.app
        await target(scope, receive, send)
