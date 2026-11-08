import { describe, it, expect } from "vitest";
import { spotPriceLevel, spotPriceScale } from "./spotPriceColors";
describe("relative spot-price colors", () => {
  it("uses price magnitude so equal prices keep the same level across today and tomorrow", () => {
    const today = [1, 2, 3],
      tomorrow = [2, 3, 5],
      scale = spotPriceScale([...today, ...tomorrow]);
    expect(today.map((p) => spotPriceLevel(p, scale))).toEqual([
      "low",
      "medium",
      "high",
    ]);
    expect(tomorrow.map((p) => spotPriceLevel(p, scale))).toEqual([
      "medium",
      "high",
      "peak",
    ]);
  });
  it("keeps zero and negative prices green, including an entirely negative day", () => {
    const scale = spotPriceScale([-2, -1, 0, 0.2, 1]);
    expect([-2, -1, 0].map((p) => spotPriceLevel(p, scale))).toEqual([
      "low",
      "low",
      "low",
    ]);
    expect(spotPriceLevel(-0.1, spotPriceScale([-4, -0.1]))).toBe("low");
    expect(spotPriceLevel(1, scale)).toBe("peak");
  });
  it("does not pretend that uniform or single-price data has cheap and expensive periods", () => {
    expect(spotPriceLevel(2.1, spotPriceScale([2.1, 2.1, 2.1]))).toBe("steady");
    expect(spotPriceLevel(2.1, spotPriceScale([2.1]))).toBe("steady");
    expect(spotPriceLevel(2.1005, spotPriceScale([2.1, 2.1005]))).toBe(
      "steady",
    );
  });
  it("ignores invalid readings without inventing a zero-price observation", () => {
    expect(spotPriceScale([NaN, Infinity, 2, 4])).toEqual({ min: 2, max: 4 });
    expect(spotPriceScale([NaN, Infinity])).toBeNull();
    expect(spotPriceLevel(NaN, { min: 1, max: 2 })).toBe("unknown");
    expect(spotPriceLevel(1, null)).toBe("unknown");
  });
  it("does not reclassify other values when duplicate quarter-hour prices are added", () => {
    const values = [0.4, 0.8, 1.2, 1.8],
      copy = [...values];
    const levels = values.map((p) => spotPriceLevel(p, spotPriceScale(values)));
    expect(
      values.map((p) =>
        spotPriceLevel(p, spotPriceScale([...values, 0.4, 0.4, 0.8])),
      ),
    ).toEqual(levels);
    expect(values).toEqual(copy);
  });
});
