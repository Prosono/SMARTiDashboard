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
