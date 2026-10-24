from datetime import UTC, datetime, timedelta

import pytest

from app.report_statistics import summarize_states

START = datetime(2026, 10, 24, tzinfo=UTC)


def points(rows):
    result = []
    for hour, state in rows:
        try:
            value = float(state)
        except ValueError:
            value = None
        result.append({"time": (START + timedelta(hours=hour)).isoformat(), "state": state, "value": value})
    return result


def test_presence_preserves_unknown_time_and_does_not_count_initial_home():
    result = summarize_states(points([(1, "home"), (2, "not_home"), (3, "home"), (4, "unavailable"), (5, "home")]), START, START + timedelta(hours=6), "person")
    assert result["active_hours"] == 3
    assert result["unknown_hours"] == 2
    assert result["coverage"] == pytest.approx(4 / 6)
    assert result["activations"] == 1


def test_lights_count_only_known_off_to_on_and_keep_zero():
    result = summarize_states(points([(0, "off"), (1, "on"), (2, "on"), (3, "unknown"), (4, "on")]), START, START + timedelta(hours=5), "light")
    assert result["active_hours"] == 3
    assert result["activations"] == 1
    assert result["unknown_hours"] == 1
    off = summarize_states(points([(0, "off")]), START, START + timedelta(hours=5), "light")
    assert off["active_hours"] == 0
    absent = summarize_states([], START, START + timedelta(hours=5), "light")
    assert absent["active_hours"] is None
    assert absent["unknown_hours"] == 5


def test_numeric_average_is_time_weighted_and_ignores_invalid_humidity():
    result = summarize_states(points([(0, "20"), (1, "24"), (4, "unavailable")]), START, START + timedelta(hours=5), "temperature")
    assert result["average"] == 23
    assert result["minimum"] == 20
    assert result["maximum"] == 24
    assert result["coverage"] == .8
    humidity = summarize_states(points([(0, "0"), (1, "120"), (2, "60")]), START, START + timedelta(hours=3), "humidity")
    assert humidity["minimum"] == 0
    assert humidity["maximum"] == 60
    assert humidity["average"] == 30
    assert humidity["unknown_hours"] == 1
