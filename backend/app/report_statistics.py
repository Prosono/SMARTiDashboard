"""Duration-weighted summaries of recorder states, including unknown intervals."""
from datetime import datetime
import math


def summarize_states(points, start, end, kind):
    duration = (end - start).total_seconds()
    known = active = weighted = 0.0
    values = []
    changes = 0
    previous = None
    last_arrival = None
    for i, point in enumerate(points):
        at = max(start, datetime.fromisoformat(point["time"]))
        until = min(end, datetime.fromisoformat(points[i + 1]["time"])) if i + 1 < len(points) else end
        seconds = max(0, (until - at).total_seconds())
        state = point["state"]
        if kind in {"temperature", "humidity"}:
            value = point["value"]
            valid = value is not None and math.isfinite(value) and (kind != "humidity" or 0 <= value <= 100)
            if valid:
                values.append(value)
                known += seconds
                weighted += value * seconds
        else:
            valid = state in {"on", "off"} if kind == "light" else state not in {"unknown", "unavailable", "", "None"}
            is_active = state == ("on" if kind == "light" else "home")
            if valid:
                known += seconds
                if is_active:
                    active += seconds
                    if previous is False:
                        changes += 1
                        last_arrival = point["time"]
                previous = is_active
            else:
                previous = None
    return {
        "known_hours": known / 3600,
        "unknown_hours": max(0, duration - known) / 3600,
        "coverage": known / duration if duration > 0 else 0,
        "active_hours": active / 3600 if known else None,
        "activations": changes,
        "last_arrival": last_arrival if kind == "person" else None,
        "minimum": min(values) if values else None,
        "maximum": max(values) if values else None,
        "average": weighted / known if known and kind in {"temperature", "humidity"} else None,
    }
