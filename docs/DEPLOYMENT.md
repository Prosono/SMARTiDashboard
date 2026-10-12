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
`make package` stages only the application source, locked requirements and built frontend under `ha-app/`. Copy that entire staged directory into HA's local app directory (`/addons/smarti`), reload the app store and install the local SMARTi app. A raw clone of this repository is not an installable remote app repository until packaging has run; generated assets are intentionally not committed. No images/releases have been published.

Configure `origin` as the exact HTTPS origin used to open Home Assistant (including a nonstandard port) and `bootstrap_secret` as a random installer-provided secret. Start the app, open its Ingress panel and create a SMARTi owner. Clear the bootstrap secret after setup.

The app uses `/data` for SQLite and Supervisor's HA proxy with `homeassistant_api`. It requests no host devices, privileged mode, Docker socket or write access to HA configuration. Its ingress listener is 8099 and is not published to LAN. A separate LAN entry point for this same HA app instance is planned; standalone HTTPS works now. No architectures beyond built/tested amd64 are advertised. HAOS end-to-end deployment still requires a real installation test.

## Backup
Stop SMARTi before a filesystem backup, then copy `smarti-live.sqlite3` (or `smarti-demo.sqlite3`) from its data directory. Protect this file: it contains password hashes and sessions. Restore into the same path and mode with ownership restricted to the service. Revoke sessions using the recovery tool after restoring a backup. Keep HA backups and Z-Wave/Zigbee network backups separately; SMARTi metadata cannot restore radio networks. HA state/registry cache is rebuilt on connection.
