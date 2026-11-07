import { expect, it } from "vitest";
import type { Control, Home } from "../types";
import { flowArtworkTargets } from "./flowArtworkModel";

const control = (
  entity_id: string,
  changes: Partial<Control> = {},
): Control => ({
  id: `registry-${entity_id}`,
  entity_id,
  name: entity_id,
  domain: entity_id.split(".")[0],
  area_id: "living",
  device_id: "multi",
  state: "off",
  attributes: {},
  availability: "available",
  capabilities: [],
  diagnostic: false,
  updated_at: null,
  integration: null,
  ...changes,
});
const battery = control("sensor.battery", {
  diagnostic: true,
  attributes: { device_class: "battery" },
});
const temperature = control("sensor.temperature", {
  attributes: { device_class: "temperature" },
});
const lamp = control("light.lamp");
const lamp2 = control("light.other", { device_id: "other" });
const climate = control("climate.ac");
const home = { controls: [battery, temperature, lamp, lamp2, climate] } as Home;

it("matches entity and registry IDs exactly and retains multi-target information", () => {
  expect(
    flowArtworkTargets(
      { trigger: "device", entity_id: temperature.id, device_id: "multi" },
      home,
    ),
  ).toEqual({ control: temperature, count: 1 });
  expect(
    flowArtworkTargets(
      {
        action: "light.turn_on",
        target: {
          entity_id: [lamp.entity_id, lamp2.entity_id, lamp.entity_id],
        },
      },
      home,
    ),
  ).toEqual({ control: lamp, count: 2 });
  expect(
    flowArtworkTargets(
      {
        action: "light.turn_on",
        target: { entity_id: ["light.missing", lamp.entity_id] },
      },
      home,
    ),
  ).toEqual({ control: lamp, count: 2 });
  expect(
    flowArtworkTargets({ entity_id: "same friendly name" }, home).control,
  ).toBeUndefined();
});
it("chooses a matching device function over battery diagnostics and limits area portraits to the service domain", () => {
  expect(
    flowArtworkTargets(
      { action: "climate.set_temperature", target: { device_id: "multi" } },
      home,
    ),
  ).toEqual({ control: climate, count: 1 });
  expect(
    flowArtworkTargets(
      { action: "light.turn_on", target: { area_id: "living" } },
      home,
    ),
  ).toEqual({ control: lamp, count: 2 });
  expect(
    flowArtworkTargets(
      { action: "light.turn_on", target: { device_id: ["missing", "multi"] } },
      home,
    ),
  ).toEqual({ control: lamp, count: 2 });
});
it("keeps logic and templates conceptual and never mines nested branches for a device portrait", () => {
  for (const step of [
    {
      choose: [
        {
          sequence: [
            { action: "light.turn_on", target: { entity_id: lamp.entity_id } },
          ],
        },
      ],
    },
    {
      condition: "template",
      entity_id: lamp.entity_id,
      value_template: "{{ true }}",
    },
    {
      condition: "and",
      conditions: [{ condition: "state", entity_id: lamp.entity_id }],
    },
    { action: "light.turn_on", target: { entity_id: "{{ target_light }}" } },
    { delay: 1 },
    null,
    "{{ action }}",
  ])
    expect(flowArtworkTargets(step, home)).toEqual({ count: 0 });
});
it("does not mutate the automation or the home snapshot", () => {
  const row = {
    action: "light.turn_on",
    target: { entity_id: [lamp.entity_id, lamp2.entity_id] },
  };
  const before = JSON.stringify({ row, home });
  flowArtworkTargets(row, home);
  expect(JSON.stringify({ row, home })).toBe(before);
});

it("does not claim an exact total for overlapping entity, device and area targets", () => {
  expect(
    flowArtworkTargets(
      {
        action: "light.turn_on",
        target: {
          entity_id: lamp.entity_id,
          device_id: "multi",
          area_id: "living",
        },
      },
      home,
    ),
  ).toEqual({ control: lamp, count: null });
});
