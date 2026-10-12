# Implementation status — 2026-10-12

## 0.3.4 — grouped integrations

Integration connections are grouped by domain into collapsed cards, with unique device counts, issue summaries and searchable device/room names. Expanding shows devices and existing per-entry rename/reload/enable/disable operations. Device data is explicitly allowlisted and supports both legacy config_entries and current config_entry_id registry fields.

Brand images use HA's authenticated [local brands API](https://developers.home-assistant.io/blog/2026/02/24/brands-proxy-api/) via a size-bounded PNG backend handler, without exposing HA credentials. Missing/older API images fall back to the [official brand CDN](https://github.com/home-assistant/brands), then a local icon. CDN requests require internet; the local HA API can serve its cached/custom images. Validation covers device association and data filtering, bounded image transport, mobile/desktop grouping, expansion, search, logo fallback and confirmed admin actions. No customer installation was changed. Release 0.3.4 is prepared locally, not published.


## 0.3.3 — structured advanced flows

Recursive source-path projection now renders choose/default, if/then/else, repeat variants, parallel/sequence, AND/OR/NOT and wait-trigger branches. Delay, stop, variables, scenes, events and template conditions have explicit summaries. Nested steps can be inspected and common fields edited, with branch additions and array-step removal. Immutable path replacement retains every untouched field; unknown fields remain available through source editing. Templates remain literal expressions; blueprints are still handled in the full editor. Deep branches collapse progressively and rendering is bounded at 12 levels, with access to complete source.

Semantics checked against [HA script building blocks](https://www.home-assistant.io/docs/scripts/) and [conditions](https://www.home-assistant.io/docs/scripts/conditions/). Validation: 23 frontend unit tests, 14 desktop/mobile management browser tests, TypeScript/Vite build and deterministic HA payload validation. Tests cover nested edits, additions/removal, save/reopen equivalence, template and sibling preservation, invalid path rejection and existing management journeys. Screenshots inspected. Actual customer automations and physical HA execution were not available for validation. Version 0.3.3 prepared locally, not published.


## 0.3.2 — automation flows and room-based selection

Automations now open as an editable When / And if / Then flow. New guided routines enter that flow after saving. Cards support adding, editing, ordering and removing blocks. The standard and JSON editors share the same draft. Unknown blocks, additional fields and conditions are retained; unsupported blocks use the JSON editor and blueprints stay in the full editor. Room-filtered searchable entity dialogs show real known metadata, appropriate icons and friendly state labels, retaining missing selections without silently replacing them. Action targets are filtered to their service domain. Save responses update the revision; clean saved editors no longer claim unsaved changes.

Validation: 18 frontend unit tests, 12 desktop/mobile management browser tests, TypeScript/Vite build and HA payload validation. Covered flow creation, condition/action edits and ordering/removal, view switching, advanced-field preservation, picker search/empty results/room filters and draft protection. Screenshots reviewed on desktop and phone. No live HA installation or physical automation was changed. Release 0.3.2 is prepared locally, not published.


## 0.3.1 — guided everyday automations

New routines start with When → Then → Review, using time, sunrise/sunset or explicit binary-sensor transitions and capability-backed light/socket actions. Choices use room/device names, searchable selection, a plain-language preview and automatic name suggestions. Compatible existing routines reopen in the guide; other configurations retain the complete editor. More devices, conditions and actions remain available under More options. No physical actions run during editing or review.

Verification: 16 frontend unit tests, 10 desktop/mobile management browser tests, TypeScript/Vite build and deterministic payload validation passed. Browser screenshots reviewed on phone and desktop. No live HA installation or physical automation execution was tested. Version 0.3.1 is prepared locally, not published.


## 0.3.0 — administration and responsive dashboards

Implemented HA-backed room CRUD and device/entity area assignment; automation CRUD with visual blocks and a lossless advanced JSON editor; integration overview, rename, enable/disable and reload; capability-checked update installation with explicit confirmation, supported backup and SMARTi display branding. New integration configuration flows are deferred by the user's choice. Separate YAML automation files remain outside HA's editable config API.

Dashboards are SMARTi SQLite metadata (schema 4): private per owner or shared per home, three independent responsive layouts, pointer/touch and keyboard movement, sizing, collision resolution, control/sensor/text/heading tiles and optimistic revision checking. Admin/CSRF checks protect HA changes; private dashboard access is owner-scoped, shared edits require admin. Controls remain governed by existing command permissions. No real HA install or system update has been executed. Verify the internal HA config API against the customer's version before acceptance.

Verification: 92 backend tests, 12 frontend unit tests and 26 desktop/mobile browser tests passed. Browser coverage includes touch and keyboard movement, independent layouts, saving/reloading, room CRUD, advanced automation preservation and confirmed integration/update actions. TypeScript/build, Ruff and deterministic HA payload checks passed. The Docker 0.3.0 image built locally; no image/repository publication was performed.

## 0.2.4 — controller diagnostics and device detail dialog

The user's controller still reports busy after 0.2.3; the cause is not confirmed without the actual controller state/version. Added raw inclusion state and connection/version diagnostics, correct disconnected/unknown errors, named/numeric enum handling, and explicit confirmed inclusion/exclusion stop even without a SMARTi-owned session. This is recovery and observability, not a claim of physical root-cause verification. No controller reset or automatic retry/start is performed.

Device rows now open a native accessible dialog with registry/network metadata and existing HA capability-checked commands. Exact physical identity links controls to devices (including extended Z-Wave identifiers). Zigbee images use the official model catalog and require internet access; missing images use an icon. Z-Wave's HA API does not supply a product image. Both protocols support an administrator-uploaded persistent local image, limited to PNG/JPEG/WebP under 600 kB. Direct automatic Z-Wave JS UI picture import remains unimplemented.

## 0.2.3 — stopped pairing recovery

Z-Wave stop now tolerates delayed status and S2 cancellation races. A bounded read-only polling window confirms the stop; subsequent status reads and starts reconcile unresolved sessions only when the connected controller reports Idle/SmartStart. Active interviews are preserved. Subscription callbacks are bound to the original session, preventing late events from corrupting a new pairing. UI distinguishes controller busy from unresolved SMARTi pairing and displays stopping progress. Regression fixtures cover delayed stop, S2 cancellation rejection, disconnection, persisted recovery, old callbacks and stop/start again. Physical radio reproduction is still pending.

## 0.2.2 — protocol inventory and removal

Devices has All controls, Zigbee and Z-Wave tabs, with the pairing wizard available at the top. Physical inventories come from Zigbee2MQTT bridge/devices and each Z-Wave JS controller's network_status, including nodes without HA controls. Zigbee availability is unknown when not reported; last LQI is shown on a 0–255 scale with unknown age for retained samples. Z-Wave shows actual node status, including asleep, without inventing a signal-strength percentage.

Read access is available to residents; removal requires admin and CSRF. Zigbee removal never forces deletion. Z-Wave uses guided physical exclusion (which can exclude a different device); matching node IDs determine success. No automatic replay, controller deletion or forced failed-node removal. Existing stop/timeouts and restart recovery cover exclusion too. Contract, authorization and desktop/mobile UI tests cover these paths. Real HA/radio tests remain pending.

## 0.2.1 — direct pairing, local changes

Prioritized the user's installed Zigbee2MQTT and Z-Wave JS integrations. Replaced the static external-setup screen with capability detection, controller selection, pairing progress, stop, security approval and DSK PIN input. Zigbee2MQTT uses HA MQTT subscriptions and correlated permit_join responses; Z-Wave uses HA inclusion subscriptions. Admin/CSRF checks remain enforced. Timeouts do not replay starts, a persisted marker survives interrupted setup, and security codes are not persisted. Bluetooth, ZHA and Matter commissioning remain outside this release.

Verification: 50 backend tests, 8 frontend unit tests and 16 desktop/mobile browser tests passed, including real local WebSocket subscription timing, mocked radio contracts and the S2 UI. Actual radio pairing has not been tested. The separate remote-access pilot is deferred and remains opt-in/disabled; no further pilot work or public deployment is part of this change.


## Unpublished 0.2.0 mobile and remote-access pilot

Implemented persistent installation UUID, separate opt-in mobile HTTPS API, expiring one-use pairing, device token rotation/revocation and audit records. SQLite v3 migration retains existing accounts/sessions. Added a standalone non-root relay Docker image and fixed-destination outbound connector; nested TLS ends at the home API. The relay never receives the home TLS key or database. Docker Compose runs an isolated single-home demo with generated test credentials/certificates and a scripted pilot client.

Verification: 43 backend tests, 8 frontend unit tests and 14 desktop/mobile browser tests passed (65 total). Lint and payload freshness checks passed. The relay image built for arm64 and amd64; the complete Docker journey ran on arm64 and the amd64 runtime import check passed. Actual Docker pilot client passed pairing, remote snapshot, simulated lamp command, direct local snapshot, refresh and remote denial after revocation. Real nested-TLS tests also verify certificate rejection and continued local access during a tunnel outage. No public deployment or existing HA installation was touched. Native iOS/Android apps, QR UI, cloud accounts, multi-home routing, automatic switching and production certificate lifecycle remain outstanding. See [pilot instructions](MOBILE_PILOT.md).


## Version 0.1.3 — setup diagnostics and multiple HA addresses

Local changes support `additional_origins` alongside the existing `origin`, with explicit `allow_http_ingress` for local HTTP access through Supervisor. HTTPS cookies remain Secure; standalone HTTP is still rejected. Both entry points use the same database/accounts and independent browser sessions. Setup errors now distinguish address, secret, validation and network failures; successful owner creation followed by failed login returns to the login form.

Validation: 32 backend tests, 8 frontend unit tests and 14 desktop/mobile browser tests passed, along with lint, production build and payload freshness verification. Tests cover both HTTP/HTTPS Ingress session cookies, authenticated actions, logout, rejected origins and setup recovery. The original screenshot's cause is not confirmed, and real HAOS/Nabu Casa validation remains pending. The 0.1.3 package is prepared locally, not deployed by this session.


## Browser storage fix (0.1.2)

A user-reported blank Ingress panel with QuotaExceededError was traced to an unguarded theme-preference write in the deployed index-mS6izSEm.js bundle. Reproduced locally by making browser storage writes throw; the original build failed to render the login form.

Theme/language storage reads and writes now fail safely. Preferences remain in React state when persistence is unavailable, and invalid saved values use defaults. No HA origin storage is cleared. The rebuilt app-store payload is version 0.1.2 and needs to be pushed before HA can offer the update.

Verification: TypeScript check, production build, payload freshness check, 5 Vitest tests and 8 Playwright tests passed. Browser regressions cover full storage (QuotaExceededError) and blocked access (SecurityError), login, theme/language changes and reload on desktop and mobile. The original user browser has not yet been retested with the updated package. Roboto preload warnings come from the surrounding HA page and are separate from the reproduced crash.

## App-store packaging update (0.1.1)

Prepared installation through the built-in HA app manager using https://github.com/Prosono/SMARTiDashboard. The repository includes a deterministic runtime archive and checksums, so HA can build directly from a clone without manual staging. Both linux/amd64 and linux/arm64 containers were built and smoke-tested with networking disabled. Actual HAOS/Ingress remains unverified. CI checks payload freshness and both architectures. These local changes must be pushed before HA can fetch version 0.1.1.


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
| Packaging | linux/amd64 and linux/arm64 images built; ran in network-isolated container; liveness, static UI, explicit demo and denied anonymous access passed |
| Visual review | Desktop/mobile screenshots, light/dark layout, no horizontal overflow; keyboard activation of theme control, local browser walkthrough |
| npm audit after dependency update | 0 known vulnerabilities at installation time |

One upstream test-client deprecation warning remains: Starlette recommends httpx2 rather than httpx for future TestClient use. It does not fail current tests. CI configuration is delivered; no remote CI run is claimed. Browser screenshots are generated under artifacts/ (ignored by Git).

## Not verified on real systems
**No real Home Assistant instance, HAOS/Supervisor installation, physical device or radio controller was available.** No occupied home's configuration, automation or device was changed. Simulator results are not hardware results. Real Ingress, registry permissions, Core-version compatibility and physical execution require the separate HARDWARE_TESTING.md procedure. LAN certificate trust on actual phones has not been tested.

## Remaining scope
Milestone 1 is not declared fully accepted or production-ready until the real HA/HAOS journey is verified. These requested features remain:
- Full resumable step-by-step onboarding beyond owner creation and automatic import.
- Category overrides and manual ordering of the standard room/control lists (custom dashboards have independent ordering).
- Native phone-app distribution is deferred; PWA was explicitly declined.
- Simultaneous LAN + Ingress listeners for the same HA app instance (standalone LAN is implemented separately).
- Detailed radio health and redacted diagnostic export; additional device capabilities such as color temperature.
- Real-hardware verification of the implemented pairing, S2, cancellation and restart-recovery flows.
- Milestone 3 automation templates, energy, expanded adapters and installer/support workflows.

Unsupported commissioning integrations are identified explicitly. There are no active fake pairing operations, guessed radio health, whole-home energy totals or hidden administrator accounts.

## Start and next priority
`make setup && make dev`, then open http://localhost:5173/. Read the generated owner-only `.data/setup-secret.txt` locally for first setup. See DEVELOPMENT.md and DEPLOYMENT.md for live credentials, HTTPS and the HA package.

Next priority: configure a development HA endpoint and backend-only token, verify read-only registry/state import and Ingress, then—with explicit permission—one harmless physical lamp command. Only after this foundation is validated should real radio pairing be added.
