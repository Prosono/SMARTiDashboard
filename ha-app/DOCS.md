# Install SMARTi from the Home Assistant app store

Requires Home Assistant OS with the app store and a configured Home Assistant URL. Both local and external URLs can be allowed. This development preview requires its own SMARTi login inside Ingress.

1. Open **Settings → Apps → App store** (older versions call these Add-ons).
2. Open the store's three-dot menu → **Repositories**.
3. Add `https://github.com/Prosono/SMARTiDashboard`.
4. Find **SMARTi**, open it and select **Install**. HA downloads the repository and builds the app; the first installation can take several minutes. No manual file copying is needed.
5. In SMARTi's **Configuration** tab, set:

```yaml
origin: "https://your-external-home-assistant-address"
additional_origins:
  - "http://homeassistant.local:8123"
allow_http_ingress: true
bootstrap_secret: "a-long-random-secret-from-your-password-manager"
```

`origin` is exactly the scheme, hostname and port used in the browser address bar, without a path or trailing slash. Example: `https://ha.example.net:8123`. Add each additional local or external address to `additional_origins`. Existing installations can keep their `origin` unchanged and add the other address. Save and restart SMARTi after changes. HTTPS certificates must be trusted by the browser.

Local HTTP Ingress requires `allow_http_ingress: true` (default false). HTTP sends credentials and sessions unencrypted on the LAN; use it only on a trusted network, and prefer HTTPS where available. HTTPS logins always retain Secure cookies. Sessions are separate for each hostname, but both addresses use the same SMARTi accounts and home. Standalone deployments still require HTTPS.

Choose a unique random `bootstrap_secret` of at least 24 characters, using a password manager. Do not use the example above as the actual secret. This setup secret establishes the first SMARTi owner; it is not your HA password or token.

6. Save, start SMARTi and select **Open web UI**. The backend connects to HA using Supervisor automatically; no HA token needs to be entered.
7. Enter the bootstrap secret and choose your SMARTi username/password. Once owner setup succeeds, clear `bootstrap_secret` in the app configuration and restart SMARTi. Existing accounts and sessions remain stored in `/data/smarti-live.sqlite3`.
8. Check that imported rooms/devices match HA before testing one harmless lamp. Use **Add device** in SMARTi for Zigbee2MQTT or Z-Wave JS pairing once the existing radio integration is configured.

## Ingress and updates
Only the Supervisor proxy is accepted on the private port 8099. No LAN port is exposed. SMARTi does not infer administrator rights from HA headers. Use the built-in app manager to start, stop, uninstall and update SMARTi. Enable automatic startup only when satisfied with the test installation; automatic updates are not configured by this repository.

If SMARTi is absent, refresh the app store and confirm that the repository is accessible and your architecture is listed in config.yaml. Read the app's Logs tab if installation or startup fails. Do not put tokens, passwords or setup secrets into shared logs.

## Data and verification
Back up the `/data` database with the app stopped. HA backups and radio-network backups are separate. The containers are build- and smoke-tested; real HAOS/Ingress, registry permissions and physical devices still need installation validation. No production-readiness claim. See the repository's docs/SECURITY.md for console account recovery and docs/DEPLOYMENT.md for optional standalone LAN HTTPS.

## Add devices from SMARTi (0.2.1)

Sign in as a SMARTi administrator and open **Add device**. Zigbee2MQTT must already run with HA MQTT integration enabled. The default base topic is `zigbee2mqtt`; if yours differs, set `zigbee2mqtt_base_topic` in this app configuration and restart SMARTi. No broker password is entered in SMARTi. Z-Wave JS must already have a loaded integration and connected controller; select the controller if more than one is configured.

Start pairing, then activate pairing on a spare device following its manufacturer instructions. SMARTi follows bridge/controller events and provides stop, security-grant approval and five-digit Z-Wave DSK PIN entry. Check the DSK against the device label. Only admins can use this flow. Demo mode never opens a radio.

The search window is bounded to 120 seconds; Zigbee2MQTT receives its own 120-second permit-join duration. Z-Wave stop is sent by the SMARTi backend timer. On disconnect, timeout or forced app termination, stop may be unconfirmed: the UI reports uncertainty and blocks another start. A persisted marker survives restart; reconnect and explicitly stop before starting another search. Never treat a request acknowledgment or HA device-registration event alone as completed pairing. A low-security Z-Wave result is shown as a warning. This has contract/browser coverage, but actual radio validation is still required.

Bluetooth, ZHA and Matter commissioning are not included in this version. Bluetooth setup depends on the specific device integration. Existing devices from these integrations continue to be imported normally when their controls are supported.
