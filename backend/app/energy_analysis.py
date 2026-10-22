"""Period aggregation with coverage, historical agreements and explicit estimates."""

import calendar
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from .energy_costs import cost
from .energy_intervals import local_day, summarize_energy
from .energy_repository import EnergyConfig
from .energy_tariffs import capacity_rate

ZONE = ZoneInfo("Europe/Oslo")
ZERO = Decimal(0)


def analyze(repo, config, meter, start, end, scenario=None):
    if start >= end:
        return {
            "role": meter.role,
            "name": meter.name,
            "summary": {"available_kwh": None, "total_kwh": None, "coverage": 0, "complete": False},
            "points": [],
            "cost_total": None,
            "breakdown": {},
            "monthly_fees": None,
            "capacity": None,
        }
    with repo.store.connect() as db:
        versions = [
            (datetime.fromisoformat(r["start"]), EnergyConfig.model_validate_json(r["body"]))
            for r in db.execute("SELECT * FROM energy_configs ORDER BY start")
        ]
    prices, months, tariffs, capacities = {}, {}, {}, {}
    provenance = set()
    rows = repo.rows(meter.entity, start, end)
    grid = next((m for m in config.meters if m.role == "grid"), None)
    points, breakdown = [], {}

    def month(stamp):
        key = stamp.year, stamp.month
        if key not in months:
            a, _ = local_day(stamp.date().replace(day=1))
            last = calendar.monthrange(stamp.year, stamp.month)[1]
            _, b = local_day(stamp.date().replace(day=last))
            until = min(b, datetime.now(UTC).replace(minute=0, second=0, microsecond=0))
            readings = repo.rows(grid.entity, a, until) if grid and a < until else []
            summary = summarize_energy(readings, a, until) if a < until else {"total_kwh": None}
            prefix, cursor, before = {}, a, ZERO
            for reading in readings:
                agreement = next((cfg for at, cfg in reversed(versions) if at <= reading.start), None)
                binding = (
                    next((m.entity for m in agreement.meters if m.role == "grid"), None)
                    if agreement
                    else None
                )
                if reading.start != cursor or binding != grid.entity:
                    before = None
                prefix[reading.start] = (before, reading.value)
                if before is not None:
                    before += reading.value
                cursor = reading.end
            months[key] = (summary["total_kwh"], readings, a, b, prefix)
        return months[key]

    priced = True
    fees = ZERO
    capacity = None
    for row in rows:
        historical = next((cfg for at, cfg in reversed(versions) if at <= row.start), None)
        calculated = {"total": None, "reason": "historical_agreement_missing"}
        if historical and scenario:
            historical = historical.model_copy(update=scenario)
        if historical and meter.role in {"grid", "ev", "consumer"}:
            stamp = row.start.astimezone(ZONE)
            key = historical.area, stamp.date()
            if key not in prices:
                prices[key] = repo.prices(*key)
            usage, grid_rows, ma, mb, prefix = month(stamp)
            usage, grid_kwh = prefix.get(row.start, (None, None))
            # A different import meter earlier in the month makes support eligibility unknown.
            configured_grid = next((m.entity for m in historical.meters if m.role == "grid"), None)
            if not grid or configured_grid != grid.entity:
                usage = None
            if historical.company not in tariffs:
                tariffs[historical.company] = repo.tariff(historical.company)
            cap = Decimal(1000 if historical.segment == "fritid" else 5000)
            fraction = None
            if usage is not None and grid_kwh is not None and meter.role != "grid":
                fraction = min(Decimal(1), max(ZERO, cap - usage) / grid_kwh) if grid_kwh > 0 else ZERO
            calculated = cost(row, historical, prices[key], usage, tariffs[historical.company], fraction)
            if calculated["total"] is not None:
                provenance.add((calculated["tariff_revision"], calculated["rules"]))
                for name, value in calculated["parts"].items():
                    breakdown[name] = breakdown.get(name, ZERO) + value
            if meter.role == "grid":
                capacity_key = historical.company, historical.segment, stamp.date()
                if capacity_key not in capacities:
                    capacities[capacity_key] = capacity_rate(
                        historical.company,
                        stamp.date(),
                        [
                            (r.start.astimezone(ZONE), r.value)
                            for r in grid_rows
                            if r.end - r.start == timedelta(hours=1)
                        ],
                        historical.segment,
                        tariffs[historical.company],
                    )
                capacity = capacities[capacity_key]
                fixed = historical.manual_capacity
                if fixed is None and capacity:
                    fixed = capacity["monthly_ex_vat"]
                if fixed is None:
                    priced = False
                else:
                    proportion = Decimal(
                        str((row.end - row.start).total_seconds() / (mb - ma).total_seconds())
                    )
                    factor = Decimal(1) if historical.vat_exempt else Decimal("1.25")
                    fees += (historical.monthly_fee + fixed) * proportion * factor
        priced &= calculated["total"] is not None
        points.append({"start": row.start, "end": row.end, "kwh": row.value, "cost": calculated})
    summary = summarize_energy(rows, start, end)
    complete = summary["complete"] and priced and bool(rows)
    return {
        "role": meter.role,
        "name": meter.name,
        "summary": summary,
        "points": points,
        "cost_total": sum(breakdown.values()) + fees if complete else None,
        "breakdown": breakdown,
        "monthly_fees": fees if complete else None,
        "capacity": capacity,
        "cost_quality": "estimated" if complete else "missing",
        "provenance": [
            {"tariff_revision": revision, "rules": rules} for revision, rules in sorted(provenance)
        ],
        "cost_note": "Faste beløp er fordelt over måneden. Kapasitetsledd og støtte er foreløpige.",
    }


def chart_points(points, start, end):
    """Bound chart size without compressing missing hours or joining DST repeats."""
    if start >= end:
        return []
    by_start = {p["start"]: p for p in points}
    days = (end - start).total_seconds() / 86400
    groups = {}
    cursor = start
    while cursor < end:
        local = cursor.astimezone(ZONE)
        key = (
            cursor if days <= 2 else local.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(UTC)
        )
        if days > 62:
            key = local.replace(day=1, hour=0, minute=0, second=0, microsecond=0).astimezone(UTC)
        group = groups.setdefault(
            key, {"start": key, "end": cursor, "kwh": ZERO, "cost": {"total": ZERO}, "missing": 0}
        )
        point = by_start.get(cursor)
        group["end"] = min(cursor + timedelta(hours=1), end)
        if not point:
            group["missing"] += 1
            group["kwh"] = None
            group["cost"]["total"] = None
        else:
            if group["kwh"] is not None:
                group["kwh"] += point["kwh"]
            if point["cost"]["total"] is None:
                group["cost"]["total"] = None
            elif group["cost"]["total"] is not None:
                group["cost"]["total"] += point["cost"]["total"]
        cursor += timedelta(hours=1)
    return list(groups.values())
