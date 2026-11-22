from datetime import datetime, timedelta
from urllib.parse import parse_qs, unquote, urlparse

import pytest
from app.entity_history import entity_history
from app.models import normalize


def control(attributes=None):
    return normalize({"sensor.temperature": {"state": "22", "attributes": attributes or {}}}, {}, {})[0]


def window(path):
    url = urlparse(path)
    start = datetime.fromisoformat(unquote(url.path.rsplit("/", 1)[-1]))
    params = parse_qs(url.query)
    # The HA REST API only returns one day when end_time is omitted.
    end = datetime.fromisoformat(params["end_time"][0]) if "end_time" in params else start + timedelta(days=1)
    return start, end


@pytest.mark.parametrize("days", [7, 14, 30])
async def test_requests_and_returns_the_whole_period(days):
    class HA:
        connected = True

        async def rest(self, method, path):
            assert method == "GET"
            start, end = window(path)
            return [
                [
                    {"state": str(day), "last_changed": (start + timedelta(days=day)).isoformat()}
                    for day in range((end - start).days + 1)
                ]
            ]

    result = await entity_history(HA(), control(), str(days * 24), demo=False)
    assert datetime.fromisoformat(result["end"]) - datetime.fromisoformat(result["start"]) == timedelta(
        days=days
    )
    assert [point["value"] for point in result["points"]] == list(range(days + 1))
    assert result["coverage_start"] == result["start"]
    assert result["source"] == "recorder"


@pytest.mark.parametrize(("state_class", "field"), [("measurement", "mean"), ("total_increasing", "state")])
async def test_older_hourly_statistics_fill_only_the_missing_prefix(state_class, field):
    class HA:
        connected = True

        async def rest(self, method, path):
            _, end = window(path)
            self.first = end - timedelta(days=2)
            resumed = (self.first + timedelta(hours=1)).isoformat()
            return [
                [
                    {"state": "unavailable", "last_changed": self.first.isoformat()},
                    {"state": "21", "last_changed": resumed},
                    {"state": "22", "last_changed": resumed},
                    {"state": "unavailable", "last_changed": (end - timedelta(hours=1)).isoformat()},
                    {"state": "23", "last_changed": (end + timedelta(days=1)).isoformat()},
                ]
            ]

        async def request(self, kind, **kwargs):
            assert kind == "recorder/statistics_during_period"
            assert kwargs["period"] == "hour" and kwargs["types"] == [field]
            assert kwargs["statistic_ids"] == ["sensor.temperature"]
            assert datetime.fromisoformat(kwargs["end_time"]) == self.first
            begin = datetime.fromisoformat(kwargs["start_time"])
            self.earliest = begin
            return {
                "sensor.temperature": [
                    {"start": begin.timestamp() * 1_000, field: 0},
                    {"start": (begin + timedelta(hours=2)).isoformat(), field: 20},
                    {"start": self.first.isoformat(), field: 999},
                ]
            }

    ha = HA()
    result = await entity_history(
        ha, control({"state_class": state_class, "unit_of_measurement": "°C"}), "720", demo=False
    )
    assert result["source"] == "mixed"
    assert result["coverage_start"] == ha.earliest.isoformat()
    points = result["points"]
    assert [p["value"] for p in points[:3]] == [0, None, 20]
    assert [p["value"] for p in points[-3:]] == [None, 22, None]
    assert len({p["time"] for p in points}) == len(points)
    assert result["minimum"] == 0 and result["maximum"] == 22


async def test_keeps_recorded_bounds_extrema_and_gaps_when_sampling_dense_history():
    class HA:
        connected = True

        async def rest(self, method, path):
            begin, _ = window(path)
            self.first = begin + timedelta(minutes=1)
            self.last = begin + timedelta(minutes=600)
            return [
                [
                    {
                        "last_changed": (begin + timedelta(minutes=index)).isoformat(),
                        "state": {100: "95", 101: "unavailable", 102: "2"}.get(index, "40"),
                    }
                    for index in range(1, 601)
                ]
            ]

    ha = HA()
    result = await entity_history(ha, control(), "168", demo=False)
    assert result["samples"] == 600
    assert len(result["points"]) <= 300
    assert result["points"][0]["time"] == result["coverage_start"] == ha.first.isoformat()
    assert result["points"][-1]["time"] == ha.last.isoformat()
    assert {2, None, 40, 95} == {p["value"] for p in result["points"]}


@pytest.mark.parametrize("state", ["locked", "unavailable"])
async def test_no_fabricated_earlier_history_for_state_entities(state):
    class HA:
        connected = True

        async def rest(self, method, path):
            _, end = window(path)
            return [[{"state": state, "last_changed": (end - timedelta(days=2)).isoformat()}]]

    lock = normalize({"lock.door": {"state": "locked", "attributes": {}}}, {}, {})[0]
    history = await entity_history(HA(), lock, "720", demo=False)
    assert history["source"] == "recorder"
    assert len(history["points"]) == 1 and history["points"][0]["state"] == state
    assert history["coverage_start"] == (history["points"][0]["time"] if state == "locked" else None)
