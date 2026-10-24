import { describe, it, expect } from "vitest";
import { routeWire, wirePath, blocked, type Box } from "./flowRouting";
const box = (id: string, x: number, y: number, height = 150): Box => ({
  id,
  x,
  y,
  width: 260,
  height,
});
describe("flow wire routing", () => {
  it("curves even perfectly aligned connections", () => {
    const path = wirePath(
      [
        { x: 0, y: 30 },
        { x: 100, y: 30 },
      ],
      [],
    );
    expect(path).toContain(" C");
    expect(path).not.toContain(" L");
    expect(path).not.toContain("C33.333333333333336 30");
  });
  it("routes vertically stacked cards around their boundaries with curves", () => {
    const a = box("a", 100, 40),
      b = box("b", 100, 340);
    const points = routeWire(a, b, [a, b]);
    expect(points[0]).toEqual({ x: 360, y: 105 });
    expect(points.at(-1)).toEqual({ x: 100, y: 405 });
    expect(points.length).toBeGreaterThan(3);
    for (let i = 1; i < points.length; i++)
      expect(blocked(points[i - 1], points[i], [a, b])).toBe(false);
    expect(wirePath(points, [])).toContain("Q");
  });
  it("avoids another card, including its measured height", () => {
    const a = box("a", 20, 60),
      b = box("b", 900, 60),
      obstacle = box("obstacle", 400, 20, 310);
    const points = routeWire(a, b, [a, b, obstacle]);
    expect(points.length).toBeGreaterThan(2);
    for (let i = 1; i < points.length; i++)
      expect(blocked(points[i - 1], points[i], [a, b, obstacle])).toBe(false);
  });
  it("adds bridges for horizontal and vertical crossings", () => {
    expect(
      wirePath(
        [
          { x: 0, y: 50 },
          { x: 100, y: 50 },
        ],
        [
          [
            { x: 50, y: 0 },
            { x: 50, y: 100 },
          ],
        ],
      ),
    ).toContain("Q50 36");
    expect(
      wirePath(
        [
          { x: 50, y: 0 },
          { x: 50, y: 100 },
        ],
        [
          [
            { x: 0, y: 50 },
            { x: 100, y: 50 },
          ],
        ],
      ),
    ).toContain("Q64 50");
  });
  it("does not add a bridge at a shared endpoint", () => {
    expect(
      wirePath(
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        [
          [
            { x: 0, y: 0 },
            { x: 0, y: 100 },
          ],
        ],
      ),
    ).not.toContain("Q");
  });
});
