import { expect, it } from "vitest";
import {
  smartiName,
  isSmartiIntegration,
  integrationName,
  homeDisplay,
} from "./branding";
import type { Home } from "./types";
it("brands names without mistaking unrelated integrations for the platform", () => {
  for (const value of [
    "Home Assistant Core",
    "HOME ASSISTANT Core",
    "HomeAssistant Core",
    "Home-Assistant Core",
    "HA Core",
  ])
    expect(smartiName(value)).toBe("SMARTi Core");
  for (const domain of [
    "hassio",
    "homeassistant",
    "homeassistant_hardware",
    "homeassistant_yellow",
  ]) {
    expect(isSmartiIntegration(domain)).toBe(true);
    expect(integrationName(domain)).toBe("SMARTi");
  }
  for (const domain of ["hue", "homekit", "zha", "mqtt"])
    expect(isSmartiIntegration(domain)).toBe(false);
  expect(smartiName("SHARP og Yamaha")).toBe("SHARP og Yamaha");
});
it("projects home display names without mutating technical identifiers or source", () => {
  const source = {
    home_name: "Home Assistant",
    controls: [
      {
        id: "homeassistant_1",
        entity_id: "sensor.homeassistant_core",
        name: "HA Core",
        integration: "homeassistant",
      },
    ],
  } as Home;
  const shown = homeDisplay(source);
  expect(shown.controls[0].name).toBe("SMARTi Core");
  expect(shown.controls[0].entity_id).toBe("sensor.homeassistant_core");
  expect(shown.controls[0].integration).toBe("homeassistant");
  expect(source.controls[0].name).toBe("HA Core");
});
