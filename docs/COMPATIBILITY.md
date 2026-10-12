# Compatibility evidence — 2026-10-12

“Contract tested” means a local protocol simulator, never a real HA installation or physical hardware.

| Component / operation | Version / source | Verification | Limits |
|---|---|---|---|
| Python backend | Python 3.14.7; FastAPI 0.143.0; Pydantic 2.14.1; websockets 16.1.1; pwdlib 0.3.1 | Local API and WebSocket contract tests | No production certification |
| React UI | Exact npm graph in package-lock.json | TypeScript and production build; browser tests recorded in IMPLEMENTATION_STATUS | Local demo |
| SQLite | Python bundled SQLite; schema user_version=2 | Bootstrap transaction, session expiry/revocation and metadata tests | Whole-home roles |
| HA auth / get_states / subscribe_events / call_service | [Official WebSocket API](https://developers.home-assistant.io/docs/api/websocket/) | Protocol simulator, including stale snapshot race and reconnect | No real Core version verified |
| HA physical commands | [REST/service semantics](https://developers.home-assistant.io/docs/api/rest/) | Commands use call_service, never state-register writes | HA acknowledgment is not physical execution |
| HA area/device/entity registry list + events | [area source](https://github.com/home-assistant/core/blob/dev/homeassistant/components/config/area_registry.py), [device source](https://github.com/home-assistant/core/blob/dev/homeassistant/components/config/device_registry.py), [entity source](https://github.com/home-assistant/core/blob/dev/homeassistant/components/config/entity_registry.py) | Upstream source inspected; isolated in ha.py; protocol fixtures | Version-sensitive internal operations; requires privileged registry access, real-version matrix pending |
| Supervisor proxy | [App communication](https://developers.home-assistant.io/docs/apps/communication/) | Server configuration implemented | HAOS integration unverified |
| Ingress | [Presentation docs](https://developers.home-assistant.io/docs/apps/presentation/) | Proxy IP rejection, secure prefixed cookies tested | Real HA origin/prefix flow pending |
| App packaging | [Configuration docs](https://developers.home-assistant.io/docs/apps/configuration/) | Self-contained linux/amd64 and linux/arm64 Docker builds + isolated runtime smoke | No HAOS installation or physical hub test; no published image |
| Z-Wave / ZHA / Zigbee2MQTT / Matter setup | Existing HA flow | External-flow descriptors only | No pairing operation is implemented or claimed |
| LAN HTTPS | Uvicorn TLS | Verified local TLS handshake and Secure cookies; runtime refuses unconfigured plaintext LAN; certificate workflow documented | Client trust/device compatibility requires deployment validation |

The source links use the inspected upstream development branch, not a guaranteed stable API. Record actual Core versions and source commit hashes before declaring a supported HA release. Registry failures retain the cache and mark the connection stale rather than silently dropping rooms. Lock entities are view-only. Energy totals, radio health and cloud-dependency assertions are deliberately not inferred.

Brand reference: [SMARTi](https://www.smarti.no/), original logo downloaded for the requested SMARTi implementation; font bundled from @fontsource/bai-jamjuree (OFL). No runtime request is made to the reference website.
