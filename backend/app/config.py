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
    additional_origins: list[str] = []
    allow_http_ingress: bool = False
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

        for value in self.allowed_origins:
            origin = urlparse(value)
            if (
                not origin.hostname
                or origin.username
                or origin.password
                or origin.path
                or origin.query
                or origin.fragment
                or "*" in value
                or origin.port == 0
            ):
                raise ValueError("Origins must contain only scheme, hostname and optional port")
            local_dev = self.development and origin.hostname in {"localhost", "127.0.0.1", "::1"}
            if origin.scheme != "https" and not (
                origin.scheme == "http" and (local_dev or (self.ingress and self.allow_http_ingress))
            ):
                raise ValueError("HTTPS required; HTTP Ingress must be explicitly enabled")
        if self.development and self.ingress:
            raise ValueError("Ingress cannot run in development mode")

    @property
    def allowed_origins(self) -> set[str]:
        return {self.origin, *self.additional_origins}
