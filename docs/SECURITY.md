# Security and account recovery

SMARTi accounts are independent from HA accounts. The first owner needs a randomly generated setup secret (at least 24 characters), supplied through protected installer access. There is no default password or first-browser ownership. Bootstrap is transactional and cannot create a second owner. Remove the setup secret from installation settings after success.

Passwords use pwdlib's Argon2 implementation. Opaque random sessions are persisted as SHA-256 digests with expiry; CSRF tokens are session-scoped. Cookies are HttpOnly and SameSite=Strict; HTTPS logins always set Secure. Non-Secure cookies are limited to explicit localhost development or opted-in HTTP Ingress. State-changing requests require a configured exact Origin and, after authentication, a CSRF token. Login/setup attempts are bounded per socket source in SQLite (8 per 15 minutes). Proxy identities are never used for authorization.

Ingress accepts only the Supervisor proxy socket IP 172.30.32.2, with forwarded-header processing disabled. Its dynamic path is used only for cookie scope; frontend URLs are relative. Configure the exact HA browser origins using origin and additional_origins. Explicit allow_http_ingress enables configured HTTP origins behind Supervisor only; these sessions and passwords travel unencrypted on the LAN. HTTPS logins retain Secure cookies. Standalone HTTP remains prohibited. Ingress still requires a SMARTi login, even for HA administrators. No publicly exposed ingress port is configured.

LAN deployment requires TLS certificate/key and local authentication on port 8443. Development HTTP binds only to loopback. There is no automatic DNS, mDNS, certificate bypass, telemetry or offline command queue. HA credentials stay in the backend environment; errors never echo tokens or arbitrary HA exception text. Access logs are disabled to reduce unnecessary personal-data retention.

All API responses are no-store. No service worker is currently registered. No browser storage contains HA credentials or sessions; only language and theme are localStorage preferences. No physical command is triggered by installation/testing.

## Recovery
Stop SMARTi and back up its database. On the machine running SMARTi, with access to its configured data directory and Python environment, run:

```sh
.venv/bin/python scripts/recover.py
```

The console asks for an existing administrator name and a new password without echoing it, changes only that account, and revokes every session. Run with the same SMARTI_MODE and SMARTI_DATA_DIR as the installation. Restart SMARTi and sign in. No recovery backdoor or email reset exists.

## Limits
This is a development foundation, not a production security certification. TLS trust must be provisioned on each client. Per-room restrictions, account deletion, role editing, MFA and recovery through the HA installer UI are not implemented. A privileged HA credential can access more than the allowlisted SMARTi operations: secure the host and its environment accordingly. Radio secrets are not collected by this release.

## Mobile pilot

The opt-in mobile pilot uses a separate TLS-only listener and bearer device credentials. Existing HA UI protections remain unchanged. See [the mobile pilot security boundaries and limitations](MOBILE_PILOT.md). SQLite schema v3 adds device credentials and pairing records; only token digests are persisted. Backups clone the installation UUID and device credentials: never run a restored clone concurrently as another home. Production enrollment, device key binding and certificate lifecycle are pending.
