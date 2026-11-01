import { describe, expect, it } from "vitest";
import { energyBars } from "./energyBarsModel";
import type { MetricHistory } from "./metricHistory";
const base = Date.parse("2026-11-01T00:00:00Z"),
  hour = 3600000;
const history = (
  values: [number, number | null][],
  end = 3,
  basis: MetricHistory["basis"] = "reading",
): MetricHistory => ({
  basis,
  unit: basis === "reading" ? "W" : "kWh",
  start: new Date(base).toISOString(),
  end: new Date(base + end * hour).toISOString(),
  points: values.map(([h, value]) => ({
    time: new Date(base + h * hour).toISOString(),
    value,
  })),
});
describe("hourly energy columns", () => {
  it("weights real readings by duration, not the number of recorder updates", () => {
    const source = history([
        [0, 100],
        [0.75, 500],
        [1, 200],
        [2, 300],
      ]),
      before = structuredClone(source);
    expect(energyBars(source).map((b) => b.value)).toEqual([200, 200, 300]);
    expect(source).toEqual(before);
  });
  it("retains null intervals and partial hours without turning them into zero consumption", () => {
    const bars = energyBars(
      history(
        [
          [0, 0],
          [0.5, null],
          [2, 400],
        ],
        2.5,
      ),
    );
    expect(bars.map((b) => b.value)).toEqual([0, null, 400]);
    expect(bars.map((b) => b.coverage)).toEqual([hour / 2, 0, hour / 2]);
    expect(bars[2].ongoing).toBe(true);
  });
  it("colors low, typical and high readings using their own day, distinguishing export", () => {
    const bars = energyBars(
      history(
        [
          [0, 100],
          [6, 200],
          [12, 300],
          [18, 400],
          [23, -50],
        ],
        24,
      ),
    );
    expect(new Set(bars.map((b) => b.level))).toEqual(
      new Set(["low", "medium", "high", "export"]),
    );
    expect(energyBars(history([[0, 200]], 1))[0].level).toBe("unknown");
    expect(
      energyBars(history([[0, 200]], 3)).every((b) => b.level === "medium"),
    ).toBe(true);
  });
  it("uses completed counter changes directly, preserving gaps and rejecting counter resets as export", () => {
    const bars = energyBars(
      history(
        [
          [0, 1],
          [1, null],
          [2, 2],
          [3, -1],
        ],
        4,
        "hourly",
      ),
    );
    expect(bars.map((b) => b.value)).toEqual([1, null, 2, -1]);
    expect(bars[3].level).toBe("unknown");
    expect(
      energyBars(
        history(
          [
            [0, 10000],
            [1, 11000],
          ],
          3,
          "counter",
        ),
      ),
    ).toEqual([]);
  });
  it("caps the window at 24 absolute hours across repeated local hours and excludes the next hour", () => {
    const source = history(
        [
          [0, 100],
          [25, 900],
        ],
        25,
      ),
      bars = energyBars(source);
    expect(bars).toHaveLength(24);
    expect(bars[0].time).toBe(base + hour);
    expect(bars.at(-1)!.value).toBe(100);
    expect(energyBars({ ...source, start: undefined })).toEqual([]);
    expect(energyBars({ ...source, end: source.start })).toEqual([]);
  });
});
