from app.demo import Demo
from app.models import normalize


def test_multichannel_diagnostic_unknown_and_entity_area_override():
    demo = Demo()
    demo.entities["switch.kitchen"]["area_id"] = "hall"
    values = {c.entity_id: c for c in demo.controls()}
    assert values["switch.kitchen"].device_id == values["light.kitchen"].device_id
    assert values["switch.kitchen"].domain == "switch"
    assert values["switch.kitchen"].area_id == "hall"
    assert values["sensor.bedroom_battery"].availability == "unknown"
    assert values["sensor.bedroom_battery"].state == "unknown"
    assert values["sensor.bedroom_battery"].diagnostic
    assert values["automation.evening"].device_id is None
    demo.entities["light.kitchen"]["disabled_by"] = "user"
    assert "light.kitchen" not in {c.entity_id for c in demo.controls()}


def test_unregistered_entity_and_onoff_light():
    controls = normalize(
        {"light.x": {"state": "off", "attributes": {"supported_color_modes": ["onoff"]}}}, {}, {}
    )
    assert controls[0].device_id is None
    assert [c.kind for c in controls[0].capabilities] == ["power"]


def test_missing_thermostat_limits_do_not_invent_control_bounds():
    controls = normalize({"climate.x": {"state": "heat", "attributes": {"supported_features": 1}}}, {}, {})
    assert controls[0].capabilities == []
