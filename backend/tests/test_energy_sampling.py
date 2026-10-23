from datetime import UTC, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace

from app.energy_analysis import chart_points
from app.energy_intervals import Interval
from app.energy_platform import EnergyPlatform
from app.energy_repository import EnergyConfig, EnergyRepository, Meter
from app.storage import Store


def setup(tmp_path):
    ha = SimpleNamespace(connected=True, epoch=0, states={})
    control = SimpleNamespace(
        entity_id="sensor.power",
        state="1.2",
        availability="available",
        attributes={"unit_of_measurement": "kW"},
        updated_at=None,
    )
    ha.controls = lambda: [control]
    service = EnergyPlatform(
        ha, Store(tmp_path / "energy.db"), SimpleNamespace(mode="live", remote_identity_file=None)
    )
    start = datetime.now(UTC).replace(minute=0, second=0, microsecond=0) - timedelta(hours=2)
    service.repo.save(EnergyConfig(power_entity="sensor.power", scheme="none"), start)
    return service, control, start


def sample(service, control, time, value="1.2"):
    control.state = value
    service.ha.states[control.entity_id] = {"last_updated": time.isoformat()}
    service.sample_power(time)


def test_direct_power_collects_without_recorder_and_merges_hour(tmp_path):
    service, control, start = setup(tmp_path)
    for minute in range(61):
        sample(service, control, start + timedelta(minutes=minute))
    repo = EnergyRepository(service.store)
    rows = repo.rows(control.entity_id, start, start + timedelta(hours=1))
    assert len(rows) == 1
    assert rows[0].value == Decimal("1.2")
    assert rows[0].source == "smarti:power"
    assert rows[0].end - rows[0].start == timedelta(hours=1)
    # Recorder cannot replace or overlap direct collection.
    repo.put(
        control.entity_id,
        [Interval(start, start + timedelta(hours=1), Decimal(99), "ha:recorder:power", "estimated")],
    )
    assert repo.rows(control.entity_id, start, start + timedelta(hours=1)) == rows
    sample(service, control, start + timedelta(minutes=61))
    assert len(repo.rows(control.entity_id, start, start + timedelta(hours=2))) == 2


def test_gaps_restart_stale_zero_and_reconnection(tmp_path):
    service, control, start = setup(tmp_path)
    sample(service, control, start, "0")
    sample(service, control, start + timedelta(minutes=1), "0")
    sample(service, control, start + timedelta(minutes=5))  # no interpolation over downtime
    sample(service, control, start + timedelta(minutes=6))
    service.ha.epoch += 1
    sample(service, control, start + timedelta(minutes=7))
    service.sample_power(start + timedelta(minutes=20))  # stale value
    assert service.power_sample is None
    restarted = EnergyPlatform(service.ha, service.store, service.settings)
    sample(restarted, control, start + timedelta(minutes=21))
    sample(restarted, control, start + timedelta(minutes=22), "nan")
    rows = service.repo.rows(control.entity_id, start, start + timedelta(hours=1))
    assert len(rows) == 2
    assert rows[0].value == 0
    assert rows[1].value == Decimal(".02")
    assert sum((r.end - r.start).total_seconds() for r in rows) == 120
    points = chart_points(
        [{"start": r.start, "end": r.end, "kwh": r.value, "cost": {"total": None}} for r in rows],
        start,
        start + timedelta(hours=1),
    )
    assert points[0]["kwh"] == Decimal(".02")
    assert points[0]["partial"] is True
    assert points[0]["cost"]["total"] is None


def test_energy_meter_prevents_double_collection_and_unit_conversion(tmp_path):
    service, control, start = setup(tmp_path)
    control.attributes["unit_of_measurement"] = "W"
    sample(service, control, start, "1200")
    sample(service, control, start + timedelta(minutes=1), "2400")
    rows = service.repo.rows(control.entity_id, start, start + timedelta(hours=1))
    assert rows[0].value == Decimal(".03")
    service.repo.save(
        EnergyConfig(
            power_entity=control.entity_id, meters=[Meter(role="grid", entity="sensor.energy", name="Energy")]
        ),
        start,
    )
    sample(service, control, start + timedelta(minutes=2), "2400")
    assert service.power_sample is None
    assert service.repo.rows(control.entity_id, start, start + timedelta(hours=1)) == rows


def test_recorder_failure_does_not_block_cloud_sync(tmp_path):
    import asyncio

    from app.cloud_energy import Reading
    from app.ha import HAError

    service, control, start = setup(tmp_path)
    sample(service, control, start)
    sample(service, control, start + timedelta(minutes=1))
    synced = []

    async def unavailable(*args, **kwargs):
        raise HAError("recorder_not_available")

    async def prices(*args):
        return None

    async def sync(config):
        with service.store.connect() as db:
            rows = db.execute("SELECT * FROM energy_intervals").fetchall()
        for row in rows:
            Reading.model_validate(
                {k: row[k] for k in ("entity", "start", "end", "value", "source", "quality")}
            )
        synced.extend(rows)

    service.ha.request = unavailable
    service.prices = prices
    service.sync = sync
    asyncio.run(service.collect())
    assert len(synced) == 1
