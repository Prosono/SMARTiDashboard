"""Normalize controller status without labelling disconnected/unknown as busy."""

STATES = {0: "idle", 1: "including", 2: "excluding", 3: "busy", 4: "smart_start"}


def controller_status(network):
    client = network.get("client") or {}
    controller = network.get("controller") or {}
    raw = controller.get("inclusion_state")
    state = STATES.get(raw) if type(raw) is int else None
    if isinstance(raw, str):
        name = raw.lower().replace("_", "").replace(" ", "")
        state = {
            "idle": "idle",
            "including": "including",
            "excluding": "excluding",
            "busy": "busy",
            "smartstart": "smart_start",
        }.get(name)
    connected = client.get("state") == "connected"
    return {
        "connected": connected,
        "state": state or "unknown",
        "ready": connected and state in {"idle", "smart_start"},
        "raw_state": raw if type(raw) in (str, int) else None,
        "client_state": str(client.get("state", "unknown"))[:80],
        "driver_version": client.get("driver_version"),
        "server_version": client.get("server_version"),
    }
