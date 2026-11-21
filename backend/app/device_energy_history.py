"""Meter history and interval-priced variable costs for selected appliances."""

import asyncio
import math
from bisect import bisect_right
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from sys import float_info
from time import monotonic
from zoneinfo import ZoneInfo

import httpx
from fastapi import HTTPException
from websockets.exceptions import ConnectionClosed

from .energy_costs import cost
from .energy_intervals import Interval
from .energy_repository import EnergyConfig
from .ha import HAError

HOUR = timedelta(hours=1)
OSLO = ZoneInfo("Europe/Oslo")
PRICE_RETRY_SECONDS = 300
MAX_PRICE_DAYS = 4


def hourly_readings(rows, start, hours, field):
    """One record per actual completed clock-hour, including both fall-back hours."""
    first = int(start.timestamp()) * 1000
    end = first + hours * 3_600_000
    values = {}
    for row in rows[: hours + 2] if isinstance(rows, list) else []:
        if not isinstance(row, dict):
            continue
        stamp, value = row.get("start"), row.get(field)
        if (
            type(stamp) in {int, float}
            and first <= stamp < end
            and (stamp - first) % 3_600_000 == 0
            and type(value) in {int, float}
            and 0 <= value <= float_info.max
        ):
            values[int((stamp - first) // 3_600_000)] = Decimal(str(value))
    return values


def chart_buckets(period, hours):
    first = 0
    for i in range(1, len(hours)):
        if period == "24h" or hours[first].astimezone(OSLO).date() != hours[i].astimezone(OSLO).date():
            yield first, i
            first = i
    yield first, len(hours)


def aggregate(values):
    if not values:
        return None
    total = float(sum(values.values()))
    return total if math.isfinite(total) else None


def coverage(values, hours):
    covered = round(len(values) / hours * 100, 1)
    return covered if len(values) == hours else min(covered, 99.9)


class DeviceEnergyHistory:
    def __init__(self, ha, repo, platform):
        self.ha, self.repo, self.platform = ha, repo, platform
        self.price_attempts = {}
        self.price_lock = asyncio.Lock()

    async def read(self, period, count, sources, demo, now=None):
        end = (now or datetime.now(UTC)).replace(minute=0, second=0, microsecond=0)
        start = end - count * HOUR
        result = {
            "period": period,
            "start": start,
            "end": end,
            "devices": [],
            "demo": demo,
            "currency": "NOK",
        }
        if demo or not sources:
            return result
        if not self.ha.connected:
            raise HTTPException(503, "ha_disconnected")

        groups = {
            kind: [source.entity for source in sources if source.kind == kind] for kind in ("energy", "power")
        }
        requests = [
            self.recorder(kind, entities, start, end) for kind, entities in groups.items() if entities
        ]
        recorded = await asyncio.gather(*requests)
        if not any(rows is not None for rows in recorded):
            raise HTTPException(503, "energy_statistics_unavailable")
        rows = {entity: rows for group in recorded if group is not None for entity, rows in group.items()}
        readings = {
            source.id: hourly_readings(
                rows.get(source.entity), start, count, "change" if source.kind == "energy" else "mean"
            )
            for source in sources
        }
        timestamps = [start + i * HOUR for i in range(count)]
        needed = {hour for values in readings.values() for hour, value in values.items() if value > 0}
        rates = await self.hourly_rates(timestamps, needed)
        buckets = list(chart_buckets(period, timestamps))

        for source in sources:
            energy = readings[source.id]
            priced = {
                hour: value * rates[hour] if value > 0 else Decimal(0)
                for hour, value in energy.items()
                if hour in rates or value == 0
            }
            points = []
            for first, last in buckets:
                measured = {hour: energy[hour] for hour in range(first, last) if hour in energy}
                estimated = {hour: priced[hour] for hour in range(first, last) if hour in priced}
                points.append(
                    {
                        "start": timestamps[first],
                        "end": timestamps[last - 1] + HOUR,
                        "kwh": aggregate(measured),
                        "cost": aggregate(estimated),
                        "coverage": coverage(measured, last - first),
                        "cost_coverage": coverage(estimated, last - first),
                    }
                )
            result["devices"].append(
                {
                    "id": source.id,
                    "name": source.name,
                    "room": source.room,
                    "kind": "measured" if source.kind == "energy" else "estimated",
                    "kwh": aggregate(energy),
                    "cost": aggregate(priced),
                    "coverage": coverage(energy, count),
                    "cost_coverage": coverage(priced, count),
                    "points": points,
                }
            )
        return result

    async def recorder(self, kind, entities, start, end):
        field, unit = ("change", "kWh") if kind == "energy" else ("mean", "kW")
        try:
            rows = await self.ha.request(
                "recorder/statistics_during_period",
                _timeout=9,
                start_time=start.isoformat(),
                end_time=end.isoformat(),
                statistic_ids=entities,
                period="hour",
                units={kind: unit},
                types=[field],
            )
        except (HAError, OSError, ConnectionClosed):
            return None
        if not isinstance(rows, dict):
            return None
        return {entity: rows.get(entity) for entity in entities}

    async def hourly_rates(self, hours, needed):
        if not self.repo or not needed:
            return {}
        with self.repo.store.connect() as db:
            config_rows = db.execute(
                "SELECT start, body FROM energy_configs WHERE start<=? ORDER BY start",
                (hours[-1].isoformat(),),
            ).fetchall()
        version_starts = [datetime.fromisoformat(row["start"]) for row in config_rows]
        # Capacity and household support are shared across all devices. Price
        # metered energy with the applicable tariff, taxes and supply agreement.
        versions = [
            EnergyConfig.model_validate_json(row["body"]).model_copy(update={"scheme": "none"})
            for row in config_rows
        ]
        configs = {}
        price_days = {}
        for hour in needed:
            stamp = hours[hour]
            index = bisect_right(version_starts, stamp) - 1
            if index < 0:
                continue
            agreement = versions[index]
            configs[hour] = agreement
            if agreement.contract == "spot":
                price_days.setdefault((agreement.area, stamp.astimezone(OSLO).date()), None)
        for key in price_days:
            price_days[key] = self.repo.prices(*key)
        await self.fetch_missing_prices(price_days)

        tariffs, result = {}, {}
        for hour, agreement in configs.items():
            stamp = hours[hour]
            if agreement.company not in tariffs:
                tariffs[agreement.company] = self.repo.tariff(agreement.company)
            rate = cost(
                Interval(stamp, stamp + HOUR, Decimal(1), "device_energy", "estimated"),
                agreement,
                price_days.get((agreement.area, stamp.astimezone(OSLO).date())),
                tariff_source=tariffs[agreement.company],
            )["total"]
            if rate is not None and rate.is_finite():
                result[hour] = rate
        return result

    async def fetch_missing_prices(self, days):
        if not self.platform or self.price_lock.locked() or not any(value is None for value in days.values()):
            return

        async def fetch(key):
            try:
                days[key] = await self.platform.prices(*key)
            except (httpx.HTTPError, ValueError, KeyError, TypeError):
                return

        async with self.price_lock:
            now = monotonic()
            self.price_attempts = {
                key: at for key, at in self.price_attempts.items() if now - at < PRICE_RETRY_SECONDS
            }
            missing = sorted(
                (key for key, value in days.items() if value is None and key not in self.price_attempts),
                key=lambda key: key[1],
                reverse=True,
            )[:MAX_PRICE_DAYS]
            self.price_attempts.update(dict.fromkeys(missing, now))
            try:
                async with asyncio.timeout(4):
                    await asyncio.gather(*(fetch(key) for key in missing))
            except TimeoutError:
                return
