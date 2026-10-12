# SMARTi

Local home control with Home Assistant underneath. React/TypeScript frontend, FastAPI backend, real HA WebSocket adapter and an explicitly separate demo mode. Design follows SMARTi's orange/charcoal identity and uses the original logo from smarti.no.

## Install in Home Assistant

Add **https://github.com/Prosono/SMARTiDashboard** under **Settings → Apps → App store → menu → Repositories**, then install **SMARTi**.

[Add repository in Home Assistant](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FProsono%2FSMARTiDashboard)

Requires HAOS and an HTTPS HA origin. Configure the origin and a random owner setup secret in the app's Configuration tab. Home Assistant credentials are provided automatically by Supervisor. [Step-by-step setup](ha-app/DOCS.md).

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
