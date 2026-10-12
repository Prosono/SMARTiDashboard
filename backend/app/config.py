from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SMARTI_", env_file=".env", extra="ignore")
    mode: Literal["demo", "live"] = "live"
    data_dir: Path = Path(".data")
    ha_url: str = ""
    ha_token: str = ""
    bootstrap_secret: str = ""
    origin: str = "https://localhost:8443"
    development: bool = False
    ingress: bool = False
    ingress_proxy: str = "172.30.32.2"
    static_dir: Path = Path("frontend/dist")
    session_hours: int = 12
    tls_cert: str | None = None
    tls_key: str | None = None

    @property
    def database(self):
        self.data_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        return self.data_dir / f"smarti-{self.mode}.sqlite3"

    def validate_runtime(self):
        from urllib.parse import urlparse

        origin = urlparse(self.origin)
        if origin.scheme != "https" and not (
            self.development and origin.hostname in {"localhost", "127.0.0.1", "::1"}
        ):
            raise ValueError("HTTPS required except explicit localhost development")
        if self.development and self.ingress:
            raise ValueError("Ingress cannot run in development mode")
