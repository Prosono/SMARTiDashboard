import { expect, it } from "vitest";
import { Battery, ShieldCheck, Thermometer } from "lucide-react";
import type { Control } from "../types";
import { lightIcon } from "../LightAppearance";
import { mediaIcon } from "../MediaIcons";
import { deviceAppearance, primaryDeviceControl } from "./deviceAppearance";

const control = (changes: Partial<Control> = {}): Control => ({
  id: "light.one",
  entity_id: "light.one",
  device_id: "device1",
  area_id: null,
  name: "Lys",
  domain: "light",
  state: "off",
  attributes: {},
  capabilities: [],
  availability: "available",
  updated_at: null,
  integration: null,
  diagnostic: false,
  ...changes,
});

it("preserves configured light and media icons and uses the dashboard's sensor icons", () => {
  const light = control({ attributes: { smarti_icon: "track" } });
  const media = control({
    domain: "media_player",
    attributes: { smarti_icon: "headphones" },
  });
  expect(deviceAppearance(light).Icon).toBe(lightIcon(light));
  expect(deviceAppearance(media).Icon).toBe(mediaIcon(media));
  expect(
    deviceAppearance(
      control({ domain: "sensor", attributes: { device_class: "battery" } }),
    ).Icon,
  ).toBe(Battery);
  expect(
    deviceAppearance(
      control({
        domain: "sensor",
        attributes: { device_class: "temperature" },
      }),
    ).Icon,
  ).toBe(Thermometer);
  expect(
    deviceAppearance(
      control({
        domain: "binary_sensor",
        attributes: { device_class: "motion" },
      }),
    ).Icon,
  ).toBe(ShieldCheck);
});

it("matches the physical registry ID and prefers its main function over battery diagnostics", () => {
  const battery = control({ domain: "sensor", diagnostic: true });
  const power = control({ domain: "sensor", id: "power" });
  const light = control({
    name: "Same name",
    attributes: { smarti_icon: "track" },
  });
  const other = control({ name: "Same name", device_id: "other" });
  expect(primaryDeviceControl([other, battery, power, light], "device1")).toBe(
    light,
  );
  expect(primaryDeviceControl([light], "missing")).toBeUndefined();
  expect(primaryDeviceControl([light], null)).toBeUndefined();
  expect(primaryDeviceControl([battery, light])).toBe(light);
  expect(primaryDeviceControl([battery])).toBe(battery);
});
