import { expect, it } from "vitest";
import { prefersLightweightEnergyView } from "./energyCompatibility";

it("avoids loading the 3D scene on iPhone and desktop-mode iPad", () => {
  expect(
    prefersLightweightEnergyView({
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_2 like Mac OS X)",
      platform: "iPhone",
      maxTouchPoints: 5,
    }),
  ).toBe(true);
  expect(
    prefersLightweightEnergyView({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
      platform: "MacIntel",
      maxTouchPoints: 5,
    }),
  ).toBe(true);
});

it("keeps desktop 3D available without requiring browser globals", () => {
  expect(
    prefersLightweightEnergyView({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
      platform: "MacIntel",
      maxTouchPoints: 0,
    }),
  ).toBe(false);
  expect(
    prefersLightweightEnergyView({
      userAgent: "Mozilla/5.0 (Windows NT 10.0)",
      platform: "Win32",
      maxTouchPoints: 10,
    }),
  ).toBe(false);
});
