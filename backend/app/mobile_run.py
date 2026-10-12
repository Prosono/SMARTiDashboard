"""Separate HTTPS-only listener; never weakens the Supervisor-only web listener."""

import uvicorn

from .config import Settings
from .main import create_app


def main():
    settings = Settings()
    if not settings.mobile_enabled or not (settings.tls_cert and settings.tls_key):
        raise SystemExit("Mobile pilot requires SMARTI_MOBILE_ENABLED and TLS certificate/key")
    uvicorn.run(
        create_app(settings, mobile_only=True),
        host="0.0.0.0",
        port=8444,
        ssl_certfile=settings.tls_cert,
        ssl_keyfile=settings.tls_key,
        proxy_headers=False,
        access_log=False,
        limit_concurrency=32,
    )


if __name__ == "__main__":
    main()
