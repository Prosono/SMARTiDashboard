import { describe, expect, it } from "vitest";
import type { Home, Control } from "../types";
import { flowDevices, deviceFeatures, deviceFeatureStep } from "./flowDevices";
const control = (id: string, state: string, attributes = {}) =>
  ({
    id: `registry-${id}`,
    entity_id: id,
    name: id.split(".")[1],
    domain: id.split(".")[0],
    state,
    attributes,
    device_id: "multi",
    device_name: "Multisensor",
    area_id: "hall",
  }) as Control;
const home = {
  controls: [
    control("sensor.temperature", "21.4", { unit_of_measurement: "°C" }),
    control("binary_sensor.smoke", "off"),
    control("sensor.battery", "unavailable", { unit_of_measurement: "%" }),
    control("climate.pump", "heat", {
      current_temperature: 21,
      temperature: 23,
      hvac_action: "heating",
      supported_features: 1,
      api_token: "secret",
      latitude: 59,
    }),
  ],
  areas: [{ area_id: "hall", name: "Gang" }],
  devices: [],
} as unknown as Home;
describe("device-first flow inputs", () => {
  it("groups by physical ID and keeps all measurement functions", () => {
    const groups = flowDevices(home);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("Multisensor");
    expect(groups[0].controls).toHaveLength(4);
  });
  it("makes native state and attribute steps while excluding metadata", () => {
    const features = deviceFeatures(flowDevices(home)[0], "nb");
    expect(
      features.some(
        (f) =>
          f.attribute === "api_token" ||
          f.attribute === "latitude" ||
          f.attribute === "supported_features",
      ),
    ).toBe(false);
    const temp = features.find(
      (f) => f.control.entity_id === "sensor.temperature",
    )!;
    expect(deviceFeatureStep(temp, "triggers")).toEqual({
      trigger: "numeric_state",
      entity_id: "sensor.temperature",
      above: 0,
    });
    const attr = features.find((f) => f.attribute === "current_temperature")!;
    expect(deviceFeatureStep(attr, "conditions")).toEqual({
      condition: "numeric_state",
      entity_id: "climate.pump",
      attribute: "current_temperature",
      above: 0,
    });
    const smoke = features.find(
      (f) => f.control.entity_id === "binary_sensor.smoke",
    )!;
    expect(deviceFeatureStep(smoke, "triggers")).toEqual({
      trigger: "state",
      entity_id: "binary_sensor.smoke",
      to: null,
    });
    expect(
      features.find((f) => f.control.entity_id === "sensor.battery")!.numeric,
    ).toBe(true);
  });
});
