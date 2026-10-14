# 1.9.0

- Move controller metrics to the top of Settings, add real sampled history behind CPU, memory and storage values, and remove automation cards from this tab.
- Add a three-step user onboarding dialog: login, profile photo/access, review. Provision SMARTi and controller accounts plus a linked household person. Track partial results and reconcile known accounts without replaying uncertain user creation.
- Add profile-photo uploads for accounts and synchronize linked controller person pictures. Passwords are hashed locally; validation responses omit submitted secrets.
- Start password-protected full backups as background Supervisor jobs, with explicit accepted/completed/failed/unconfirmed states.
- Add reviewed IPv4 DHCP/static, gateway, DNS and supported Wi-Fi changes. Preserve IPv6, reject stale configuration, validate addresses and never replay the same write request after an uncertain result.
- Request Supervisor manager role for the new network/backup APIs. No restore, delete, reboot or arbitrary Supervisor proxy is exposed.

Prepared locally. Physical network reconnection, vendor/platform behavior and restore testing still require validation on the target installation.

# 1.8.0

- Add administrator settings for controller CPU/memory, host storage, network interfaces and backup inventory, with explicit unavailable states and no simulated measurements.
- Edit the home's name, coordinates, elevation and time zone in a dialog using the real controller configuration.
- Create, rename, assign presence trackers and remove stored household people; preserve login accounts, existing picture/user associations and YAML-managed people. Reuse presence visibility and photo settings.
- Enable Supervisor API access with the homeassistant role for Core stats and read-only info endpoints. Network configuration and backup creation/restoration are not exposed.

Prepared locally; validation against physical Supervisor hardware remains pending.

# 1.7.0

- Add an integration catalog and modal setup wizard using the controller's real config flows, with translated labels, typed fields, menus, errors, progress, external sign-in, cancellation and completion.
- Bind pending setup flows to the initiating administrator session; keep privileged credentials and completed config-entry data on the backend.
- Unsupported specialized selectors are explicitly blocked with guidance to finish setup in the controller. Demo cannot install integrations.

Prepared locally. Real hardware, vendor OAuth callbacks and version-specific integration schemas require validation on the target installation.

# 1.6.2

- Fix camera live-stream relay through Supervisor by preserving the `/core/api/` upstream prefix for playlists and video segments, including root-relative playlist links.
- Replace the misleading camera HLS-support error with an accurate playback failure message.

Prepared locally; physical HA camera validation remains pending.

# 1.6.1

- Open Home customization, people, calendar, energy display, EV/charger and energy-flow preferences in consistent accessible dialogs without inserting forms into the dashboard layout.
- Selecting an unconfigured energy component opens only its own measurement settings. Complete equipment and flow setup remain available from the toolbar.
- Keep focus inside the dialog, restore it on close, support Escape and prevent dismissal while saving. Keep save errors visible in the dialog; cancelling draft forms does not save changes.

Prepared locally; physical HA validation remains pending.

# 1.6.0

- Recompose Energy as one charcoal scene with a time-aware greeting, actual available weather, floating measurements with recorder-history previews, and compact source/period navigation.
- Refine the pitched graphite house with detailed roof panels and cladding, full-height glazing, a furnished golden-lit living room, a rear annex, slate paving, branching trees and softly illuminated planting.
- Keep physical measurement anchors and separate energy connections, editable equipment visibility, real live values, signed history, pause/reduced motion and WebGL fallback.

Prepared locally; physical HA hardware and native mobile GPU validation remain pending.

# 1.5.1

- Give the graphite energy house a low asymmetric pitched roof, with solar modules and their activity contours fitted to its slope.
- Add warm interior illumination visible through the glazing, retaining the dark site, simple architecture and independent energy connections. Interior lighting is part of the illustration, not a device-state indicator.

# 1.5.0

- Replace the pitched-roof miniature with a minimal graphite pavilion: stepped flat roofs, smoked glazing and restrained architectural lighting. Use a dark slate site and studio background in both app themes.
- Give solar, battery, grid and EV separate paths and physical house terminals instead of one shared outdoor junction. Show household consumption as an interior circuit behind the glass facade.
- Preserve measured directions, equipment visibility, history and pause/reduced-motion behavior. Add route checks for independent terminals and usable curves.

Prepared locally; physical HA energy hardware validation remains pending.

# 1.4.0

- Refine the energy home with a curved anonymous electric fastback, panoramic glazing, sculpted fenders, detailed wheels and studio reflections.
- Fit activity lighting to individual solar-module frames, the battery shell, vehicle/charger and mast insulators. Directional light packets travel smoothly when meter readings change; zero, missing and stale readings remain unlit.
- Anchor desktop measurement labels to the physical equipment with subtle pointers. Refine responsive spacing, measurement cards and separate hourly-history previews.
- Improve the energy-history workspace with readable responsive axes, signed area graphs, visible gaps, interactive inspection and data-coverage indicators.

Prepared locally; live HA recorder and physical energy hardware validation remain pending.

# 1.3.0

- Give the anonymous EV a lower fastback silhouette, smooth nose, glass canopy and narrow headlights, without manufacturer branding.
- Move battery/grid labels closer to their equipment. Add colored pulsing coronas around active solar panels, battery, EV and utility mast; pause, reduced motion, stale/offline/zero readings and hidden components remain respected.
- Add background sparklines and an expandable power-history graph with 24-hour/seven-day periods, pointer/touch/keyboard inspection and signed grid/battery direction. Use recorded hourly means and preserve gaps; align split meters before computing net values.
- Add a dedicated Edit 3D model entry and equipment checklist. Hide optional equipment and its readings/flows, retaining personal mappings for later reuse. A removed sensor does not prevent hiding its component.

Prepared locally; live HA recorder and physical energy hardware validation remain pending.

# 1.2.0

- Rebuild the energy house as a detailed architectural model with recessed glazing, timber, framed solar cells, a sculpted EV, charger, wall battery and utility mast.
- Replace loose grey cables with colored ribbons of light following the site's distribution paths. Moving white highlights show measured direction; missing, stale or zero readings do not light up a connection.
- Add anchored icons and live power readings beside each component. Select a component to open its sensor setup directly; labels remain usable while rotating and on smaller screens. Retain grid/battery direction, battery percentage and personal component visibility.
- Refine measurement summaries and configuration in every palette and both themes. Disconnected responses hide battery percentage and explicitly show offline status.

Prepared locally; live HA energy hardware validation remains pending.

# 1.1.0

- Add a real, locally rendered 3D energy home with solar roof, battery, EV/charger and utility connection. Rotate the view and inspect color-coded power readings; animate flows in their measured direction.
- Configure visible components and W/kW sensors per user. Grid and battery support signed net readings or separate opposite-direction meters, with explicit positive-direction configuration. Optional battery percentage is supported.
- Refresh power readings every five seconds. Missing, invalid, disconnected or stale readings stop the affected flow. Configure freshness from one to 60 minutes; no totals or energy balances are inferred.
- Lazy-load the renderer, pause animation outside the viewport/background, respect reduced motion and preserve readings/configuration when WebGL is unavailable. Existing kWh history remains below the model.

Prepared locally; live HA energy hardware validation remains pending.

# 1.0.0

- Replace thermostat controls with a semicircular target-temperature display, room reading and large +/- buttons. Show mode and HVAC activity separately with heating/cooling/off colors, across Home, rooms and device dialogs. Respect reported steps, bounds and availability; mode switching and dual-setpoint editing are not introduced.
- Add a configurable EV/charger section under Home → Energy. Bind existing battery, range, power, energy and status sensors plus an optional charging switch per user. Missing/offline readings remain explicit; configuration sends no device commands and switching asks for confirmation.
- Provide a setup empty state until a vehicle or charger is connected. No vendor integration, current-limit control or charging schedule is created automatically.

# 0.9.0

Add a calendar to Home with a seven-day date strip, week navigation, today shortcut and expandable daily agenda. Select up to 12 existing calendars per SMARTi user; none are selected initially. Display timed, all-day and multi-day events using the home timezone, with exclusive end dates and explicit loading/offline/partial-failure states. Calendar viewing is read-only; events remain in their existing calendar service.

# 0.8.2

Inspect integration device history with a pointer or touch: show the nearest sampled reading, timestamp, unit and a graph marker. Unknown readings are explicitly labelled. Arrow keys, Home and End navigate readings; changing sensor or period clears the selection.

# 0.8.1

Fix integration device history returning HTTP 422 when the browser explicitly requests 24 hours or seven days. Validate the period as a URL string before converting it to hours. Regression tests cover both explicit periods, the default period and invalid values.

# 0.8.0

- Choose which people appear on Home, with an optional “only home” filter saved per login. Show actual local system profile photos through an authenticated proxy; administrators can upload shared profile overrides or restore system photos.
- Show current weather alongside tomorrow’s daily forecast, including high/low temperature and precipitation when supplied. Use the home timezone and clearly indicate unavailable forecasts.
- Open devices from expanded integrations in a detail dialog with manufacturer, model, room, firmware and supported controls. Inspect sensor and binary sensor history over 24 hours or seven days, with min/max, a graph and readings table; unknown values break the graph.
- Keep photo credentials server-side and enforce administrator access for photo changes and integration device inspection.

Prepared locally; physical HA installation validation remains pending.

# 0.7.1

Use SMARTi names and the bundled SMARTi logo for Home Assistant platform integrations, including Supervisor and hardware variants. Brand expanded integration/device labels, update labels, home/control display names and built-in Norwegian/English copy consistently. Search accepts SMARTi while retaining original integration searches. Preserve original domain/entry/entity IDs, endpoints and saved names; opening and saving an unchanged branded integration name does not rewrite its underlying name. Third-party integrations retain their own logos.

# 0.7.0

- Add SMARTi, Fjord, Forest, Sand and Plum color palettes, each combined independently with light/dark mode. Choose from the header palette menu or More → Settings. Optional browser storage remembers the choice; blocked/full storage cannot prevent rendering.
- Replace individual room device lists with a photographic room overview, real room status, section icons, search and shortcuts. Group lights, climate/air, power/outlets, security, cameras and other controls. Existing controls, confirmations and availability restrictions remain in place.
- Reuse personal room photos, with labelled decorative imagery as a fallback. Large groups expand explicitly, room cameras use the existing visibility-managed live player, and room switching/back navigation stay accessible on mobile and desktop.

Prepared locally; physical HA installation validation remains pending.

# 0.6.0

- Split Home into Overview, Lights, Energy, Security and Climate, with direct tab selection, keyboard navigation and horizontal touch swipes. Gestures starting on controls, video or charts stay with those controls; vertical scrolling remains available.
- Keep greetings, favorite rooms/devices, scenes and security warnings on Overview. Show HA person presence as Home/Away/Unknown without exposing location/tracker metadata; disconnected presence is unknown.
- Group lights and climate devices by room, with search and expandable device lists. Move energy configuration and charging to Energy; camera playback and security controls to Security. Camera players unmount and release their sessions when leaving the tab.
- Retain responsive light/dark styling, accessible tab labels, reduced motion, and clear empty states. No separate dashboard editor.

Prepared locally; physical HA and native Safari testing remain pending.

# 0.5.0

- Replace Home camera stills with authenticated HLS live video, automatic playback while visible, explicit stop/retry and fullscreen. HA credentials remain server-side; streams are scoped to the SMARTi login session. Requires an HA camera with HLS stream support; WebRTC-only cameras are not supported yet.
- Add scene favorites and a three-step creator/editor for lights, switches and climate. Save persistent native HA scenes without activating devices; activation and deletion are explicit. Preserve advanced fields and unsupported devices when editing an existing scene.
- Expand energy into a configurable overview with 24-hour, 7-day and 30-day periods, bar/line charts, previous-period comparisons and individual meter summaries. Use recorder statistics, retain missing-data gaps, and compare only complete periods. Personal choices control meters and visible sections; never sum overlapping meters or invent costs/savings.

Prepared locally. Physical HA camera, recorder and native scene validation remains required.

# 0.4.1

Refresh the built-in Home screen with a photographic welcome area, decorative Scandinavian room images, compact controls, semantic status colors and refined light/dark themes. Personal room photos take precedence over clearly labelled decorative images; all artwork is bundled locally. Improve phone/tablet layouts, navigation, camera previews and real-data energy charts. Show configured routines as actions without implying an active home mode. No new dashboard editor or changes to physical automation execution. Validated locally; physical HA installation validation remains pending.

# 0.4.0

Replace the custom dashboard builder with an automatic, responsive Home overview. Retire dashboard CRUD endpoints (410) and remove the editor; preserve old stored layouts without exposing them. Home discovers weather, room temperatures, security signals, cameras, power/energy meters and charging signals from live registry-backed controls. Add personal favorite rooms/devices/cameras, admin-uploaded room photos, and explicit admin mapping of Home/Away/Night/Holiday to scenes, scripts or automations. Mode activation and lock/cover/scene actions require confirmation. Camera stills are opt-in, authenticated and bounded; HA tokens stay on the server. Add per-meter 24-hour history and configured solar/battery/consumer readings without summing overlapping meters or inventing daily usage. Show observed recent state changes, stale data and unknown security explicitly. Support light/dark themes, phone, tablet and desktop layouts. Live physical HA validation remains pending.

# 0.3.7

Connect flow cards by dragging output to input or selecting ports by touch/keyboard. Preview and confirm sequence changes or combine two action cards into a native HA parallel block. Show compatible targets and explanations for unsupported links. Keep global conditions before actions, reject self/duplicate links and outgoing active stops, and preserve untouched card configuration. New vivid/calm palettes color cards, ports and wires consistently. Connections change the saved automation; visual positions and palette remain session-only. Arbitrary graphs and custom conditional port wiring remain unsupported; edit conditional branches in the subflow editor.

# 0.3.6

Give flow cards distinct orange, blue and green headers with matching connections. Drag cards from their body or handle, pan by dragging the canvas background, toggle the grid and connection lines, and remove cards with confirmation. Moving cards and hiding lines do not alter execution order; removing a card changes the draft until saved. Card positions remain temporary. Validated with frontend unit tests and desktop/mobile browser interaction tests; not tested on physical HA.

# 0.3.5

Add a Homey-inspired automation workspace with connected cards, pointer/touch and keyboard movement, zoom, arrange/reset and a searchable card library. Select cards to edit or open advanced subflows. Preserve the structural and JSON editors. Connections are projected from HA execution order; position changes do not change the automation. Card positions are temporary and arbitrary connector wiring is not implemented. No physical automations were executed during validation.

# 0.3.4

Group integration connections into compact, expandable cards with Home Assistant brand images. Fetch local/custom brand icons through an authenticated backend request, fall back to the official brands CDN on older HA installations, and use an icon when neither source is available. Expand each card to inspect connection-specific devices, rooms, models and administration actions. Search also matches devices and rooms. Count unique devices across connections and support legacy/current HA device registry associations. Existing automation flow improvements are included.

# 0.3.3

Render nested choose/default, if/then/else, repeat count/for_each/while/until, parallel/sequence, logical conditions and wait-trigger branches as expandable flows. Show delay, stop, variables, events and template conditions explicitly. Add targeted nested-step editing and branch additions/removal while preserving untouched configuration, templates and unknown fields. Give advanced action flows full width with quieter surfaces and connection rails. Unsupported fields and blueprints remain accessible through full configuration editing; templates are never evaluated in the browser. No real HA automations were executed during validation.

# 0.3.2

Add a responsive, editable When / And if / Then flow view for existing and newly saved automations, with card editing, additions, removal, ordering and switching to the standard editor without losing configuration. Advanced blocks and additional settings remain visible and preserved; blueprints use the full configuration editor. Replace entity dropdowns with a searchable room-filtered picker, device-type icons, available state labels and keyboard-accessible dialogs. Successful saves refresh the editing revision and keep the flow open. Physical HA validation remains pending.

# 0.3.1

Add a three-step automation guide: choose a time, sunrise/sunset or binary sensor event; select a light/socket by name and room; review a plain-language summary before saving. Supports backtracking, automatic name suggestions and validated selections. Simple compatible routines reopen in the guide. Complex configurations retain the full editor without hiding or discarding settings. Saving does not trigger a test run. HA remains the execution engine; physical installation testing is still required.

# 0.3.0

Add administrator room creation/rename/deletion, device placement and explicit entity area overrides. Add automation creation/editing/deletion, enable/disable and confirmed runs; a visual time/state/sun editor preserves advanced configuration through a full JSON editor. HA remains the execution engine and authority. Automations in separate YAML files that the HA config API cannot edit stay at their source.

Add integration status, rename, enable/disable and reload (new integration setup is deferred by choice). Add update entities with current/latest versions, live progress, confirmed installation and optional supported backup. Names containing Home Assistant display as SMARTi with the SMARTi logo; underlying component identity and versions are unchanged.

Add persistent private and shared dashboards with separate 2/6/12-column phone/tablet/desktop layouts, pointer/touch drag handles, keyboard movement, tile sizing, collision handling, sensor/control/text/heading tiles and revision checks. Residents edit their own private dashboards; admins edit shared dashboards. Existing SQLite data migrates without account reset. Successful logins no longer consume the failed-login rate-limit budget; previous failed attempts remain counted. No live system updates or real HA configuration changes were performed during development; installation validation remains required.

# 0.2.5

Support both HA MQTT and an explicitly configured external Zigbee2MQTT frontend WebSocket, including setups using Zigbee2MQTT Proxy. Add backend-only server/token options and redacted connection diagnostics. Pairing, stop and removal require correlated acknowledgements; no command is replayed after reconnect. HA entity controls still require HA integration. Accept legacy plain online/offline messages and preserve bounded, sanitized telemetry arriving before device inventory. Frontend sample age remains unknown because the stream does not identify cached samples. Hardware/HAOS validation remains pending.

# 0.2.4

Add actual Z-Wave controller state, redacted diagnostics and an explicitly confirmed stop operation for inclusion/exclusion that no longer belongs to a SMARTi session. Distinguish disconnected, unknown and busy states; support named and numeric state values. This supplies recovery and diagnostic tools; the customer's persistent busy state has not been reproduced on hardware.

Add clickable physical device rows with a modal showing model, firmware, network metadata, related sensor readings and supported power/brightness/temperature commands. Use Zigbee2MQTT's official model image catalog, with an icon fallback. Add persistent administrator-uploaded PNG/JPEG/WebP images for either protocol. Automatic Z-Wave JS UI image import is not available via the current HA API. Images and device actions retain session/role/CSRF checks.

# 0.2.3

Fix pairing remaining blocked after stopping Z-Wave inclusion. Wait for delayed controller state, continue stopping when S2 cancellation has already completed, and reconcile unresolved sessions against connected idle controller status. Ignore late events from previous sessions and preserve active interviews. Show separate messages for an unresolved SMARTi session and a busy controller, with visible stopping progress. No start commands are replayed.

# 0.2.2

Add Zigbee and Z-Wave tabs under Devices with physical device inventories, status icons, search and refresh. Show Zigbee LQI when reported, explicitly mark unknown measurement age and distinguish sleeping Z-Wave battery devices from offline nodes. Admins can remove Zigbee devices with a correlated acknowledgement or start a two-minute, stoppable Z-Wave exclusion flow. Controller deletion is blocked. Exclusion recovery markers persist across restarts; a different excluded node is never reported as the selected device. Add new device opens the existing pairing wizard. Real hardware validation remains pending.

# 0.2.1

Add direct Zigbee2MQTT permit-join and Z-Wave JS inclusion from SMARTi, with capability detection, controller selection, bounded search, stop, progress, S2 security approval and PIN entry. Preserve an interrupted-session marker across restarts. Configure zigbee2mqtt_base_topic when using a custom MQTT base topic. Admin access is required. Bluetooth, ZHA and Matter commissioning are not implemented by this release. Real radio/hardware validation is pending; contract and browser tests cover the new flows.

# 0.2.0 (local pilot, unpublished)

Add opt-in mobile API foundations and persistent installation identity. Existing HA UI remains unchanged; mobile access is disabled by default. Add separate Docker relay/connector pilot with nested TLS, single-use pairing, rotating device credentials and revocation. This does not yet provide a native phone app, cloud accounts or a multi-home hosted service. SQLite migration preserves existing accounts/sessions.

# 0.1.3

Support multiple local/external addresses with additional_origins and explicit HTTP Ingress opt-in (HTTPS remains the default). Existing origin settings remain valid. Explain first-run failures separately: HA origin mismatch, setup secret, invalid fields, invalid timezone and network errors. Recover to login when owner creation has succeeded but automatic login fails. Keep origin and setup-secret checks enforced.

# 0.1.2

Fix a blank screen when browser storage is full or blocked. Theme and language remain usable in memory when preferences cannot be saved. Invalid saved values use safe defaults. SMARTi does not clear or evict Home Assistant browser data.

# 0.1.1

Installable through the built-in HA app store from the Git repository. Include a reproducible runtime payload, source/checksum manifest, app logo and direct repository-add link. No manual staging or file transfer is required for users. Build and runtime smoke verification for amd64 and aarch64.

# 0.1.0

Initial development foundation: local accounts, real HA WebSocket adapter, rooms, daily controls, explicit demo, responsive SMARTi design, and initial Ingress packaging. Physical hardware and HAOS validation pending.
