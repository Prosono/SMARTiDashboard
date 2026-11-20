"""Bounded, local history from PowerGuard's own observations and confirmed actions."""

import json
import logging
import math
import sqlite3
from datetime import UTC, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException

from .access import visible

LOG = logging.getLogger(__name__)
OSLO = ZoneInfo("Europe/Oslo")
SAMPLE_SECONDS = 15
TODAY_STEP = 300
DEVICE_STEP = 60
RETENTION = timedelta(hours=26)
MAX_RECENT_ACTIONS = 200
Period = Literal["hour", "today"]


def timestamp(value):
    return datetime.fromtimestamp(value, UTC)


def reading(value):
    if type(value) in {int, float} and math.isfinite(value) and value >= 0:
        return value
    return None


def bucket(at, step):
    return math.floor(at / step) * step


def clear_power_guard_history(db):
    for table in ("power_guard_samples", "power_guard_actions"):
        if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone():
            db.execute("DELETE FROM " + table)


class PowerGuardHistory:
    def __init__(self, store, settings_key):
        self.store = store
        self.settings_key = settings_key
        self.last_sample = None
        self.next_prune = 0
        with store.connect() as db:
            db.executescript("""
CREATE TABLE IF NOT EXISTS power_guard_samples (
    meter TEXT NOT NULL, slot INTEGER NOT NULL, at REAL NOT NULL,
    power_kw REAL NOT NULL, projected_kw REAL, limit_kw REAL NOT NULL, device_watts TEXT NOT NULL,
    PRIMARY KEY (meter,slot)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS power_guard_samples_at ON power_guard_samples(at);
CREATE TABLE IF NOT EXISTS power_guard_actions (
    at REAL NOT NULL, device TEXT NOT NULL, command TEXT NOT NULL, watts REAL,
    PRIMARY KEY (at,device,command)
) WITHOUT ROWID;
""")

    def prune(self, now):
        if now.timestamp() < self.next_prune:
            return
        self.next_prune = now.timestamp() + 3600
        cutoff = (now - RETENTION).timestamp()
        try:
            with self.store.connect() as db:
                db.execute("DELETE FROM power_guard_samples WHERE at<?", (cutoff,))
                db.execute("DELETE FROM power_guard_actions WHERE at<?", (cutoff,))
        except sqlite3.Error:
            LOG.warning("PowerGuard could not prune history")

    def sample(self, revision, at, power_kw, projected_kw, limit_kw, device_watts, *, meter_entity):
        power_kw, limit_kw = reading(power_kw), reading(limit_kw)
        if power_kw is None or not limit_kw or reading(at) is None:
            return
        slot = bucket(at, SAMPLE_SECONDS)
        key = (revision, meter_entity, slot)
        if self.last_sample == key:
            return
        watts = {device: value for device, value in device_watts.items() if reading(value) is not None}
        try:
            with self.store.connect() as db:
                db.execute("BEGIN IMMEDIATE")
                row = db.execute("SELECT value FROM settings WHERE key=?", (self.settings_key,)).fetchone()
                record = json.loads(row[0]) if row else None
                # A save or wipe may have superseded the tick during its read or command.
                if not isinstance(record, dict) or record.get("revision") != revision:
                    return
                config, binding = record.get("config"), record.get("binding")
                if (
                    not isinstance(config, dict)
                    or config.get("enabled") is not True
                    or not isinstance(binding, dict)
                    or binding.get("entity") != meter_entity
                ):
                    return
                db.execute(
                    """INSERT OR IGNORE INTO power_guard_samples
                    (meter,slot,at,power_kw,projected_kw,limit_kw,device_watts) VALUES (?,?,?,?,?,?,?)""",
                    (meter_entity, slot, at, power_kw, reading(projected_kw), limit_kw, json.dumps(watts)),
                )
        except (sqlite3.Error, ValueError):
            LOG.warning("PowerGuard could not record a history sample")
            return
        self.last_sample = key

    @staticmethod
    def action(db, device, command, at, watts):
        try:
            db.execute(
                "INSERT OR IGNORE INTO power_guard_actions (at,device,command,watts) VALUES (?,?,?,?)",
                (at.timestamp(), device, command, reading(watts)),
            )
        except sqlite3.Error:
            LOG.warning("PowerGuard could not record a load action")

    def read(self, period, now, *, meter_entity, device_names, trace_ids):
        midnight = now.astimezone(OSLO).replace(hour=0, minute=0, second=0, microsecond=0)
        start = midnight.astimezone(UTC) if period == "today" else now - timedelta(hours=1)
        step = TODAY_STEP if period == "today" else SAMPLE_SECONDS
        start_at, end_at = start.timestamp(), now.timestamp()
        device_start_at = max(start_at, (now - timedelta(hours=1)).timestamp())
        result = {
            "period": period,
            "start": start,
            "end": now,
            "step_seconds": step,
            "points": [],
            "actions": [],
            "devices": [],
            "counts": {"paused": 0, "restored": 0},
        }
        if not meter_entity and not device_names:
            return result
        with self.store.connect() as db:
            samples = db.execute(
                """SELECT at,power_kw,projected_kw,limit_kw,device_watts FROM power_guard_samples
                WHERE meter=? AND slot>=? AND slot<=? AND at>=? AND at<=? ORDER BY slot""",
                (meter_entity, bucket(start_at, SAMPLE_SECONDS), end_at, start_at, end_at),
            ).fetchall()
            actions = db.execute(
                "SELECT at,device,command,watts FROM power_guard_actions WHERE at>=? AND at<=? ORDER BY at DESC",
                (start_at, end_at),
            ).fetchall()

        main = {}
        traces = {}
        for row in samples:
            at = row["at"]
            main[bucket(at, step)] = {
                "at": timestamp(at),
                "power_kw": row["power_kw"],
                "projected_kw": row["projected_kw"],
                "limit_kw": row["limit_kw"],
            }
            if at >= device_start_at and trace_ids:
                measurements = json.loads(row["device_watts"])
                for device in trace_ids.intersection(measurements):
                    traces.setdefault(device, {})[bucket(at, DEVICE_STEP)] = {
                        "at": timestamp(at),
                        "watts": measurements[device],
                    }

        if main:
            result["points"] = [
                main.get(slot)
                or {
                    "at": timestamp(max(slot, start_at)),
                    "power_kw": None,
                    "projected_kw": None,
                    "limit_kw": None,
                }
                for slot in range(bucket(start_at, step), bucket(end_at, step) + step, step)
            ]
        result["devices"] = [
            {
                "id": device,
                "points": [
                    points.get(slot) or {"at": timestamp(max(slot, device_start_at)), "watts": None}
                    for slot in range(
                        bucket(device_start_at, DEVICE_STEP),
                        bucket(end_at, DEVICE_STEP) + DEVICE_STEP,
                        DEVICE_STEP,
                    )
                ],
            }
            for device, points in sorted(traces.items())
        ]
        for row in actions:
            device, command = row["device"], row["command"]
            if device not in device_names or command not in {"turn_off", "turn_on"}:
                continue
            result["counts"]["paused" if command == "turn_off" else "restored"] += 1
            if len(result["actions"]) < MAX_RECENT_ACTIONS:
                result["actions"].append(
                    {
                        "id": device,
                        "name": device_names[device],
                        "at": timestamp(row["at"]),
                        "command": command,
                        "watts": row["watts"],
                    }
                )
        return result


def power_guard_history_router(guard, user):
    router = APIRouter(prefix="/api/home/energy/power-guard")

    @router.get("/history")
    async def history(period: Period = "hour", current=Depends(user)):
        now = datetime.now(UTC)
        meter = None
        names = {}
        traces = set()
        try:
            if guard.settings.mode != "demo" and not guard.resetting():
                _, meter, _, _, loads, _ = guard.inventory(now)
                names = {
                    device: control.name for device, control in loads.items() if visible(current, control)
                }
                traces = names.keys() & {load.id for load in guard.record().config.devices}
            return guard.history.read(
                period,
                now,
                meter_entity=meter.entity_id if meter and visible(current, meter) else None,
                device_names=names,
                trace_ids=traces,
            )
        except (sqlite3.Error, ValueError):
            raise HTTPException(503, "power_guard_history_unavailable") from None

    return router
