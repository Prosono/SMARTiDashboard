# Explicit live validation

Not performed in this environment: no HA endpoint/token or radio hardware was supplied.

1. On an isolated test HA installation, record Core, Supervisor, HAOS, integration, controller firmware and radio versions in COMPATIBILITY.md.
2. Import existing areas and devices read-only. Verify entity-level room overrides, disabled entities, multi-channel devices and unknown/missing values.
3. With the owner's explicit permission, select one harmless test lamp or switch. Confirm its current physical state, then issue one explicit on/off operation and compare the UI, HA state and actual device. Do not use locks, heating, gates or occupied-home automation as test targets.
4. Change a test entity in HA and verify the SMARTi stream. Interrupt the test network and restore it; verify stale indication, fresh registry/snapshot state, and no replayed command.
5. Verify HAOS Ingress at a dynamic prefix, regular and administrator SMARTi accounts, and rejected direct requests to the Ingress port. Verify LAN HTTPS trust on phone and desktop separately.
6. Stop SMARTi and verify an already configured harmless HA test automation continues to execute. This does not test failure of HA, the hub or power.

Radio exclusion is not implemented. For user-initiated inclusion testing, use a spare Zigbee2MQTT or Z-Wave JS device and record the integration versions. Verify the following manually:

- Zigbee2MQTT: availability, custom base topic if relevant, 120-second permit window, interview success/failure and confirmed close.
- Z-Wave JS: correct controller, S2 grant approval, DSK/PIN, failed interview and low-security warning.
- Stop, timeout, HA disconnect and SMARTi restart: never show unconfirmed pairing/close as success; no repeated start. On forced termination, Z-Wave may need explicit stop after restart or in HA.
- Confirm that the actual device appears with the expected capabilities and room after HA registry import. Do not infer physical success from the test fixtures.

Do not reset controllers or exclude existing devices as part of these tests.
