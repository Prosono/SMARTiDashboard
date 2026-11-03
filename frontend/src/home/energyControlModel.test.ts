import { describe, expect, it } from "vitest";
import { priceHours } from "./energyControlModel";
import { osloMidnight } from "./energySummaryModel";

const rows = (day: string, count: number, minutes = 60) => {
  const start = osloMidnight(day);
  return Array.from({ length: count }, (_, i) => ({
    time_start: new Date(start + i * minutes * 60000).toISOString(),
    time_end: new Date(start + (i + 1) * minutes * 60000).toISOString(),
    NOK_per_kWh: i / 10,
  }));
};
describe("complete local price hours", () => {
  it("weights quarter-hour quotes instead of labelling each quote an hour", () => {
    const hours = priceHours(rows("2026-11-03", 96, 15), "2026-11-03");
    expect(hours).toHaveLength(24);
    expect(hours[0].price).toBeCloseTo(0.15);
    expect(hours[23].price).toBeCloseTo(9.35);
  });
  it("keeps negative prices and zero, but excludes incomplete and overlapping hours", () => {
    const prices = rows("2026-11-03", 24);
    prices[0].NOK_per_kWh = -1;
    const hours = priceHours(
      prices.filter((_, i) => i !== 3),
      "2026-11-03",
    );
    expect(hours).toHaveLength(23);
    expect(hours[0].price).toBe(-1);
    expect(priceHours([...prices, prices[1]], "2026-11-03")).toHaveLength(23);
    prices[0].NOK_per_kWh = 0;
    expect(priceHours(prices, "2026-11-03")[0].price).toBe(0);
  });
  it("keeps both repeated autumn hours and the shorter spring day", () => {
    for (const [day, count] of [
      ["2026-10-25", 25],
      ["2026-03-29", 23],
    ] as const)
      expect(priceHours(rows(day, count), day)).toHaveLength(count);
  });
  it("does not pull prices from neighbouring days", () => {
    expect(
      priceHours(
        [...rows("2026-11-02", 24), ...rows("2026-11-03", 24)],
        "2026-11-03",
      ),
    ).toHaveLength(24);
    expect(priceHours([], "2026-11-03")).toEqual([]);
  });
});
