"""Read-only household calendar, using local calendar dates and personal selection."""

import asyncio
import re
from datetime import UTC, date, datetime, time, timedelta
from urllib.parse import quote, urlencode
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .ha import HAError


class CalendarSelection(BaseModel):
    model_config = {"extra": "forbid"}
    calendars: list[str] = Field(default_factory=list, max_length=12)


def normalize_event(row, calendar, zone):
    """Preserve exclusive all-day end dates; convert timed events to home timezone."""
    try:
        all_day = "date" in row["start"]

        def stamp(value):
            if all_day:
                return datetime.combine(date.fromisoformat(value["date"]), time.min, zone)
            parsed = datetime.fromisoformat(value["dateTime"])
            return parsed.replace(tzinfo=zone) if parsed.tzinfo is None else parsed.astimezone(zone)

        start, end = stamp(row["start"]), stamp(row["end"])
        if end <= start:
            return None
        return {
            "calendar": calendar,
            "start": start.isoformat(),
            "end": end.isoformat(),
            "all_day": all_day,
            "summary": str(row.get("summary") or "")[:500],
            "location": str(row.get("location") or "")[:1000],
            "description": str(row.get("description") or "")[:4000],
        }
    except (TypeError, ValueError, KeyError):
        return None


def calendar_router(store, user, ha, settings):
    router = APIRouter(prefix="/api/home/calendar", dependencies=[Depends(user)])

    def zone():
        try:
            return ZoneInfo(store.get("timezone", "Europe/Oslo"))
        except ZoneInfoNotFoundError:
            return ZoneInfo("Europe/Oslo")

    def sources():
        return [
            {"id": id, "name": str(s.get("attributes", {}).get("friendly_name") or id)[:200]}
            for id, s in ha.states.items()
            if re.fullmatch(r"calendar\.[a-z0-9_]+", id) and not ha.entities.get(id, {}).get("disabled_by")
        ]

    def selection(current):
        return CalendarSelection.model_validate_json(store.get(f"calendar:{current['id']}", "{}"))

    @router.get("")
    async def overview(current=Depends(user)):
        return {
            "sources": sources(),
            **selection(current).model_dump(),
            "today": datetime.now(zone()).date().isoformat(),
            "timezone": str(zone()),
        }

    @router.put("")
    async def save(body: CalendarSelection, current=Depends(user)):
        known = {s["id"] for s in sources()}
        if any(id not in known for id in body.calendars):
            raise HTTPException(422, "calendar_not_found")
        body.calendars = list(dict.fromkeys(body.calendars))
        store.set(f"calendar:{current['id']}", body.model_dump_json())
        return {"saved": True}

    @router.get("/events")
    async def events(start: date, current=Depends(user)):
        if not ha.connected:
            raise HTTPException(503, "calendar_disconnected")
        tz = zone()
        today = datetime.now(tz).date()
        if abs((start - today).days) > 366:
            raise HTTPException(422, "calendar_range")
        first = datetime.combine(start, time.min, tz)
        end = first + timedelta(days=7)
        days = {(start + timedelta(days=i)).isoformat(): [] for i in range(7)}
        selected = selection(current).calendars
        known = {s["id"] for s in sources()}
        semaphore = asyncio.Semaphore(4)

        async def fetch(id):
            if id not in known:
                return id, [], True, False
            try:
                async with semaphore:
                    rows = (
                        []
                        if settings.mode == "demo"
                        else await ha.rest(
                            "GET",
                            "calendars/"
                            + quote(id, safe="")
                            + "?"
                            + urlencode(
                                {
                                    "start": first.isoformat(),
                                    "end": end.isoformat(),
                                }
                            ),
                        )
                    )
                if not isinstance(rows, list):
                    raise HAError("invalid_calendar")
                normalized = [event for row in rows[:200] if (event := normalize_event(row, id, tz))]
                return id, normalized, False, len(rows) > 200
            except (HAError, HTTPException, TimeoutError):
                return id, [], True, False

        failed, truncated = [], False
        for id, records, error, limited in await asyncio.gather(*(fetch(id) for id in selected)):
            if error:
                failed.append(id)
            truncated |= limited
            for event in records:
                a, b = datetime.fromisoformat(event["start"]), datetime.fromisoformat(event["end"])
                for key in days:
                    day = datetime.combine(date.fromisoformat(key), time.min, tz)
                    if a < day + timedelta(days=1) and b > day:
                        days[key].append(event)
        for items in days.values():
            items.sort(
                key=lambda e: (
                    not e["all_day"],
                    datetime.fromisoformat(e["start"]).astimezone(UTC),
                    e["summary"],
                )
            )
        return {"days": days, "failed": failed, "truncated": truncated, "timezone": str(tz)}

    return router
