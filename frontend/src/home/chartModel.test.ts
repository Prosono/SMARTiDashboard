import { describe, expect, it } from "vitest";
import {
  chartSegments,
  measuredGeometry,
  measuredPath,
  nearestSample,
} from "./chartModel";

const point = (hour: number, value: number | null) => ({
  time: `2026-11-01T${String(hour).padStart(2, "0")}:00:00Z`,
  value,
});
describe("measured chart geometry", () => {
  it("preserves missing and invalid samples as separate curve segments", () => {
    const points = [
      point(0, 0),
      point(1, 2),
      point(2, null),
      point(3, 5),
      { time: "invalid", value: 7 },
      point(4, Infinity),
      point(5, 3),
    ];
    expect(chartSegments(points).map((s) => s.map((p) => p.value))).toEqual([
      [0, 2],
      [5],
      [3],
    ]);
    const geometry = measuredGeometry([{ id: "a", name: "A", points }])!;
    expect(geometry.low).toBe(0);
    expect(geometry.high).toBe(5);
    expect(
      measuredGeometry([
        {
          id: "bad",
          name: "Bad",
          points: [point(0, null), point(1, Infinity)],
        },
      ]),
    ).toBeNull();
  });
  it("uses shared timestamps and readable scales for unequal source sample times", () => {
    const a = [point(0, 18), point(4, 22)],
      b = [point(2, 20), point(6, null)];
    const g = measuredGeometry([
      { id: "a", name: "A", points: a },
      { id: "b", name: "B", points: b },
    ])!;
    expect(g.start).toBe(Date.parse(a[0].time));
    expect(g.end).toBe(Date.parse(b[1].time));
    expect(g.x(Date.parse(b[0].time))).toBeCloseTo(
      (g.x(Date.parse(a[0].time)) + g.x(Date.parse(a[1].time))) / 2,
    );
    expect(g.ticks.length).toBeGreaterThan(1);
    expect(g.ticks.length).toBeLessThanOrEqual(7);
    expect(g.ticks.every(Number.isFinite)).toBe(true);
    const zero = measuredGeometry([
      { id: "zero", name: "Zero", points: [point(0, 0)] },
    ])!;
    expect(zero.x(Date.parse(point(0, 0).time))).toBe(240);
    expect(Number.isFinite(zero.y(0))).toBe(true);
  });
  it("never reports an interpolated value or extends a source beyond its observed interval", () => {
    const points = [point(0, 18), point(1, null), point(3, 24)];
    expect(
      nearestSample(points, Date.parse(point(1, 0).time))?.value,
    ).toBeNull();
    expect(nearestSample(points, Date.parse(point(2, 0).time))).toEqual(
      points[1],
    );
    expect(nearestSample(points, Date.parse(point(4, 0).time))).toBeNull();
  });
  it("keeps smoothed curves inside each pair of measured values, including peaks", () => {
    const points = [
      { x: 0, y: 90 },
      { x: 20, y: 10 },
      { x: 32, y: 65 },
      { x: 100, y: 0 },
      { x: 120, y: 0 },
    ];
    const path = measuredPath(points);
    const curves = [
      ...path.matchAll(
        /C([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+)/g,
      ),
    ];
    expect(curves).toHaveLength(4);
    curves.forEach((curve, i) => {
      const [, , ay, , by, , endY] = curve.map(Number),
        startY = points[i].y;
      for (let step = 0; step <= 20; step++) {
        const t = step / 20,
          s = 1 - t,
          value =
            s ** 3 * startY +
            3 * s * s * t * ay +
            3 * s * t * t * by +
            t ** 3 * endY;
        expect(value).toBeGreaterThanOrEqual(Math.min(startY, endY) - 0.001);
        expect(value).toBeLessThanOrEqual(Math.max(startY, endY) + 0.001);
      }
    });
    expect(
      measuredPath([
        { x: 0, y: 1 },
        { x: 0, y: 2 },
      ]),
    ).toContain(" L");
  });
});
