import { expect, it } from "vitest";
import { isEvCharging, type Flow } from "./energyFlowModel";

it.each([
  ["charging", { watts: 2200 }, true],
  ["idle", { watts: 0 }, false],
  ["standby", { watts: 12 }, false],
  ["stale positive reading", { status: "stale" }, false],
  ["disconnected charger", { status: "unavailable" }, false],
  ["missing reading", { watts: null }, false],
  ["removed charger", { visible: false }, false],
] satisfies [string, Partial<Flow>, boolean][])(
  "only draws the car for active charging (%s)",
  (_, overrides, expected) => {
    expect(
      isEvCharging({
        visible: true,
        status: "ok",
        watts: 2200,
        measured_at: "2026-11-23T06:00:00Z",
        ...overrides,
      }),
    ).toBe(expected);
  },
);
