# SMARTi architecture

## Implementation plan
1. Establish local identity, SQLite metadata and a strict API boundary.
2. Implement HA WebSocket authentication, subscriptions, registries, snapshots and validated commands.
3. Deliver responsive Hjem/Rom/Enheter/Mer, demo, onboarding and daily controls.
4. Verify contracts, security, browser journeys and a self-contained HA container.
5. Validate against a real HA instance before implementing and claiming radio pairing support.

## Decisions
React + TypeScript + Vite + Tailwind + TanStack Query, FastAPI + Pydantic + SQLite.
One home and HA instance per process. No cloud dependency, analytics, remote fonts or CDN at runtime.
The original SMARTi logo and locally bundled Bai Jamjuree follow smarti.no; charcoal, orange and warm light surfaces adapt its identity for daily use.

The browser only calls SMARTi. The backend owns the HA credential, cache, authorization and sessions. HA remains the only authority for areas, devices, entity IDs, states and automations. SMARTi stores accounts, Home preferences, room photos, mode mappings and favorites. HA outages preserve stale cache and inhibit commands. No state cache survives a restart; it is rebuilt.

A single HA WebSocket receiver routes request IDs and subscriptions. Subscribe before fetching a snapshot, buffer events during synchronization, merge newer state timestamps, then expose the synchronized cache. Registry changes trigger a fresh, atomic registry snapshot. A generation counter prevents registry events during refresh from being lost. Reconnection re-subscribes once per event type. Commands are never queued or retried.

The browser receives authenticated SSE invalidations, then fetches the current model using TanStack Query. Browser-to-backend WebSockets are unnecessary; HA-to-backend WebSockets provide real-time state. The SSE session is revalidated every second. Room navigation remains installation-wide; function-level permissions filter entity data and commands, without per-room restrictions. Automation changes and user creation require administrator role. Lock control is intentionally unavailable.

Device IDs come from the HA registry. Controls retain entity and device linkage; channels are separate controls. Entity area overrides device area. Diagnostic and configuration entities are omitted from daily cards. HA domains select capability schemas, never physical identity. Unknown/missing values retain their meaning. Timestamps denote HA state updates, not physical radio contact.

## Deliberate boundaries
- No independent automation engine or thermostat loop; stopping SMARTi does not stop HA automation.
- External setup guidance until radio APIs and actual controllers are verified.
- Account creation is resumable at the installation level: existing users prevent bootstrap, and the original HA installation is automatically imported.
- Function-level access profiles are stored per SMARTi account; admin role remains installation-wide. No per-room authorization. See SECURITY.md.
- HA Ingress and standalone LAN HTTPS use separate deployment modes/listeners. The HA app exposes no LAN port. Concurrent LAN ingress for that same HA app is a later integration step.

## Management boundary

`management.py` exposes dedicated administrator-only operations, not a generic HA service or HTTP proxy. HA WebSocket APIs handle registries/config entries/services; narrowly constructed backend REST paths handle editable automation files and integration reload. Unknown advanced automation fields survive editing, and configs use a content revision check. The HA token remains in the backend. Update names/logo are mapped at presentation time, while entity IDs and installed/latest versions retain their actual identities. No successful request is presented as verified physical execution or completed installation.

`home_overview.py` stores personal room/camera/meter choices and admin-managed room images/mode bindings. The fixed Home layout is assembled from registry-backed capabilities, with bounded visible content and reusable controls. Photos and camera stills require authentication; camera tokens never leave the backend. Mode execution requires explicit configuration and confirmation. History is read-only and source-specific. Dashboard CRUD returns 410; inert legacy database rows remain for nondestructive upgrades.


### Personal experience levels

`GET/PUT /api/home/experience` stores `simple`, `normal` or `advanced` in
`settings` under `experience:{user_id}`. Existing users default to advanced.
The preference is separate from authorization; all existing access checks and
confirmation requirements apply regardless of presentation. Users can change
only their own level, including accounts with restricted function permissions.
Simple uses an everyday home/room view with search, favorites, bounded device
lists and a reduced navigation. Camera/security and media controls remain
available on demand. Normal uses existing feature pages with optional overview
details; technical administration destinations are omitted from its sidebar. Advanced preserves the full navigation.
This preference does not change Home Assistant account privileges.

`GET/PUT /api/home/language` stores `nb` or `en` under `language:{user_id}`.
Authenticated UI language follows this preference; the login screen retains its
browser-local language choice. Users may only update their own language.
