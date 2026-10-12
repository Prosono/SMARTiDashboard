# 0.1.3

Support multiple local/external addresses with additional_origins and explicit HTTP Ingress opt-in (HTTPS remains the default). Existing origin settings remain valid. Explain first-run failures separately: HA origin mismatch, setup secret, invalid fields, invalid timezone and network errors. Recover to login when owner creation has succeeded but automatic login fails. Keep origin and setup-secret checks enforced.

# 0.1.2

Fix a blank screen when browser storage is full or blocked. Theme and language remain usable in memory when preferences cannot be saved. Invalid saved values use safe defaults. SMARTi does not clear or evict Home Assistant browser data.

# 0.1.1

Installable through the built-in HA app store from the Git repository. Include a reproducible runtime payload, source/checksum manifest, app logo and direct repository-add link. No manual staging or file transfer is required for users. Build and runtime smoke verification for amd64 and aarch64.

# 0.1.0

Initial development foundation: local accounts, real HA WebSocket adapter, rooms, daily controls, explicit demo, responsive SMARTi design, and initial Ingress packaging. Physical hardware and HAOS validation pending.
