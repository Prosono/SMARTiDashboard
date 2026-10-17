import { describe, it, expect } from "vitest";
import { flowSummary } from "./AutomationFlow";
import { entityState } from "./entityWords";
import type { Home } from "../types";
const home = {
  controls: [
    {
      entity_id: "binary_sensor.door",
      name: "Ytterdør",
      domain: "binary_sensor",
      attributes: { device_class: "door" },
    },
  ],
} as unknown as Home;
describe("flow descriptions preserve source configuration", () => {
  it("uses familiar sensor states without changing the event", () => {
    const row = {
      trigger: "state",
      entity_id: "binary_sensor.door",
      from: "off",
      to: "on",
      for: { minutes: 5 },
    };
    const copy = structuredClone(row);
    expect(flowSummary(row, "triggers", home, "nb")).toEqual({
      title: "Ytterdør",
      detail: "Fra Lukket · Til Åpen · I minst 5 min",
    });
    expect(row).toEqual(copy);
    expect(entityState("binary_sensor.door", "off", home, "en")).toBe("Closed");
  });
  it("keeps complex blocks and multiple targets visible", () => {
    expect(flowSummary({ choose: [] }, "actions", home, "nb").title).toBe(
      "Velg første vei som passer",
    );
    expect(
      flowSummary(
        {
          action: "light.turn_on",
          target: { entity_id: ["light.one", "light.two"] },
        },
        "actions",
        home,
        "nb",
      ).detail,
    ).toBe("light.one, light.two");
    const nested = {
      choose: [
        {
          conditions: [
            {
              condition: "state",
              entity_id: "binary_sensor.door",
              state: "off",
            },
          ],
          sequence: [
            {
              action: "light.turn_on",
              target: { entity_id: ["light.one", "light.two"] },
              data: { brightness_pct: 35, transition: 2 },
            },
          ],
        },
      ],
      default: [{ delay: "00:05:00" }],
    };
    const before = structuredClone(nested);
    const summary = flowSummary(nested, "actions", home, "nb");
    expect(summary.detail).toContain("reserveveien");
    expect(nested).toEqual(before);
    expect(flowSummary(null, "actions", home, "nb").title).toBe(
      "Ukjent oppsett",
    );
  });
});
