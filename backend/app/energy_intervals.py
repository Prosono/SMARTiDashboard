"""Lossless interval primitives shared by energy providers and cost calculations.

No billing rules, storage policy or source preference is implicit here. All
intervals are half-open UTC ranges; missing data is never converted to zero.
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo


def utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("energy_timestamp_requires_timezone")
    return value.astimezone(UTC)


@dataclass(frozen=True)
class Interval:
    start: datetime
    end: datetime
    value: Decimal | None
    source: str
    quality: str = "measured"

    def __post_init__(self):
        object.__setattr__(self, "start", utc(self.start))
        object.__setattr__(self, "end", utc(self.end))
        if self.end <= self.start:
            raise ValueError("invalid_energy_interval")
        if self.value is not None and (not isinstance(self.value, Decimal) or not self.value.is_finite()):
            raise ValueError("invalid_energy_value")
        if not self.source or self.quality not in {"measured", "estimated", "calculated"}:
            raise ValueError("invalid_energy_provenance")


def local_day(day: date, timezone: str = "Europe/Oslo") -> tuple[datetime, datetime]:
    zone = ZoneInfo(timezone)
    return (
        datetime.combine(day, time.min, zone).astimezone(UTC),
        datetime.combine(day + timedelta(days=1), time.min, zone).astimezone(UTC),
    )


def non_overlapping(rows: list[Interval]) -> list[Interval]:
    ordered = sorted(rows, key=lambda row: row.start)
    if any(left.end > right.start for left, right in zip(ordered, ordered[1:])):
        raise ValueError("overlapping_energy_intervals")
    return ordered


def reconcile(primary: list[Interval], fallback: list[Interval]) -> list[Interval]:
    """Prefer complete primary readings; use fallback only in wholly empty ranges.

    A partial overlap is deliberately not divided: that would invent a load
    profile. For example, an hourly reading cannot fill three missing quarters
    if one measured quarter already exists. Callers must report that gap.
    """
    selected = [row for row in non_overlapping(primary) if row.value is not None]
    for candidate in non_overlapping(fallback):
        if candidate.value is not None and not any(
            row.start < candidate.end and candidate.start < row.end for row in selected
        ):
            selected.append(candidate)
    return sorted(selected, key=lambda row: row.start)


def summarize_energy(rows: list[Interval], start: datetime, end: datetime) -> dict:
    start, end = utc(start), utc(end)
    if end <= start:
        raise ValueError("invalid_energy_period")
    ordered = non_overlapping(rows)
    selected = [row for row in ordered if start <= row.start and row.end <= end and row.value is not None]
    seconds = sum((row.end - row.start).total_seconds() for row in selected)
    complete = seconds == (end - start).total_seconds()
    subtotal = sum((row.value for row in selected), Decimal(0)) if selected else None
    return {
        "total_kwh": subtotal if complete else None,
        "available_kwh": subtotal,
        "complete": complete,
        "coverage": seconds / (end - start).total_seconds(),
        "quality": "estimated"
        if any(r.quality == "estimated" for r in selected)
        else "calculated"
        if any(r.quality == "calculated" for r in selected)
        else "measured"
        if selected
        else "missing",
        "sources": sorted({row.source for row in selected}),
    }
