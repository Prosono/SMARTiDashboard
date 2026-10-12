# Development

Requirements: Python 3.14, Node 24, npm; Docker for container verification. From the repository root:

```sh
make setup
make dev
```

Open http://localhost:5173/. `make dev` uses explicit demo mode and writes a random setup secret to `.data/setup-secret.txt` with owner-only permissions. Read that file locally and enter it in the first-run form, choose an owner username and a password of at least 12 characters. There are no default account credentials. The generated demo data includes channels, missing battery values, stale/unavailable controls and entities with no physical device.

For live development, configure `.env` with a HA URL/token, then run `SMARTI_MODE=live make dev`. The localhost development helper overrides the UI origin, bootstrap secret and TLS requirement only for loopback; it preserves the explicit live mode. Demo and live databases are separate. A failed HA connection never produces demo data.

```sh
make lint
make test
make build
cd frontend && npx playwright install chromium
cd .. && make e2e
make container
```

`make e2e` starts an ephemeral demo server on localhost:8765, with an isolated known test account; those credentials are only in the test harness and never created by normal startup. Do not expose the harness outside loopback. Contract tests use a local WebSocket HA simulator; no tests contact the user's HA or radio hardware.

Python exact resolved versions are in `backend/requirements.lock`; npm's full graph is in `frontend/package-lock.json`. Rebuild and rerun the suite after dependency updates. `make package` prepares a complete build context in ha-app. Generated files are ignored. CI runs lint, tests, browser tests and the container build.
