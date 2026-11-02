import { describe, expect, it } from "vitest";
import {
  energySummaryBars,
  finiteReading,
  osloMidnight,
  type SummaryPoint,
  type SummaryPrice,
} from "./energySummaryModel";

const hour = 3600000;
const day = "2026-11-02",
  next = "2026-11-03",
  first = osloMidnight(day);
const stamp = (h: number) => new Date(first + h * hour).toISOString();
const reading = (
  h: number,
  value: number | string | null,
  cost: SummaryPoint["cost"] = { total: value },
): SummaryPoint => ({ start: stamp(h), end: stamp(h + 1), kwh: value, cost });
const price = (h: number, value: number, duration = 1): SummaryPrice => ({
  time_start: stamp(h),
  time_end: stamp(h + duration),
  NOK_per_kWh: value,
});
const base = { start: day, end: next, now: first + 12 * hour };

describe("native energy summary charts", () => {
  it("keeps actual zero, missing hours and future hours distinct, without changing source data", () => {
    const points = [
      reading(0, "0"),
      reading(1, null),
      reading(2, "1.25"),
      reading(20, 99),
    ];
    const copy = structuredClone(points);
    const bars = energySummaryBars({ ...base, kind: "consumption", points });
    expect(bars).toHaveLength(24);
    expect(bars.slice(0, 4).map((b) => b.value)).toEqual([0, null, 1.25, null]);
    expect(bars[20]).toMatchObject({ value: null, future: true });
    expect(bars[1]).toMatchObject({
      value: null,
      future: false,
      partial: true,
    });
    expect(points).toEqual(copy);
  });
  it("uses Home's own-history levels and marks provisional readings", () => {
    const points = Array.from({ length: 12 }, (_, h) => reading(h, h + 1));
    points[3].partial = true;
    const bars = energySummaryBars({ ...base, kind: "consumption", points });
    expect(bars[0].level).toBe("low");
    expect(bars[6].level).toBe("medium");
    expect(bars[11].level).toBe("high");
    expect(bars[3].partial).toBe(true);
    expect(
      energySummaryBars({
        ...base,
        kind: "consumption",
        points: [reading(0, 4)],
      })[0].level,
    ).toBe("unknown");
  });
  it("preserves price interval widths, negative prices, holes and Oslo day boundaries", () => {
    const bars = energySummaryBars({
      ...base,
      kind: "spot",
      prices: [price(2, 2, 0.25), price(0, -0.5), price(-1, 9), price(24, 9)],
    });
    expect(bars.map((b) => b.value)).toEqual([-50, null, 200, null]);
    expect(bars[1]).toMatchObject({
      start: first + hour,
      end: first + 2 * hour,
    });
    expect(bars[2].end - bars[2].start).toBe(hour / 4);
    expect(bars.at(-1)?.end).toBe(osloMidnight(next));
  });
  it("weights price bands by duration rather than the number of quarter-hour quotes", () => {
    const prices = [
      price(0, -1, 6),
      price(6, 1, 12),
      ...Array.from({ length: 24 }, (_, n) => price(18 + n / 4, 3, 0.25)),
    ];
    const bars = energySummaryBars({ ...base, kind: "spot", prices });
    expect(bars[0].level).toBe("low");
    expect(bars[1].level).toBe("medium");
    expect(bars.at(-1)?.level).toBe("high");
  });
  it("stacks reported cost components exactly, retaining discounts and tax signs", () => {
    const parts = {
      electricity: "1.5",
      markup: ".1",
      grid: ".4",
      electricity_tax: ".1",
      enova: ".01",
      support: "-.5",
      vat: ".4025",
    };
    const bars = energySummaryBars({
      ...base,
      kind: "cost",
      points: [reading(0, 1, { total: "2.0125", parts })],
    });
    expect(bars[0].value).toBe(2.0125);
    for (const [key, value] of Object.entries({
      electricity: 1.6,
      grid: 0.4,
      tax: 0.5125,
      support: -0.5,
    }))
      expect(
        bars[0].parts?.[key as keyof NonNullable<(typeof bars)[0]["parts"]>],
      ).toBeCloseTo(value, 10);
    expect(
      Object.values(bars[0].parts!).reduce((sum, n) => sum + n, 0),
    ).toBeCloseTo(bars[0].value!);
    expect(bars[1].value).toBeNull();
  });
  it("does not manufacture a breakdown when parts are missing, nonfinite or inconsistent", () => {
    const bars = energySummaryBars({
      ...base,
      kind: "cost",
      points: [
        reading(0, 1, { total: 2 }),
        reading(1, 1, { total: 2, parts: { electricity: 99 } }),
        reading(2, 1, { total: 2, parts: { electricity: Infinity } }),
        reading(3, 1, { total: 0, parts: { electricity: 0 } }),
        reading(4, 1, { total: null, parts: { electricity: 99 } }),
      ],
    });
    expect(bars.slice(0, 3).map((b) => b.parts)).toEqual([null, null, null]);
    expect(bars[3]).toMatchObject({ value: 0, parts: { electricity: 0 } });
    expect(bars[4]).toMatchObject({ value: null, parts: null });
  });
  it("aggregates calendar days and months without making gaps into known zeroes", () => {
    const points = [reading(0, 2), reading(1, 3), reading(24, 4)];
    const bars = energySummaryBars({
      ...base,
      kind: "consumption",
      points,
      end: "2026-11-09",
      now: first + 7 * 24 * hour,
    });
    expect(bars).toHaveLength(7);
    expect(bars.slice(0, 3).map((b) => b.value)).toEqual([5, 4, null]);
    expect(bars[0].partial).toBe(true);
    const months = energySummaryBars({
      kind: "cost",
      start: "2026-01-01",
      end: "2027-01-01",
      now: osloMidnight("2027-01-01"),
      points,
    });
    expect(months).toHaveLength(12);
    expect(months[10].value).toBe(9);
    expect(months[0].value).toBeNull();
  });
  it("keeps all 23 or 25 real hours on daylight-saving days", () => {
    for (const [start, end, count] of [
      ["2026-03-29", "2026-03-30", 23],
      ["2026-10-25", "2026-10-26", 25],
    ] as const) {
      const bars = energySummaryBars({
        kind: "consumption",
        start,
        end,
        now: osloMidnight(end),
      });
      expect(bars).toHaveLength(count);
      expect(bars.at(-1)!.end - bars[0].start).toBe(count * hour);
    }
  });
  it("rejects invalid readings and dates without rounding real zero to missing", () => {
    for (const value of [
      null,
      undefined,
      "",
      " ",
      NaN,
      Infinity,
      "broken",
      false,
    ])
      expect(finiteReading(value)).toBeNull();
    expect(finiteReading("0")).toBe(0);
    expect(
      energySummaryBars({ ...base, kind: "spot", start: "broken" }),
    ).toEqual([]);
    expect(
      energySummaryBars({ ...base, kind: "consumption", end: "broken" }),
    ).toEqual([]);
  });
});
