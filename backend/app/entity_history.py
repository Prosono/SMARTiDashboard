"""Read one entity's recorded states, with older hourly statistics when available."""

import math
from datetime import UTC, datetime, timedelta
from typing import Literal
from urllib.parse import quote, urlencode

from fastapi import HTTPException
from websockets.exceptions import ConnectionClosed

from .ha import HAError

HistoryHours = Literal["1", "6", "24", "168", "336", "720"]
HOUR = timedelta(hours=1)
MAX_RAW_POINTS = 300
MISSING_STATES = {"unknown", "unavailable"}


def number(value):
    if isinstance(value, bool):
        return None
    try:
        value = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return value if math.isfinite(value) else None


def timestamp(value):
    try:
        if type(value) in {int, float}:
            return datetime.fromtimestamp(value / 1000, UTC)
        date = datetime.fromisoformat(value)
        return date.astimezone(UTC) if date.tzinfo is not None else None
    except (TypeError, ValueError, OverflowError, OSError):
        return None


def point(when, state, value):
    return {"time": when.isoformat(), "state": state, "value": value}


async def recorder_points(ha, control, start, end):
    climate = control.domain == "climate"
    params = {"filter_entity_id": control.entity_id, "end_time": end.isoformat()}
    if climate:
        params["significant_changes_only"] = "0"
    else:
        params.update(no_attributes="", minimal_response="")
    data = await ha.rest(
        "GET", "history/period/" + quote(start.isoformat(), safe="") + "?" + urlencode(params)
    )
    rows = data[0] if isinstance(data, list) and data and isinstance(data[0], list) else []
    by_time = {}
    initial = None
    for row in rows:
        if not isinstance(row, dict):
            continue
        stamp = timestamp(
            (row.get("last_updated") or row.get("last_changed"))
            if climate
            else (row.get("last_changed") or row.get("last_updated"))
        )
        if stamp is None or stamp > end:
            continue
        state = str(row.get("state", "unknown"))[:80]
        attributes = row.get("attributes")
        raw = attributes.get("current_temperature") if climate and isinstance(attributes, dict) else None
        value = number(raw if climate else state) if state not in MISSING_STATES else None
        if stamp < start:
            if initial is None or stamp >= initial[0]:
                initial = stamp, state, value
        else:
            by_time[stamp] = point(stamp, state, value)
    if initial and start not in by_time:
        by_time[start] = point(start, initial[1], initial[2])
    return sorted(by_time.items())


async def older_statistics(ha, control, start, until):
    state_class = control.attributes.get("state_class")
    if control.domain != "sensor" or state_class not in ("measurement", "total", "total_increasing"):
        return []
    first_hour = start.replace(minute=0, second=0, microsecond=0)
    if first_hour < start:
        first_hour += HOUR
    if first_hour + HOUR > until:
        return []
    field = "mean" if state_class == "measurement" else "state"
    try:
        data = await ha.request(
            "recorder/statistics_during_period",
            _timeout=9,
            statistic_ids=[control.entity_id],
            start_time=first_hour.isoformat(),
            end_time=until.isoformat(),
            period="hour",
            types=[field],
        )
    except (HAError, OSError, TimeoutError, ConnectionClosed):
        return []
    rows = data.get(control.entity_id) if isinstance(data, dict) else None
    values = {}
    for row in rows if isinstance(rows, list) else ():
        if not isinstance(row, dict):
            continue
        hour = timestamp(row.get("start"))
        value = number(row.get(field))
        if (
            hour is not None
            and first_hour <= hour <= until - HOUR
            and (hour - first_hour) % HOUR == timedelta(0)
            and value is not None
        ):
            values[hour] = value
    if not values:
        return []
    hour = min(values)
    points = []
    while hour < until:
        value = values.get(hour)
        points.append(point(hour, "unknown" if value is None else str(value), value))
        hour += HOUR
    return points


def sampled_recorder(rows, numeric):
    if len(rows) <= MAX_RAW_POINTS:
        return [p for _, p in rows]
    count = (MAX_RAW_POINTS - 2) // 4
    first, last = rows[0][0], rows[-1][0]
    bucket_width = (last - first).total_seconds() / count
    buckets = {}
    for stamp, p in rows:
        index = min(int((stamp - first).total_seconds() / bucket_width), count - 1)
        buckets.setdefault(index, []).append(p)
    chosen = {rows[0][1]["time"]: rows[0][1]}
    first_observed = next(
        (p for _, p in rows if (p["value"] is not None if numeric else p["state"] not in MISSING_STATES)),
        None,
    )
    if first_observed:
        chosen[first_observed["time"]] = first_observed
    for bucket in buckets.values():
        candidates = [bucket[-1]]
        if numeric:
            readings = [p for p in bucket if p["value"] is not None]
            if readings:
                candidates.extend(
                    [min(readings, key=lambda p: p["value"]), max(readings, key=lambda p: p["value"])]
                )
            gap = next((p for p in bucket if p["value"] is None), None)
        else:
            candidates.append(bucket[0])
            gap = next((p for p in bucket if p["state"] in MISSING_STATES), None)
        if gap:
            candidates.append(gap)
        chosen.update((p["time"], p) for p in candidates)
    return [p for _, p in sorted(chosen.items())]


async def entity_history(ha, control, hours, *, demo):
    if not demo and not ha.connected:
        raise HTTPException(503, "history_unavailable")
    end = datetime.now(UTC)
    start = end - timedelta(hours=int(hours))
    raw, hourly = [], []
    recorder_failed = False
    if not demo:
        try:
            raw = await recorder_points(ha, control, start, end)
        except (HAError, TimeoutError):
            recorder_failed = True
        except HTTPException as exc:
            if exc.status_code != 404:
                raise
            recorder_failed = True
        if int(hours) >= 168:
            hourly = await older_statistics(ha, control, start, raw[0][0] if raw else end)
        if recorder_failed and not hourly:
            raise HTTPException(503, "history_unavailable")

    all_points = [*hourly, *(p for _, p in raw)]
    values = [p["value"] for p in all_points if p["value"] is not None]
    numeric = bool(values) or control.domain == "climate"
    coverage = next(
        (
            p["time"]
            for p in all_points
            if (p["value"] is not None if numeric else p["state"] not in MISSING_STATES)
        ),
        None,
    )
    return {
        "unit": control.attributes.get(
            "temperature_unit" if control.domain == "climate" else "unit_of_measurement"
        ),
        "points": hourly + sampled_recorder(raw, numeric),
        "minimum": min(values) if values else None,
        "maximum": max(values) if values else None,
        "samples": len(all_points),
        "start": start.isoformat(),
        "end": end.isoformat(),
        "coverage_start": coverage,
        "source": "mixed" if hourly and raw else "statistics" if hourly else "recorder",
    }
