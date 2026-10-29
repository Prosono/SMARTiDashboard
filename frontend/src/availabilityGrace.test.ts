import { describe, it, expect } from "vitest";
import { AvailabilityGrace } from "./availabilityGrace";
import type { Control } from "./types";
const on = {
  id: "light",
  entity_id: "light.test",
  device_id: null,
  area_id: null,
  name: "Test",
  domain: "light",
  capabilities: [],
  updated_at: null,
  integration: null,
  diagnostic: false,
  state: "on",
  availability: "available",
  attributes: { brightness: 200 },
} as Control;
const unavailable = {
  ...on,
  state: "unavailable",
  availability: "unavailable",
} as Control;
describe("availability grace", () => {
  it("keeps short connection outages visible and expires without another response", () => {
    const g = new AvailabilityGrace();
    g.update([on], false, 0);
    expect(g.update([on], true, 100).offline).toBe(false);
    expect(g.update([on], true, 30099).offline).toBe(false);
    expect(g.update([on], true, 30100).offline).toBe(true);
    expect(g.update([on], false, 31000).offline).toBe(false);
    expect(g.update([on], true, 32000).offline).toBe(false);
  });
  it("holds readings for 30 seconds and resets the deadline on recovery", () => {
    const g = new AvailabilityGrace();
    g.update([on], false, 0);
    expect(g.update([unavailable], false, 100).controls[0].state).toBe("on");
    expect(g.update([unavailable], false, 30100).controls[0].state).toBe(
      "unavailable",
    );
    g.update([on], false, 31000);
    expect(g.update([unavailable], false, 32000).controls[0].state).toBe("on");
  });
  it("does not fabricate availability or resurrect removed controls", () => {
    const g = new AvailabilityGrace();
    expect(g.update([unavailable], true, 0).offline).toBe(true);
    expect(g.update([unavailable], false, 1).controls[0]).toEqual(unavailable);
    g.update([on], false, 2);
    expect(g.update([], false, 3).controls).toEqual([]);
    expect(g.update([unavailable], false, 4).controls[0]).toEqual(unavailable);
  });
});
