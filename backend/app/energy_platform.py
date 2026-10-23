"""Shared energy setup, bounded recorder collection and resumable cloud archive."""

import asyncio
import hashlib
import json
import math
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter, Depends, HTTPException

from .access import visible
from .certificate_hook import read_identity
from .energy_analysis import analyze, chart_points
from .energy_costs import cost, spot_rate
from .energy_flow import power_reading
from .energy_intervals import Interval, local_day
from .energy_repository import EnergyConfig, EnergyRepository
from .energy_tariffs import catalogue
from .ha import HAError

OSLO = ZoneInfo("Europe/Oslo")


class SetupRequest(EnergyConfig):
    effective_from: date | None = None


class EnergyPlatform:
    def __init__(self, ha, store, settings):
        self.ha, self.store, self.settings = ha, store, settings
        self.repo = EnergyRepository(store)
        self.lock = asyncio.Lock()

    async def prices(self, area, day):
        cached = self.repo.prices(area, day)
        if cached is not None:
            return cached
        url = f"https://home.smarti.dev/api/energy/prices/{area}/{day}"
        async with httpx.AsyncClient(timeout=15, trust_env=False, follow_redirects=False) as client:
            response = await client.get(url)
            response.raise_for_status()
            if len(response.content) > 100000:
                raise ValueError("price_response_too_large")
            rows = response.json()
        if not isinstance(rows, list) or not 1 <= len(rows) <= 100:
            raise ValueError("invalid_spot_prices")
        expected, end = local_day(day)
        for row in rows:
            a, b = datetime.fromisoformat(row["time_start"]), datetime.fromisoformat(row["time_end"])
            if a.tzinfo is None or b.tzinfo is None or a != expected or not a < b <= end:
                raise ValueError("invalid_spot_intervals")
            if not Decimal(str(row["NOK_per_kWh"])).is_finite():
                raise ValueError("invalid_spot_value")
            expected = b
        if expected != end:
            raise ValueError("incomplete_spot_day")
        with self.store.connect() as db:
            db.execute(
                "INSERT OR REPLACE INTO energy_prices VALUES(?,?,?,?)",
                (area, str(day), json.dumps(rows), datetime.now(UTC).isoformat()),
            )
        return rows

    async def collect(self):
        if self.lock.locked():
            return
        async with self.lock:
            with self.store.connect() as db:
                if db.execute("SELECT 1 FROM sqlite_master WHERE name='factory_resets'").fetchone():
                    if db.execute("SELECT 1 FROM factory_resets WHERE status='running'").fetchone():
                        return
            config = self.repo.config()
            if not config or self.settings.mode == "demo":
                return
            generation = self.store.get("energy_generation")
            end = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
            # Refresh recent readings for recorder corrections, plus one older day per cycle.
            start = end - timedelta(days=2)
            entities = [m.entity for m in config.meters]
            if entities and self.ha.connected:
                cursor = self.store.get("energy_backfill")
                older = datetime.fromisoformat(cursor) if cursor else start
                ranges = [(start, end)]
                if older > end - timedelta(days=366):
                    ranges.append((older - timedelta(days=1), older))
                for a, b in ranges:
                    data = await self.ha.request(
                        "recorder/statistics_during_period",
                        start_time=a.isoformat(),
                        end_time=b.isoformat(),
                        statistic_ids=entities,
                        period="hour",
                        units={"energy": "kWh"},
                        types=["change"],
                    )
                    if self.store.get("energy_generation") != generation or self.repo.config() is None:
                        return
                    for entity in entities:
                        readings = []
                        for row in (data or {}).get(entity, [])[:72]:
                            stamp, value = row.get("start"), row.get("change")
                            if not isinstance(stamp, (int, float)) or not isinstance(value, (int, float)):
                                continue
                            if not math.isfinite(stamp) or not math.isfinite(value) or value < 0:
                                continue
                            point = datetime.fromtimestamp(stamp / 1000, UTC)
                            if point.minute or point.second or not a <= point < b:
                                continue
                            readings.append(
                                Interval(
                                    point,
                                    point + timedelta(hours=1),
                                    Decimal(str(value)),
                                    "ha:recorder",
                                    "measured",
                                )
                            )
                        self.repo.put(entity, readings)
                if len(ranges) > 1:
                    self.store.set("energy_backfill", ranges[-1][0].isoformat())
                    historical = self.repo.config(ranges[-1][0])
                    if historical:
                        try:
                            await self.prices(historical.area, ranges[-1][0].astimezone(OSLO).date())
                        except (httpx.HTTPError, ValueError, KeyError, TypeError):
                            pass
            today = datetime.now(OSLO).date()
            if config.company and self.store.get("energy_tariff_checked") != str(today):
                try:
                    async with httpx.AsyncClient(
                        timeout=15, trust_env=False, follow_redirects=False
                    ) as client:
                        response = await client.get(
                            "https://home.smarti.dev/api/energy/tariffs/" + config.company
                        )
                        response.raise_for_status()
                        source = response.json()
                    if len(response.content) > 500000 or source.get("id") != config.company:
                        raise ValueError("invalid_tariff_source")
                    if not isinstance(source.get("data", {}).get("tariffer"), list):
                        raise ValueError("invalid_tariff_source")
                    with self.store.connect() as db:
                        db.execute(
                            "INSERT OR REPLACE INTO energy_tariffs VALUES(?,?,?,?)",
                            (
                                source["revision"],
                                config.company,
                                datetime.now(UTC).isoformat(),
                                json.dumps(source),
                            ),
                        )
                    self.store.set("energy_tariff_checked", str(today))
                except (httpx.HTTPError, ValueError, KeyError, TypeError):
                    pass
            for day in [today - timedelta(days=1), today, today + timedelta(days=1)]:
                try:
                    await self.prices(config.area, day)
                except (httpx.HTTPError, ValueError, KeyError, TypeError):
                    pass  # Future prices may not be published. Never cache missing as zero.
            if self.store.get("energy_generation") != generation or self.repo.config() is None:
                return
            await self.sync(config)
            self.store.set("energy_collected_at", datetime.now(UTC).isoformat())

    async def sync(self, config):
        if not config.cloud_history or not self.settings.remote_identity_file:
            return
        try:
            home, credential = read_identity(self.settings.remote_identity_file)
        except (OSError, ValueError, KeyError):
            self.store.set("energy_cloud_state", "not_connected")
            return
        with self.store.connect() as db:
            rows = db.execute(
                "SELECT * FROM energy_intervals WHERE synced=0 ORDER BY start LIMIT 1000"
            ).fetchall()
            agreements = [
                {"start": r["start"], "config": json.loads(r["body"])}
                for r in db.execute("SELECT * FROM energy_configs ORDER BY start DESC LIMIT 200")
            ]
        agreement_digest = hashlib.sha256(json.dumps(agreements, sort_keys=True).encode()).hexdigest()
        if not rows and self.store.get("energy_agreements_digest") == agreement_digest:
            return
        body = [{k: r[k] for k in ("entity", "start", "end", "value", "source", "quality")} for r in rows]
        async with httpx.AsyncClient(timeout=20, trust_env=False, follow_redirects=False) as client:
            result = await client.post(
                f"https://home.smarti.dev/api/hubs/{home}/energy/history",
                headers={"Authorization": "Bearer " + credential},
                json={"readings": body, "agreements": agreements},
            )
            result.raise_for_status()
            if result.json().get("accepted") != len(rows):
                raise ValueError("energy_archive_not_confirmed")
        with self.store.connect() as db:
            for r in rows:
                db.execute(
                    "UPDATE energy_intervals SET synced=1 WHERE entity=? AND start=? AND value=? AND end=?",
                    (r["entity"], r["start"], r["value"], r["end"]),
                )
        self.store.set("energy_agreements_digest", agreement_digest)
        with self.store.connect() as db:
            pending = db.execute("SELECT 1 FROM energy_intervals WHERE synced=0 LIMIT 1").fetchone()
        self.store.set("energy_cloud_state", "pending" if pending else "synced")
        self.store.set("energy_cloud_at", datetime.now(UTC).isoformat())

    async def run(self):
        while True:
            try:
                await self.collect()
            except (HAError, httpx.HTTPError, TimeoutError, ValueError, OSError):
                self.store.set("energy_cloud_state", "retrying")
            await asyncio.sleep(300)


def platform_router(service, user, admin):
    router = APIRouter(prefix="/api/home/energy/platform")
    repo, store, ha = service.repo, service.store, service.ha

    @router.get("/setup")
    async def setup(current=Depends(user)):
        config = repo.config()
        source = repo.tariff(config.company) if config else None
        return {
            "config": config,
            "can_edit": current["role"] == "admin",
            "country": store.get("country", ""),
            "companies": [{"id": c["id"], "name": c["data"]["netteier"]} for c in catalogue()["companies"]],
            "tariff_source": {
                "name": "Fri Nettleie",
                "url": catalogue()["source"],
                "updated": source["data"].get("sist_oppdatert", source["fetched"])
                if source
                else catalogue()["fetched"],
                "stale": source.get("stale", False) if source else True,
                "license": catalogue()["license"],
            },
            "elhub": "requires_business_access",
            "sensors": [
                {
                    "entity": c.entity_id,
                    "name": c.name,
                    "unit": c.attributes["unit_of_measurement"],
                    "state": c.state if ha.connected else "unavailable",
                }
                for c in ha.controls()
                if c.domain == "sensor"
                and visible(current, c)
                and c.attributes.get("unit_of_measurement") in {"kWh", "Wh", "W", "kW", "%"}
            ],
        }

    @router.put("/setup")
    async def save(body: SetupRequest, current=Depends(admin)):
        available = {c.entity_id: c for c in ha.controls() if visible(current, c)}
        for meter in body.meters:
            c = available.get(meter.entity)
            if not c or c.attributes.get("unit_of_measurement") not in {"Wh", "kWh"}:
                raise HTTPException(422, "invalid_energy_meter")
        if body.power_entity:
            c = available.get(body.power_entity)
            if not c or c.attributes.get("unit_of_measurement") not in {"W", "kW"}:
                raise HTTPException(422, "invalid_power_meter")
        for entity in list(body.power.values()) + ([body.battery_level] if body.battery_level else []):
            c = available.get(entity)
            allowed = {"%"} if entity == body.battery_level else {"W", "kW"}
            if not c or c.attributes.get("unit_of_measurement") not in allowed:
                raise HTTPException(422, "invalid_energy_sensor")
        if body.company and body.company not in {c["id"] for c in catalogue()["companies"]}:
            raise HTTPException(422, "invalid_grid_company")
        previous = repo.config()
        if previous is None:
            import uuid

            store.set("energy_generation", str(uuid.uuid4()))
        at = None
        if body.effective_from:
            if not date(2021, 12, 1) <= body.effective_from <= datetime.now(OSLO).date():
                raise HTTPException(422, "invalid_agreement_date")
            at, _ = local_day(body.effective_from)
        repo.save(EnergyConfig.model_validate(body.model_dump(exclude={"effective_from"})), at)
        store.set("energy_platform_config", repo.config().model_dump_json())
        if previous is None or previous.company != body.company:
            store.set("energy_tariff_checked", "")
        if previous is None or previous.meters != body.meters:
            store.set("energy_backfill", "")
        return {"saved": True}

    @router.post("/refresh")
    async def refresh(current=Depends(admin)):
        try:
            await service.collect()
        except (HAError, httpx.HTTPError, TimeoutError, ValueError, OSError):
            raise HTTPException(503, "energy_refresh_unavailable") from None
        return {"refreshed": True}

    @router.get("/dashboard")
    def dashboard(start: date, end: date, current=Depends(user)):
        if not 0 < (end - start).days <= 366:
            raise HTTPException(422, "invalid_energy_period")
        config = repo.config()
        if not config:
            return {"configured": False}
        a, _ = local_day(start)
        b, _ = local_day(end)
        b = min(b, datetime.now(UTC).replace(minute=0, second=0, microsecond=0))
        controls = {c.entity_id: c for c in ha.controls() if visible(current, c)}
        meters = []
        for meter in config.meters:
            if meter.entity not in controls:
                continue
            result = analyze(repo, config, meter, a, b)
            result["points"] = chart_points(result["points"], a, b)
            meters.append(result)
        grid = next((m for m in config.meters if m.role == "grid" and m.entity in controls), None)
        today = datetime.now(OSLO).date()
        finished = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
        totals = {}
        forecast = None
        comparisons = []
        previous = None
        if grid:
            from .energy_intervals import summarize_energy

            for label, day in [
                ("today", today),
                ("month", today.replace(day=1)),
                ("year", today.replace(month=1, day=1)),
            ]:
                began, _ = local_day(day)
                if began < finished:
                    values = repo.rows(grid.entity, began, finished)
                    totals[label] = summarize_energy(values, began, finished)
                    totals[label]["cost"] = analyze(repo, config, grid, began, finished)["cost_total"]
            month_start, _ = local_day(today.replace(day=1))
            if month_start < finished:
                month_result = analyze(repo, config, grid, month_start, finished)
                totals["month"]["cost"] = month_result["cost_total"]
                if (
                    month_result["cost_total"] is not None
                    and (finished - month_start).total_seconds() >= 3 * 86400
                ):
                    import calendar

                    _, month_end = local_day(
                        today.replace(day=calendar.monthrange(today.year, today.month)[1])
                    )
                    forecast = {
                        "value": month_result["cost_total"]
                        * Decimal(
                            str(
                                (month_end - month_start).total_seconds()
                                / (finished - month_start).total_seconds()
                            )
                        ),
                        "quality": "estimated",
                        "method": "Samme gjennomsnittlige døgnkostnad som hittil denne måneden.",
                    }
                for scheme in ["none", "norgespris"] + (
                    ["stromstotte"] if config.segment == "husholdning" else []
                ):
                    result = analyze(repo, config, grid, month_start, finished, {"scheme": scheme})
                    comparisons.append({"scheme": scheme, "cost": result["cost_total"]})
            if a < b:
                before = analyze(repo, config, grid, a - (b - a), a)
                previous = {"kwh": before["summary"].get("total_kwh"), "cost": before["cost_total"]}
        outlook = []
        if grid:
            for day in [today, today + timedelta(days=1)]:
                prices = repo.prices(config.area, day)
                for price in prices or []:
                    begin, finish = (
                        datetime.fromisoformat(price["time_start"]),
                        datetime.fromisoformat(price["time_end"]),
                    )
                    unit = Interval(begin, finish, Decimal(1), "price-scenario", "estimated")
                    estimate = cost(
                        unit,
                        config,
                        prices,
                        (
                            Decimal(0)
                            if day.month != today.month
                            else totals.get("month", {}).get("total_kwh")
                        ),
                        repo.tariff(config.company),
                    )
                    outlook.append(
                        {
                            "start": begin,
                            "end": finish,
                            "spot": price["NOK_per_kWh"],
                            "variable_rate": estimate["total"],
                        }
                    )
        solar = None
        production = next((m for m in config.meters if m.role == "solar" and m.entity in controls), None)
        export = next((m for m in config.meters if m.role == "export" and m.entity in controls), None)
        if production and export and a < b:
            produced = repo.rows(production.entity, a, b)
            exported = repo.rows(export.entity, a, b)
            from .energy_intervals import summarize_energy

            ps, es = summarize_energy(produced, a, b), summarize_energy(exported, a, b)
            value, complete_value = Decimal(0), bool(exported)
            for row in exported:
                historical = repo.config(row.start)
                rate, _ = (
                    spot_rate(
                        repo.prices(historical.area, row.start.astimezone(OSLO).date()), row.start, row.end
                    )
                    if historical
                    else (None, False)
                )
                if rate is None:
                    complete_value = False
                else:
                    value += row.value * rate
            battery_present = bool(
                config.battery_level
                or config.power.get("battery")
                or any(m.role.startswith("battery_") for m in config.meters)
            )
            self_use = (
                ps["total_kwh"] - es["total_kwh"]
                if ps["complete"] and es["complete"] and not battery_present
                else None
            )
            solar = {
                "production": ps["available_kwh"],
                "export": es["available_kwh"],
                "self_consumption": self_use if self_use is not None and self_use >= 0 else None,
                "export_spot_value": value if complete_value and es["complete"] else None,
                "note": "Spotverdi før leverandørens eksportvilkår. Egenforbruk beregnes bare uten batteri og med komplette målinger.",
            }
        power, state, _ = power_reading(
            controls.get(config.power_entity), getattr(ha, "states", {}), ha.connected, datetime.now(UTC), 300
        )
        return {
            "configured": True,
            "outlook": outlook,
            "solar": solar,
            "totals": totals,
            "forecast": forecast,
            "comparisons": comparisons,
            "previous": previous,
            "meters": meters,
            "power_kw": power / 1000 if power is not None else None,
            "power_status": state,
            "cloud": store.get("energy_cloud_state", "pending"),
            "cloud_at": store.get("energy_cloud_at"),
            "collected_at": store.get("energy_collected_at"),
            "spot": repo.prices(config.area, datetime.now(OSLO).date()),
            "tomorrow": repo.prices(config.area, datetime.now(OSLO).date() + timedelta(days=1)),
            "price_source": "https://www.hvakosterstrommen.no/strompris-api",
            "cost_note": "Beregninger er uten faste månedsbeløp. Støtte krever komplett månedsgrunnlag.",
        }

    return router
