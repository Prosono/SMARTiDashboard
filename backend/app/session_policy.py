"""Resident sessions persist until explicitly revoked; short-lived grants stay separate."""

import time

# Keep the existing timestamp columns and validation/revocation paths compatible.
# This sentinel has no practical automatic expiry. Browser cookies are renewed
# within the browser's maximum persistent-cookie window.
SESSION_EXPIRY = 253402300799
SESSION_COOKIE_SECONDS = 400 * 86400


def persist_valid_sessions(connection, table):
    if table not in {"sessions", "customer_connections"}:
        raise ValueError("Not a resident session table")
    # Never resurrect an expired or revoked credential during an upgrade/restart.
    connection.execute(
        f"UPDATE {table} SET expires=? WHERE expires>? AND expires<?",
        (SESSION_EXPIRY, time.time(), SESSION_EXPIRY),
    )
