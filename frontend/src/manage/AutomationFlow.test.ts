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
      detail: "Endres til åpen",
    });
    expect(row).toEqual(copy);
    expect(entityState("binary_sensor.door", "off", home, "en")).toBe("Closed");
  });
  it("keeps complex blocks and multiple targets visible", () => {
    expect(flowSummary({ choose: [] }, "actions", home, "nb").title).toBe(
      "Velg mellom handlinger",
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
    ).toBe("Flere mål");
    expect(flowSummary(null, "actions", home, "nb").title).toBe(
      "Avansert blokk",
    );
  });
});
