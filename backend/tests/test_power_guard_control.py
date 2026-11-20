from datetime import UTC, datetime, timedelta

import pytest
from app.power_guard_control import GuardAction, GuardLoad, PowerGuardController

START = datetime(2026, 11, 20, 12, tzinfo=UTC)


def sample(controller, seconds, watts, loads=(), *, meter="sensor.house", limit_kw=5, origin=START):
    return controller.evaluate(
        origin + timedelta(seconds=seconds), meter=meter, watts=watts, limit_kw=limit_kw, loads=loads
    )


def test_sustained_overload_sheds_lowest_priority_available_load_once_per_settle_period():
    controller = PowerGuardController()
    loads = (
        GuardLoad("important", 1200, "on"),
        GuardLoad("flexible", 1500, "on"),
        GuardLoad("unavailable", 2000, "unavailable"),
        GuardLoad("already_off", 2000, "off"),
    )
    for seconds in range(0, 30, 5):
        assert sample(controller, seconds, 6200, loads).action is None

    result = sample(controller, 30, 6200, loads)
    assert result.action == GuardAction("flexible", "turn_off")
    assert result.state == "shedding"
    assert result.projected_kw == pytest.approx(6.2)
    controller.record_action(START + timedelta(seconds=30))

    after = (loads[0], GuardLoad("flexible", 1500, "off", paused=True), *loads[2:])
    for seconds in range(35, 50, 5):
        result = sample(controller, seconds, 5400, after)
        assert result.state == "settling"
        assert result.action is None
    assert sample(controller, 50, 5400, after).action == GuardAction("important", "turn_off")


def test_short_peak_and_insufficient_fresh_coverage_cannot_switch():
    controller = PowerGuardController()
    loads = (GuardLoad("flexible", 1500, "on"),)
    for seconds in range(0, 20, 5):
        assert sample(controller, seconds, 1000, loads).action is None
    assert sample(controller, 20, 8000, loads).state == "over_target"
    assert sample(controller, 25, 1000, loads).state == "monitoring"
    assert sample(controller, 50, None, loads).state == "meter_unavailable"
    for seconds in range(55, 70, 5):
        assert sample(controller, seconds, 8000, loads).state == "warming_up"
    assert sample(controller, 70, 8000, loads).state == "over_target"
    assert sample(controller, 100, 8000, loads).state == "warming_up"
    assert sample(controller, 105, float("nan"), loads).state == "meter_unavailable"


def test_restore_only_power_guard_paused_loads_with_sustained_adequate_headroom():
    controller = PowerGuardController()
    loads = (
        GuardLoad("manually_off", 600, "off"),
        GuardLoad("important", 1500, "off", paused=True),
        GuardLoad("flexible", 800, "off", paused=True),
    )
    # There is room for the smaller load alone, but the important load comes first.
    for seconds in range(0, 120, 5):
        assert sample(controller, seconds, 3500, loads).action is None
    for seconds in range(120, 210, 5):
        assert sample(controller, seconds, 2000, loads).action is None
    assert sample(controller, 210, 2000, loads).action == GuardAction("important", "turn_on")
    controller.record_action(START + timedelta(seconds=210))

    after = (loads[0], GuardLoad("important", 1500, "on"), loads[2])
    for seconds in range(215, 305, 5):
        assert sample(controller, seconds, 3500, after).action is None
    assert sample(controller, 305, 3500, after).action == GuardAction("flexible", "turn_on")


def test_source_change_rebuilds_the_forecast_before_acting():
    controller = PowerGuardController()
    loads = (GuardLoad("flexible", 1500, "on"),)
    for seconds in range(0, 30, 5):
        assert sample(controller, seconds, 9000, loads).action is None
    result = sample(controller, 30, 1000, loads, meter="sensor.new")
    assert result.state == "warming_up"
    assert result.projected_kw is None
    for seconds in (35, 40, 45):
        result = sample(controller, seconds, 1000, loads, meter="sensor.new")
    assert result.projected_kw == pytest.approx(1)
    assert result.state == "monitoring"


def test_forecast_integrates_import_and_does_not_net_earlier_import_against_export():
    controller = PowerGuardController()
    for seconds in range(0, 20, 5):
        sample(controller, seconds, 4000)
    result = sample(controller, 20, -2000)
    assert result.power_kw == 0
    assert result.projected_kw == pytest.approx((15 * 4000 + 5 * 2000) / 3600000)


def test_exhausted_hour_does_not_chase_unreachable_budget_or_restore_paused_loads():
    controller = PowerGuardController()
    for seconds in range(0, 905, 5):
        sample(controller, seconds, 20000)
    loads = (GuardLoad("on", 1200, "on"), GuardLoad("paused", 600, "off", paused=True))
    for seconds in range(905, 1010, 5):
        result = sample(controller, seconds, 1000, loads)
        assert result.state == "limit_reached"
        assert result.action is None
        assert result.projected_kw > 5

    # Reducing a still-high ongoing draw helps even though this hour is above target.
    for seconds in range(1010, 1025, 5):
        assert sample(controller, seconds, 6100, loads).action is None
    assert sample(controller, 1025, 6100, loads).action == GuardAction("on", "turn_off")

    # A brief meter interruption invalidates the current streak, not the
    # known energy already used in this hour.
    assert sample(controller, 1030, None, loads).state == "meter_unavailable"
    for seconds in range(1035, 1050, 5):
        assert sample(controller, seconds, 800, loads).state == "warming_up"
    assert sample(controller, 1050, 800, loads).state == "limit_reached"


def test_repeated_oslo_dst_clock_hours_have_separate_forecasts():
    controller = PowerGuardController()
    origin = datetime(2026, 10, 25, 0, 59, 40, tzinfo=UTC)  # 02:59:40 CEST
    for seconds in range(0, 20, 5):
        first = sample(controller, seconds, 4200, origin=origin)
    second = sample(controller, 20, 2000, origin=origin)  # 02:00:00 CET
    assert first.projected_kw == pytest.approx(4.2)
    assert second.projected_kw == pytest.approx(2)
