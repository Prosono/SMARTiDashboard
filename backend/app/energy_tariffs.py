"""Dated, tax-exclusive Fri Nettleie tariffs. Unsupported rules fail closed."""

import json
from datetime import date, timedelta
from decimal import Decimal
from functools import lru_cache
from pathlib import Path


def D(value):
    number = Decimal(str(value))
    if not number.is_finite():
        raise ValueError("invalid_tariff_number")
    return number


@lru_cache(maxsize=1)
def catalogue():
    return json.loads((Path(__file__).parent / "energy_data/tariffs.json").read_text())


def easter(year):
    a, b, c = year % 19, year // 100, year % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    offset = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * offset) // 451
    n = h + offset - 7 * m + 114
    return date(year, n // 31, n % 31 + 1)


def holiday(day):
    return (day.month, day.day) in {(1, 1), (5, 1), (5, 17), (12, 25), (12, 26)} or day in {
        easter(day.year) + timedelta(days=n) for n in (-3, -2, 0, 1, 39, 49, 50)
    }


def matches(rule, stamp):
    if set(rule) - {"navn", "timer", "dager", "måneder", "pris"}:
        raise ValueError("unsupported_tariff_rule")
    months = "januar februar mars april mai juni juli august september oktober november desember".split()
    if rule.get("måneder") and months[stamp.month - 1] not in rule["måneder"]:
        return False
    weekend, feast = stamp.weekday() >= 5, holiday(stamp.date())
    days = {
        "alle": True,
        "ukedag": not weekend,
        "helg": weekend,
        "helligdag": feast,
        "helligdager": feast,
        "fridag": weekend or feast,
        "virkedag": not (weekend or feast),
    }
    days.update(
        {
            name: stamp.weekday() == n
            for n, name in enumerate("mandag tirsdag onsdag torsdag fredag lørdag søndag".split())
        }
    )
    if any(day not in days for day in rule.get("dager", [])):
        raise ValueError("unsupported_tariff_day")
    if rule.get("dager") and not any(days[d] for d in rule["dager"]):
        return False
    hours = rule.get("timer")
    if hours is None:
        return True
    values = hours if isinstance(hours, list) else [hours]
    selected = set()
    for value in values:
        parts = str(value).split("-")
        if len(parts) == 2:
            start, end = map(int, parts)
            if not 0 <= start <= 23 or not 0 <= end <= 23:
                raise ValueError("invalid_tariff_hour")
            selected.update(
                range(start, end + 1) if start <= end else list(range(start, 24)) + list(range(end + 1))
            )
        else:
            selected.add(int(value))
    return stamp.hour in selected


def tariff(company, day, segment="husholdning", source=None):
    source = source or next((c for c in catalogue()["companies"] if c["id"] == company), None)
    if not source:
        return None, None
    candidates = [
        t
        for t in source["data"]["tariffer"]
        if segment in t["kundegrupper"]
        and t["gyldig_fra"] <= day.isoformat()
        and (not t.get("gyldig_til") or day.isoformat() < t["gyldig_til"])
    ]
    return (max(candidates, key=lambda t: t["gyldig_fra"]) if candidates else None), source


def _energy_rate(company, stamp, segment="husholdning", source=None):
    selected, source = tariff(company, stamp.date(), segment, source)
    if not selected:
        return None, None
    rule = selected["energiledd"]
    if set(rule) - {"grunnpris", "unntak"}:
        return None, source["revision"]
    price = D(rule["grunnpris"])
    try:
        for exception in rule.get("unntak", []):
            if matches(exception, stamp):
                price = D(exception["pris"])
    except (ValueError, TypeError, KeyError):
        return None, source["revision"]
    return price / 100, source["revision"]


def _capacity_rate(company, day, hourly, segment="husholdning", source=None):
    """Provisional monthly fee. Inputs are full UTC hours with kWh consumption."""
    selected, _ = tariff(company, day, segment, source)
    if not selected or selected["fastledd"]["metode"] not in {"TRE_DØGNMAX_MND", "MND_MAX"}:
        return None
    peaks = {}
    for stamp, kwh in hourly:
        if stamp.year == day.year and stamp.month == day.month:
            peaks[stamp.date()] = max(peaks.get(stamp.date(), D(0)), kwh)
    n = 3 if selected["fastledd"]["metode"] == "TRE_DØGNMAX_MND" else 1
    if not peaks:
        return None
    n = min(n, len(peaks))
    peak = sum(sorted(peaks.values(), reverse=True)[:n]) / n
    fixed = selected["fastledd"]
    eligible = [
        t
        for t in fixed["terskler"]
        if peak >= D(t["terskel"])
        if fixed.get("terskel_inkludert") or peak > D(t["terskel"]) or D(t["terskel"]) == 0
    ]
    if not eligible:
        return None
    tier = max(eligible, key=lambda t: t["terskel"])
    upcoming = sorted((t for t in fixed["terskler"] if D(t["terskel"]) > peak), key=lambda t: D(t["terskel"]))
    return {
        "next_threshold_kw": D(upcoming[0]["terskel"]) if upcoming else None,
        "next_monthly_ex_vat": D(upcoming[0]["pris"]) / 12 if upcoming else None,
        "monthly_ex_vat": D(tier["pris"]) / 12,
        "peak_kw": peak,
        "threshold": tier["terskel"],
        "provisional": True,
    }


def energy_rate(company, stamp, segment="husholdning", source=None):
    try:
        return _energy_rate(company, stamp, segment, source)
    except (KeyError, TypeError, ValueError, ArithmeticError, AttributeError):
        return None, None


def capacity_rate(company, day, hourly, segment="husholdning", source=None):
    try:
        return _capacity_rate(company, day, hourly, segment, source)
    except (KeyError, TypeError, ValueError, ArithmeticError, AttributeError):
        return None
