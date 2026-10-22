"""Traceable interval costs, explicitly incomplete when input rules are absent."""

from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from .energy_tariffs import energy_rate

ZERO = Decimal(0)
OSLO = ZoneInfo("Europe/Oslo")


def spot_rate(prices, start, end):
    """Time-weight quarter prices for hourly meters: estimated, never measured."""
    selected = [
        (
            datetime.fromisoformat(p["time_start"]),
            datetime.fromisoformat(p["time_end"]),
            Decimal(str(p["NOK_per_kWh"])),
        )
        for p in prices or []
    ]
    cursor, weighted, count = start, ZERO, 0
    for a, b, rate in sorted(selected):
        a, b = max(a, start), min(b, end)
        if b <= a:
            continue
        if a != cursor or not rate.is_finite():
            return None, False
        weighted += rate * Decimal(str((b - a).total_seconds()))
        cursor, count = b, count + 1
    if cursor != end:
        return None, False
    return weighted / Decimal(str((end - start).total_seconds())), count > 1


def cost(row, config, prices, monthly_usage=None, tariff_source=None, eligible_fraction=None):
    """Prices ex VAT. monthly_usage is the complete cumulative import BEFORE this interval.

    The cap applies chronologically; the crossing interval is prorated. For a
    submeter, eligible_fraction allocates the grid interval's supported share.
    """
    local = row.start.astimezone(OSLO)
    if local.year != 2026 or row.value is None:
        return {"total": None, "reason": "rules_or_measurement_missing"}
    spot, estimated = spot_rate(prices, row.start, row.end)
    supply = config.fixed_price if config.contract == "fixed" else spot
    if supply is None or (config.scheme != "none" and spot is None):
        return {"total": None, "reason": "spot_price_missing"}
    grid, revision = (
        (config.manual_grid_rate, "manual")
        if config.manual_grid_rate is not None
        else energy_rate(config.company, local, config.segment, tariff_source)
    )
    if grid is None:
        return {"total": None, "reason": "grid_tariff_missing"}
    support = ZERO
    supported_kwh = ZERO
    if config.scheme != "none":
        cap = Decimal(1000 if config.segment == "fritid" else 5000)
        if monthly_usage is None:
            return {"total": None, "reason": "support_cap_requires_complete_month"}
        supported_kwh = min(row.value, max(ZERO, cap - monthly_usage))
        if eligible_fraction is not None:
            supported_kwh = row.value * eligible_fraction
        if config.scheme == "norgespris":
            support = spot - Decimal(".40")
        elif config.scheme == "stromstotte":
            support = max(ZERO, spot - Decimal(".77")) * Decimal(".90")
    tax = ZERO if config.electricity_tax_exempt else Decimal(".0713")
    enova = Decimal(".01")
    parts = {
        "electricity": row.value * supply,
        "markup": row.value * config.markup,
        "grid": row.value * grid,
        "electricity_tax": row.value * tax,
        "enova": row.value * enova,
        "support": -supported_kwh * support,
    }
    parts["vat"] = ZERO if config.vat_exempt else sum(parts.values()) * Decimal(".25")
    return {
        "total": sum(parts.values()),
        "parts": parts,
        "quality": "estimated" if estimated else "calculated",
        "tariff_revision": revision,
        "rules": "NO-2026-v1",
        "spot_ex_vat": spot,
        "excludes_monthly_fees": True,
    }
