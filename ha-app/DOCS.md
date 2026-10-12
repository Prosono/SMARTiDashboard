# SMARTi local app preview

Run `make package` from the source repository before copying this folder into `/addons/smarti` on a development HAOS installation. The staged folder includes the complete build context. Set `origin` to the exact HTTPS Home Assistant origin and `bootstrap_secret` to a randomly generated secret of at least 24 characters, delivered securely to the owner. Create the SMARTi owner inside the Ingress panel, then clear the secret.

Only the Supervisor ingress proxy is accepted on port 8099. No LAN port is exposed. SMARTi asks for its own login and does not infer a role from HA proxy headers. HA authentication uses SUPERVISOR_TOKEN only on the backend. Data is stored in /data/smarti-live.sqlite3. Back it up with the app stopped; HA and radio backups are separate.

The linux/amd64 container is build-tested. Real HAOS, HA registry permissions, dynamic-prefix operation and physical controls still require integration validation. Radio setup remains an external HA flow. See the source repository's docs for standalone LAN HTTPS and account recovery. No production-readiness claim.
