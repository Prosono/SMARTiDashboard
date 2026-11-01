import { describe, expect, it } from "vitest";
import { consumptionRange, metricAssessment } from "./metricAssessment";
import type { MetricHistory } from "./metricHistory";
import type { Control } from "../types";
const c = (state = "7500", unit = "W"): Control => ({
  id: "power",
  entity_id: "sensor.power",
  domain: "sensor",
  state,
  name: "Reading",
  attributes: { unit_of_measurement: unit },
  availability: "available",
  capabilities: [],
  diagnostic: false,
  device_id: null,
  area_id: null,
  updated_at: null,
  integration: null,
});
const history: MetricHistory = {
  basis: "reading",
  unit: "W",
  start: "2026-11-01T00:00:00Z",
  end: "2026-11-02T00:00:00Z",
  points: [1000, 2000, 3000, 4000].map((value, i) => ({
    time: `2026-11-01T${String(i * 6).padStart(2, "0")}:00:00Z`,
    value,
  })),
};
describe("measurement level surfaces", () => {
  it("compares power with time-weighted recorded quartiles", () => {
    expect(consumptionRange(history)).toEqual([1000, 3000]);
    for (const [value, level] of [
      [0, "low"],
      [500, "low"],
      [2500, "medium"],
      [7500, "high"],
    ] as const)
      expect(
        metricAssessment(c(String(value)), "energy", history, false, "nb")
          .level,
      ).toBe(level);
  });
  it("does not over-weight a burst of frequent changes", () => {
    const burst = {
      ...history,
      points: [
        { time: "2026-11-01T00:00:00Z", value: 1000 },
        ...Array.from({ length: 20 }, (_, i) => ({
          time: `2026-11-01T23:${String(i).padStart(2, "0")}:00Z`,
          value: 9000,
        })),
      ],
    };
    expect(consumptionRange(burst)).toEqual([1000, 1000]);
  });
  it("keeps missing intervals, insufficient coverage, counters and offline readings unclassified", () => {
    expect(
      consumptionRange({
        ...history,
        points: history.points.map((p) => ({ ...p, value: null })),
      }),
    ).toBeNull();
    expect(
      consumptionRange({
        ...history,
        end: "2026-11-01T01:00:00Z",
        points: [history.points[0]],
      }),
    ).toBeNull();
    expect(metricAssessment(c(), "energy", undefined, false, "nb").level).toBe(
      "unknown",
    );
    expect(metricAssessment(c(), "energy", history, true, "nb").level).toBe(
      "unknown",
    );
    expect(
      metricAssessment(
        c("100000", "Wh"),
        "energy",
        { ...history, basis: "counter" },
        false,
        "nb",
      ).level,
    ).toBe("unknown");
  });
  it("recognizes negative export rather than high consumption", () => {
    expect(
      metricAssessment(c("-2000"), "energy", history, false, "nb").level,
    ).toBe("export");
  });
  it("uses the latest hourly change for an energy counter and keeps a missing last hour unknown", () => {
    expect(
      metricAssessment(
        c("999999", "Wh"),
        "energy",
        { ...history, basis: "hourly" },
        false,
        "nb",
      ).level,
    ).toBe("high");
    const missing = {
      ...history,
      basis: "hourly" as const,
      points: [
        ...history.points,
        { time: "2026-11-01T23:00:00Z", value: null },
      ],
    };
    expect(
      metricAssessment(c("999999", "Wh"), "energy", missing, false, "nb").level,
    ).toBe("unknown");
  });
  it("does not interpret a negative energy-counter change as consumption or power export", () => {
    const reset = {
      ...history,
      basis: "hourly" as const,
      points: [...history.points, { time: "2026-11-01T23:00:00Z", value: -1 }],
    };
    expect(
      metricAssessment(c("100", "kWh"), "energy", reset, false, "nb").level,
    ).toBe("unknown");
  });
  it("normalizes Fahrenheit and distinguishes cool, middle, warm and high temperatures", () => {
    for (const [value, level] of [
      [32, "cold"],
      [68, "normal"],
      [77, "warm"],
      [86, "high"],
    ] as const)
      expect(
        metricAssessment(
          c(String(value), "°F"),
          "temperature",
          undefined,
          false,
          "nb",
        ).level,
      ).toBe(level);
  });
  it("supports zero humidity and changes continuously from white toward blue", () => {
    const colors = [0, 25, 50, 75, 100].map((v) =>
      metricAssessment(c(String(v), "%"), "humidity", undefined, false, "nb"),
    );
    expect(colors.every((a) => a.level === "humidity")).toBe(true);
    expect(new Set(colors.map((a) => a.style.background)).size).toBe(5);
    for (const v of [-1, 101])
      expect(
        metricAssessment(c(String(v), "%"), "humidity", undefined, false, "nb")
          .level,
      ).toBe("unknown");
  });
  it("keeps text readable throughout the humidity color scale", () => {
    const lum = (rgb: number[]) =>
      rgb
        .map((v) => v / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
    for (let humidity = 0; humidity <= 100; humidity++) {
      const style = metricAssessment(
        c(String(humidity), "%"),
        "humidity",
        undefined,
        false,
        "nb",
      ).style as Record<string, string>;
      const rgb = style["--card-color"].match(/\d+/g)!.map(Number),
        ink = style["--text"]
          .slice(1)
          .match(/../g)!
          .map((h) => parseInt(h, 16));
      const a = lum(rgb),
        b = lum(ink);
      expect(
        (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
