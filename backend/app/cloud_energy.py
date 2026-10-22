"""Authenticated per-home energy archive. Never mix owners of a reused hub."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from fastapi import HTTPException, Query, Request
from pydantic import BaseModel, Field, model_validator

from .energy_repository import EnergyConfig


class Reading(BaseModel):
    model_config = {"extra": "forbid"}
    entity: str = Field(min_length=1, max_length=200)
    start: datetime
    end: datetime
    value: Decimal = Field(ge=0, le=1000000, allow_inf_nan=False)
    source: str = Field(min_length=1, max_length=200)
    quality: str = Field(pattern="^(measured|estimated|calculated)$")

    @model_validator(mode="after")
    def interval(self):
        if self.start.tzinfo is None or self.end.tzinfo is None:
            raise ValueError("timezone_required")
        self.start, self.end = self.start.astimezone(UTC), self.end.astimezone(UTC)
        if not timedelta(minutes=1) <= self.end - self.start <= timedelta(hours=1):
            raise ValueError("invalid_interval")
        if self.end > datetime.now(UTC) + timedelta(minutes=1) or self.start.year < 2021:
            raise ValueError("invalid_period")
        return self


class Agreement(BaseModel):
    model_config = {"extra": "forbid"}
    start: datetime
    config: EnergyConfig

    @model_validator(mode="after")
    def timestamp(self):
        if self.start.tzinfo is None or not 2021 <= self.start.year <= datetime.now(UTC).year:
            raise ValueError("invalid_agreement_date")
        self.start = self.start.astimezone(UTC)
        return self


class Batch(BaseModel):
    model_config = {"extra": "forbid"}
    readings: list[Reading] = Field(max_length=1000)
    agreements: list[Agreement] = Field(default_factory=list, max_length=200)


def install_energy(app, db, session, home_auth):
    with db() as c:
        c.executescript("""CREATE TABLE IF NOT EXISTS energy_history(
 home TEXT NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
 owner TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 entity TEXT NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL, value TEXT NOT NULL,
 source TEXT NOT NULL, quality TEXT NOT NULL, PRIMARY KEY(home,owner,entity,start));""")

    with db() as c:
        c.execute(
            "CREATE TABLE IF NOT EXISTS energy_agreements(home TEXT NOT NULL REFERENCES homes(id) ON DELETE CASCADE, owner TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, start TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(home,owner,start))"
        )

    @app.post("/api/hubs/{home_id}/energy/history")
    def ingest(home_id: str, body: Batch, request: Request):
        authenticated = home_auth(home_id, request)
        with db() as c:
            c.execute("BEGIN IMMEDIATE")
            home = c.execute("SELECT * FROM homes WHERE id=?", (home_id,)).fetchone()
            if not home or not home["owner"] or home["credential"] != authenticated["credential"]:
                raise HTTPException(409, "energy_home_not_claimed")
            resetting = c.execute(
                "SELECT 1 FROM hub_resets WHERE home=? AND phase!='completed'", (home_id,)
            ).fetchone()
            if resetting:
                raise HTTPException(409, "energy_home_resetting")
            for agreement in body.agreements:
                c.execute(
                    "INSERT OR REPLACE INTO energy_agreements VALUES(?,?,?,?)",
                    (home_id, home["owner"], agreement.start.isoformat(), agreement.config.model_dump_json()),
                )
            for row in body.readings:
                c.execute(
                    """INSERT INTO energy_history VALUES(?,?,?,?,?,?,?,?)
 ON CONFLICT(home,owner,entity,start) DO UPDATE SET end=excluded.end,value=excluded.value,
 source=excluded.source,quality=excluded.quality""",
                    (
                        home_id,
                        home["owner"],
                        row.entity,
                        row.start.isoformat(),
                        row.end.isoformat(),
                        str(row.value),
                        row.source,
                        row.quality,
                    ),
                )
        return {"accepted": len(body.readings)}

    @app.get("/api/homes/{home_id}/energy/history")
    def history(
        home_id: str,
        request: Request,
        start: datetime,
        end: datetime,
        limit: int = Query(default=1000, ge=1, le=10000),
    ):
        account = session(request)["account"]
        if (
            start.tzinfo is None
            or end.tzinfo is None
            or not timedelta(0) < end - start <= timedelta(days=366)
        ):
            raise HTTPException(422, "invalid_energy_period")
        with db() as c:
            home = c.execute(
                "SELECT owner FROM homes WHERE id=? AND (owner=? OR id IN "
                "(SELECT home FROM home_members WHERE account=?))",
                (home_id, account, account),
            ).fetchone()
            if not home:
                raise HTTPException(404, "home_not_found")
            rows = c.execute(
                "SELECT entity,start,end,value,source,quality FROM energy_history "
                "WHERE home=? AND owner=? AND start>=? AND end<=? ORDER BY start,entity LIMIT ?",
                (
                    home_id,
                    home["owner"],
                    start.astimezone(UTC).isoformat(),
                    end.astimezone(UTC).isoformat(),
                    limit + 1,
                ),
            ).fetchall()
            import json

            agreements = [
                {"start": r["start"], "config": json.loads(r["body"])}
                for r in c.execute(
                    "SELECT start,body FROM energy_agreements WHERE home=? AND owner=? ORDER BY start",
                    (home_id, home["owner"]),
                )
            ]
        return {
            "readings": [dict(r) for r in rows[:limit]],
            "truncated": len(rows) > limit,
            "agreements": agreements,
        }
