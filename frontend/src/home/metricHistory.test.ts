import { describe, expect, it } from "vitest";
import { loadMetricHistory } from "./metricHistory";
import type { Control } from "../types";
const c = (unit = "W"): Control => ({
  id: "opaque",
  entity_id: "sensor.power",
  domain: "sensor",
  state: "7500",
  name: "Power",
  attributes: { unit_of_measurement: unit },
  availability: "available",
  capabilities: [],
  diagnostic: false,
  device_id: null,
  area_id: null,
  updated_at: null,
  integration: null,
});
const points = [
  { time: "2026-11-01T10:00:00Z", value: 1000 },
  { time: "2026-11-01T11:00:00Z", value: null },
  { time: "2026-11-01T12:00:00Z", value: 2000 },
];
describe("metric recorder history", () => {
  it("reads raw power history first and preserves real gaps", async () => {
    const paths: string[] = [];
    const result = await loadMetricHistory(c(), "energy", async (path) => {
      paths.push(path);
      return { points, unit: "W" };
    });
    expect(paths).toEqual(["controls/sensor.power/history?hours=24"]);
    expect(result.points).toEqual(points);
    expect(result.unit).toBe("W");
  });
  it.each(["empty", "error"])(
    "falls back from %s recorder states and converts kW statistics to W",
    async (mode) => {
      const paths: string[] = [];
      const result = await loadMetricHistory(c(), "energy", async (path) => {
        paths.push(path);
        if (path.startsWith("controls")) {
          if (mode === "error") throw Error("missing");
          return { points: [] };
        }
        return {
          series: [
            {
              id: "opaque",
              unit: "kW",
              current: {
                points: points.map((p) => ({
                  ...p,
                  value: p.value === null ? null : p.value / 1000,
                })),
              },
            },
          ],
        };
      });
      expect(paths[1]).toContain("ids=opaque");
      expect(result.points).toEqual(points);
    },
  );
  it("uses hourly energy changes rather than coloring a cumulative counter", async () => {
    const result = await loadMetricHistory(c("Wh"), "energy", async (path) => {
      expect(path).toContain("statistics");
      return { series: [{ id: "opaque", unit: "kWh", current: { points } }] };
    });
    expect(result.basis).toBe("hourly");
    expect(result.unit).toBe("kWh");
  });
  it("can show raw counter history without pretending it is hourly consumption", async () => {
    const result = await loadMetricHistory(c("kWh"), "energy", async (path) =>
      path.startsWith("controls") ? { points, unit: "kWh" } : { series: [] },
    );
    expect(result.basis).toBe("counter");
    expect(result.points).toEqual(points);
  });
  it("normalizes temperature units and clips initial known state to the requested window", async () => {
    const result = await loadMetricHistory(
      c("°C"),
      "temperature",
      async () => ({
        unit: "°F",
        start: "2026-11-01T10:30:00Z",
        end: "2026-11-01T12:00:00Z",
        points: [
          { time: points[0].time, value: 68 },
          { time: points[1].time, value: null },
          { time: points[2].time, value: 77 },
          { time: "2026-11-01T13:00:00Z", value: 90 },
        ],
      }),
    );
    expect(result.points).toEqual([
      { time: "2026-11-01T10:30:00.000Z", value: 20 },
      { time: points[1].time, value: null },
      { time: points[2].time, value: 25 },
    ]);
  });
  it("does not plot incompatible units or another source's statistics", async () => {
    const result = await loadMetricHistory(c(), "energy", async (path) =>
      path.startsWith("controls")
        ? { points, unit: "kWh" }
        : { series: [{ id: "other", unit: "kW", current: { points } }] },
    );
    expect(result.points).toEqual([]);
  });
  it("distinguishes empty successful history from a failed source", async () => {
    expect(
      (await loadMetricHistory(c(), "energy", async () => ({ points: [] })))
        .points,
    ).toEqual([]);
    await expect(
      loadMetricHistory(c(), "energy", async () => {
        throw Error("offline");
      }),
    ).rejects.toThrow("offline");
  });
});
