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


def test_presence_exposes_state_without_location_or_tracker_metadata():
    states = {
        "person.resident": {
            "state": "home",
            "attributes": {
                "friendly_name": "Resident",
                "latitude": 58.1,
                "longitude": 8.1,
                "user_id": "private",
                "device_trackers": ["device_tracker.phone"],
                "entity_picture": "/private.jpg",
                "source": "device_tracker.phone",
            },
        },
        "person.unknown": {"state": "unknown", "attributes": {}},
        "person.disabled": {"state": "home", "attributes": {}},
    }
    controls = normalize(states, {"person.disabled": {"disabled_by": "user"}}, {})
    assert len(controls) == 2
    assert controls[0].name == "Resident"
    assert controls[0].state == "home"
    assert controls[0].attributes == {}
    assert controls[0].capabilities == []
    assert controls[1].availability == "unknown"


def test_climate_steps_follow_each_device_and_ha_fallback():
    for unit, supplied, expected in [
        ("°C", 1, 1), ("°C", 0.5, 0.5), ("°C", 0.1, 0.1),
        ("°C", None, 0.5), ("°F", None, 1),
    ]:
        attributes = {"supported_features": 1, "min_temp": 7, "max_temp": 35,
                      "temperature_unit": unit, "current_temperature": 21.1}
        if supplied is not None:
            attributes["target_temp_step"] = supplied
        control = normalize({"climate.x": {"state": "heat", "attributes": attributes}}, {}, {})[0]
        assert control.capabilities[0].step == expected


def test_ha_temperature_unit_is_used_before_fallback_without_mutating_state():
    from app.ha import HomeAssistant
    ha = HomeAssistant("http://example.invalid:8123", "unused")
    ha.temperature_unit = "°F"
    ha.states = {"climate.x": {"state": "heat", "attributes": {
        "supported_features": 1, "min_temp": 40, "max_temp": 90,
    }}}
    control = ha.controls()[0]
    assert control.capabilities[0].step == 1
    assert control.capabilities[0].unit == "°F"
    assert "temperature_unit" not in ha.states["climate.x"]["attributes"]
