# Deployment

## Standalone LAN HTTPS
1. Build the frontend and staged container context: `make package`.
2. Copy `.env.example` to `.env`, configure the existing HA URL and server-side token, a random bootstrap secret, and the exact HTTPS SMARTi origin.
3. Obtain a certificate for the chosen DNS name or LAN IP from your organization's/local trusted CA. A DNS certificate must include that exact DNS name in its SAN; an IP URL needs an IP SAN. Store the certificate chain as `server.crt` and private key as `server.key` in a directory readable only by the installer/service.
4. Install the issuing CA certificate in every client's trusted root store using your organization's device management or OS certificate settings. Keep the CA private key off the hub. Do not bypass browser warnings. Publicly trusted certificates can also be provisioned using a domain you own and DNS validation.
5. Set `SMARTI_CERT_DIR` to that directory and run `docker compose up --build -d`.
6. Open the configured origin, e.g. `https://192.168.1.50:8443/`, and enter the installer secret to create the owner. Remove the secret from `.env` and recreate the container after bootstrap.

Concrete local-CA example for an installer with OpenSSL (choose your actual IP; keep the CA material securely on the installer machine):

```sh
openssl req -x509 -newkey rsa:3072 -sha256 -days 3650 -keyout ca.key -out ca.crt -subj '/CN=SMARTi local CA'
openssl req -new -newkey rsa:3072 -nodes -keyout server.key -out server.csr -subj '/CN=192.168.1.50'
printf 'subjectAltName=IP:192.168.1.50\nextendedKeyUsage=serverAuth\n' > server.ext
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out server.crt -days 365 -sha256 -extfile server.ext
chmod 600 server.key
```

Trust `ca.crt` on clients, transfer only `server.crt` and `server.key` to the hub, and renew before expiry. Installing a new CA is a device-owner action, not automated by this repository. No `smarti.local` name is assumed. Reserve the chosen hub IP in your router or configure DNS explicitly. TLS to HA is verified normally when using an HTTPS HA endpoint.

## Home Assistant OS app / Ingress

Install through the built-in app manager: Settings → Apps → App store → menu → Repositories. Add `https://github.com/Prosono/SMARTiDashboard`, find SMARTi and select Install. Older HA versions label apps as add-ons. See [the complete UI instructions](../ha-app/DOCS.md).

Configure `origin` as the exact browser origin used to open HA (including a nonstandard port), and add other local/external addresses to `additional_origins`. Local HTTP Ingress also requires `allow_http_ingress: true`; prefer HTTPS to protect credentials on the LAN. Set `bootstrap_secret` as a unique random secret of at least 24 characters from a password manager. Start, open the web UI and create a SMARTi owner. Clear the secret after setup. Supervisor provides HA authentication automatically.

The app uses `/data` for SQLite and Supervisor's HA proxy with `homeassistant_api`. It requests no host devices, privileged mode, Docker socket or write access to HA configuration. Its ingress listener is 8099 and is not published to LAN. A separate LAN entry point for this same HA app instance is planned; standalone HTTPS works now. HAOS end-to-end deployment still requires a real installation test.

### Maintainer packaging
`make package` creates `ha-app/payload.tar.gz` and `payload-manifest.json`; both must be included in Git when application code changes. The deterministic archive includes only runtime backend source, locked Python requirements and compiled frontend assets. Source and payload SHA-256 hashes are recorded. `scripts/package.py --check` checks that the committed package matches a fresh build; CI enforces this. Docker uses only files inside ha-app/, exactly as Supervisor does. End users do not need to run these commands.

The repository uses on-device Docker builds, not externally published images. Updating the app version in config.yaml makes a newly pushed version discoverable by HA's app manager. Local changes must be pushed to the repository before HA can fetch them.

## Backup
Stop SMARTi before a filesystem backup, then copy `smarti-live.sqlite3` (or `smarti-demo.sqlite3`) from its data directory. Protect this file: it contains password hashes and sessions. Restore into the same path and mode with ownership restricted to the service. Revoke sessions using the recovery tool after restoring a backup. Keep HA backups and Z-Wave/Zigbee network backups separately; SMARTi metadata cannot restore radio networks. HA state/registry cache is rebuilt on connection.

## Zigbee2MQTT transport

Version 0.2.5 supports HA MQTT (default) and a direct connection to an external Zigbee2MQTT frontend, including setups using Zigbee2MQTT Proxy. See [transport configuration and verification](../ha-app/DOCS.md#zigbee2mqtt-ha-mqtt-or-an-external-server--proxy). Standalone deployments use `SMARTI_ZIGBEE2MQTT_TRANSPORT=frontend`, `SMARTI_ZIGBEE2MQTT_SERVER=http://your-zigbee2mqtt-host:8080` and optional `SMARTI_ZIGBEE2MQTT_AUTH_TOKEN`. These are server-side settings; don't use the coordinator's TCP socket address. HA entity controls continue to use the HA integration.
