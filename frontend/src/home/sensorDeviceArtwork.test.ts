import { expect, it } from "vitest";
import type { Control } from "../types";
import { sensorArtworkKind } from "./sensorDeviceArtwork";
import { isAirConditioner } from "./equipmentModel";

const control = (
  name: string,
  attributes: Record<string, unknown> = {},
): Control => ({
  id: "sensor.fixture",
  entity_id: "sensor.fixture",
  name,
  attributes,
  domain: "sensor",
  state: "0",
  device_id: null,
  area_id: null,
  availability: "available",
  diagnostic: false,
  capabilities: [],
  updated_at: null,
  integration: null,
});
it("gives real and computed entities suitable categories without changing their hardware domain", () => {
  for (const [name, attributes, kind] of [
    [
      "Strømgevinst energi total",
      { device_class: "energy", unit_of_measurement: "kWh" },
      "meter",
    ],
    ["Effekt", { unit_of_measurement: "W" }, "meter"],
    ["Strømgevinst opptjent total", { unit_of_measurement: "NOK" }, "money"],
    ["Kostnad", { device_class: "monetary" }, "money"],
    [
      "Backup Next scheduled automatic backup",
      { device_class: "timestamp" },
      "backup",
    ],
    ["Backup manager state", {}, "backup"],
    [
      "Stue AC Current Temperature",
      { device_class: "temperature" },
      "air-conditioner",
    ],
    ["Stue AC Mode", {}, "air-conditioner"],
    ["Vaskemaskin program", {}, "washing-machine"],
    ["Tumble dryer cycle", {}, "tumble-dryer"],
    ["Oppvaskmaskin status", {}, "dishwasher"],
    ["Kjøleskap modus", {}, "refrigerator"],
    ["Roode Combined People Inside", {}, "presence"],
    ["Temperatur", { device_class: "temperature" }, "temperature-sensor"],
    ["Utetemperatur", { unit_of_measurement: "°C" }, "temperature-sensor"],
    ["Room reading", { unit_of_measurement: "°F" }, "temperature-sensor"],
    ["Luftfuktighet", { device_class: "humidity" }, "environment"],
    ["Batteri", { device_class: "battery" }, "battery"],
    ["Tidspunkt", { device_class: "timestamp" }, "calendar"],
    ["Ukjent sensortype", {}, "data"],
  ] as const) {
    const c = control(name, attributes);
    expect(sensorArtworkKind(c)).toBe(kind);
    expect(c.domain).toBe("sensor");
    expect(isAirConditioner(c)).toBe(false);
  }
  expect(
    sensorArtworkKind({ ...control("Lampe"), domain: "light" }),
  ).toBeNull();
});
it("uses declared measurements before incidental names", () => {
  expect(
    sensorArtworkKind(
      control("AC forbruk", {
        device_class: "energy",
        unit_of_measurement: "kWh",
      }),
    ),
  ).toBe("meter");
  expect(
    sensorArtworkKind(control("AC kostnad", { unit_of_measurement: "kr/kWh" })),
  ).toBe("money");
  expect(
    sensorArtworkKind(
      control("Kjøleskap effekt", { unit_of_measurement: "W" }),
    ),
  ).toBe("meter");
});
