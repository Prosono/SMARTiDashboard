"""Function-level SMARTi permissions; HA accounts keep their separate HA rights."""

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

FEATURES = (
    "lights",
    "climate",
    "media",
    "security",
    "cameras",
    "energy",
    "people",
    "calendar",
    "other",
    "scenes",
)
CONTROL_FEATURES = ("lights", "climate", "media", "security", "other", "scenes")
ALL = {f"{f}.view" for f in FEATURES} | {f"{f}.control" for f in CONTROL_FEATURES}


class AccessDraft(BaseModel):
    model_config = {"extra": "forbid"}
    profile: str = Field(pattern="^(admin|resident|viewer|custom)$")
    permissions: list[str] = Field(default_factory=list, max_length=30)

    @model_validator(mode="after")
    def valid(self):
        if set(self.permissions) - ALL:
            raise ValueError("Unknown permission")
        if any(
            p.endswith(".control") and p.replace(".control", ".view") not in self.permissions
            for p in self.permissions
        ):
            raise ValueError("Control requires view")
        return self


def policy(store, current):
    if current["role"] == "admin":
        return {"profile": "admin", "permissions": sorted(ALL)}
    raw = store.get(f"access:{current['id']}")
    if not raw:
        return {"profile": "resident", "permissions": sorted(ALL)}
    try:
        data = AccessDraft.model_validate_json(raw)
        return {"profile": data.profile, "permissions": sorted(set(data.permissions) & ALL)}
    except (ValueError, TypeError):
        return {"profile": "custom", "permissions": []}


def can(current, permission):
    return current["role"] == "admin" or permission in current.get("permissions", ALL)


def require(current, permission):
    if not can(current, permission):
        raise HTTPException(403, "permission_denied")


def feature(c):
    domain, a = c.domain, c.attributes
    mapping = {
        "light": "lights",
        "weather": "climate",
        "climate": "climate",
        "fan": "climate",
        "humidifier": "climate",
        "media_player": "media",
        "camera": "cameras",
        "lock": "security",
        "alarm_control_panel": "security",
        "cover": "security",
        "binary_sensor": "security",
        "person": "people",
        "device_tracker": "people",
        "calendar": "calendar",
        "scene": "scenes",
        "script": "scenes",
        "automation": "scenes",
    }
    if domain in mapping:
        return mapping[domain]
    if domain == "sensor":
        if a.get("device_class") in {
            "temperature",
            "humidity",
            "carbon_dioxide",
            "pm25",
            "pm10",
            "volatile_organic_compounds",
        }:
            return "climate"
        if a.get("device_class") in {"power", "energy"} or a.get("unit_of_measurement") in {
            "W",
            "kW",
            "Wh",
            "kWh",
        }:
            return "energy"
    return "other"


def visible(current, c):
    return can(current, feature(c) + ".view") and (feature(c) != "scenes" or all_views(current))


def controllable(current, c):
    return (
        visible(current, c)
        and can(current, feature(c) + ".control")
        and (feature(c) != "scenes" or ALL.issubset(set(current.get("permissions", ALL))))
    )


def all_views(current):
    return all(can(current, f + ".view") for f in FEATURES)


def route_access(request, current, ha):
    """All authenticated browser endpoints pass here, including aggregate/media endpoints."""
    if current["role"] == "admin":
        return
    path = request.url.path.removeprefix("/api/")
    read = request.method in {"GET", "HEAD"}
    if path in {"session", "logout", "home", "events", "account/photo"}:
        return
    if path.startswith(("controls/", "favorites/")):
        key = request.path_params.get("entity_id")
        c = next((c for c in ha.controls() if c.entity_id == key), None)
        if c:
            require(current, feature(c) + (".view" if path.startswith("favorites/") else ".control"))
            require(current, feature(c) + ".view")
        return
    if path.startswith(("home/camera/", "home/camera-stream/")):
        require(current, "cameras.view")
        return
    if path.startswith("home/people"):
        require(current, "people.view")
        if not read:
            raise HTTPException(403, "admin_required")
        return
    if path.startswith("home/calendar"):
        require(current, "calendar.view")
        return
    if path.startswith(("home/energy", "home/history/", "home/vehicle")):
        require(current, "energy.view")
        return
    if path.startswith("home/weather/"):
        require(current, "climate.view")
        return
    if path == "home/activity":
        return
    if path.startswith(("home/preferences", "home/room-view/", "home/room-image/")):
        return
    if path.startswith("manage/device/"):
        controls = [c for c in ha.controls() if c.device_id == request.path_params.get("id")]
        if not controls or not all(visible(current, c) for c in controls):
            raise HTTPException(403, "permission_denied")
        return
    if path.startswith(("scenes", "home/modes/", "groups")):
        # Cross-domain actions cannot bypass restricted individual functions.
        if not all_views(current):
            raise HTTPException(403, "permission_denied")
        if not read and not ALL.issubset(set(current.get("permissions", ALL))):
            raise HTTPException(403, "permission_denied")
        return
    if path.startswith("mobile/") and not path.startswith("mobile/v1/"):
        return
    # Existing admin dependencies remain authoritative. New routes fail closed for restricted users.
    if set(current.get("permissions", ALL)) != ALL:
        raise HTTPException(403, "permission_denied")


def access_router(store, admin):
    router = APIRouter(prefix="/api/manage/accounts")

    @router.put("/{id}/access")
    async def update(id: int, body: AccessDraft, current=Depends(admin)):
        grants = sorted(
            ALL
            if body.profile in {"admin", "resident"}
            else {p for p in ALL if p.endswith(".view")}
            if body.profile == "viewer"
            else set(body.permissions)
        )
        with store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT id,role FROM users WHERE id=?", (id,)).fetchone()
            if not row:
                raise HTTPException(404, "user_not_found")
            if body.profile != "admin" and row["role"] == "admin":
                if (
                    id == current["id"]
                    or db.execute("SELECT count(*) FROM users WHERE role='admin'").fetchone()[0] <= 1
                ):
                    raise HTTPException(409, "keep_administrator")
            db.execute(
                "UPDATE users SET role=? WHERE id=?", ("admin" if body.profile == "admin" else "user", id)
            )
            db.execute(
                "INSERT OR REPLACE INTO settings VALUES (?,?)",
                (f"access:{id}", json.dumps({"profile": body.profile, "permissions": grants})),
            )
        return {"profile": body.profile, "permissions": grants}

    return router
