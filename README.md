# SMARTi

Local home control with Home Assistant underneath. React/TypeScript frontend, FastAPI backend, real HA WebSocket adapter and an explicitly separate demo mode. Design follows SMARTi's orange/charcoal identity and uses the original logo from smarti.no.

A separate, unpublished [mobile/remote-access Docker pilot](docs/MOBILE_PILOT.md) now exercises one home with local HTTPS and an outbound encrypted tunnel. It is a demo foundation, not a distributed phone app or multi-customer cloud service.

## Install in Home Assistant

Add **https://github.com/Prosono/SMARTiDashboard** under **Settings → Apps → App store → menu → Repositories**, then install **SMARTi**.

[Add repository in Home Assistant](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FProsono%2FSMARTiDashboard)

Requires HAOS. Configure the local/external browser origins and a random owner setup secret in the app's Configuration tab. Home Assistant credentials are provided automatically by Supervisor. [Step-by-step setup](ha-app/DOCS.md).

## Home administration and overview (0.7.0)

Create and edit automations, manage rooms/device placement, administer configured integrations and install supported updates from SMARTi. Home Assistant update names use SMARTi display branding. Home automatically adapts to available devices, with personal favorites, room photos, explicit mode shortcuts and live HLS camera cards, a scene creator and configurable energy charts using HA recorder statistics. Five Home tabs — Overview, Lights, Energy, Security and Climate — support touch swipes, direct selection and keyboard navigation. HA person presence appears on Overview. Five selectable palettes work in light/dark mode; individual rooms have photos, status summaries and grouped controls. The custom dashboard builder has been removed. See [administration instructions and limitations](ha-app/DOCS.md#administration-and-home-overview-040). Configuration writes and updates require administrator access; new integration setup flows remain deferred.

## Start locally

Requires Python 3.14 and Node 24:

```sh
make setup
make dev
```

Open **http://localhost:5173/**. Read the generated `.data/setup-secret.txt` locally and use it to create the owner account. Choose your own username/password; no defaults exist. This command starts **demo mode**, not real home control.

For live mode, configure the HA URL/token in `.env` using `.env.example`, then `SMARTI_MODE=live make dev`. Live data never falls back to demo. LAN HTTPS and HA Ingress installation are described in [Deployment](docs/DEPLOYMENT.md).

## Verify

```sh
make lint
make test
make build
cd frontend && npx playwright install chromium
cd .. && make e2e
make container
```

No test changes a real home's devices. The HA contract suite uses an isolated WebSocket simulator. See [Implementation status](docs/IMPLEMENTATION_STATUS.md) for precise verification and unfinished work. This release is a development foundation, not production-ready.

- [Architecture](docs/ARCHITECTURE.md)
- [Compatibility and official sources](docs/COMPATIBILITY.md)
- [Development](docs/DEVELOPMENT.md)
- [Security and recovery](docs/SECURITY.md)
- [Deployment and backup](docs/DEPLOYMENT.md)
- [Explicit hardware validation](docs/HARDWARE_TESTING.md)

The logo remains SMARTi brand material. No repository-wide license has been selected or implied.

### Home location and zones

Settings → Hjemmets plassering og soner uses a locally bundled Leaflet map with subdued OpenStreetMap tiles and theme-aware controls. Tiles are fetched by the browser from `tile.openstreetmap.org` and require internet access; the displayed area is sent to that tile service. Coordinate editing remains available without tiles. Keep OpenStreetMap attribution visible and observe its tile usage policy when deploying at scale.

Choose **Endre plassering**, drag the marker or tap the map, then save to update the controller's home location. **Ny sone** creates a named zone with a radius in meters; “Kun til automasjoner” marks it passive. Stored zones can be edited or deleted (with confirmation). Zones defined in YAML are outside this editor; the special home zone is managed through home location. Changes require administrator access and a connected controller; demo mode does not fabricate zones.
