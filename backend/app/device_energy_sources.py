"""Discover device energy meters and persist a separate home-wide selection."""

from collections import defaultdict
from dataclasses import dataclass
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from websockets.exceptions import ConnectionClosed

from .access import require, visible
from .ha import HAError

DEVICE_ENERGY_SOURCES_KEY = "energy_device_sources"
MAX_SELECTED_DEVICE_METERS = 60
ENERGY_UNITS = {"Wh", "kWh"}
POWER_UNITS = {"W", "kW"}
CONSUMER_ROLES = {"consumer", "ev"}
APPLIANCE_DOMAINS = {
    "climate",
    "fan",
    "humidifier",
    "light",
    "media_player",
    "switch",
    "vacuum",
    "water_heater",
}


class DeviceEnergyPreferences(BaseModel):
    model_config = {"extra": "forbid"}
    # None uses discovery, while [] is an explicit empty selection.
    selected_ids: list[Annotated[str, Field(min_length=1, max_length=200)]] | None = Field(
        max_length=MAX_SELECTED_DEVICE_METERS
    )


@dataclass(frozen=True)
class DeviceEnergySource:
    id: str
    entity: str
    name: str
    room: str | None
    meter: str
    kind: Literal["energy", "power"]
    unit: str
    group: str
    automatic: bool

    def view(self):
        return {
            "id": self.id,
            "name": self.name,
            "room": self.room,
            "meter": self.meter,
            "kind": self.kind,
            "unit": self.unit,
            "group": self.group,
            "automatic": self.automatic,
        }


@dataclass(frozen=True)
class DeviceEnergyInventory:
    sources: list[DeviceEnergySource]
    selected_ids: list[str]
    mode: Literal["automatic", "manual"]

    @property
    def selected(self):
        available = {source.id: source for source in self.sources}
        return [available[id] for id in self.selected_ids if id in available]

    def view(self, current):
        return {
            "sources": [source.view() for source in self.sources],
            "selected_ids": self.selected_ids,
            "mode": self.mode,
            "can_edit": current["role"] == "admin" and not current.get("support"),
        }


def source_statistics(value):
    """Accept both historical and grouped Home Assistant Energy configurations."""
    if isinstance(value, dict):
        for key, child in value.items():
            if key.startswith("stat_") and isinstance(child, str):
                yield child
            else:
                yield from source_statistics(child)
    elif isinstance(value, list):
        for child in value:
            yield from source_statistics(child)


def meter_kind(control):
    if control.domain != "sensor":
        return None
    unit = control.attributes.get("unit_of_measurement")
    device_class = control.attributes.get("device_class")
    if unit in ENERGY_UNITS and device_class in {"energy", None}:
        return "energy"
    if unit in POWER_UNITS and device_class in {"power", None}:
        return "power"
    return None


def discover_device_energy_sources(controls, devices, areas, config, preferences, current):
    aggregate = set(source_statistics(preferences.get("energy_sources", [])))
    if config:
        aggregate.update(meter.entity for meter in config.meters if meter.role not in CONSUMER_ROLES)
        aggregate.add(config.power_entity)
        aggregate.update(
            entity for role, entity in config.power.items() if role in {"home", "solar", "battery"}
        )
    aggregate_devices = {c.device_id for c in controls if c.device_id and c.entity_id in aggregate}
    meters = {
        c.entity_id: c
        for c in controls
        if c.entity_id not in aggregate
        and c.device_id not in aggregate_devices
        and meter_kind(c)
        and visible(current, c)
    }
    names = {}
    explicit = []
    groups = {
        entity: f"device:{meter.device_id}" if meter.device_id else f"meter:{meter.id}"
        for entity, meter in meters.items()
    }

    def prefer(entity, name):
        if entity not in meters or entity in names:
            return
        names[entity] = name.strip() if isinstance(name, str) else ""
        explicit.append(entity)

    if config:
        for meter in config.meters:
            if meter.role in CONSUMER_ROLES:
                prefer(meter.entity, meter.name)
        if config.power.get("ev"):
            prefer(config.power["ev"], None)
    rows = preferences.get("device_consumption")
    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, dict):
            continue
        energy, power = row.get("stat_consumption"), row.get("stat_rate")
        energy = energy if isinstance(energy, str) and energy in meters else None
        power = power if isinstance(power, str) and power in meters else None
        if energy:
            prefer(energy, row.get("name"))
        if power:
            if energy and power not in names:
                # Home Assistant explicitly paired these channels for the same appliance.
                groups[power] = groups[energy]
                names[power] = names[energy]
            elif not energy:
                prefer(power, row.get("name"))

    recommended = set()
    covered = set()

    def add(entity):
        group = groups[entity]
        if group not in covered:
            covered.add(group)
            recommended.add(entity)

    for entity in explicit:
        add(entity)

    # Auto-select a reliable cumulative sensor ahead of instantaneous power.
    # Leave ambiguous and unlinked sources for the user to inspect and select.
    appliances = {c.device_id for c in controls if c.domain in APPLIANCE_DOMAINS and not c.diagnostic}
    by_group = defaultdict(list)
    for entity, meter in meters.items():
        if meter.device_id and meter.device_id in appliances:
            by_group[groups[entity]].append(meter)
    for possible in by_group.values():
        energy = [
            meter
            for meter in possible
            if meter_kind(meter) == "energy"
            and meter.attributes.get("state_class") in {"total", "total_increasing"}
        ]
        power = [
            meter
            for meter in possible
            if meter_kind(meter) == "power" and meter.attributes.get("state_class") == "measurement"
        ]
        eligible = energy or power
        if len(eligible) == 1:
            add(eligible[0].entity_id)

    sources = []
    for entity, meter in meters.items():
        device = devices.get(meter.device_id, {})
        sources.append(
            DeviceEnergySource(
                id=meter.id,
                entity=entity,
                name=names.get(entity) or device.get("name_by_user") or device.get("name") or meter.name,
                room=areas.get(meter.area_id, {}).get("name"),
                meter=meter.name,
                kind=meter_kind(meter),
                unit=meter.attributes["unit_of_measurement"],
                group=groups[entity],
                automatic=entity in recommended,
            )
        )
    return sorted(sources, key=lambda source: (source.name.casefold(), source.kind, source.meter.casefold()))


def select_inventory(sources, selected_ids):
    if selected_ids is None:
        automatic = [source.id for source in sources if source.automatic][:MAX_SELECTED_DEVICE_METERS]
        return DeviceEnergyInventory(sources, automatic, "automatic")
    available = {source.id: source for source in sources}
    eligible = []
    covered = set()
    for id in selected_ids:
        source = available.get(id)
        if source and source.group not in covered:
            covered.add(source.group)
            eligible.append(id)
    return DeviceEnergyInventory(sources, eligible, "manual")


async def device_energy_inventory(ha, store, settings, repo, current):
    require(current, "energy.view")
    demo = settings.mode == "demo"
    if not demo and not ha.connected:
        raise HTTPException(503, "ha_disconnected")
    preferences = {}
    if not demo:
        try:
            preferences = await ha.request("energy/get_prefs", _timeout=3)
        except (HAError, OSError, ConnectionClosed):
            pass
        if not ha.connected:
            raise HTTPException(503, "ha_disconnected")
    sources = discover_device_energy_sources(
        ha.controls(),
        getattr(ha, "devices", {}),
        getattr(ha, "areas", {}),
        repo.config() if repo else None,
        preferences if isinstance(preferences, dict) else {},
        current,
    )
    saved = DeviceEnergyPreferences.model_validate_json(
        store.get(DEVICE_ENERGY_SOURCES_KEY, '{"selected_ids":null}')
    )
    return select_inventory(sources, saved.selected_ids)


def device_energy_sources_router(ha, store, user, admin, settings, repo):
    router = APIRouter(prefix="/api/home/energy/device-sources")

    @router.get("")
    async def get_sources(current=Depends(user)):
        return (await device_energy_inventory(ha, store, settings, repo, current)).view(current)

    @router.put("")
    async def save_sources(body: DeviceEnergyPreferences, current=Depends(admin)):
        inventory = await device_energy_inventory(ha, store, settings, repo, current)
        selected = select_inventory(inventory.sources, body.selected_ids)
        if body.selected_ids is not None and selected.selected_ids != body.selected_ids:
            raise HTTPException(422, "invalid_device_energy_sources")
        store.set(DEVICE_ENERGY_SOURCES_KEY, body.model_dump_json())
        return selected.view(current)

    return router
