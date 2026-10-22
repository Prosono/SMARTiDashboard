"""Cloud cache for allowlisted open tariff sources; bundles survive upstream outages."""

import asyncio
import hashlib
import json
from datetime import UTC, datetime, timedelta

import httpx
import yaml
from fastapi import HTTPException

from .energy_tariffs import catalogue


def install_sources(app, db):
    lock = asyncio.Lock()
    with db() as c:
        c.execute(
            "CREATE TABLE IF NOT EXISTS energy_tariff_sources(company TEXT PRIMARY KEY, fetched TEXT, body TEXT)"
        )

    @app.get("/api/energy/tariffs/{company}")
    async def grid_tariff(company: str):
        bundled = next((c for c in catalogue()["companies"] if c["id"] == company), None)
        if not bundled:
            raise HTTPException(404, "unknown_grid_company")
        async with lock:
            now = datetime.now(UTC)
            with db() as c:
                cached = c.execute(
                    "SELECT * FROM energy_tariff_sources WHERE company=?", (company,)
                ).fetchone()
            if cached and datetime.fromisoformat(cached["fetched"]) > now - timedelta(days=1):
                return json.loads(cached["body"])
            result = (
                json.loads(cached["body"])
                if cached
                else bundled | {"fetched": catalogue()["fetched"], "stale": True}
            )
            try:
                async with httpx.AsyncClient(timeout=10, trust_env=False, follow_redirects=False) as client:
                    async with client.stream(
                        "GET",
                        f"https://raw.githubusercontent.com/kraftsystemet/fri-nettleie/main/tariffer/{company}.yml",
                    ) as response:
                        response.raise_for_status()
                        content = b""
                        async for chunk in response.aiter_bytes():
                            content += chunk
                            if len(content) > 250000:
                                raise ValueError("tariff_too_large")
                data = yaml.safe_load(content)
                if (
                    not isinstance(data, dict)
                    or not isinstance(data.get("tariffer"), list)
                    or not 1 <= len(data["tariffer"]) <= 100
                ):
                    raise ValueError("invalid_tariff")
                # Normalize YAML date objects and bound the decoded representation, too.
                encoded = json.dumps(data, default=str)
                if len(encoded) > 500000:
                    raise ValueError("tariff_too_large")
                result = {
                    "id": company,
                    "revision": hashlib.sha256(content).hexdigest(),
                    "data": json.loads(encoded),
                    "fetched": now.isoformat(),
                    "stale": False,
                }
            except (httpx.HTTPError, ValueError, TypeError, yaml.YAMLError):
                result = result | {"stale": True}
            with db() as c:
                c.execute(
                    "INSERT OR REPLACE INTO energy_tariff_sources VALUES(?,?,?)",
                    (company, now.isoformat(), json.dumps(result)),
                )
            return result


def install_prices(app, db):
    from datetime import date
    from decimal import Decimal
    from typing import Literal

    from .energy_intervals import local_day

    lock = asyncio.Lock()
    with db() as c:
        c.execute(
            "CREATE TABLE IF NOT EXISTS energy_spot_sources(area TEXT NOT NULL,day TEXT NOT NULL,body TEXT NOT NULL,fetched TEXT NOT NULL,PRIMARY KEY(area,day))"
        )

    @app.get("/api/energy/prices/{area}/{day}")
    async def prices(area: Literal["NO1", "NO2", "NO3", "NO4", "NO5"], day: date):
        if not date(2021, 12, 1) <= day <= datetime.now(UTC).date() + timedelta(days=1):
            raise HTTPException(422, "invalid_price_date")
        async with lock:
            with db() as c:
                row = c.execute(
                    "SELECT body FROM energy_spot_sources WHERE area=? AND day=?", (area, str(day))
                ).fetchone()
            if row:
                return json.loads(row[0])
            try:
                async with httpx.AsyncClient(timeout=15, trust_env=False, follow_redirects=False) as client:
                    response = await client.get(
                        f"https://www.hvakosterstrommen.no/api/v1/prices/{day.year}/{day:%m-%d}_{area}.json"
                    )
                    response.raise_for_status()
                    if len(response.content) > 100000:
                        raise ValueError("price_response_too_large")
                    rows = response.json()
                if not isinstance(rows, list) or not 1 <= len(rows) <= 100:
                    raise ValueError("invalid_price_data")
                cursor, end = local_day(day)
                for item in rows:
                    a, b = (
                        datetime.fromisoformat(item["time_start"]),
                        datetime.fromisoformat(item["time_end"]),
                    )
                    if (
                        a.tzinfo is None
                        or b.tzinfo is None
                        or a != cursor
                        or not a < b <= end
                        or not Decimal(str(item["NOK_per_kWh"])).is_finite()
                    ):
                        raise ValueError("invalid_price_interval")
                    cursor = b
                if cursor != end:
                    raise ValueError("incomplete_prices")
            except (httpx.HTTPError, ValueError, TypeError, KeyError):
                raise HTTPException(503, "prices_not_available") from None
            with db() as c:
                c.execute(
                    "INSERT INTO energy_spot_sources VALUES(?,?,?,?)",
                    (area, str(day), json.dumps(rows), datetime.now(UTC).isoformat()),
                )
            return rows
