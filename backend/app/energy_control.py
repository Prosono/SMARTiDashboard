"""Current dashboard context, independent of the selected historical window."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from .energy_intervals import local_day, summarize_energy
from .energy_tariffs import capacity_rate, energy_rate, tariff

OSLO = ZoneInfo("Europe/Oslo")


def current_context(repo, config, grid, now=None):
    now = now or datetime.now(UTC)
    local = now.astimezone(OSLO)
    source = repo.tariff(config.company)
    selected, source = tariff(config.company, local.date(), config.segment, source)
    rate, revision = energy_rate(config.company, local, config.segment, source)
    if config.manual_grid_rate is not None:
        rate, revision = config.manual_grid_rate, "manual"
    factor = Decimal(1) if config.vat_exempt else Decimal("1.25")
    capacity = None
    if grid or config.manual_capacity is not None:
        start, _ = local_day(local.date().replace(day=1))
        end = now.astimezone(UTC).replace(minute=0, second=0, microsecond=0)
        rows = repo.rows(grid.entity, start, end) if grid and start < end else []
        hourly = [
            r for r in rows if r.value is not None and r.value >= 0 and r.end - r.start == timedelta(hours=1)
        ]
        result = capacity_rate(
            config.company,
            local.date(),
            [(r.start.astimezone(OSLO), r.value) for r in hourly],
            config.segment,
            source,
        )
        if result or config.manual_capacity is not None:
            peaks = {}
            for row in hourly:
                day = row.start.astimezone(OSLO).date().isoformat()
                peaks[day] = max(peaks.get(day, Decimal(0)), row.value)
            method = selected.get("fastledd", {}).get("metode") if selected else None
            monthly = (
                config.manual_capacity if config.manual_capacity is not None else result["monthly_ex_vat"]
            )
            capacity = {
                **(result or {}),
                "monthly": monthly * factor,
                "manual": config.manual_capacity is not None,
                "vat_included": not config.vat_exempt,
                "method": method,
                "days_recorded": len(peaks),
                "days_required": 3 if method == "TRE_DØGNMAX_MND" else 1 if method == "MND_MAX" else None,
                "peaks": [
                    {"day": day, "kw": kw}
                    for day, kw in sorted(peaks.items(), key=lambda p: p[1], reverse=True)[:3]
                ],
                "coverage": summarize_energy(rows, start, end)["coverage"] if start < end else 0,
                "estimated": any(r.quality == "estimated" for r in hourly),
                "provisional": True,
            }
    return {
        "at": now,
        "company": {
            "id": config.company,
            "name": source.get("data", {}).get("netteier", config.company) if source else config.company,
        },
        "area": config.area,
        "contract": config.contract,
        "scheme": config.scheme,
        "tariff": {
            "energy_ex_vat": rate,
            "manual": config.manual_grid_rate is not None,
            "revision": revision,
            "valid_from": selected.get("gyldig_fra") if selected else None,
            "updated": source.get("data", {}).get("sist_oppdatert", source.get("fetched"))
            if source
            else None,
            "stale": source.get("stale", False) if source else True,
        },
        "capacity": capacity,
    }
