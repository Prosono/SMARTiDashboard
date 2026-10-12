# Implementation status — 2026-10-12

## Delivered
First runnable iteration of milestone 1. React/TypeScript/Vite/Tailwind/TanStack Query UI and Python/FastAPI backend. Original SMARTi logo, locally bundled Bai Jamjuree, orange accents, light/dark themes, Norwegian/English, responsive desktop sidebar and four-entry mobile navigation.

- One-time-secret owner creation; home name, language, timezone; local admin/user accounts with Argon2, server sessions, expiry, logout revocation, rate limiting, CSRF and Origin validation.
- SQLite migrations (schema v2), owner-only database permissions, per-user favorites keyed by stable registry IDs, offline console recovery.
- Real HA WebSocket authentication, correlated requests, bounded timeouts, subscribed states and registry events, reconnect with fresh snapshots, stale cache, explicit errors and no command replay.
- Typed area/entity/device/capability model; multi-channel linkage, entity area overrides, disabled/diagnostic handling, unknown states and partial device availability.
- Rooms, search/category filters, favorites, light/switch/thermostat controls, sensor values, battery/technical detail disclosure, view-only locks, admin-only HA automation enable/disable.
- Only explicit allowlisted commands. HA acknowledgment and observed HA state are distinguished; neither is claimed to verify physical execution. Missing thermostat constraints disable its setpoint control.
- Explicit demo/live separation. No demonstration fallback on live errors. No runtime CDN, remote font, analytics or cloud login.
- HA app Ingress configuration with proxy-only boundary and prefix-aware cookies, separate standalone LAN HTTPS deployment, self-contained packaging script, Docker image and CI workflow.
- Typed DeviceSetupProvider capability interface, truthful external-flow statuses; no radio commands yet.

## Verification completed

| Check | Result |
|---|---|
| `make lint` | Ruff check/format and TypeScript passed |
| `make test` | 23 pytest tests + 1 Vitest translation-contract test passed |
| `make build` | Production frontend built successfully |
| `make e2e` | 4 Playwright journeys passed, desktop Chromium and mobile Chromium emulation |
| HA WebSocket contract | Actual local WebSocket transport; auth, snapshot/event ordering, newer-state protection, registry refresh races, command confirmation, rejection, reconnect and no replay |
| HTTPS transport | Actual local TLS handshake with a temporary trusted test certificate, validation enabled, Secure session and unauthenticated rejection |
| Security API tests | Bootstrap secret/reuse, roles, forged headers, CSRF, origin, rate limit, expiry/revocation, DB permissions, invalid capabilities/values |
| Packaging | linux/amd64 image built; ran in network-isolated container; liveness, static UI, explicit demo and denied anonymous access passed |
| Visual review | Desktop/mobile screenshots, light/dark layout, no horizontal overflow; keyboard activation of theme control, local browser walkthrough |
| npm audit after dependency update | 0 known vulnerabilities at installation time |

One upstream test-client deprecation warning remains: Starlette recommends httpx2 rather than httpx for future TestClient use. It does not fail current tests. CI configuration is delivered; no remote CI run is claimed. Browser screenshots are generated under artifacts/ (ignored by Git).

## Not verified on real systems
**No real Home Assistant instance, HAOS/Supervisor installation, physical device or radio controller was available.** No occupied home's configuration, automation or device was changed. Simulator results are not hardware results. Real Ingress, registry permissions, Core-version compatibility and physical execution require the separate HARDWARE_TESTING.md procedure. LAN certificate trust on actual phones has not been tested.

## Remaining scope
Milestone 1 is not declared fully accepted or production-ready until the real HA/HAOS journey is verified. These requested features remain:
- Full resumable step-by-step onboarding beyond owner creation and automatic import.
- Editing HA names/areas from SMARTi, category overrides, manual room/control ordering.
- PWA install/offline static-resource shell (no service worker is currently registered).
- Simultaneous LAN + Ingress listeners for the same HA app instance (standalone LAN is implemented separately).
- Detailed radio health and redacted diagnostic export; additional device capabilities such as color temperature.
- Milestone 2 pairing state machine, verified Z-Wave/S2 and Zigbee setup, timeouts/cancellation/restart reconciliation.
- Milestone 3 automation templates, energy, expanded adapters and installer/support workflows.

The setup UI explicitly directs users to their existing HA setup flow. There are no active fake pairing operations, guessed radio health, whole-home energy totals or hidden administrator accounts.

## Start and next priority
`make setup && make dev`, then open http://localhost:5173/. Read the generated owner-only `.data/setup-secret.txt` locally for first setup. See DEVELOPMENT.md and DEPLOYMENT.md for live credentials, HTTPS and the HA package.

Next priority: configure a development HA endpoint and backend-only token, verify read-only registry/state import and Ingress, then—with explicit permission—one harmless physical lamp command. Only after this foundation is validated should real radio pairing be added.
