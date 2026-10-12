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
