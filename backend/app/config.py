from pathlib import Path
from typing import Literal

from pydantic import Field
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
    zigbee2mqtt_base_topic: str = "zigbee2mqtt"
    zigbee2mqtt_transport: Literal["ha_mqtt", "frontend"] = "ha_mqtt"
    zigbee2mqtt_server: str = ""
    zigbee2mqtt_auth_token: str = Field(default="", repr=False)
    mobile_enabled: bool = False
    mobile_url: str = ""
    session_hours: int = 12
    tls_cert: str | None = None
    tls_key: str | None = None

    @property
    def database(self):
        self.data_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        return self.data_dir / f"smarti-{self.mode}.sqlite3"

    def validate_runtime(self):
        from urllib.parse import urlparse

        if self.zigbee2mqtt_transport == "frontend":
            server = urlparse(self.zigbee2mqtt_server)
            if (
                server.scheme not in {"http", "https"}
                or not server.hostname
                or server.username
                or server.password
                or server.query
                or server.fragment
                or server.port == 0
            ):
                raise ValueError(
                    "Zigbee2MQTT server must be an HTTP(S) frontend URL without credentials or query"
                )

        topic = self.zigbee2mqtt_base_topic
        if not topic or len(topic) > 200 or any(c in topic for c in "#+\x00") or topic.endswith("/"):
            raise ValueError("Invalid Zigbee2MQTT base topic")

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
