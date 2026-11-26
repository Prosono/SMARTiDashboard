import { describe, it, expect } from "vitest";
import { flowLibrary, newFlowStep } from "./flowLibrary";
import { flowPresets } from "./flowPresets";
import { flowEntityScope, withFlowEntityScope } from "./flowEntityScope";
describe("flow suggestions", () => {
  it("distinguishes sunrise events from daylight requirements", () => {
    expect(newFlowStep("triggers", "preset:sunrise")).toEqual({
      trigger: "sun",
      event: "sunrise",
    });
    expect(newFlowStep("conditions", "preset:daylight")).toEqual({
      condition: "sun",
      after: "sunrise",
      before: "sunset",
    });
  });
  it("keeps power and energy as explicit sensor choices", () => {
    for (const id of ["power", "energy", "warm", "motion", "charging"]) {
      expect(newFlowStep("triggers", `preset:${id}`).entity_id).toBe("");
      expect(newFlowStep("conditions", `preset:${id}`).entity_id).toBe("");
    }
  });
  it("scopes visually identical state presets without altering their native configuration", () => {
    const leak = newFlowStep("triggers", "preset:leak");
    const door = newFlowStep("triggers", "preset:door");
    expect(leak).toEqual(door);
    const wet = {
      domain: "binary_sensor",
      attributes: { device_class: "moisture" },
    };
    const open = {
      domain: "binary_sensor",
      attributes: { device_class: "door" },
    };
    expect(flowEntityScope(leak)?.matches(wet)).toBe(true);
    expect(flowEntityScope(door)?.matches(wet)).toBe(false);
    expect(flowEntityScope(leak)?.matches(open)).toBe(false);
    const chosen = withFlowEntityScope(
      { ...leak, entity_id: "binary_sensor.leak" },
      flowEntityScope(leak),
    );
    expect(flowEntityScope(chosen)?.matches(wet)).toBe(true);
    expect(JSON.parse(JSON.stringify(chosen))).toEqual({
      trigger: "state",
      to: "on",
      entity_id: "binary_sensor.leak",
    });
    expect(flowEntityScope(newFlowStep("triggers", "state"))).toBeUndefined();
  });
  it("filters both trigger and condition presets by the measurement they watch", () => {
    const power = flowEntityScope(newFlowStep("conditions", "preset:power"));
    const humidity = flowEntityScope(
      newFlowStep("triggers", "preset:humidity"),
    );
    const wattmeter = {
      domain: "sensor",
      attributes: { unit_of_measurement: "W" },
    };
    const battery = {
      domain: "sensor",
      attributes: { device_class: "battery", unit_of_measurement: "%" },
    };
    expect(power?.matches(wattmeter)).toBe(true);
    expect(humidity?.matches(battery)).toBe(false);
    expect(
      humidity?.matches({
        ...battery,
        attributes: { device_class: "humidity" },
      }),
    ).toBe(true);
  });
  it("uses native weekday requirements and independent copies", () => {
    const a = newFlowStep("conditions", "preset:weekdays");
    a.weekday.push("sat");
    expect(newFlowStep("conditions", "preset:weekdays").weekday).toHaveLength(
      5,
    );
  });
  it.each(["triggers", "conditions", "actions"] as const)(
    "has unique categorized searchable cards for %s",
    (kind) => {
      const library = flowLibrary(kind, "nb");
      expect(new Set(library.map((x) => x.id)).size).toBe(library.length);
      for (const card of library) {
        expect(card.category).toBeTruthy();
        expect(card.hint).toBeTruthy();
        expect(newFlowStep(kind, card.id)).toBeTruthy();
      }
      expect(flowPresets(kind, "en").map((x) => x.id)).toEqual(
        flowPresets(kind, "nb").map((x) => x.id),
      );
    },
  );
});
