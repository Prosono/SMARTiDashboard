# SMARTi mobile and remote-access pilot

This is a runnable, **single-home demo pilot**, without public deployment. It includes the home/mobile backend, a separate Docker relay and an outbound home connector. It does not yet include an iOS/Android app, cloud account service, QR scanning UI, automatic address switching, installer ownership transfer, multi-home routing or managed certificate renewal. The existing HA installation is not modified or contacted by the demo.

## Run locally

From the repository root, with the existing Python environment, OpenSSL and Docker available:

```sh
make package
python3 scripts/prepare_pilot.py /tmp/my-smarti-pilot
docker compose --env-file /tmp/my-smarti-pilot/compose.env -f pilot/compose.yaml up --build -d
.venv/bin/python scripts/pilot_client.py /tmp/my-smarti-pilot
```

The preparation command creates a NEW private directory, random owner credentials, a random connector credential, an installation UUID and separate seven-day test certificates for home and relay. It refuses to overwrite existing files. The outer directory is mode 0700; files individually mounted into the non-root relay container are readable inside that container. Do not place this directory in Git or a shared folder. Keep the same directory when restarting the same pilot database.

All published ports bind to **127.0.0.1**. No certificate validation is disabled. The client trusts only the home pilot certificate for the inner connection, and the connector trusts only the relay pilot certificate for the outer connection.

| Address | Purpose |
|---|---|
| `https://localhost:18443` | Existing SMARTi browser UI, with isolated demo owner |
| `https://localhost:18444/api/mobile/v1/…` | Direct mobile API |
| `https://localhost:19443/api/mobile/v1/…` | Same mobile API through the relay |
| `wss://localhost:19444/connector` | Authenticated outbound connector endpoint |

The test owner credentials are in `secrets/owner.json` in your pilot directory. The Python client handles them without printing them. The UI uses a local test certificate, so normal browsers won't trust it automatically. The client demonstrates login through the browser API, issuing a one-use pairing code, pairing over remote TLS, reading the home, issuing a **simulated** lamp command, direct local access, refreshing tokens and revoking the phone. It refuses to send a command unless the backend reports demo mode. Reruns are subject to the existing authentication rate limits.

Stop the containers (retain the pilot home data):

```sh
docker compose --env-file /tmp/my-smarti-pilot/compose.env -f pilot/compose.yaml down
```

The Compose project is named `smarti-pilot`; use one instance at a time. Use `down --volumes` only when deliberately resetting this disposable demo. Test certificates expire after seven days; recreate the disposable pilot directory and database together for a fresh pilot.

## Architecture and encryption

```text
Phone/test client ─── HTTPS directly ──────────────────> Home mobile API
        │                                                  ▲
        └── inner TLS ──> Relay TCP port ── WSS tunnel ─────┘
                                      initiated from home
```

The home connector initiates WSS; no inbound home-router port is required for the relayed path. The relay authenticates a provisioned home UUID and random connector credential. It forwards opaque TCP bytes to one fixed home mobile listener. It cannot ask the connector to connect to arbitrary hosts or ports.

Inner TLS terminates on the home mobile API. The relay's TLS key is solely for the **outer WSS connection**, and is a different key/certificate from the home's. The relay mounts neither the home database nor the home's TLS private key. Home HTTPS validates the user/device token independently of relay authentication. The relay can observe addresses, timing and byte counts, and can interrupt traffic; it is not an anonymity service.

The pilot permits one active connector and up to 16 concurrent streams, with bounded frames, connection/write/idle timeouts and a five-minute stream lifetime. Tunnel loss closes existing streams. The connector reconnects with backoff; it never queues or replays device commands. An interrupted command has an unknown result and must not be retried automatically. Offline access is demonstrated through the direct home API; automatic mobile connection selection is not implemented.

## API contract

The mobile API is disabled by default (`SMARTI_MOBILE_ENABLED=false`). When enabled, the browser surface exposes these **admin + session + CSRF** endpoints, scoped to the logged-in user's account:

| Method/path | Purpose |
|---|---|
| `POST /api/mobile/pairings` | Issue a 256-bit, five-minute code; invalidate earlier unclaimed code |
| `DELETE /api/mobile/pairings` | Cancel the pending code |
| `GET /api/mobile/devices` | Installation ID and this user's devices, without credentials |
| `DELETE /api/mobile/devices/{id}` | Immediately revoke this user's device |

An eventual QR flow should contain the installation ID, endpoint, expiring code and a securely provisioned home certificate/public-key binding. This pilot passes the JSON and home trust certificate via the local test tooling; it is **not** a finished customer enrollment system. The UUID is a routing identifier, not proof of cryptographic identity.

The separate HTTPS listener (`python -m app.mobile_run`, port 8444) accepts no browser Origin and never uses cookies for mobile authentication. Web UI and bootstrap endpoints are inaccessible on that listener. The HA Ingress listener's Supervisor-IP, Origin and CSRF checks remain in place.

| Method/path under `/api/mobile/v1` | Authentication/body |
|---|---|
| `POST /pair` | `{installation_id, code, device_name}` |
| `POST /refresh` | `{installation_id, refresh_token}` |
| `GET /session` | Bearer access token; returns current role and installation ID |
| `GET /home` | Bearer access token; existing normalized home snapshot |
| `POST /controls/{entity_id}/commands` | Bearer access token; existing validated command body |
| `POST /logout` | Bearer access token; revokes this phone |

Pair/refresh return `installation_id`, `device_id`, `token_type`, `access_token`, `refresh_token`, `expires_at` and `device_expires_at`. Access lasts up to 15 minutes; rotating refresh credentials last up to 30 days, bounded by a 90-day device lifetime. Refresh immediately invalidates the old access token. Reuse of an old refresh credential revokes that device family; native clients must serialize refreshes and securely replace both credentials. A lost refresh response may require pairing again. Store credentials in the platform's protected credential storage, not browser localStorage.

Pairing consumption and refresh rotation use SQLite transactions, including concurrent-attempt tests. Only token digests are stored. Roles are re-read from the account for every authenticated request. Device revocation affects both local and remote access immediately. Existing offline account recovery now revokes mobile credentials and pending pairing codes as well as browser sessions. A persisted audit table records issuance, pairing and revocation events, without credential values.

## Docker image for your future server

Build the separate relay image:

```sh
docker build -f services/relay/Dockerfile -t smarti-relay:pilot .
```

It runs as UID/GID 10001 and needs readable, mounted configuration files:

- `RELAY_HOME_ID` (or `RELAY_HOME_ID_FILE`): provisioned installation UUID.
- `RELAY_TOKEN_FILE`: random connector credential, at least 32 characters.
- `RELAY_TLS_CERT` and `RELAY_TLS_KEY`: certificate/key for the outer WSS endpoint.
- Port 8443: TCP passthrough for the mobile HTTPS connection.
- Port 9443: TLS-protected WSS connector endpoint.

For a later **single-home** server trial, `app.smarti.dev:443` could map to TCP port 8443, and `app.smarti.dev:9443/connector` to the WSS port. The home mobile certificate must cover the hostname clients use. An ordinary HTTP reverse proxy that terminates the inner TLS on the relay would break this end-to-end design; use TCP passthrough. Domain/certificate provisioning is not automated. The local seven-day certificates must not be reused for a public deployment.

Before serving multiple customer homes, implement isolated per-home routing/credentials, enrollment and certificate lifecycle, a cloud account and invitation service, device-key binding, native apps and protected credential storage, account recovery, operational rate limits, monitoring, resource/load testing and installation validation. Do not expose this development pilot publicly as a finished product. No public deployment, DNS change, registry push or HA update was performed for this work.
