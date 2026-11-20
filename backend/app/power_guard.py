"""Hub-local capacity control with explicit load ownership and confirmed state transitions."""

import asyncio
import logging
import math
import re
import sqlite3
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from websockets.exceptions import ConnectionClosed

from .access import visible
from .energy_flow import power_reading
from .energy_tariffs import D, tariff
from .ha import HAError
from .power_guard_control import GuardLoad, PowerGuardController

LOG = logging.getLogger(__name__)
OSLO = ZoneInfo("Europe/Oslo")
STORE_KEY = "energy_power_guard"
MAX_AGE_SECONDS = 45
POLL_SECONDS = 5
STATUS_WRITE_SECONDS = 15
CONFIRM_SECONDS = 30
RETRY_SECONDS = 300
HVAC_MIN_PAUSE_SECONDS = 180
HVAC_MODES = {"heat", "cool", "heat_cool", "auto", "dry", "fan_only"}
Direction = Literal["turn_on", "turn_off"]


class ManagedLoad(BaseModel):
    model_config = {"extra": "forbid"}
    id: str = Field(min_length=1, max_length=200)
    watts: int = Field(ge=1, le=50000, strict=True)


class PowerGuardConfig(BaseModel):
    model_config = {"extra": "forbid"}
    enabled: bool = False
    limit_kw: float | None = Field(default=None, gt=0, le=10000, allow_inf_nan=False, strict=True)
    devices: list[ManagedLoad] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def distinct_loads(self):
        if len({load.id for load in self.devices}) != len(self.devices):
            raise ValueError("duplicate_power_guard_devices")
        return self


class MeterBinding(BaseModel):
    entity: str | None
    company: str
    segment: str


class Pause(BaseModel):
    entity: str
    last_changed: str
    resume_state: str
    at: float


class Pending(BaseModel):
    id: str
    entity: str
    command: Direction
    previous: str
    expected: str
    context: str
    at: float


class LastAction(BaseModel):
    id: str
    command: Direction
    at: datetime


class Runtime(BaseModel):
    state: str = "disabled"
    power_kw: float | None = None
    projected_kw: float | None = None
    updated_at: datetime | None = None
    last_action: LastAction | None = None
    paused: dict[str, Pause] = Field(default_factory=dict)
    blocked_until: dict[str, float] = Field(default_factory=dict)
    pending: Pending | None = None


class Record(BaseModel):
    revision: str = ""
    config: PowerGuardConfig = Field(default_factory=PowerGuardConfig)
    binding: MeterBinding | None = None
    runtime: Runtime = Field(default_factory=Runtime)


def capacity_tiers(company, segment, day, source):
    """Bounded capacity bands for supported residential demand tariffs."""
    try:
        selected, provider = tariff(company, day, segment, source)
        name = (provider or {}).get("data", {}).get("netteier")
        if not selected:
            return name, []
        fixed = selected["fastledd"]
        if fixed["metode"] not in {"TRE_DØGNMAX_MND", "MND_MAX"}:
            return name, []
        thresholds = sorted({D(step["terskel"]) for step in fixed["terskler"]})
        if not thresholds or thresholds[0] != 0 or any(value > 10000 for value in thresholds):
            return name, []
        return name, [
            {"label": f"{lower:g}–{upper:g} kW", "limit_kw": float(upper)}
            for lower, upper in zip(thresholds, thresholds[1:], strict=False)
        ]
    except (KeyError, TypeError, ValueError, ArithmeticError, AttributeError):
        return None, []


def capabilities(control):
    return {action for part in control.capabilities for action in part.actions}


def climate_modes(control):
    modes = control.attributes.get("hvac_modes")
    return {mode for mode in modes if isinstance(mode, str)} if isinstance(modes, list) else set()


def eligible(control):
    if control.diagnostic:
        return False
    actions = capabilities(control)
    if control.domain == "switch":
        return {"turn_on", "turn_off"} <= actions
    if control.domain == "climate":
        modes = climate_modes(control)
        return "set_hvac_mode" in actions and "off" in modes and bool(HVAC_MODES & modes)
    return False


def load_state(control):
    if control is None or control.availability != "available":
        return "unavailable"
    if control.domain == "climate":
        if control.state == "off":
            return "off"
        if control.state in HVAC_MODES & climate_modes(control):
            return "on"
        return "unavailable"
    return control.state if control.state in {"on", "off"} else "unavailable"


def meter_candidate(control):
    return (
        control is not None
        and control.domain == "sensor"
        and control.attributes.get("unit_of_measurement") in {"W", "kW"}
    )


def read_record(db):
    row = db.execute("SELECT value FROM settings WHERE key=?", (STORE_KEY,)).fetchone()
    return Record.model_validate_json(row[0]) if row else Record()


class PowerGuard:
    def __init__(self, ha, store, repo, settings, resetting: Callable[[], bool] = lambda: False):
        self.ha = ha
        self.store = store
        self.repo = repo
        self.settings = settings
        self.resetting = resetting
        self.engine = PowerGuardController()
        self.engine_key = None
        self.last_meter_stamp = None

    def record(self):
        with self.store.connect() as db:
            return read_record(db)

    def binding(self, now):
        config = self.repo.config(now)
        if config:
            return MeterBinding(entity=config.power_entity, company=config.company, segment=config.segment)
        return None

    def inventory(self, now):
        binding = self.binding(now)
        controls = self.ha.controls()
        loads = {control.id: control for control in controls if eligible(control)}
        if binding is None:
            return None, None, [], None, loads
        meter = next((control for control in controls if control.entity_id == binding.entity), None)
        company, tiers = capacity_tiers(
            binding.company, binding.segment, now.astimezone(OSLO).date(), self.repo.tariff(binding.company)
        )
        return binding, meter if meter_candidate(meter) else None, tiers, company, loads

    def view(self, current, now=None):
        now = now or datetime.now(UTC)
        binding, meter, tiers, company, loads = self.inventory(now)
        record = self.record()
        return self.response(record, current, binding, meter, tiers, company, loads)

    def response(self, record, current, binding, meter, tiers, company, loads):
        areas = getattr(self.ha, "areas", {})
        can_edit = current["role"] == "admin" and not current.get("support")
        allowed = {key: control for key, control in loads.items() if visible(current, control)}
        unseen = {load.id for load in record.config.devices} - loads.keys() if can_edit else set()
        visible_ids = set(allowed) | unseen
        runtime = record.runtime
        last_action = (
            runtime.last_action if runtime.last_action and runtime.last_action.id in visible_ids else None
        )
        state = runtime.state
        if record.config.enabled and record.binding != binding:
            state = "settings_changed"
        elif record.config.enabled and not any(tier["limit_kw"] == record.config.limit_kw for tier in tiers):
            state = "waiting_tariff"
        return {
            "configured_meter": meter is not None,
            "meter": {"id": meter.id, "name": meter.name} if meter else None,
            "company": company or (binding.company if binding and binding.company else None),
            "can_edit": can_edit,
            "tiers": tiers,
            "devices": sorted(
                [
                    {
                        "id": control.id,
                        "name": control.name,
                        "room": areas.get(control.area_id, {}).get("name"),
                        "kind": control.domain,
                        "state": load_state(control),
                    }
                    for control in allowed.values()
                ],
                key=lambda item: (item["room"] or "", item["name"].casefold(), item["id"]),
            ),
            "config": record.config.model_copy(
                update={"devices": [load for load in record.config.devices if load.id in visible_ids]}
            ),
            "status": {
                "state": state,
                "power_kw": runtime.power_kw if state == runtime.state else None,
                "projected_kw": runtime.projected_kw if state == runtime.state else None,
                "updated_at": runtime.updated_at,
                "paused_ids": [
                    load.id
                    for load in record.config.devices
                    if load.id in runtime.paused and load.id in visible_ids
                ],
                "last_action": last_action,
            },
        }

    def configure(self, config, current):
        if current["role"] != "admin" or current.get("support"):
            raise HTTPException(403, "admin_required")
        if config.enabled and self.resetting():
            raise HTTPException(409, "power_guard_reset_in_progress")
        now = datetime.now(UTC)
        binding, meter, tiers, company, loads = self.inventory(now)
        with self.store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            previous = read_record(db)
            known = {load.id for load in previous.config.devices}
            ids = {load.id for load in config.devices}
            if ids - loads.keys() - known:
                raise HTTPException(422, "power_guard_invalid_devices")
            if config.enabled:
                if not meter:
                    raise HTTPException(422, "power_guard_meter_required")
                if not any(tier["limit_kw"] == config.limit_kw for tier in tiers):
                    raise HTTPException(422, "power_guard_tier_required")
                if not ids.intersection(loads):
                    raise HTTPException(422, "power_guard_devices_required")
            if previous.config == config and previous.binding == binding:
                return self.response(previous, current, binding, meter, tiers, company, loads)

            last_action = previous.runtime.last_action
            old_runtime = previous.runtime
            keep_pauses = config.enabled and previous.config.enabled and previous.binding == binding
            state = (
                "disabled" if not config.enabled else "demo" if self.settings.mode == "demo" else "warming_up"
            )
            runtime = Runtime(state=state, updated_at=now, last_action=last_action)
            if keep_pauses:
                runtime.paused = {key: item for key, item in old_runtime.paused.items() if key in ids}
                runtime.blocked_until = {
                    key: until for key, until in old_runtime.blocked_until.items() if key in ids
                }
                if old_runtime.pending and old_runtime.pending.id in ids:
                    runtime.pending = old_runtime.pending
            record = Record(revision=uuid4().hex, config=config, binding=binding, runtime=runtime)
            db.execute("INSERT OR REPLACE INTO settings VALUES (?,?)", (STORE_KEY, record.model_dump_json()))
        return self.response(record, current, binding, meter, tiers, company, loads)

    def persist(self, record):
        """The remote/web writer can supersede a decision without being rolled back by this worker."""
        with self.store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if read_record(db).revision != record.revision:
                return False
            db.execute("UPDATE settings SET value=? WHERE key=?", (record.model_dump_json(), STORE_KEY))
            return True

    def publish(self, record, now, state, power=None, projected=None, *, changed=False):
        runtime = record.runtime
        if (
            changed
            or runtime.state != state
            or runtime.updated_at is None
            or (now - runtime.updated_at).total_seconds() >= STATUS_WRITE_SECONDS
        ):
            runtime.state = state
            runtime.power_kw = power
            runtime.projected_kw = projected
            runtime.updated_at = now
            self.persist(record)

    async def read_meter(self, meter, now):
        if not self.ha.connected or not re.fullmatch(r"sensor\.[a-z0-9_]+", meter.entity_id):
            return None, "meter_unavailable", None
        try:
            async with asyncio.timeout(3):
                raw = await self.ha.rest("GET", "states/" + meter.entity_id)
            if not isinstance(raw, dict) or raw.get("entity_id") != meter.entity_id:
                return None, "meter_unavailable", None
            stamp = datetime.fromisoformat(raw.get("last_reported") or raw.get("last_updated"))
            if (stamp - now).total_seconds() > 5:
                return None, "stale_meter", None
        except (HTTPException, HAError, TimeoutError, OSError, TypeError, ValueError):
            return None, "meter_unavailable", None
        state = raw.get("state")
        attrs = raw.get("attributes")
        if not isinstance(state, str) or not isinstance(attrs, dict):
            return None, "meter_unavailable", None
        control = meter.model_copy(
            update={
                "state": state,
                "availability": "available" if state not in {"unknown", "unavailable"} else state,
                "attributes": attrs,
            }
        )
        watts, status, _ = power_reading(
            control, {meter.entity_id: raw}, self.ha.connected, now, MAX_AGE_SECONDS
        )
        if watts is None or not math.isfinite(watts):
            return None, "stale_meter" if status == "stale" else "meter_unavailable", None
        return max(0, watts), "monitoring", stamp.timestamp()

    def reconcile(self, runtime, loads, now):
        timestamp = now.timestamp()
        changed = False
        pending = runtime.pending
        status = None
        if pending:
            control = loads.get(pending.id)
            raw = self.ha.states.get(pending.entity, {})
            context = raw.get("context") or {}
            confirmed = (
                control is not None
                and control.entity_id == pending.entity
                and raw.get("state") == pending.expected
                and context.get("id") == pending.context
                and isinstance(raw.get("last_changed"), str)
                and state_stamp(raw) >= pending.at - 1
            )
            if confirmed:
                if pending.command == "turn_off":
                    runtime.paused[pending.id] = Pause(
                        entity=pending.entity,
                        last_changed=raw["last_changed"],
                        resume_state=pending.previous,
                        at=timestamp,
                    )
                else:
                    runtime.paused.pop(pending.id, None)
                runtime.last_action = LastAction(id=pending.id, command=pending.command, at=now)
                runtime.pending = None
                self.engine.record_action(now)
                changed = True
            elif timestamp - pending.at >= CONFIRM_SECONDS:
                runtime.pending = None
                runtime.blocked_until[pending.id] = timestamp + RETRY_SECONDS
                self.engine.record_action(now)
                status = "command_failed"
                changed = True
            else:
                return changed, "command_pending"

        for key, pause in list(runtime.paused.items()):
            control = loads.get(key)
            if load_state(control) == "unavailable":
                continue
            raw = self.ha.states.get(control.entity_id, {})
            if (
                control.entity_id != pause.entity
                or load_state(control) != "off"
                or raw.get("last_changed") != pause.last_changed
                or not can_resume(control, pause)
            ):
                # A manual or external change relinquishes ownership and gets a grace period.
                runtime.paused.pop(key)
                runtime.blocked_until[key] = timestamp + RETRY_SECONDS
                changed = True

        expired = [key for key, until in runtime.blocked_until.items() if until <= timestamp]
        for key in expired:
            del runtime.blocked_until[key]
        return changed or bool(expired), status

    async def issue(self, record, load, action, now):
        runtime = record.runtime
        pause = runtime.paused.get(action.id)
        state = load_state(load)
        expected_state = "off" if action.command == "turn_off" else pause.resume_state if pause else None
        if (action.command == "turn_off" and state != "on") or (
            action.command == "turn_on" and (state != "off" or not pause or not can_resume(load, pause))
        ):
            return "settling"
        if not self.ha.connected or self.resetting() or self.record().revision != record.revision:
            return "settling"
        if self.binding(now) != record.binding:
            return "settings_changed"

        raw = self.ha.states.get(load.entity_id, {})
        if raw.get("state") != load.state or not isinstance(raw.get("last_changed"), str):
            return "settling"
        if action.command == "turn_on" and raw["last_changed"] != pause.last_changed:
            return "settling"
        previous = load.state
        request = {"domain": load.domain, "target": {"entity_id": load.entity_id}}
        if load.domain == "climate":
            request.update(service="set_hvac_mode", service_data={"hvac_mode": expected_state})
        else:
            request.update(service=action.command, service_data={})

        self.engine.record_action(now)
        try:
            result = await self.ha.request("call_service", _timeout=5, **request)
            context = ((result or {}).get("context") or {}).get("id")
            if not isinstance(context, str) or not context:
                raise HAError("power_guard_command_unconfirmed")
        except (HAError, TimeoutError, OSError, ConnectionClosed):
            runtime.blocked_until[action.id] = now.timestamp() + RETRY_SECONDS
            return "command_failed"
        runtime.pending = Pending(
            id=action.id,
            entity=load.entity_id,
            command=action.command,
            at=now.timestamp(),
            context=context,
            expected=expected_state,
            previous=previous,
        )
        return "command_pending"

    def clear_measurements(self):
        self.engine.clear_measurements()
        self.last_meter_stamp = None

    async def tick(self, now=None):
        clock = now or datetime.now(UTC)
        record = self.record()
        if self.settings.mode == "demo" or not record.config.enabled:
            self.clear_measurements()
            return
        binding, meter, tiers, _, loads = self.inventory(clock)
        if self.resetting():
            state = "reset_in_progress"
        elif binding != record.binding:
            state = "settings_changed"
        elif meter is None:
            state = "waiting_meter"
        elif not any(tier["limit_kw"] == record.config.limit_kw for tier in tiers):
            state = "waiting_tariff"
        else:
            state = None
        runtime = record.runtime
        if state:
            self.clear_measurements()
            self.publish(record, clock, state)
            return

        engine_key = (record.revision, getattr(self.ha, "epoch", 0))
        if self.engine_key != engine_key:
            self.clear_measurements()
            self.engine_key = engine_key
            if runtime.last_action:
                self.engine.record_action(runtime.last_action.at)

        watts, reading_status, meter_stamp = await self.read_meter(meter, clock)
        if now is None:
            clock = datetime.now(UTC)
        if not self.ha.connected or getattr(self.ha, "epoch", 0) != engine_key[1]:
            watts, reading_status = None, "meter_unavailable"
        # HA state may have changed while the REST measurement was in flight.
        eligible_ids = {load.id for load in record.config.devices}
        loads = {
            control.id: control
            for control in self.ha.controls()
            if control.id in eligible_ids and eligible(control)
        }
        changed, pending_status = self.reconcile(runtime, loads, clock)
        timestamp = clock.timestamp()
        candidates = []
        for load in record.config.devices:
            control = loads.get(load.id)
            pause = runtime.paused.get(load.id)
            state = load_state(control)
            if load.id in runtime.blocked_until or (
                pause
                and control
                and control.domain == "climate"
                and timestamp - pause.at < HVAC_MIN_PAUSE_SECONDS
            ):
                state = "unavailable"
            candidates.append(GuardLoad(id=load.id, watts=load.watts, state=state, paused=pause is not None))
        if watts is None:
            self.engine.evaluate(
                clock, meter=meter.entity_id, watts=None, limit_kw=record.config.limit_kw, loads=candidates
            )
            self.publish(record, clock, reading_status, changed=changed)
            return
        # A cached HA state is useful for display, but it isn't another observation.
        if self.last_meter_stamp is not None and meter_stamp <= self.last_meter_stamp:
            status = pending_status or ("settling" if changed else runtime.state)
            self.publish(record, clock, status, watts / 1000, runtime.projected_kw, changed=changed)
            return
        self.last_meter_stamp = meter_stamp
        sample = self.engine.evaluate(
            datetime.fromtimestamp(meter_stamp, UTC),
            meter=meter.entity_id,
            watts=watts,
            limit_kw=record.config.limit_kw,
            loads=candidates,
        )
        if pending_status:
            status = pending_status
        elif sample.action:
            # Require a meter update after the preceding switch action before sending another one.
            if runtime.last_action and meter_stamp <= runtime.last_action.at.timestamp():
                status = "settling"
            else:
                status = await self.issue(record, loads[sample.action.id], sample.action, clock)
                changed = True
        else:
            status = sample.state
        if status == "settings_changed":
            self.clear_measurements()
            self.publish(record, clock, status, changed=changed)
            return
        self.publish(record, clock, status, sample.power_kw, sample.projected_kw, changed=changed)

    async def run(self):
        if self.settings.mode == "demo":
            return
        while True:
            try:
                await self.tick()
            except (ValueError, OSError, sqlite3.Error):
                # A broken settings value or a temporary local read error stops control.
                self.clear_measurements()
                LOG.warning("PowerGuard cannot read local state")
            await asyncio.sleep(POLL_SECONDS)


def state_stamp(raw):
    try:
        stamp = datetime.fromisoformat(raw.get("last_changed"))
        return stamp.timestamp() if stamp.tzinfo is not None else -math.inf
    except (ValueError, TypeError, OverflowError):
        return -math.inf


def can_resume(control, pause):
    if control.domain == "climate":
        return pause.resume_state in HVAC_MODES & climate_modes(control)
    return pause.resume_state == "on"


def power_guard_router(guard, user, admin):
    router = APIRouter(prefix="/api/home/energy/power-guard")

    @router.get("")
    async def get(current=Depends(user)):
        return guard.view(current)

    @router.put("")
    async def put(config: PowerGuardConfig, current=Depends(admin)):
        return guard.configure(config, current)

    return router
