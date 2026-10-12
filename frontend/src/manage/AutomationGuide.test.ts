import { describe, it, expect } from "vitest";
import { canGuide, guideValid } from "./AutomationGuide";
import type { Home } from "../types";
const config = {
  alias: "Evening",
  mode: "single",
  triggers: [{ trigger: "time", at: "20:00:00" }],
  conditions: [],
  actions: [{ action: "light.turn_on", target: { entity_id: "light.one" } }],
};
const home = {
  controls: [
    {
      entity_id: "light.one",
      domain: "light",
      capabilities: [{ actions: ["turn_on", "turn_off"] }],
    },
  ],
} as Home;
describe("guided automation safety", () => {
  it("accepts everyday routines without modifying their configuration", () => {
    const before = structuredClone(config);
    expect(canGuide(config)).toBe(true);
    expect(guideValid(config, home)).toBe(true);
    expect(config).toEqual(before);
  });
  it("keeps complex settings in the full editor", () => {
    for (const extra of [
      { variables: { x: 1 } },
      { mode: "restart" },
      { conditions: [{ condition: "state" }] },
      { actions: [{ ...config.actions[0], data: { brightness_pct: 50 } }] },
      { triggers: [{ ...config.triggers[0], weekday: ["mon"] }] },
      { triggers: [{ trigger: "sun", event: "sunset", offset: "00:30:00" }] },
    ])
      expect(canGuide({ ...config, ...extra })).toBe(false);
  });
  it("rejects missing targets, unsupported actions and invalid times", () => {
    expect(guideValid(config, { controls: [] } as unknown as Home)).toBe(false);
    expect(
      guideValid(
        { ...config, triggers: [{ trigger: "time", at: "29:99" }] },
        home,
      ),
    ).toBe(false);
    expect(
      guideValid(
        {
          ...config,
          actions: [
            { action: "switch.turn_on", target: { entity_id: "light.one" } },
          ],
        },
        home,
      ),
    ).toBe(false);
  });
  it("requires explicit binary transitions so reconnecting is not an event", () => {
    expect(
      canGuide({
        ...config,
        triggers: [
          { trigger: "state", entity_id: "binary_sensor.door", to: "on" },
        ],
      }),
    ).toBe(false);
    expect(
      canGuide({
        ...config,
        triggers: [
          {
            trigger: "state",
            entity_id: "binary_sensor.door",
            from: "off",
            to: "on",
          },
        ],
      }),
    ).toBe(true);
  });
});
