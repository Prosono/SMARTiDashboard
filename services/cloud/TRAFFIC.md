# Hub traffic metrics

The relay counts forwarded opaque TLS bytes in each direction per home, grouped by
UTC date. No payloads, URLs, IP addresses, APNs tokens or user information are stored.
These are remote-access bytes, not total household internet use or local LAN traffic.
TCP/WebSocket overhead is excluded; TLS overhead is included. Connections are TCP
streams, not devices or people. Daily counters are retained for 90 days.

Set `RELAY_TRAFFIC_DATABASE=/metrics/traffic.sqlite` on both services. Mount a
separate `traffic` volume read/write in the relay and read-only in the portal.
The relay image initializes `/metrics` for UID 10001. The account database remains
read-only for the relay. Counters flush every ten seconds and on normal coroutine
shutdown; sudden process/host termination may lose the last unflushed interval.
A missing database yields `available:false`; stale counters are labelled after
60 seconds without a flush. Historic traffic cannot be reconstructed.

`GET /api/admin/traffic?days=30` requires the existing portal admin session and
accepts 1–90 days. It supplies daily totals and per-home breakdowns to `/admin/hubs`.
The interface offers 7/30/90 days and refreshes measurements every minute when visible.

Deployment 2026-10-21: `smartihome:fleet-20261021` and
`smartihome-relay:fleet-20261021`. The previous compose file is preserved on the
server as `compose.smartihome.before-fleet-20261021.yaml`. Measurements were verified
fresh and nonzero after deployment. No iOS or HA app update is required.

Validation: relay/TLS integration tests, traffic persistence and user isolation,
admin authorization, onboarding regression tests, and responsive light/dark browser
checks (`scripts/test_fleet.cjs`, `scripts/test_portal_design.cjs`).
