"""Clock-hour import forecast and switching decisions for PowerGuard."""

import math
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

MAX_SAMPLE_GAP = timedelta(seconds=25)
MIN_SAMPLE_SPAN = timedelta(seconds=15)
SHED_DELAY = timedelta(seconds=15)
RESTORE_DELAY = timedelta(seconds=90)
SETTLE_DELAY = timedelta(seconds=20)
HOUR = timedelta(hours=1)
HOUR_SECONDS = HOUR.total_seconds()


@dataclass(frozen=True)
class GuardLoad:
    id: str
    watts: float | None
    state: str
    paused: bool = False


@dataclass(frozen=True)
class GuardAction:
    id: str
    command: Literal["turn_off", "turn_on"]


@dataclass(frozen=True)
class GuardEvaluation:
    state: str
    power_kw: float | None = None
    projected_kw: float | None = None
    action: GuardAction | None = None


class PowerGuardController:
    def __init__(self):
        self.last_action: datetime | None = None
        self.clear_measurements()

    def clear_measurements(self):
        self._source: tuple[str, str, float] | None = None
        self._hour_start: datetime | None = None
        self._covered_seconds = 0.0
        self._import_watt_seconds = 0.0
        self._clear_streaks()

    def _clear_streaks(self):
        self._first_sample: datetime | None = None
        self._last_sample: tuple[datetime, float] | None = None
        self._risk_since: datetime | None = None
        self._restore_candidate: tuple[str, float, datetime] | None = None

    def record_action(self, now: datetime):
        """Restart stability timers when the service attempts a switch."""
        self.last_action = now.astimezone(UTC)
        self._risk_since = None
        self._restore_candidate = None

    def _observe(self, now: datetime, watts: float, source: tuple[str, str, float]) -> tuple[float, bool]:
        previous = self._last_sample
        if self._source != source or (previous is not None and now <= previous[0]):
            self.clear_measurements()
            self._source = source
            previous = None
        elif previous is not None and now - previous[0] > MAX_SAMPLE_GAP:
            self._clear_streaks()
            previous = None
        if previous is None:
            self._first_sample = now

        # Truncating in local time preserves fold for the two autumn clock hours.
        local_hour = now.astimezone(ZoneInfo(source[1])).replace(minute=0, second=0, microsecond=0)
        hour_start = local_hour.astimezone(UTC)
        if hour_start != self._hour_start:
            self._hour_start = hour_start
            self._covered_seconds = 0.0
            self._import_watt_seconds = 0.0
            self._restore_candidate = None

        if previous is not None:
            last_time, last_watts = previous
            elapsed = (now - max(last_time, hour_start)).total_seconds()
            covered_fraction = elapsed / (now - last_time).total_seconds()
            start_watts = watts + covered_fraction * (last_watts - watts)
            self._import_watt_seconds += (start_watts + watts) * 0.5 * elapsed
            self._covered_seconds += elapsed

        self._last_sample = (now, watts)
        elapsed_hour = (now - hour_start).total_seconds()
        return elapsed_hour, now - self._first_sample >= MIN_SAMPLE_SPAN

    def evaluate(
        self,
        now: datetime,
        *,
        meter: str,
        watts: float | None,
        limit_kw: float,
        loads: Sequence[GuardLoad],
        timezone: str = "Europe/Oslo",
    ) -> GuardEvaluation:
        """Evaluate a fresh reading. Loads are in highest-first priority order."""
        if not math.isfinite(limit_kw) or limit_kw <= 0:
            raise ValueError("invalid_power_guard_limit")
        source = (meter, timezone, limit_kw)
        if watts is None or not math.isfinite(watts):
            # Keep observed energy for the same hour, but do not bridge the gap.
            if self._source == source:
                self._clear_streaks()
            else:
                self.clear_measurements()
            return GuardEvaluation("meter_unavailable")

        now = now.astimezone(UTC)
        watts = max(watts, 0.0)  # Export does not cancel earlier import in the same hour.
        elapsed, ready = self._observe(now, watts, source)
        if not ready:
            return GuardEvaluation("warming_up", watts / 1000)

        projected_watts = (
            self._import_watt_seconds + (HOUR_SECONDS - self._covered_seconds) * watts
        ) / HOUR_SECONDS

        def result(state: str, action: GuardAction | None = None):
            return GuardEvaluation(state, watts / 1000, projected_watts / 1000, action)

        limit_watts = limit_kw * 1000
        reserve = min(250.0, max(100.0, limit_watts * 0.03), limit_watts * 0.10)
        shed_threshold = limit_watts - reserve
        reached_limit = self._import_watt_seconds >= limit_watts * HOUR_SECONDS
        # Once the hour's measured budget is spent, only limit ongoing high draw.
        # Chasing the projected total at that point would pause every remaining load.
        overload = (watts if reached_limit else projected_watts) >= shed_threshold
        settling = self.last_action is not None and now - self.last_action < SETTLE_DELAY

        if overload:
            self._restore_candidate = None
            if self._risk_since is None:
                self._risk_since = now
            candidate = next(
                (load for load in reversed(loads) if load.state == "on" and not load.paused), None
            )
            if settling:
                return result("settling")
            if candidate is None:
                return result("limit_reached" if reached_limit else "no_loads")
            if now - self._risk_since < SHED_DELAY:
                return result("over_target")
            return result("shedding", GuardAction(candidate.id, "turn_off"))

        self._risk_since = None
        if reached_limit:
            self._restore_candidate = None
            return result("limit_reached")

        candidate = next((load for load in loads if load.paused and load.state == "off"), None)
        if candidate is None or candidate.watts is None:
            self._restore_candidate = None
            return result("paused" if any(load.paused for load in loads) else "monitoring")

        restart_watts = watts + candidate.watts
        missing_seconds = max(0.0, elapsed - self._covered_seconds)
        # Reserve headroom for elapsed minutes without samples, such as after restart.
        restart_forecast = (
            self._import_watt_seconds
            + missing_seconds * max(shed_threshold, watts)
            + (HOUR_SECONDS - elapsed) * restart_watts
        ) / HOUR_SECONDS
        if restart_watts > shed_threshold - reserve or restart_forecast > shed_threshold:
            self._restore_candidate = None
            return result("paused")

        if self._restore_candidate is None or self._restore_candidate[:2] != (candidate.id, candidate.watts):
            self._restore_candidate = (candidate.id, candidate.watts, now)
        if settling or now - self._restore_candidate[2] < RESTORE_DELAY:
            return result("paused")
        return result("restoring", GuardAction(candidate.id, "turn_on"))
