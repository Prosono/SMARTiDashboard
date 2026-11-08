import { describe, it, expect } from "vitest";
import {
  routeWire,
  routeConnection,
  wirePath,
  smoothWirePath,
  blocked,
  createWireRouter,
  type Box,
  type Point,
} from "./flowRouting";
const box = (id: string, x: number, y: number, height = 150): Box => ({
  id,
  x,
  y,
  width: 260,
  height,
});
// Inspect the SVG actually drawn, rather than only the router's control polygon.
function cubics(path: string): Point[][] {
  const numbers = path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  let start = { x: numbers[0], y: numbers[1] };
  const result: Point[][] = [];
  for (let i = 2; i < numbers.length; i += 6) {
    const next = [
      start,
      { x: numbers[i], y: numbers[i + 1] },
      { x: numbers[i + 2], y: numbers[i + 3] },
      { x: numbers[i + 4], y: numbers[i + 5] },
    ];
    result.push(next);
    start = next[3];
  }
  return result;
}
function expectClear(path: string, boxes: Box[]) {
  expect(path).not.toBe("");
  for (const [a, b, c, d] of cubics(path)) {
    for (let i = 1; i < 200; i++) {
      const t = i / 200,
        u = 1 - t;
      const x =
        u ** 3 * a.x +
        3 * u ** 2 * t * b.x +
        3 * u * t ** 2 * c.x +
        t ** 3 * d.x;
      const y =
        u ** 3 * a.y +
        3 * u ** 2 * t * b.y +
        3 * u * t ** 2 * c.y +
        t ** 3 * d.y;
      expect(
        boxes.some(
          (r) =>
            x > r.x + 0.02 &&
            x < r.x + r.width - 0.02 &&
            y > r.y + 0.02 &&
            y < r.y + r.height - 0.02,
        ),
      ).toBe(false);
    }
  }
}
function expectSmooth(path: string) {
  const curves = cubics(path);
  for (let i = 1; i < curves.length; i++) {
    const before = curves[i - 1],
      after = curves[i];
    const incoming = {
      x: before[3].x - before[2].x,
      y: before[3].y - before[2].y,
    };
    const outgoing = { x: after[1].x - after[0].x, y: after[1].y - after[0].y };
    const product =
      Math.hypot(incoming.x, incoming.y) * Math.hypot(outgoing.x, outgoing.y);
    if (product > 0.001) {
      expect(
        (incoming.x * outgoing.x + incoming.y * outgoing.y) / product,
      ).toBeGreaterThan(0.999);
    }
  }
}
describe("flow wire routing", () => {
  it("keeps aligned wires straight without artificial bows or crossing humps", () => {
    const points = [
      { x: 0, y: 50 },
      { x: 100, y: 50 },
    ];
    const crossing = [
      [
        { x: 50, y: 0 },
        { x: 50, y: 100 },
      ],
    ];
    expect(wirePath(points, crossing)).toBe(wirePath(points));
    expect(
      cubics(wirePath(points)).every((c) => c.every((p) => p.y === 50)),
    ).toBe(true);
  });
  it("uses a sweeping curve even where another connection crosses", () => {
    const a = box("a", 20, 20),
      b = box("b", 650, 240);
    const points = routeWire(a, b, [a, b]);
    const path = smoothWirePath(
      points,
      [a, b],
      [
        [
          { x: 400, y: 0 },
          { x: 400, y: 500 },
        ],
      ],
    )!;
    expect(cubics(path)).toHaveLength(1);
    expectClear(path, [a, b]);
    expect(
      smoothWirePath(points, [a, b, box("obstacle", 350, 40, 350)]),
    ).toBeNull();
  });
  it.each([
    [box("a", 20, 20), box("b", 290, 20)],
    [box("a", 100, 40), box("b", 100, 340)],
    [box("a", 900, 40), box("b", 100, 380)],
    [box("a", 900, 400), box("b", 100, 40)],
    [box("a", 20, 60), box("b", 900, 60), box("obstacle", 400, 20, 310)],
    [
      box("a", 20, 60),
      box("b", 1200, 60),
      box("x", 400, 0, 260),
      box("y", 750, 100, 350),
    ],
  ])(
    "clears measured card boundaries with tangent-continuous curves %#",
    (...boxes: Box[]) => {
      const points = routeWire(boxes[0], boxes[1], boxes);
      for (let i = 1; i < points.length; i++)
        expect(blocked(points[i - 1], points[i], boxes)).toBe(false);
      const route = routeConnection(boxes[0], boxes[1], boxes);
      expectClear(route.path, boxes);
      expectSmooth(route.path);
      const segments = cubics(route.path);
      expect(segments[0][1].x).toBeGreaterThanOrEqual(segments[0][0].x);
      expect(segments.at(-1)![2].x).toBeLessThanOrEqual(segments.at(-1)![3].x);
    },
  );
  it("does not draw a wire through overlapping cards", () => {
    const boxes = [box("a", 100, 40), box("b", 300, 40)];
    expect(routeConnection(boxes[0], boxes[1], boxes).path).toBe("");
  });
});
describe("incremental wire routing", () => {
  const a = box("a", 20, 20),
    b = box("b", 900, 20),
    remote = box("remote", 1600, 900);
  const edges = [{ from: "a", to: "b" }];
  it("reuses unaffected wires but reroutes moved/resized endpoints", () => {
    const route = createWireRouter();
    const first = route([a, b, remote], edges)[0];
    expect(route([a, b, { ...remote, y: 1000 }], edges)[0]).toBe(first);
    const changed = route([a, { ...b, y: 300 }, remote], edges)[0];
    expect(changed).not.toBe(first);
    expectClear(changed.path, [a, { ...b, y: 300 }, remote]);
    expect(route([{ ...a, height: 200 }, b, remote], edges)[0]).not.toBe(
      changed,
    );
  });
  it("invalidates old/new obstacle positions and added/removed cards", () => {
    const route = createWireRouter();
    const straight = route([a, b], edges)[0];
    const obstruction = box("new", 400, 0, 300);
    const detour = route([a, b, obstruction], edges)[0];
    expect(detour).not.toBe(straight);
    expectClear(detour.path, [a, b, obstruction]);
    const removed = route([a, b], edges)[0];
    expect(removed).not.toBe(detour);
    expect(removed.path).toBe(straight.path);
    route([a, b, remote], edges);
    expectClear(route([a, b, { ...remote, x: 400, y: 0 }], edges)[0].path, [
      a,
      b,
      { ...remote, x: 400, y: 0 },
    ]);
  });
  it("retries obstructed wires and prunes deleted/reordered edges", () => {
    const route = createWireRouter();
    const overlap = box("overlap", 200, 20);
    expect(route([a, b, overlap], edges)[0].path).toBe("");
    expect(route([a, b], edges)[0].path).not.toBe("");
    expect(route([a, b], [])).toEqual([]);
    expect(route([a, b], [{ from: "b", to: "a" }])).toHaveLength(1);
  });
});
