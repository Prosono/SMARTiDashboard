from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest

from app.energy_costs import cost, spot_rate
from app.energy_intervals import Interval
from app.energy_repository import EnergyConfig, EnergyRepository
from app.energy_tariffs import capacity_rate, energy_rate, holiday
from app.storage import Store


def test_tariff_uses_inclusive_last_hour_and_holidays():
    zone = ZoneInfo("Europe/Oslo")

    def rate(day, hour):
        return energy_rate("elvia", datetime(2026, 7, day, hour, tzinfo=zone))[0]

    assert rate(6, 21) == Decimal(".2899")
    assert rate(6, 22) == Decimal(".1699")
    assert rate(5, 12) == Decimal(".1699")
    assert holiday(date(2026, 4, 2))
    assert holiday(date(2026, 5, 14))
    assert not holiday(date(2026, 7, 6))


def test_capacity_uses_distinct_days_not_three_hours_same_day():
    zone = ZoneInfo("Europe/Oslo")
    rows = [
        (datetime(2026, 7, day, hour, tzinfo=zone), Decimal(value))
        for day, hour, value in [(1, 1, "9"), (1, 2, "8"), (1, 3, "7"), (2, 1, "2"), (3, 1, "1")]
    ]
    result = capacity_rate("elvia", date(2026, 7, 31), rows)
    assert result["peak_kw"] == 4
    assert result["monthly_ex_vat"] == 200


def test_price_quarters_are_explicit_estimate_and_gap_not_zero():
    start = datetime(2026, 7, 1, tzinfo=UTC)
    rows = [
        {
            "time_start": (start + timedelta(minutes=15 * i)).isoformat(),
            "time_end": (start + timedelta(minutes=15 * (i + 1))).isoformat(),
            "NOK_per_kWh": i - 1,
        }
        for i in range(4)
    ]
    assert spot_rate(rows, start, start + timedelta(hours=1)) == (Decimal(".5"), True)
    assert spot_rate(rows[:3], start, start + timedelta(hours=1))[0] is None


def test_cost_negative_prices_and_support_charge():
    start = datetime(2026, 7, 1, tzinfo=UTC)
    row = Interval(start, start + timedelta(hours=1), Decimal(2), "test")
    prices = [{"time_start": row.start.isoformat(), "time_end": row.end.isoformat(), "NOK_per_kWh": -0.1}]
    config = EnergyConfig(company="elvia", scheme="norgespris")
    result = cost(row, config, prices, Decimal(1000))
    assert result["parts"]["support"] == Decimal("1.0")
    assert result["total"] == Decimal("1.62800")
    assert cost(row, config, prices)["total"] is None
    assert cost(row, config, prices, Decimal(5001))["parts"]["support"] == 0
    assert cost(row, config, prices, Decimal(4999))["parts"]["support"] == Decimal(".5")


def test_config_history_and_measurement_retry_are_idempotent(tmp_path):
    store = Store(tmp_path / "hub.db")
    repo = EnergyRepository(store)
    first = datetime(2026, 7, 1, tzinfo=UTC)
    repo.save(EnergyConfig(area="NO1"), first)
    repo.save(EnergyConfig(area="NO2"), first + timedelta(days=1))
    assert repo.config(first).area == "NO1"
    assert repo.config(first + timedelta(days=2)).area == "NO2"
    row = Interval(first, first + timedelta(hours=1), Decimal(2), "test")
    repo.put("sensor.total", [row])
    repo.put("sensor.total", [row])
    assert len(repo.rows("sensor.total", first, first + timedelta(days=1))) == 1
    with store.connect() as db:
        db.execute("UPDATE energy_intervals SET synced=1")
    repo.put("sensor.total", [row])
    with store.connect() as db:
        assert db.execute("SELECT synced FROM energy_intervals").fetchone()[0] == 1
    repo.put("sensor.total", [Interval(first, row.end, Decimal(3), "test")])
    with store.connect() as db:
        assert db.execute("SELECT synced FROM energy_intervals").fetchone()[0] == 0


def test_config_rejects_double_counting_and_wrong_support():
    with pytest.raises(ValueError):
        EnergyConfig(segment="fritid", scheme="stromstotte")
    with pytest.raises(ValueError):
        EnergyConfig(
            meters=[
                {"role": "grid", "entity": "a", "name": "a"},
                {"role": "solar", "entity": "a", "name": "a"},
            ]
        )


def test_night_tariff_range_wraps_midnight():
    from app.energy_tariffs import matches

    rule = {"timer": "22-5", "pris": 1}
    assert matches(rule, datetime(2026, 7, 1, 23))
    assert matches(rule, datetime(2026, 7, 2, 5))
    assert not matches(rule, datetime(2026, 7, 2, 6))


def test_chart_preserves_missing_hour_and_dst_repeated_hour():
    from app.energy_analysis import chart_points
    from app.energy_intervals import local_day

    start, end = local_day(date(2026, 10, 25))
    points = [
        {"start": start, "end": start + timedelta(hours=1), "kwh": Decimal(1), "cost": {"total": Decimal(2)}}
    ]
    result = chart_points(points, start, end)
    assert len(result) == 25
    assert result[0]["kwh"] == 1
    assert result[1]["kwh"] is None
    assert len({p["start"] for p in result}) == 25


def test_full_month_cost_includes_capacity_supplier_fee_tax_and_chronological_support(tmp_path):
    import json

    from app.energy_analysis import analyze
    from app.energy_intervals import local_day
    from app.energy_repository import Meter

    repo = EnergyRepository(Store(tmp_path / "energy.db"))
    start, _ = local_day(date(2026, 7, 1))
    end, _ = local_day(date(2026, 8, 1))
    meter = Meter(role="grid", entity="sensor.import", name="Import")
    config = EnergyConfig(company="elvia", scheme="stromstotte", monthly_fee=Decimal(40), meters=[meter])
    repo.save(config, start)
    rows = []
    for day in range(1, 32):
        a, b = local_day(date(2026, 7, day))
        prices = []
        for hour in range(24):
            at = a + timedelta(hours=hour)
            rows.append(Interval(at, at + timedelta(hours=1), Decimal(1), "ha:recorder"))
            prices.append(
                {
                    "time_start": at.isoformat(),
                    "time_end": (at + timedelta(hours=1)).isoformat(),
                    "NOK_per_kWh": 1,
                }
            )
        with repo.store.connect() as db:
            db.execute(
                "INSERT INTO energy_prices VALUES(?,?,?,?)",
                ("NO1", f"2026-07-{day:02}", json.dumps(prices), end.isoformat()),
            )
    repo.put(meter.entity, rows)
    result = analyze(repo, config, meter, start, end)
    assert result["summary"]["total_kwh"] == 744
    expected = (
        Decimal(744)
        + Decimal(23 * 16) * Decimal(".2899")
        + Decimal(744 - 23 * 16) * Decimal(".1699")
        + Decimal(744) * Decimal(".0813")
        - Decimal(744) * Decimal(".207")
        + Decimal(160)
    ) * Decimal("1.25")
    assert abs(result["cost_total"] - expected) < Decimal(".000001")
    assert result["capacity"]["peak_kw"] == 1


def test_changed_grid_meter_does_not_reuse_prior_meter_support_allowance(tmp_path):
    import json

    from app.energy_analysis import analyze
    from app.energy_intervals import local_day
    from app.energy_repository import Meter

    repo = EnergyRepository(Store(tmp_path / "changed.db"))
    start, _ = local_day(date(2026, 7, 1))
    old = Meter(role="grid", entity="sensor.old", name="Old")
    new = Meter(role="grid", entity="sensor.new", name="New")
    config = EnergyConfig(company="elvia", scheme="norgespris", meters=[old])
    repo.save(config, start)
    changed = config.model_copy(update={"meters": [new]})
    repo.save(changed, start + timedelta(hours=1))
    # Recorder can contain old measurements for a newly selected sensor. They
    # must not stand in for the home's previously configured import meter.
    repo.put(
        new.entity,
        [
            Interval(start + timedelta(hours=i), start + timedelta(hours=i + 1), Decimal(1), "ha:recorder")
            for i in range(2)
        ],
    )
    prices = [
        {
            "time_start": start.isoformat(),
            "time_end": (start + timedelta(hours=2)).isoformat(),
            "NOK_per_kWh": 1,
        }
    ]
    with repo.store.connect() as db:
        db.execute(
            "INSERT INTO energy_prices VALUES(?,?,?,?)",
            ("NO1", "2026-07-01", json.dumps(prices), start.isoformat()),
        )
    result = analyze(repo, changed, new, start + timedelta(hours=1), start + timedelta(hours=2))
    assert result["cost_total"] is None
    assert result["points"][0]["cost"]["reason"] == "support_cap_requires_complete_month"


def test_incomplete_upstream_tariff_cannot_crash_or_invent_costs():
    malformed = {"data": {"tariffer": [{"kundegrupper": ["husholdning"], "gyldig_fra": "2026-01-01"}]}}
    assert energy_rate("elvia", datetime(2026, 7, 1), source=malformed) == (None, None)
    assert capacity_rate("elvia", date(2026, 7, 1), [], source=malformed) is None
