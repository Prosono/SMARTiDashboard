# Implementation status — 2026-10-13

## 0.7.1 — consistent SMARTi presentation (current)

Platform integration domains (homeassistant, hassio and homeassistant hardware variants) use the bundled SMARTi logo without fetching upstream platform logos. A shared display helper brands titles, expanded device names/models, update labels and home/control names. Built-in Norwegian/English prose uses SMARTi or clear home-hub/app terminology. Technical identifiers, API routes, URLs and stored integration titles are preserved; submitting an unchanged branded title retains the original source title. Third-party integration branding remains unchanged. Source configs and technical entity IDs are not rewritten.

Validation: all 60 desktop/mobile browser tests and 33 frontend unit tests passed, including brand detection and immutable display projections. Browser regression covers local logo selection, branded search/details and unchanged source names when saving; build and release payload checks are included. Version 0.7.1 is prepared locally, not published.

## 0.7.0 — selectable palettes and grouped room overview

Five palettes (SMARTi, Fjord, Forest, Sand, Plum) independently combine with light/dark mode. A header quick picker and settings picker share an optional browser preference, retaining the existing storage-failure safeguards. Theme tokens color surfaces, text, borders, controls and navigation while preserving original branding and semantic warnings. Mobile navigation retains readable surface backgrounds rather than inheriting desktop sidebar colors.

Individual rooms now have a photographic header, named measurement summary, availability summary, section navigation and search. Controls are grouped by lighting, climate/air, power/outlets, security, cameras and other actions. Room-assignment precedence and native controls remain unchanged. Personal photos take precedence, stock imagery is labelled decorative, failed images fall back gracefully. Camera players reuse visibility-aware teardown and unmount on room changes. Larger groups expand explicitly; no new device capabilities or commands are introduced.

Validation: 31 frontend unit tests passed; TypeScript/Vite build passed. Browser coverage exercises all ten palette/mode combinations, persistence, popup bounds, responsive navigation, room grouping/search/switching and real demo control state changes. The full browser run passed 56 of 58 tests and exposed a 320 px palette-popup overflow. After fixing that layout, all four palette/room desktop/mobile tests passed on rerun. Deterministic release payload verification passed. Physical HA and native Safari validation remain pending. Version 0.7.0 is prepared locally, not published.

## 0.6.0 — five Home views and presence

Home now separates Overview, Lights, Energy, Security and Climate. Accessible tab buttons support direct selection, arrow/Home/End keys and bounded horizontal touch swipes. Vertical scroll and gestures beginning on controls, video, charts and dialogs are excluded from paging. Content transitions respect reduced motion. Inactive views unmount, releasing camera players when leaving Security; energy choices remain stored per user. Home opens on Overview rather than persisting a tab in browser storage.

Overview retains the greeting (using the SMARTi account name), weather, room/device favorites, scenes and security attention notices. HA person entities provide Home/Away/Unknown presence; disconnected data is always unknown. Person normalization drops location, tracker and user metadata. No motion-derived identity or fabricated presence is introduced. Lights and climate controls/readings are searchable and grouped by room, with expandable lists instead of silently truncating large rooms. Empty capability sets receive explanatory states. Security includes the existing confirmed lock/gate controls; no new alarm-arming, light-color or HVAC-mode commands are added.

Validation: all 54 desktop/mobile browser tests passed, including real Chromium touch events, dimmer gesture isolation, keyboard navigation, person/offline states, HLS teardown on tab change and existing management flows. Screenshots reviewed in light/dark themes, with overflow checks at 320, 834 and 1440 px. All 31 frontend unit tests and four model tests (including presence attribute filtering) passed; Ruff, TypeScript/Vite build and deterministic HA payload verification passed. Native Safari and physical HA testing remain pending. Version 0.6.0 is prepared locally, not published.

## 0.5.0 — live video, native scenes and configurable energy

Home camera cards now play HLS video using native browser support or lazily loaded hls.js. Visibility, tab state, explicit stop and unmount control player/session lifetime. SMARTi proxies bounded manifests and fragments through session-bound opaque resources; same-origin/path validation prevents arbitrary upstream requests, and HA credentials stay server-side. Four concurrent sessions per user, bounded lifetime and explicit retry limit resource use. Demo does not pretend to be live. WebRTC-only and MJPEG-only cameras are not covered. Native Safari and real HA video remain unverified.

A scene strip provides favorites, confirmed activation and an admin three-step creator/editor for lights, switches and climate. Scenes use HA's persistent config API; saving never activates devices. Revision checks detect concurrent edits. Existing unsupported targets and advanced fields survive edits, while only editable safe state fields are exposed. Stateless scenes with no activation timestamp remain usable. Demo scenes persist separately and activation is simulated.

Energy preferences are per-user: up to six individual meters, visible sections, period and chart style. Hourly recorder changes/means drive rolling completed-hour 24h/7d/30d windows. Graphs preserve gaps and partial totals disclose coverage; comparison percentages require both periods to be complete. Each meter remains separate, without inferred costs, savings or sums of overlapping meters. Current readings and HA-configured source readings are distinguished from historical consumption. Recorder statistics must exist; external statistics without entities remain unsupported.

Validation: 108 backend tests, 31 frontend unit tests and all 48 desktop/mobile browser tests passed. HLS browser tests decode a synthetic fragmented-MP4 fixture, verify playback progression, and exercise stop/restart/offscreen cleanup; backend tests separately validate playlist rewriting, authentication, session isolation and URL boundaries. Scene tests cover durable save without activation, advanced-field preservation and revisions. Energy tests cover hourly units, gaps, comparisons and personal preferences. Responsive screenshots reviewed. TypeScript/Vite build and deterministic HA payload verification passed. No physical device or running HA installation was changed. Release 0.5.0 is prepared locally, not published.

Sources: [HA camera stream API](https://github.com/home-assistant/core/blob/dev/homeassistant/components/camera/__init__.py), [HA scene config](https://github.com/home-assistant/core/blob/dev/homeassistant/components/config/scene.py), [HA recorder statistics](https://github.com/home-assistant/core/blob/dev/homeassistant/components/recorder/websocket_api.py), [hls.js](https://github.com/video-dev/hls.js).

## 0.4.1 — photographic Home design

The fixed Home overview now has a photographic welcome area, clearly labelled local decorative room imagery (overridden by personal photos), compact favorites, semantic status colors and polished camera/energy modules. The shared app shell uses a warmer light theme and deeper forest/charcoal dark theme. Configured modes are visibly actions, not inferred active states. Four optimized WebP images total about 309 KiB; their generation prompts and provenance are in `frontend/public/home/README.md`.

Validation: 31 frontend tests, all 42 desktop/mobile browser tests, TypeScript/Vite build and deterministic HA payload verification passed. Local visual checks cover 320, 390, 834 and 1440 px in both themes, image delivery and browser errors. No backend logic, physical devices or running HA installation changed. Version 0.4.1 is prepared locally, not published.

## 0.4.0 — automatic Home overview

The separate custom dashboard editor and its grid library are removed. Its API returns 410 after authentication; existing database rows remain inert to avoid destroying customer data on upgrade. Hjem is now the fixed overview, composed from capability/registry-backed data. Existing rooms, devices, automations, integrations and updates remain in place.

New frontend modules separate discovery (`homeModel`), camera/history components (`HomeMedia`) and Home presentation/preferences (`HomeOverview`). Backend `home_overview` adds personal favorite room/camera/meter choices, admin-managed room photos and household mode mappings. Device/action favorites reuse the original stable-ID mechanism. All browser storage remains optional. Room images are resized in the browser, accepted as bounded JPEG/PNG and served only to authenticated users. Modes are never inferred from names or executed on selection/configuration. Explicit admin assignment and per-activation confirmation are required; no measured home-mode state is fabricated.

HA normalization now includes weather, camera, alarm, cover, scene and script domains, with capability-checked confirmed lock/cover/scene commands and camera credential filtering. Climate units come from HA system configuration. Security prioritizes critical/unknown/open signals without claiming a home is safe when disconnected. Temperature summarizes one known-unit reading per room. Unknown metadata is handled conservatively; temperature/energy unit fallbacks are used where unambiguous.

Energy uses one selected W/kW/Wh/kWh meter and bounded 24-hour recorder history, preserves unknown gaps and never sums potentially overlapping sources. Solar/storage/consumer readings are discovered from HA energy preferences when configured and backed by accessible entities. Daily totals, savings, costs and comparisons are not fabricated from cumulative meter values. External statistics without entities are not displayed. Charger discovery uses charging device classes and known integration metadata; unrecognized devices remain available for favorites. Camera previews are explicit still-image requests, without background streams. Activity is a bounded in-memory list of observed state changes, not a full logbook or an automation trace history.

Validation includes small light-only homes, temperature/sensor homes, energy/charging, camera/security, 600-control browser fixtures and an 800-control discovery test; offline handling; favorite persistence; room photos; mode confirmation and access control; mobile, desktop and an 834px tablet viewport; light and dark screenshots. Existing management, pairing, setup and storage failure journeys remain tested. No physical HA devices were changed. Version 0.4.0 is prepared locally, not published.

References: [HA REST/history API](https://developers.home-assistant.io/docs/api/rest/), [energy preference API](https://github.com/home-assistant/core/blob/dev/homeassistant/components/energy/websocket_api.py), [energy source schemas](https://github.com/home-assistant/core/blob/dev/homeassistant/components/energy/data.py).


## 0.3.5 — Homey-inspired card workspace

Studied official [Advanced Flow](https://homey.app/en-us/features/advanced-flow/), [Flow card SDK](https://apps.developer.homey.app/the-basics/flow) and [Or/Else guidance](https://support.homey.app/hc/en-us/articles/360015464674-Use-Or-and-Else-in-Flows). Adopted readable When/And/Then cards, visible connections, movable cards, a searchable card library and subflow disclosure. Homey's ANY/ALL completion gates and freely connected graph are not treated as equivalent to HA's triggers, condition groups or sequential actions.

The workspace projects alternative HA triggers into a start gate, sequential conditions and action cards. Conditions explicitly describe the false/stop path; stop actions do not draw a continuing edge. Advanced blocks open the lossless structural editor. Dragging and keyboard movement change only temporary layout, not execution order. Zoom, scrolling and arrange/reset are supported. Arbitrary connector wiring, persistent positions and Homey-style runtime tags/error ports remain outside this implementation; this is not a full Advanced Flow clone or a new execution engine.

Validation: 25 frontend unit tests and 18 desktop/mobile management browser tests passed, including pointer/keyboard movement, zoom, card search, unchanged source configuration, nested flows and existing integration/dashboard management. TypeScript/Vite build and deterministic HA payload checks passed. Screenshot reviewed. Version 0.3.5 prepared locally; no live installation or publication.


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


## 0.3.7 — editable flow connections

The canvas supports pointer-drawn connections and two-port touch/keyboard selection, live preview lines, compatible-target highlighting, Escape cancellation and an explicit change preview before applying. Sequence connections move the target immediately after the source (or first after Start/the last global condition), reconnecting the remaining list without deleting cards. Parallel connections wrap two action cards in HA `parallel`/`sequence` blocks at the source position. Other configuration fields are retained. These edits go through the existing draft/save/revision API; they are not decorative stored edges.

Vivid and calm palettes share semantic colors across headers, ports and wires. Existing dragging, background pan, grid/line controls and card removal remain available. Positions and palette are temporary. Conditional branches are edited in the existing subflow editor, not through arbitrary Yes/No connector wiring. Global conditions cannot be bypassed, and self/duplicate/invalid links and outgoing active Stop connections are rejected. No separate graph runtime is introduced.

Reference: https://www.home-assistant.io/docs/scripts/ (sequence, parallel and conditions). Verified using local frontend and desktop/mobile browser tests, including persisted demo API configuration. Physical HA execution remains unverified.


## People, tomorrow’s weather and integration device details (0.8.0)

On Home, choose **Velg personer** to select existing people and optionally show only those at home. Selection is personal to the logged-in account; unknown/offline presence stays visible. Administrators can choose a profile image in the same panel. Uploaded images are cropped to a square and shared with the home; “Bruk systembildet” removes the override. Native local person images are fetched through the authenticated backend. External image URLs are not fetched; upload a photo instead. This does not create tracking entities or change their location data.

The weather card shows now and tomorrow. Tomorrow requires a daily forecast from the configured weather integration; missing data is explicitly labelled. Dates follow the configured home timezone. Forecasts are cached for five minutes. The implementation uses the official [weather.get_forecasts service](https://www.home-assistant.io/integrations/weather/).

Under **Integrasjoner**, expand a group and select a device. The administrator dialog shows registry information and available controls. **Statistikk** selects a sensor/binary sensor and the last 24 hours or seven days. This requires recorded history; it does not infer energy consumption or invent missing values. The graph and table show at most 300 sampled readings, with unknown-state gaps preserved; min/max are calculated from all returned numeric readings. Devices without supported measurements have an explicit empty state.

Local automated coverage includes preference isolation, photo authorization/proxy paths, timezone boundaries, device ownership of history sources, and desktop/mobile interactions. Actual HA hardware, weather providers and native Safari still require live validation.

## 0.9.0 — Home calendar

Home now includes a read-only calendar date strip and daily agenda. Existing hub calendar entities are selected per user (up to 12), with no calendars selected initially. Supports timed/all-day/multi-day events, home timezone, seven-day browsing, expandable location/description, refresh, and explicit missing/offline/partial-failure states. Event responses are limited to 200 per calendar per week and rendered as text, without browser persistence. Selection is not an access-control boundary; home users can select calendars exposed by the hub.

Backend tests cover authentication, CSRF, per-user selection, exclusive all-day end dates, timezone/DST normalization and partial provider failure. Desktop/mobile tests cover selection persistence, navigation, event details and failures. Live calendar provider validation and appointment creation/editing remain outside this release. Protocol reference: https://developers.home-assistant.io/docs/api/rest/.

## 1.0.0 — Thermostat design and EV bindings

Reusable semicircle thermostat presentation now serves control cards and device dialogs. It displays target/current temperature, source-reported mode and HVAC activity, semantic heat/cool/off colors and capability-bound +/- controls. Unsupported dual-setpoint control remains read-only; no mode-change API or arc-drag action is added.

Home → Energy has a personal EV/charger configuration for existing battery/range/power/energy/status sensors and a charging switch. Empty, missing and offline states are explicit. The energy figure remains the source meter value. Mapping is validated server-side and does not send commands; switching is confirmed by the user and uses the existing guarded command endpoint. No vehicle/provider integration or charging scheduler is included.

Verified through backend preference isolation/validation/authentication tests, 33 frontend unit tests, and desktop/mobile tests for setpoint changes, limits, offline disabling, configuration, cancelled/confirmed switch commands and persistence. The user has no connected EV/charger for hardware validation yet.


## 1.1.0 — Configurable 3D energy flow

Energy has a lazy-loaded local WebGL house model, rotation, five configurable power connections, directional particles and accessible numerical readings. Per-user mappings validate W/kW sensors, net/split grid/battery direction, optional SOC and freshness; no energy totals or balance are derived. Five-second readings stop affected animations on missing, old or disconnected data. Visibility/reduced-motion handling and disposal bound graphics activity; WebGL failures preserve the text/configuration UI. Existing history and vehicle controls are retained below.

Backend coverage verifies sign, split readings, units, SOC, freshness, validation, authentication and personal settings. Browser coverage verifies configuration, visible rendering/movement, rotation, persistence, hidden components, offline data and unavailable WebGL on desktop/mobile. Live HA and native mobile GPU/provider validation remain pending.


## 1.2.0 — Architectural energy home and direct sensor setup

The local model now includes recessed interior/glazing detail, timber, solar cell frames, a sculpted EV/charger, wall battery and utility mast. Colored light ribbons replace physical loose cables. Projected DOM buttons carry accessible live values and open the corresponding sensor field; camera rotation and responsive collision handling keep these targets within view. Pause and reduced motion freeze highlights; zero/missing/stale/disconnected paths are not illuminated. Values still come from the existing five-second power API and no energy balance is inferred.

The expanded desktop/mobile browser scenario exercises projected component setup/focus, rendering and actual movement, rotation, retained mappings, hidden components, stale/offline readings and WebGL fallback. Physical HA energy hardware and native mobile GPU validation remain pending.


## 1.3.0 — Active equipment coronas, power history and model editing

The anonymous EV now uses a low fastback profile. Battery and grid cards sit closer to their objects; active solar, EV, battery and grid components receive shader-based pulsing coronas, using the same freshness, pause, visibility and reduced-motion rules as energy paths. A dedicated model editor exposes equipment toggles and preserves mappings when hidden, including missing sensors.

The authenticated energy-flow history endpoint requests completed-hour recorder means in kW, normalizes them to W and aligns split meter timestamps before applying the same direction conventions as live data. Per-component sparklines open an inspectable signed graph with 24h/7d choices, gap preservation, explicit errors/empty states and keyboard/touch support. No extrapolated totals or fake history is generated. Live HA recorder/device validation remains pending.

## 1.4.0 — Precise activity lighting and refined energy design

The anonymous electric fastback uses a curved body/canopy, sculpted wheel openings, detailed rims and slim headlights, with local studio reflections. Activity contours follow each solar-module frame, the rounded battery shell, vehicle footprint, charger face and mast insulators. Narrow colored cores preserve their hue on the light model; subtle outer spill supplies the glow. Directional light packets integrate travelled distance so changing readings do not teleport them, and facade transitions keep the ribbon orientation continuous.

Desktop reading cards connect to physical component anchors; smaller views arrange labels around the model. Live values and actual hourly previews have separate space. Measurement layouts respond to available content width, including tablets with a sidebar. The history workspace includes responsive signed axes, filled segments that preserve missing hours, pointer/touch/keyboard inspection and explicit recorded-data coverage.

Validation covers 33 frontend unit tests and four desktop/mobile browser scenarios: actual rendered movement, stable pixels during pause/reduced motion/zero readings/disconnection, resumed animation, rotation, history inspection, configuration persistence, hidden components and WebGL fallback. Desktop, tablet and mobile screenshots are reviewed in light/dark themes. Release 1.4.0 is prepared locally, not published; physical HA hardware and native mobile GPU validation remain pending.

## 1.5.0 — Graphite pavilion and independent energy connections

The energy house is rebuilt as two minimal graphite volumes with flat roofs, smoked glazing and a dark slate base. Architectural detail is reduced to thin fascia, a recessed entry and one low planter. The model stage uses its own dark studio background in both app themes, while the surrounding readings and history retain the selected theme. The anonymous fastback is retained.

Each external role has an independent physical terminal: roof solar to a facade inverter, battery to its adjacent service bay, EV to a front-left charging circuit and grid to a separate side meter. Household consumption runs inside the glazed living wing. No route uses the former common outdoor hub. Direction, freshness, pause and equipment visibility rules remain unchanged; these display routes do not imply the property's actual wiring or an inferred energy balance.

Validation: 35 frontend unit tests include independent route terminals, usable curves and floor clearance. Four desktop/mobile browser scenarios exercise rendering, animation/status transitions, history, saved visibility/mappings and WebGL fallback. Light/dark stage and full-page captures plus tablet layout are reviewed. Release 1.5.0 is prepared locally, not published; live HA hardware/native mobile GPU validation remains pending.

## 1.5.1 — Pitched roof and warm interior

The graphite house has a low asymmetric pitched roof with solar modules and their contours aligned to the slope. Its route to the inverter and the projected solar label follow the revised geometry. Warm interior surfaces, recessed fixtures and two bounded shadowless lights illuminate the front and side glazing. This lighting is static illustration styling; actual power readings, equipment visibility and independent flow paths retain their existing behavior.

Validation: 35 frontend unit tests and four desktop/mobile browser scenarios, with visual review of roof/panel alignment, interior illumination and responsive framing. Build and HA payload verification pass. Version 1.5.1 is prepared locally, not published.

## 1.6.0 — Cinematic energy home and source navigation

Energy is composed as a unified charcoal panel with a time-aware greeting, real available weather and larger floating measurement cards. The cards show recorded hourly previews beside live power values, with fine leaders and rings attached to physical equipment. Source navigation opens consumption, solar, battery, EV and grid history; the period control applies to miniature and expanded charts. Unavailable weather is omitted, and no demonstration readings are substituted in production.

The pitched graphite model has finer standing seams, vertical cladding, a full-height glazed furnished lounge with warm illumination, an open driveway, a rear annex, slate paving and detailed branching trees/planting. Interior and garden lights remain decorative. Optional equipment, separate connection terminals, measured direction and freshness behavior are retained. Static opaque architecture is merged by compatible material/shadow settings, preserving the original camera-fit bounds; static shadows are reused until equipment visibility changes. Dynamic light paths and transparent glazing remain separate. Geometry, materials, instance buffers, textures and light resources are disposed on unmount.

Validation: 35 frontend unit tests and four desktop/mobile browser scenarios pass. Browser coverage includes real-history previews with gaps, synchronized period controls, weather availability, independent directions, stable pause/reduced-motion/zero/offline frames, rotation, editable visibility, configuration persistence and WebGL fallback. Desktop, wide-screen, tablet and mobile captures were reviewed; production build and HA payload verification pass. Release 1.6.0 is prepared locally, not published; physical HA energy hardware and native mobile GPU validation remain pending.
