import { describe, expect, it } from "vitest";
import { energySensorReading } from "./energySensorReading";

describe("energy sensor readings", () => {
  it("preserves zero, direction, decimals and units", () => {
    expect(energySensorReading("0", "W")).toBe("0 W");
    expect(energySensorReading("-12.45", "kW")).toBe("−12,45 kW");
    expect(energySensorReading("74", "%")).toBe("74 %");
  });
  it("distinguishes missing and unavailable readings from zero", () => {
    for (const state of [undefined, "", " ", "unknown", "NaN", "Infinity"])
      expect(energySensorReading(state, "W")).toBe("Ingen måling");
    expect(energySensorReading("unavailable", "W")).toBe("Utilgjengelig");
    expect(energySensorReading("1.25", "kWh", "en")).toBe("1.25 kWh");
  });
});
