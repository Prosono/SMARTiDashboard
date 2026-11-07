import { expect, it } from "vitest";
import type { Control } from "./types";
import { sensorDisplayValue } from "./sensorValueModel";
const sensor = (
  state: string,
  attributes: Record<string, unknown> = {},
): Control => ({
  id: "sensor.value",
  entity_id: "sensor.value",
  name: "Måling",
  state,
  attributes,
  domain: "sensor",
  availability: "available",
  device_id: null,
  area_id: null,
  diagnostic: false,
  updated_at: null,
  integration: null,
  capabilities: [],
});
it("localizes measured values while preserving zero, negatives, units and the original precision", () => {
  const c = sensor("1783.80692", {
    device_class: "energy",
    unit_of_measurement: "kWh",
  });
  expect(sensorDisplayValue(c, "nb").value.replace(/\s/g, " ")).toBe(
    "1 783,807",
  );
  expect(c.state).toBe("1783.80692");
  expect(sensorDisplayValue(c, "en").value).toBe("1,783.807");
  expect(
    sensorDisplayValue(
      sensor("166.17641", { unit_of_measurement: "NOK" }),
      "nb",
    ).value,
  ).toBe("166,18");
  expect(
    sensorDisplayValue(sensor("0", { unit_of_measurement: "W" }), "nb").value,
  ).toBe("0");
  expect(
    sensorDisplayValue(sensor("-9", { unit_of_measurement: "°C" }), "en").value,
  ).toBe("-9");
  expect(
    sensorDisplayValue(
      sensor("0.0000075", { unit_of_measurement: "kWh" }),
      "en",
    ).value,
  ).toBe("0.0000075");
});
it("splits valid timestamps into local date/time and keeps unknown states honest", () => {
  const raw = "2026-11-08T04:14:23+00:00";
  const display = sensorDisplayValue(
    sensor(raw, { device_class: "timestamp" }),
    "nb",
  );
  expect(display.kind).toBe("timestamp");
  expect(display.value).toBe("08.11.2026");
  expect(display.secondary).toBe(
    new Date(raw).toLocaleTimeString("nb-NO", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  );
  expect(sensorDisplayValue(sensor("2026-11-08"), "nb").value).toBe(
    "08.11.2026",
  );
  expect(sensorDisplayValue(sensor("2026-02-31"), "nb").kind).toBe("text");
  expect(
    sensorDisplayValue(sensor("unknown", { unit_of_measurement: "kWh" }), "nb"),
  ).toMatchObject({ kind: "text", value: "Ukjent", unit: "" });
  expect(
    sensorDisplayValue(
      sensor("not a date", { device_class: "timestamp" }),
      "en",
    ).value,
  ).toBe("not a date");
});
