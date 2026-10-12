"""Honest setup capability boundary, before any radio-specific implementation."""

from typing import Literal, Protocol

from pydantic import BaseModel


class SetupSupport(BaseModel):
    id: str
    status: Literal["supported", "unsupported", "requires_setup", "requires_external_flow"]
    operations: list[str]
    verified_versions: list[str]
    reason: str


class DeviceSetupProvider(Protocol):
    def support(self) -> SetupSupport: ...


class ExternalHASetup:
    def __init__(self, provider_id: str):
        self.provider_id = provider_id

    def support(self):
        return SetupSupport(
            id=self.provider_id,
            status="requires_external_flow",
            operations=[],
            verified_versions=[],
            reason="setup_in_home_assistant",
        )


PROVIDERS: list[DeviceSetupProvider] = [
    ExternalHASetup(p) for p in ["zwave_js", "zha", "zigbee2mqtt", "matter"]
]
