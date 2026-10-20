"""Read-only household history and activity from Home Assistant's recorder."""

import math
from datetime import UTC, datetime, timedelta
from urllib.parse import quote, urlencode

from fastapi import APIRouter, Depends, HTTPException, Query

from .ha import HAError
from .models import Control


def history_router(ha, user, settings):
    router = APIRouter(prefix="/api/history")

    def entities():
        result = {c.entity_id: c for c in ha.controls()}
        for entity_id, state in ha.states.items():
            registry = ha.entities.get(entity_id, {})
            if entity_id in result or registry.get("disabled_by"):
                continue
            attrs = state.get("attributes", {})
            device = ha.devices.get(registry.get("device_id"), {})
            result[entity_id] = Control(
                id=entity_id,
                entity_id=entity_id,
                name=attrs.get("friendly_name") or entity_id,
                domain=entity_id.split(".")[0],
                state=str(state.get("state", "unknown")),
                attributes={k: attrs[k] for k in ("unit_of_measurement", "device_class") if k in attrs},
                capabilities=[],
                availability="unknown",
                updated_at=state.get("last_updated"),
                device_id=registry.get("device_id"),
                area_id=registry.get("area_id") or device.get("area_id"),
            )
        return result

    def window(start, end):
        if start.tzinfo is None or end.tzinfo is None or not start < end:
            raise HTTPException(422, "invalid_history_period")
        if end - start > timedelta(days=31):
            raise HTTPException(422, "history_period_max_31_days")
        if end > datetime.now(UTC) + timedelta(minutes=5):
            raise HTTPException(422, "history_period_in_future")
        return start.isoformat(), end.isoformat()

    def selected(value):
        ids = list(dict.fromkeys(value.split(","))) if value else []
        if len(ids) > 12 or any(i not in entities() for i in ids):
            raise HTTPException(422, "invalid_history_entities")
        return ids

    async def read(path):
        if settings.mode == "demo":
            return []
        if not ha.connected:
            raise HTTPException(503, "history_unavailable")
        try:
            return await ha.rest("GET", path)
        except (HAError, TimeoutError):
            raise HTTPException(503, "history_unavailable") from None

    @router.get("/entities")
    def choices(current=Depends(user)):
        return [c.model_dump() for c in entities().values()]

    @router.get("/states")
    async def states(
        start: datetime, end: datetime, entity_ids: str = Query(max_length=2400), current=Depends(user)
    ):
        begin, finish = window(start, end)
        ids = selected(entity_ids)
        if not ids:
            raise HTTPException(422, "select_history_entities")
        data = await read(
            "history/period/"
            + quote(begin, safe="")
            + "?"
            + urlencode(
                {
                    "filter_entity_id": ",".join(ids),
                    "end_time": finish,
                    "no_attributes": "",
                    "minimal_response": "",
                    "significant_changes_only": "0",
                }
            )
        )
        by_id = {}
        for rows in data:
            if not rows or not isinstance(rows, list):
                continue
            entity = rows[0].get("entity_id")
            if entity not in ids:
                continue
            points = []
            for row in rows:
                stamp = row.get("last_changed") or row.get("last_updated")
                try:
                    date = datetime.fromisoformat(stamp)
                    if date.tzinfo is None or date > end:
                        continue
                except (TypeError, ValueError):
                    continue
                state = str(row.get("state", "unknown"))[:255]
                try:
                    value = float(state)
                    if not math.isfinite(value):
                        value = None
                except ValueError:
                    value = None
                points.append(
                    {"time": max(date, start).astimezone(UTC).isoformat(), "state": state, "value": value}
                )
            points.sort(key=lambda p: p["time"])
            by_id[entity] = points
        catalog = entities()
        series = []
        for entity in ids:
            points = by_id.get(entity, [])
            values = [p["value"] for p in points if p["value"] is not None]
            series.append(
                {
                    "entity_id": entity,
                    "points": points[-2000:],
                    "samples": len(points),
                    "truncated": len(points) > 2000,
                    "unit": catalog[entity].attributes.get("unit_of_measurement"),
                    "minimum": min(values) if values else None,
                    "maximum": max(values) if values else None,
                    "start": begin,
                    "end": finish,
                }
            )
        return {"series": series}

    @router.get("/activity")
    async def activity(
        start: datetime,
        end: datetime,
        entity_ids: str = Query(default="", max_length=2400),
        current=Depends(user),
    ):
        begin, finish = window(start, end)
        ids = selected(entity_ids)
        params = {"end_time": finish}
        if ids:
            params["entity"] = ",".join(ids)
        data = await read("logbook/" + quote(begin, safe="") + "?" + urlencode(params))
        rows = []
        for item in data:
            try:
                stamp = datetime.fromisoformat(item.get("when", ""))
                if stamp.tzinfo is None or not start <= stamp <= end:
                    continue
            except (TypeError, ValueError):
                continue
            if ids and item.get("entity_id") not in ids:
                continue
            rows.append(
                {
                    key: str(item[key])[:1000] if item.get(key) is not None else None
                    for key in (
                        "when",
                        "name",
                        "entity_id",
                        "state",
                        "message",
                        "context_entity_id",
                        "context_name",
                        "context_event_type",
                    )
                }
            )
        for row in rows:
            row["when"] = datetime.fromisoformat(row["when"]).astimezone(UTC).isoformat()
        rows.sort(key=lambda r: r["when"], reverse=True)
        return {"entries": rows[:1000], "truncated": len(rows) > 1000, "total": len(rows)}

    return router
