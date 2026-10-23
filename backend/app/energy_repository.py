"""Hub-local energy history, idempotent intervals and effective-dated settings."""

import json
from datetime import UTC, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from .energy_intervals import Interval, utc


class Meter(BaseModel):
    model_config = {"extra": "forbid", "validate_default": True}
    role: Literal["grid", "solar", "export", "ev", "battery_charge", "battery_discharge", "consumer"]
    entity: str = Field(min_length=1, max_length=200)
    name: str = Field(min_length=1, max_length=100)


class EnergyConfig(BaseModel):
    model_config = {"extra": "forbid", "validate_default": True}
    country: Literal["NO"] = "NO"
    area: Literal["NO1", "NO2", "NO3", "NO4", "NO5"] = "NO1"
    company: str = Field(default="", max_length=80)
    segment: Literal["husholdning", "fritid"] = "husholdning"
    contract: Literal["spot", "fixed"] = "spot"
    fixed_price: Decimal = Field(default=0, ge=0, le=100, allow_inf_nan=False)
    markup: Decimal = Field(default=0, ge=-10, le=100, allow_inf_nan=False)
    monthly_fee: Decimal = Field(default=0, ge=0, le=10000, allow_inf_nan=False)
    scheme: Literal["none", "stromstotte", "norgespris"] = "stromstotte"
    vat_exempt: bool = False
    electricity_tax_exempt: bool = False
    manual_grid_rate: Decimal | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)
    manual_capacity: Decimal | None = Field(default=None, ge=0, le=100000, allow_inf_nan=False)
    meters: list[Meter] = Field(default_factory=list, max_length=16)
    power_entity: str | None = Field(default=None, max_length=200)
    power: dict[Literal["solar", "battery", "ev", "home"], str] = Field(default_factory=dict, max_length=4)
    battery_level: str | None = Field(default=None, max_length=200)
    equipment: dict[Literal["solar", "ev", "battery"], bool] | None = None
    cloud_history: bool = True

    @model_validator(mode="after")
    def unique(self):
        if len({m.entity for m in self.meters}) != len(self.meters):
            raise ValueError("duplicate_energy_meter")
        if sum(m.role == "grid" for m in self.meters) > 1:
            raise ValueError("one_grid_import_meter_required")
        if self.segment == "fritid" and self.scheme == "stromstotte":
            raise ValueError("holiday_home_not_eligible_for_stromstotte")
        return self


class EnergyRepository:
    def __init__(self, store):
        self.store = store
        with store.connect() as db:
            db.executescript("""
CREATE TABLE IF NOT EXISTS energy_tariffs(revision TEXT PRIMARY KEY, company TEXT NOT NULL, fetched TEXT NOT NULL, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS energy_configs(start TEXT PRIMARY KEY, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS energy_intervals(entity TEXT NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL,
 value TEXT NOT NULL, source TEXT NOT NULL, quality TEXT NOT NULL, synced INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(entity,start));
CREATE TABLE IF NOT EXISTS energy_prices(area TEXT NOT NULL, day TEXT NOT NULL, body TEXT NOT NULL,
 fetched TEXT NOT NULL, PRIMARY KEY(area,day));
""")

    def config(self, at=None):
        stamp = utc(at or datetime.now(UTC)).isoformat()
        with self.store.connect() as db:
            row = db.execute(
                "SELECT body FROM energy_configs WHERE start<=? ORDER BY start DESC LIMIT 1", (stamp,)
            ).fetchone()
        return EnergyConfig.model_validate_json(row[0]) if row else None

    def save(self, config, at=None):
        # Whole-hour boundary: never apply two configurations to one recorded hour.
        stamp = utc(at or datetime.now(UTC)).replace(minute=0, second=0, microsecond=0).isoformat()
        with self.store.connect() as db:
            db.execute(
                "INSERT OR REPLACE INTO energy_configs VALUES (?,?)", (stamp, config.model_dump_json())
            )

    def put(self, entity, rows):
        with self.store.connect() as db:
            for row in rows:
                if row.value is None:
                    continue
                values = (
                    entity,
                    row.start.isoformat(),
                    row.end.isoformat(),
                    str(row.value),
                    row.source,
                    row.quality,
                )
                db.execute(
                    """INSERT INTO energy_intervals VALUES (?,?,?,?,?,?,0)
 ON CONFLICT(entity,start) DO UPDATE SET end=excluded.end,value=excluded.value,source=excluded.source,
 quality=excluded.quality,synced=0 WHERE value!=excluded.value OR end!=excluded.end
 OR source!=excluded.source OR quality!=excluded.quality""",
                    values,
                )

    def rows(self, entity, start, end):
        with self.store.connect() as db:
            rows = db.execute(
                "SELECT * FROM energy_intervals WHERE entity=? AND start>=? AND end<=? ORDER BY start",
                (entity, utc(start).isoformat(), utc(end).isoformat()),
            ).fetchall()
        return [
            Interval(
                datetime.fromisoformat(r["start"]),
                datetime.fromisoformat(r["end"]),
                Decimal(r["value"]),
                r["source"],
                r["quality"],
            )
            for r in rows
        ]

    def prices(self, area, day):
        with self.store.connect() as db:
            row = db.execute(
                "SELECT body FROM energy_prices WHERE area=? AND day=?", (area, str(day))
            ).fetchone()
        return json.loads(row[0]) if row else None

    def tariff(self, company):
        with self.store.connect() as db:
            row = db.execute(
                "SELECT body FROM energy_tariffs WHERE company=? ORDER BY fetched DESC LIMIT 1", (company,)
            ).fetchone()
        return json.loads(row[0]) if row else None
