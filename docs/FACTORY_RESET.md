# Factory reset — 1.35.71

Managed HA hubs now support coordinated full reset. Advanced-mode administrators
must confirm data loss, pairing limitations, backup choice, RESET HUB and their
current password. Temporary support users cannot perform reset. No customer hub
was reset during development.

## Sequence

1. Validate HA storage schemas, standard HA HTTP/bridge configuration, writable
   configuration mount and cloud coordination. Custom recorder layouts
   are blocked before mutation rather than claiming an external database is erased.
2. Do not unpair devices, start exclusion or reset radio controllers. Retain local
   Zigbee2MQTT/Z-Wave app directories; explain that any pairing removal is manual.
3. Cloud revokes home-scoped member, support and portal access and old setup plans.
   Portal account, immutable hub identity and ownership stay intact.
4. Disable automatic Core restart and stop Core. Replace its configuration with
   loopback/private Supervisor bridge bindings before changing authentication.
5. Remove human HA users (including owner), credentials, tokens and TOTP. Preserve
   system-generated service accounts for Supervisor. Remove HA configuration,
   registries, SQLite history, logs and customer files. Installed custom integration
   and blueprint software stays. Installed Supervisor apps are not uninstalled.
6. Clear SMARTi users, sessions, phone registrations and customer settings. Keep
   the reset journal and hub identity. Enable SMARTi automatic boot, persist the OS
   boot ID and request one host reboot. Never replay an uncertain reboot request.
   A changed OS boot ID confirms reboot; Core remains stopped awaiting its owner.
7. The existing portal owner scans the physical QR label again. The server requires
   owner authorization and label proof for this reset generation before accepting
   a setup plan; a direct URL or LAN discovery proof cannot bypass this. The
   confirmed password is encrypted to an ephemeral hub key; the cloud stores only
   ciphertext. The hub creates a new HA owner through onboarding while isolated,
   then restores normal Core startup and applies SMARTi user/location/room setup.
8. Successful setup restores remote access. Integration connections must be
   configured again; radio pairings are retained unless the user removes them manually.

## Failure and recovery

Interrupted destructive jobs are never replayed automatically. Startup marks
interrupted preparation/erase/ambiguous owner creation failed. Core must remain
stopped or isolated until support reviews the journal. Do not manually start HA,
restore old credentials, or delete the reset marker to bypass recovery.
Awaiting-owner acknowledgements can be retried; owner-creation POSTs cannot.
The portal retains the pairing report even though local user sessions are removed.

## Validation

Unit coverage includes schema refusal, revoked access, preserved ownership,
encrypted credentials bound to one hub/reset, idempotency, erasure, cloud failure,
and unsafe recorder layouts. Desktop/mobile reset dialog tests pass.
scripts/test_ha_auth_reset.py passed with real HA 2026.10.2 in a disposable Docker
internal network without published ports. It ran the full coordinator, verified
old HA and SMARTi users were removed, created exactly one new owner and restored
normal startup. The Supervisor adapter was simulated with Docker start/stop.
Real HAOS service reconnection and physical radio behavior still require the
new spare hub test. Do not describe the Docker test as a hardware test.

Local YAML packages/includes are inspected recursively before reset. External paths,
symlinks, cycles and recorder configuration remain blocked. Failed preflight returns
a safe, specific reason to the administrator without exposing file contents.

For 1.35.71, unit tests also verify exactly one OS reboot request, recovery after
a changed boot ID, preserved radio data and owner-plus-QR gating. The Docker harness
simulates the OS boot transition; real HAOS reboot is tested only on the spare hub.

### Radio connections after reset (1.35.72)

Owner setup now verifies retained Zigbee2MQTT and Z-Wave JS UI connections before completion. SMARTi confirms the Supervisor-discovered MQTT integration and creates a manual Z-Wave JS integration pointing to the installed UI app's internal hostname and port 3000. It never installs a second radio app, changes radio options or initiates pairing. Existing integration entries are not replaced. Unknown/multiple app installations, missing MQTT discovery, disabled integrations and unavailable bridges block success and require manual assistance.

The heartbeat also repairs completed resets from earlier versions once, recording success only after both providers are ready. Updating does not initiate another reset. A real hub check is required for MQTT discovery and radio connectivity; unit tests use simulated HA/Supervisor responses.
