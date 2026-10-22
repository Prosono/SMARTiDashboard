from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest

from app.energy_intervals import Interval, local_day, reconcile, summarize_energy


def reading(start, minutes=60, value="1", source="ha", quality="measured"):
    return Interval(
        start,
        start + timedelta(minutes=minutes),
        Decimal(value) if value is not None else None,
        source,
        quality,
    )


@pytest.mark.parametrize(
    "day,hours", [(date(2026, 3, 29), 23), (date(2026, 10, 25), 25), (date(2026, 10, 22), 24)]
)
def test_local_day_uses_actual_dst_duration(day, hours):
    start, end = local_day(day)
    assert (end - start).total_seconds() == hours * 3600
    rows = [reading(start + timedelta(hours=i)) for i in range(hours)]
    result = summarize_energy(rows, start, end)
    assert result["total_kwh"] == hours
    assert result["complete"]


def test_missing_is_not_zero_and_estimate_remains_labelled():
    start = datetime(2026, 10, 22, tzinfo=UTC)
    rows = [reading(start, 15, "0", quality="estimated"), reading(start + timedelta(minutes=15), 15, None)]
    result = summarize_energy(rows, start, start + timedelta(hours=1))
    assert result["total_kwh"] is None
    assert result["available_kwh"] == 0
    assert result["coverage"] == 0.25
    assert result["quality"] == "estimated"


def test_two_sources_never_double_count_or_invent_subintervals():
    start = datetime(2026, 10, 22, tzinfo=UTC)
    authoritative = [reading(start, value="2", source="elhub")]
    fallback = [reading(start + timedelta(minutes=i * 15), 15) for i in range(8)]
    merged = reconcile(authoritative, fallback)
    assert len(merged) == 5
    assert summarize_energy(merged, start, start + timedelta(hours=2))["total_kwh"] == 6
    assert len(reconcile([reading(start, 15)], [reading(start, 60, source="elhub")])) == 1


def test_rejects_overlaps_naive_timestamps_and_nonfinite_values():
    start = datetime(2026, 10, 22, tzinfo=UTC)
    with pytest.raises(ValueError, match="overlapping"):
        summarize_energy([reading(start), reading(start)], start, start + timedelta(hours=1))
    with pytest.raises(ValueError, match="timezone"):
        reading(start.replace(tzinfo=None))
    with pytest.raises(ValueError, match="invalid_energy_value"):
        reading(start, value="NaN")
