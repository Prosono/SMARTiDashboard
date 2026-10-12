import { expect, it } from "vitest";
import { overview, temperature } from "./homeModel";
import type { Control, Home } from "../types";
const c = (
  domain: string,
  state: string,
  attributes = {},
  extra = {},
): Control => ({
  id: Math.random().toString(),
  name: domain,
  entity_id: domain + ".any",
  domain,
  state,
  attributes,
  area_id: "room",
  device_id: null,
  capabilities: [],
  availability: "available",
  updated_at: null,
  integration: null,
  diagnostic: false,
  ...extra,
});
const home = (controls: Control[]): Home => ({
  controls,
  areas: [{ area_id: "room", name: "Room" }],
  devices: [],
  favorites: [],
  home_name: "Home",
  mode: "live",
  connected: true,
  error: null,
  last_sync: null,
  ha_version: null,
  revision: 0,
});
it("small home shows lights without inventing measurements", () => {
  const m = overview(home([c("light", "on")]));
  expect(m.temperature).toBeNull();
  expect(m.meters).toEqual([]);
  expect(m.security).toEqual([]);
  expect(m.cameras).toEqual([]);
});
it("normalizes temperature units and avoids overweighting rooms", () => {
  expect(temperature(c("sensor", "68", { unit_of_measurement: "°F" }))).toBe(
    20,
  );
  const m = overview(
    home([
      c("sensor", "20", {
        unit_of_measurement: "°C",
        device_class: "temperature",
      }),
      c("sensor", "40", {
        unit_of_measurement: "°C",
        device_class: "temperature",
      }),
    ]),
  );
  expect(m.temperature).toBe(20);
  expect(temperature(c("sensor", "21", {}))).toBeNull();
});
it("keeps overlapping meters separate and recognizes capability-backed charging", () => {
  const m = overview(
    home([
      c("sensor", "1200", { device_class: "power", unit_of_measurement: "W" }),
      c("sensor", "3", { unit_of_measurement: "kWh" }),
      c("binary_sensor", "on", { device_class: "battery_charging" }),
    ]),
  );
  expect(m.meters).toHaveLength(2);
  expect(m.charging).toHaveLength(1);
});
it("prioritizes smoke and unknown security ahead of ordinary openings", () => {
  const m = overview(
    home([
      c("binary_sensor", "on", { device_class: "door" }),
      c("lock", "unavailable", {}, { availability: "unavailable" }),
      c("binary_sensor", "on", { device_class: "smoke" }),
      c("camera", "idle"),
    ]),
  );
  expect(m.alerts).toHaveLength(2);
  expect(m.security[0].attributes.device_class).toBe("smoke");
  expect(m.cameras).toHaveLength(1);
});
it("indexes large homes without truncating discoverable controls", () => {
  const m = overview(
    home(Array.from({ length: 800 }, () => c("light", "off"))),
  );
  expect(m.byRoom.get("room")).toHaveLength(800);
  expect(m.controls).toHaveLength(800);
});
