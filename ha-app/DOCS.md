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

## Add devices from SMARTi (0.2.5)

Sign in as a SMARTi administrator and open **Add device**. Zigbee2MQTT must already run. Select one of the two connection methods below. Z-Wave JS must already have a loaded integration and connected controller; select the controller if more than one is configured.

Start pairing, then activate pairing on a spare device following its manufacturer instructions. SMARTi follows bridge/controller events and provides stop, security-grant approval and five-digit Z-Wave DSK PIN entry. Check the DSK against the device label. Only admins can use this flow. Demo mode never opens a radio.

The search window is bounded to 120 seconds; Zigbee2MQTT receives its own 120-second permit-join duration. Z-Wave stop is sent by the SMARTi backend timer. On disconnect, timeout or forced app termination, stop may be unconfirmed: the UI reports uncertainty and blocks another start. A persisted marker survives restart; reconnect and explicitly stop before starting another search. Never treat a request acknowledgment or HA device-registration event alone as completed pairing. A low-security Z-Wave result is shown as a warning. This has contract/browser coverage, but actual radio validation is still required.

Bluetooth, ZHA and Matter commissioning are not included in this version. Bluetooth setup depends on the specific device integration. Existing devices from these integrations continue to be imported normally when their controls are supported.

## Zigbee2MQTT: HA MQTT or an external server / Proxy

A USB or Ethernet/Wi-Fi coordinator is managed by Zigbee2MQTT, not directly by SMARTi. Zigbee2MQTT Proxy only opens the external frontend; it does not connect HA to that server's MQTT broker. SMARTi supports both connections explicitly:

**Existing HA MQTT (default):**
```yaml
zigbee2mqtt_transport: ha_mqtt
zigbee2mqtt_base_topic: zigbee2mqtt
```
HA's MQTT integration must connect to the same broker as Zigbee2MQTT. Set the base topic to the actual `mqtt.base_topic`. No broker password is entered in SMARTi.

**External Zigbee2MQTT, including installations using Zigbee2MQTT Proxy:**
```yaml
zigbee2mqtt_transport: frontend
zigbee2mqtt_server: "http://192.168.1.50:8080"
zigbee2mqtt_auth_token: ""
```
Replace the example with the same `server` address used by Zigbee2MQTT Proxy. Use the frontend URL (including any configured base path), **not** the coordinator's `tcp://…:6638` address, an HA Ingress URL, or the Proxy sidebar link. SMARTi connects server-to-server to `/api` over WebSocket. `zigbee2mqtt_base_topic` is not needed for routing in this mode; the external frontend handles its own base topic. No new inbound port is exposed by SMARTi.

If Zigbee2MQTT frontend has an `auth_token`, enter that same token in `zigbee2mqtt_auth_token` (password field). Otherwise leave it empty. This is not a SMARTi bootstrap secret, HA token or MQTT password. Keep it private. The server URL/token stay on the backend and are not returned in diagnostics. HTTPS verifies the server certificate; HTTP should only be used on a trusted local network. SMARTi's container must be able to reach the configured server.

Save and restart SMARTi. Under **Devices → Zigbee → Zigbee connection**, choose **Check connection**. It reads bridge status and the device list without opening pairing. Then test start/stop with a spare Zigbee device. Direct mode supports inventory, pairing and removal even without HA MQTT; device controls and HA sensor readings still require the devices to be integrated into HA. The frontend API does not distinguish cached device samples, so SMARTi does not present their receipt time as a fresh radio measurement. Availability may remain unknown if reporting is disabled in Zigbee2MQTT.

Contract tests cover both transports, authentication failures, reply correlation and disconnect recovery. Physical coordinator/HAOS verification is still required. Commands are never replayed when a connection is restored.

References: [Zigbee2MQTT Proxy](https://github.com/zigbee2mqtt/hassio-zigbee2mqtt/tree/master/zigbee2mqtt-proxy), [frontend configuration](https://www.zigbee2mqtt.io/guide/configuration/frontend.html).

## Administration and Home overview (0.4.0)

- **Rooms → Manage rooms** (administrator): create, rename or delete rooms; move physical devices between rooms. Entity-specific room assignments have precedence. Expand the overrides section and select Follow device to clear one. Deleting a room preserves its devices and removes their assignment to that room.
- **More → Automations** (administrator): create routines with time/state/sun triggers, state/numeric conditions and actions. Reorder or remove blocks; use Advanced editing (JSON) for other triggers, templates, blueprints and arbitrary HA-supported actions. Unsupported blocks are preserved, never silently simplified. Existing file-managed automations with no editable config API entry must be edited at their source. A confirmed manual run checks conditions first. Saving an automation does not manually run it; its configured triggers become active in HA.
- **More → Integrations** (administrator): view connected config entries, rename, enable/disable and reload them. Restart requirements are reported without automatically restarting HA. Creating integrations, OAuth/config flows and vendor option screens remain deferred.
- **More → Updates** (administrator): lists HA update entities, preserving versions and real progress. Home Assistant names use SMARTi branding in this view. Installation requires confirmation and can request a backup only when the entity advertises it. An accepted request is not proof of completed installation. If a request times out, check the actual component status before retrying; restarting the component can interrupt the UI. Sources without an install capability are read-only.
- **Home → Personalize Home**: choose favorite rooms, devices and cameras. An administrator can upload room photos and bind Home/Away/Night/Holiday to existing scenes, scripts or automations. Every activation requires confirmation. Unconfigured modes open setup and do not perform actions. SMARTi chooses the responsive layout; there is no dashboard editor.
- Home shows only relevant sections. Visible camera cards now play live HLS video through SMARTi. Energy shows individual readings and recorder statistics with configurable charts and periods. Solar, battery and consumer readings use the existing HA energy configuration when available. Activity shows observed changes since SMARTi started, not the full HA logbook.

HA's configured admin API credential is required for administration. Ingress supplies the Supervisor credential as before. No browser receives that credential. These HA configuration endpoints are version-sensitive; verify against your installed Core version. Old SMARTi dashboard routes now return 410; existing saved layout rows are retained but not exposed. Back up `/data` before upgrading; migration to schema 4 preserves accounts, sessions, favorites and prior settings. Demo room/automation/integration changes are temporary, and update installation is simulated. Home preferences and uploaded room photos persist within the selected demo/live database.


## Live cameras, scenes and energy (0.5.0)

**Live cameras:** select cameras under Personalize Home. Visible cards automatically start muted live playback; scrolling away, hiding the tab or pressing Stop releases the player session. Use the player controls or fullscreen to inspect a camera. Up to four live sessions per user are allowed. The browser connects through SMARTi, including HA Ingress, rather than directly to the camera's LAN address. This requires the camera to support HA's HLS stream API; WebRTC-only cameras currently show an explanatory error. HLS has buffering latency. A still image is never labelled LIVE. After a long session or an error, use Retry. Native Safari playback and physical cameras still require installation testing.

**Scenes:** Home lists native HA scenes. Select favorite scenes using the star or expand the full list. Administrators can create a scene in three steps: name/icon, devices and desired states, then review/save. The editor supports lights, switches and climate; existing unsupported devices and advanced fields are preserved. Saving does not activate anything. Activation requires confirmation; an accepted request is not proof that every device reached its target. Existing scenes must be available through HA's editable scene configuration API to be edited or deleted. Demo scenes persist in the demo database and only simulate activation.

**Energy:** open Customize in the energy section to select up to six meters, bar/line charts and visible summaries, comparisons, meter lists and configured sources. These choices are personal. Periods cover the latest completed 24 hours, 7 days or 30 days, not calendar days. Energy uses recorder hourly changes (kWh); power uses hourly means (kW). Missing history stays a gap; incomplete totals show coverage and comparisons require complete current and previous periods. Meters are shown separately because they can overlap. Costs and estimated savings are not calculated. HA recorder statistics must exist for the chosen entities. Solar, storage and consumer readings use HA energy preferences when accessible entities are configured.

API references: [HA camera streams](https://github.com/home-assistant/core/blob/dev/homeassistant/components/camera/__init__.py), [native scene configuration](https://github.com/home-assistant/core/blob/dev/homeassistant/components/config/scene.py), [recorder statistics](https://github.com/home-assistant/core/blob/dev/homeassistant/components/recorder/websocket_api.py).


## Home tabs (0.6.0)

Home now has five fixed views: **Overview**, **Lights**, **Energy**, **Security** and **Climate**. Tap/click a tab, use arrow keys while the tabs have focus, or swipe horizontally across the content on a touch screen. Swipes starting on buttons, sliders, charts, video or dialogs do not switch views. The first and last views do not wrap when swiping. Home starts on Overview; no browser storage is required for tab navigation.

Overview contains your greeting, weather, favorite rooms/devices, scenes and security attention notices. Presence comes from HA `person` entities and displays Home, Away or Unknown. No people are inferred from motion sensors or usernames. When disconnected, presence is shown as unknown. Configure people and their presence sources in HA; SMARTi does not create trackers. Coordinates, tracker references and HA user IDs are omitted from person attributes sent to the browser.

Lights and Climate group the existing controls/readings by room, with search and expandable lists for large rooms. Capabilities remain those of the imported devices; this release does not add color or HVAC-mode controls. Energy retains personal meter/chart choices. Security groups cameras, sensor/alarm status and supported lock/gate controls; alarm arming is not added. Cameras start only while their cards are visible on Security and stop when leaving it. Missing integrations have useful empty states instead of invented readings. Preferences and scene management remain under Home.


## Color palettes and room overview (0.7.0)

Choose the palette icon in the top bar, or open More → Settings → Color palette. SMARTi, Fjord, Forest, Sand and Plum can each be combined with light or dark mode. The choice applies to this browser and is retained when optional browser storage is available; it is not a household-wide setting. The SMARTi logo stays unchanged. Escape closes the quick palette menu.

Opening a room from Home or Rooms now shows its photo, actual status and grouped sections for lighting, climate/air, power/outlets, security, cameras and other supported controls. Search within the room, use section shortcuts, or select another room at the top. Empty categories are omitted; larger categories have Show all. Control capabilities, availability checks and action confirmations are unchanged. Camera playback follows the existing visibility/session rules and stops when leaving the room. A temperature summary uses one named sensor/thermostat and converts Fahrenheit to Celsius; it is not an average. Connection status describes data availability, not radio signal quality or verified physical execution.

Personal room photos configured under Home → Personalize Home take precedence. Otherwise supported room names use a labelled decorative image; unavailable images fall back to a plain header. Manage rooms opens the existing administrator room-assignment editor.


## People, tomorrow’s weather and integration device details (0.8.0)

On Home, choose **Velg personer** to select existing people and optionally show only those at home. Selection is personal to the logged-in account; unknown/offline presence stays visible. Administrators can choose a profile image in the same panel. Uploaded images are cropped to a square and shared with the home; “Bruk systembildet” removes the override. Native local person images are fetched through the authenticated backend. External image URLs are not fetched; upload a photo instead. This does not create tracking entities or change their location data.

The weather card shows now and tomorrow. Tomorrow requires a daily forecast from the configured weather integration; missing data is explicitly labelled. Dates follow the configured home timezone. Forecasts are cached for five minutes. The implementation uses the official [weather.get_forecasts service](https://www.home-assistant.io/integrations/weather/).

Under **Integrasjoner**, expand a group and select a device. The administrator dialog shows registry information and available controls. **Statistikk** selects a sensor/binary sensor and the last 24 hours or seven days. This requires recorded history; it does not infer energy consumption or invent missing values. The graph and table show at most 300 sampled readings, with unknown-state gaps preserved; min/max are calculated from all returned numeric readings. Devices without supported measurements have an explicit empty state.

Local automated coverage includes preference isolation, photo authorization/proxy paths, timezone boundaries, device ownership of history sources, and desktop/mobile interactions. Actual HA hardware, weather providers and native Safari still require live validation.


## Calendar on Home (0.9.0)

On Home → Overview, find **På planen** and choose **Velg kalendere**. Select existing calendars and save. Selection is personal to the SMARTi login (up to 12); all residents can view calendars made available to the home hub. This selection is a display preference, not a calendar access-control boundary.

Choose a date to view that day's agenda, use arrows to move by a week or **I dag** to return to today. Expand an appointment for location and description. Times follow the configured home timezone; all-day end dates are exclusive and overnight events appear on each affected day. Existing recurring appointments are returned by the calendar integration as occurrences.

Connect calendars to the home hub first if none appear. This version reads appointments; it does not create calendars or edit events. Data refreshes every five minutes while open, with manual refresh available. Offline or failed calendars are explicitly labelled. Each calendar is limited to 200 events per requested week, with an on-screen notice if truncated. Calendar details are not stored in browser storage.

Uses the official [calendar REST API](https://developers.home-assistant.io/docs/api/rest/). Live installation/provider validation remains pending.


## Thermostats and EV charging (1.0.0)

Thermostats now show a semicircular target-temperature gauge, current room temperature and +/- controls. Heating is orange, cooling blue and off/unavailable neutral; activity such as heating versus idle is shown separately from mode. Only reported temperature capabilities are editable. Devices that only expose a high/low target range display that range without introducing unsupported commands. This release does not add mode selection or dragging on the arc. The visual direction follows the [thermostat card](https://www.home-assistant.io/dashboards/thermostat/), using SMARTi styling.

Under Home → Energy, **Elbil & lader → Tilpass** binds existing entities to battery percentage, range (km/mi), charging power (W/kW), energy (Wh/kWh), status and an optional on/off charging switch. Preferences are personal. These bindings do not install an integration: connect the car/charger to the home hub first. The energy value is the selected meter reading, not an inferred charging-session total. Only use a switch known to control charging; turning it on/off requires confirmation and retains the backend's existing capability and availability checks. No current limits, schedules or vendor-specific start/stop services are changed.

Validated with isolated demo/API and desktop/mobile tests; live thermostat and EV hardware confirmation remains pending.
