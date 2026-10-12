import os

import uvicorn

from .config import Settings
from .main import create_app


def main():
    settings = Settings()
    cert, key = settings.tls_cert, settings.tls_key
    if not settings.development and not settings.ingress and not (cert and key):
        raise SystemExit("Set SMARTI_TLS_CERT and SMARTI_TLS_KEY for LAN HTTPS")
    if settings.ingress:
        settings.ha_url = "http://supervisor/core"
        settings.ha_token = os.environ.get("SUPERVISOR_TOKEN", "")
    uvicorn.run(
        create_app(settings),
        host="127.0.0.1" if settings.development else "0.0.0.0",
        port=8099 if settings.ingress else 8443,
        proxy_headers=False,
        ssl_certfile=cert,
        ssl_keyfile=key,
        access_log=False,
    )


if __name__ == "__main__":
    main()
