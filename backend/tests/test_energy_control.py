from datetime import UTC, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace

from app.energy_control import current_context
from app.energy_intervals import Interval, local_day
from app.energy_layout import combined_layout
from app.energy_repository import EnergyConfig


def fixture(vat_exempt=False, **extra):
    config = EnergyConfig.model_validate(
        {
            "company": "elvia",
            "scheme": "none",
            "vat_exempt": vat_exempt,
            "meters": [{"role": "grid", "entity": "sensor.import", "name": "Huset"}],
            **extra,
        }
    )
    now = datetime(2026, 11, 10, 12, tzinfo=UTC)
    first, _ = local_day(now.date().replace(day=1))
    rows = [
        Interval(
            first + timedelta(hours=offset), first + timedelta(hours=offset + 1), Decimal(value), "fixture"
        )
        for offset, value in [(0, "10"), (1, "9"), (24, "5"), (48, "3")]
    ]
    calls = []

    def read(entity, start, end):
        calls.append((entity, start, end))
        return rows

    repo = SimpleNamespace(tariff=lambda _: None, rows=read)
    return repo, config, config.meters[0], now, calls


def test_current_capacity_uses_monthly_distinct_days_and_marks_incomplete_history():
    repo, config, grid, now, calls = fixture()
    result = current_context(repo, config, grid, now)
    capacity = result["capacity"]
    assert capacity["peak_kw"] == 6
    assert capacity["threshold"] == 5
    assert capacity["next_threshold_kw"] == 10
    assert capacity["days_recorded"] == 3
    assert capacity["days_required"] == 3
    assert len(capacity["peaks"]) == 3
    assert 0 < capacity["coverage"] < 1
    assert capacity["provisional"]
    assert calls[0][1] == local_day(now.date().replace(day=1))[0]
    assert calls[0][2].minute == 0


def test_capacity_vat_and_manual_energy_rates_are_explicit():
    repo, config, grid, now, _ = fixture()
    normal = current_context(repo, config, grid, now)
    no_vat = current_context(repo, config.model_copy(update={"vat_exempt": True}), grid, now)
    assert normal["capacity"]["monthly"] == no_vat["capacity"]["monthly"] * Decimal("1.25")
    assert not no_vat["capacity"]["vat_included"]
    manual = current_context(
        repo,
        config.model_copy(update={"manual_grid_rate": Decimal("0"), "manual_capacity": Decimal("123")}),
        grid,
        now,
    )
    assert manual["tariff"]["energy_ex_vat"] == 0
    assert manual["tariff"]["manual"]
    assert manual["capacity"]["monthly"] == Decimal("153.75")
    assert manual["capacity"]["manual"]


def test_hidden_or_missing_grid_does_not_expose_peaks():
    repo, config, _, now, calls = fixture()
    result = current_context(repo, config, None, now)
    assert result["capacity"] is None
    assert calls == []
    assert result["company"]["name"] == "Elvia AS"
    assert result["tariff"]["energy_ex_vat"] is not None


def test_manual_fixed_fee_can_be_shown_without_a_meter_or_invented_tier():
    repo, config, _, now, calls = fixture(manual_capacity=Decimal("100"))
    result = current_context(repo, config, None, now)
    assert result["capacity"]["monthly"] == 125
    assert result["capacity"]["manual"]
    assert "threshold" not in result["capacity"]
    assert result["capacity"]["peaks"] == []
    assert calls == []


def test_combined_layout_preserves_old_positions_config_and_records():
    from copy import deepcopy

    old = {
        "revision": 4,
        "items": [
            {"id": "energy:flow", "x": 0, "y": 0, "w": 3, "h": 4},
            {
                "id": "custom:one",
                "x": 0,
                "y": 4,
                "w": 1,
                "h": 2,
                "config": {"title": "Min måler", "sources": ["sensor.test"]},
            },
        ],
    }
    history = {
        "revision": 2,
        "items": [
            {"id": "energy:history", "x": 1, "y": 0, "w": 2, "h": 3},
            {
                "id": "custom:one",
                "x": 0,
                "y": 3,
                "w": 1,
                "h": 2,
                "config": {"title": "Annen måler", "sources": ["sensor.other"]},
            },
        ],
    }
    before = deepcopy((old, history))
    result = combined_layout(old, history)
    assert (old, history) == before
    assert result["revision"] == 0
    assert result["items"][:2] == old["items"]
    assert result["items"][2]["y"] == 6
    assert result["items"][3]["id"] == "custom:one:history"
    assert result["items"][3]["config"]["sources"] == ["sensor.other"]
    assert len({item["id"] for item in result["items"]}) == len(result["items"])


def test_empty_layouts_stay_empty_and_unconfigured_layouts_get_defaults():
    assert combined_layout(None, None) == {"revision": 0, "items": None}
    assert combined_layout({"revision": 3, "items": []}, {"revision": 2, "items": []}) == {
        "revision": 0,
        "items": [],
    }
