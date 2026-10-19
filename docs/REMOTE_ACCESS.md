# SMARTi remote access — enrollment foundation

## Deployment target

- Host: 65.21.203.106; SSH user: omni
- Directory: /home/omni/smartihome
- Compose file: /home/omni/smartihome/compose.smartihome.yaml
- Container: smartihome
- Host port: **127.0.0.1:18080**; container HTTP port: 8080
- Public entry: **https://home.smarti.dev**, via existing Caddy

SSH access uses the user-authenticated control socket /tmp/smartihome-ssh.
This is an account/enrollment foundation, not a complete customer remote-access release.

2026-10-18: built and started smartihome:development on the target server.
Verified /healthz returns ok and / returns HTTP 200 over 127.0.0.1:18080.
Container runs as 10001:10001 with zero restarts at verification. Existing Caddy,
omnigrid and hads containers remain running. Subsequently published the account
portal via Caddy on home.smarti.dev, verified public HTTPS and HTTP 200.
Original Caddy config is backed up as Caddyfile.before-smarti-* in the project
directory. Both home and *.home DNS records resolve to the target IP.
Cloud accounts volume: smartihome_accounts. Source snapshot: source/ under the
project directory. Provision secret: secrets/provision, inside a private directory.

Caddy runs in container omnigrid-caddy-1 on network omnigrid_default. Its
configuration is /opt/omnigrid/Caddyfile (mounted at /etc/caddy/Caddyfile).
Existing omnigrid and hads routes are preserved. The app joins omnigrid_default
and Caddy proxies to smartihome:8080. The deployed site is in
services/cloud/Caddyfile.server. Forwarded client IPs are trusted only from
172.18.0.3 (the inspected Caddy address); revisit this if Caddy is recreated.
Caddyfile.example is solely a host-run Caddy example, not this deployment.

DNS: Namecheap A record, host `home`, value `65.21.203.106`. Do not add AAAA without
configured IPv6. Do not open port 18080 publicly. Caddy uses public ports 80/443.

## Implemented locally

Separate account service and browser portal, with Docker and Compose definitions:

- Account creation/login, password hashing, secure HttpOnly SameSite cookies.
- Exact-origin and CSRF verification for browser mutations.
- Multiple homes per owner with isolated lists; no implicit username/email linking.
- Separate operator provisioning and per-hub random credentials.
- Five-minute, single-use home claim codes, stored hashed.
- Code rotation invalidates earlier codes; concurrent claims have one winner.
- Bootstrap keys stay local; cloud credentials never enter browser localStorage.

The portal deliberately has no Open home button yet. Cloud ownership must not
silently grant a local hub session or bypass its RBAC.

## Running the foundation

Build from repository root:

    docker build -f services/cloud/Dockerfile -t smartihome:development .

For local Compose, set SMARTI_PROVISION_SECRET_FILE to an external file containing
at least 32 random bytes encoded as text. services/cloud/compose.yaml builds from
the checkout. The server example services/cloud/compose.smartihome.yaml uses the
built image and mounts /home/omni/smartihome/secrets/provision. Never commit that
file. Preserve and back up the accounts volume. The server Compose file is deployed.

Operator API: POST /api/provision/homes, Bearer provisioning credential, body
{"name":"Hjemme"}. Securely deliver the returned installation_id and credential
to that specific hub. These are not customer login credentials.

Hub API: POST /api/hubs/{installation_id}/claim-code with Bearer hub credential.
A local administrator can request/cancel this code under Settings → System.
Set SMARTI_REMOTE_IDENTITY_FILE to a private JSON file containing installation_id
and credential on a provisioned hub. The app never returns that credential to the
browser. The user signs into the portal and enters the code. A claimed home cannot
issue another ownership claim. Local admin can disable or re-enable remote access;
cloud owner can disable it. An unprovisioned hub makes no cloud requests.

## Remaining before customer use

1. Automated secure delivery of hub identity, QR, target-home confirmation and
   installation packaging. The local admin dialog/API is implemented in 1.35.30,
   packaged locally, not installed on the actual hub.
2. Deploy the new multi-home TLS router and implement certificate lifecycle.
   Each hub needs its own browser-trusted certificate with its private key on
   the hub. A single shared wildcard private key is not an acceptable substitute.
   The current Caddy HTTP proxy cannot pass opaque TLS ClientHello through;
   production port 443 needs an L4-aware ingress plan preserving existing sites.
   No wildcard home proxy or public relay port has been enabled.
   Caddy termination for the account portal does not change the pilot's end-to-end
   home TLS guarantee.
3. Browser-compatible remote sessions, explicit cloud-to-local user mapping, and
   enforcement of current hub function-level RBAC.
4. Invitations, acceptance/revocation, account recovery, MFA, audit trail,
   credential rotation and ownership transfer/reset.
5. Native app onboarding and protected credential storage. Current browser cookies
   are not a native OAuth/token API.
6. Monitoring, backups/restore and load tests. Account service has bounded
   password hashing concurrency, request concurrency and per-IP/account throttling.
   Proxy trust is explicitly limited to Caddy, not arbitrary forwarded headers.
7. Two actual SMARTi hubs and browser sessions end-to-end before enabling customer
   home access. The lower-level two-home TLS routing tests already pass locally.

backend/tests/test_cloud.py covers account isolation, multiple homes, single-use
claims, races, expiry, code rotation, wrong hub credentials, origin/CSRF, logout,
secret hashing and brute-force limits.

## Multi-home tunnel implementation

backend/app/multihome_relay.py uses the cloud database read-only. Only claimed,
enabled homes can authenticate their outbound WSS connector. The router accepts a
bounded TLS ClientHello, matches the exact UUID.home.smarti.dev hostname, and
forwards the original bytes to that home's tunnel. No default-home fallback exists.
Home authentication remains inside home TLS. Existing streams close after revocation
or credential rotation (checked once per second); new connections check immediately.
The routing service requires outer WSS certificate/key configuration and the cloud
DB via CLOUD_DATABASE. Build with services/cloud/Dockerfile.relay. It has not been
started on the production server.

Tests cover fragmented ClientHello, malformed/plaintext/oversized requests, two
simultaneous homes with distinct certificates, wrong connector credentials, local
authentication, certificate mismatch, revocation, reconnect and unaffected other home.

## 2026-10-18: deployed tunnel and certificate pilot

The earlier remaining-items list above describes the initial foundation. The
following pieces are now implemented and deployed:

- Public TCP 443 is owned by `smartihome-edge` (HAProxy, pinned image digest).
  SNI ending `.home.smarti.dev` goes to `smartihome-relay:8443`; the relay
  separately requires a canonical, enabled, claimed home UUID. Other names go
  to Caddy with PROXY v2. No home private keys are present on either service.
- Caddy still owns public HTTP 80 and UDP 443. Its TCP 443 host mapping is now
  `127.0.0.1:14443`. `/opt/omnigrid/compose.yaml` was changed only for that TCP
  mapping. The Caddy listener trusts PROXY metadata only from edge IP
  `172.18.0.240/32`. Caddy's own IP remained `172.18.0.3`, preserving cloud
  forwarded-IP trust. All three existing sites passed before/after health checks.
- `wss://home.smarti.dev/relay/connect` terminates outer TLS at Caddy and rewrites
  to the authenticated `/connector` on the private relay. Inner home TLS stays
  opaque. Relay ports 8443/9443 are NOT published. Plain WS is explicitly enabled
  only inside the Docker network; standalone relay defaults to verified TLS.
- The cloud queries internal `/status` to show a home link only when its enabled
  hub is connected. Portal accounts do not become local hub sessions.
- HTTP-01 serves only current, owner-linked, enabled-home challenges on the
  exact UUID hostname. Proofs expire after 15 minutes and are replaced per home.
  Certbot 5.8.0 runs on the hub, with separate staging/production state, 180-second
  process deadline, persistent private key directories, and renewal every 12h
  with a 1h retry after failure. TLS contexts reload without replaying commands.
- The optional local runtime shares the primary HA adapter; it binds only a
  loopback ephemeral TLS port for the outbound connector. Browser access requires
  the exact home host/origin, local login, CSRF and existing RBAC. It uses
  `__Host-smarti_remote`, rejects bootstrap/claim/mobile routes remotely, ignores
  forwarded headers, and cannot weaken the Supervisor ingress boundary.
- HA package 1.35.31 discovers installer-owned `/data/remote-identity.json`.
  Without this file it makes no remote connection. Hub provisioning remains an
  installer operation; customer self-service/native onboarding is not complete.

Evidence: a real Let's Encrypt STAGING certificate was issued for a temporary
home, with key generated on the local test hub. A verified WSS connector went
through deployed Caddy/relay. A TLS client pinned to the staging certificate
reached the actual SMARTi remote surface through PUBLIC port 443 and received
401 without local login. This does not validate a production certificate or a
physical customer hub. No real Home Assistant device was controlled.

Rollback files on server:
- `compose.omnigrid.before-edge.yaml`
- `compose.smartihome.before-public-edge.yaml`
- `Caddyfile.before-proxyprotocol-*` and earlier `Caddyfile.before-*`

To roll back public routing: first restore the edge Compose snapshot and run
`up -d --no-deps edge-router` to free TCP 443; then restore the saved omnigrid
Compose content to `/opt/omnigrid/compose.yaml` and recreate only `caddy` there.
Restore the Caddyfile backup in place and reload if removing the PROXY listener.
Do not stop unrelated containers or delete the accounts volume.

Still required before customer rollout: install and provision the updated actual
hub, verify trusted production TLS and two real households, complete customer
self-service enrollment/invitations/account recovery/native-app identity storage,
and monitoring/backups/load testing. The bootstrap secret stays local and must
not be used as a cloud credential.

### Manual Supervisor configuration — 1.35.32

A local HA administrator can now supply `remote_installation_id` and
`remote_credential` in the SMARTi app Configuration tab. The latter uses the
Supervisor password schema. Startup validates both fields and atomically saves
an owner-only identity file before enabling the runtime. Invalid input logs only
a generic message and leaves local access working. Empty options preserve earlier
installer-provisioned files. These are operator-issued hub credentials, not a
bootstrap secret. No new browser provisioning endpoint was introduced.

### Local UI provisioning — 1.35.33

`POST /api/remote/provision` accepts a canonical hub UUID and bounded URL-safe
credential only from a local administrator with valid Origin/CSRF. It verifies the
pair at the fixed cloud origin, disallows already-claimed identities, and atomically
creates the private file with no-overwrite semantics. Credentials never appear in
the response. Existing hub identity cannot be replaced through this endpoint.
The app lifespan owns an idempotent start callback, enabling the remote runtime
without restarting the primary HA connection. Remote surfaces reject this entire
route prefix. Supervisor configuration remains available as an installer fallback.
