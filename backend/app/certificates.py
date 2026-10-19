"""Bounded automatic certificate issuance; all ACME keys remain on this hub."""

import asyncio
import os
import shlex
import ssl
import sys
from pathlib import Path

from .certificate_hook import read_identity

PRODUCTION = "https://acme-v02.api.letsencrypt.org/directory"
STAGING = "https://acme-staging-v02.api.letsencrypt.org/directory"


class Certificates:
    def __init__(self, identity_file, directory, *, staging=False):
        self.identity_file = Path(identity_file).resolve()
        self.home, _ = read_identity(self.identity_file)
        self.hostname = f"{self.home}.home.smarti.dev"
        # Test certificates and production keys must never share lineage/account state.
        self.directory = Path(directory).resolve() / ("staging" if staging else "production")
        self.server = STAGING if staging else PRODUCTION
        self._lock = asyncio.Lock()

    @property
    def cert(self):
        return self.directory / "config" / "live" / self.hostname / "fullchain.pem"

    @property
    def key(self):
        return self.cert.with_name("privkey.pem")

    def context(self):
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.minimum_version = ssl.TLSVersion.TLSv1_2
        context.load_cert_chain(self.cert, self.key)
        return context

    def command(self):
        hook = shlex.join([sys.executable, "-m", "app.certificate_hook"])
        return [
            sys.executable,
            "-c",
            "from certbot.main import main; raise SystemExit(main())",
            "certonly",
            "--manual",
            "--preferred-challenges",
            "http",
            "--manual-auth-hook",
            hook + " auth",
            "--manual-cleanup-hook",
            hook + " cleanup",
            "--non-interactive",
            "--agree-tos",
            "--register-unsafely-without-email",
            "--keep-until-expiring",
            "--key-type",
            "ecdsa",
            "--server",
            self.server,
            "--cert-name",
            self.hostname,
            "-d",
            self.hostname,
            "--config-dir",
            str(self.directory / "config"),
            "--work-dir",
            str(self.directory / "work"),
            "--logs-dir",
            str(self.directory / "logs"),
        ]

    async def ensure(self):
        async with self._lock:
            self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
            os.chmod(self.directory, 0o700)
            env = {**os.environ, "SMARTI_REMOTE_IDENTITY_FILE": str(self.identity_file)}
            process = await asyncio.create_subprocess_exec(
                *self.command(),
                env=env,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            try:
                await asyncio.wait_for(process.wait(), 180)
            finally:
                if process.returncode is None:
                    process.kill()
                    await process.wait()
            if process.returncode != 0:
                raise RuntimeError("Certificate issuance or renewal failed")
            self.context()  # Refuse invalid or mismatched certificate/key pairs.
