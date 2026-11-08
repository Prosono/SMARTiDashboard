/** Obstacle-aware, tangent-continuous connections in logical canvas units. */
export type Point = { x: number; y: number };
export type Box = Point & { id: string; width: number; height: number };
export function blocked(a: Point, b: Point, boxes: Box[]) {
  return boxes.some((r) =>
    a.x === b.x
      ? a.x > r.x &&
        a.x < r.x + r.width &&
        Math.max(a.y, b.y) > r.y &&
        Math.min(a.y, b.y) < r.y + r.height
      : a.y > r.y &&
        a.y < r.y + r.height &&
        Math.max(a.x, b.x) > r.x &&
        Math.min(a.x, b.x) < r.x + r.width,
  );
}
export function routeWire(
  source: Box,
  target: Box,
  all: Box[],
  lane = 0,
): Point[] {
  const start = { x: source.x + source.width, y: source.y + 65 };
  const end = { x: target.x, y: target.y + 65 };
  const gap =
    end.x > start.x
      ? Math.min(64 + lane * 12, (end.x - start.x) / 3)
      : 64 + lane * 12;
  const clearance = Math.min(36, Math.max(4, gap - 8));
  const a = { x: start.x + gap, y: start.y },
    b = { x: end.x - gap, y: end.y };
  if (
    blocked(
      start,
      a,
      all.filter((r) => r.id !== source.id),
    ) ||
    blocked(
      b,
      end,
      all.filter((r) => r.id !== target.id),
    )
  )
    return [];
  const obstacles = all.map((r) => ({
    ...r,
    x: r.x - clearance,
    y: r.y - clearance,
    width: r.width + clearance * 2,
    height: r.height + clearance * 2,
  }));
  // Most edits leave a clear elbow route. Avoid building/searching the full
  // visibility grid unless another card actually blocks both simple paths.
  for (const corner of [
    { x: b.x, y: a.y },
    { x: a.x, y: b.y },
  ]) {
    const middle = [a, corner, b];
    if (!blocked(a, corner, obstacles) && !blocked(corner, b, obstacles))
      return simplifyRoute([start, ...middle, end]);
  }
  // A single generous return lane is more stable than an arbitrary staircase
  // through equal-cost grid cells, especially when the target is to the left.
  const lanes = [
    ...new Set([
      (a.y + b.y) / 2,
      ...obstacles.flatMap((r) => [r.y - 8, r.y + r.height + 8]),
    ]),
  ].sort(
    (x, y) =>
      Math.abs(x - a.y) +
      Math.abs(x - b.y) -
      (Math.abs(y - a.y) + Math.abs(y - b.y)),
  );
  for (const y of lanes) {
    const left = { x: a.x, y },
      right = { x: b.x, y };
    if (
      !blocked(a, left, obstacles) &&
      !blocked(left, right, obstacles) &&
      !blocked(right, b, obstacles)
    )
      return simplifyRoute([start, a, left, right, b, end]);
  }
  const xs = [
    ...new Set([
      a.x,
      b.x,
      ...obstacles.flatMap((r) => [r.x - 8, r.x + r.width + 8]),
    ]),
  ].sort((a, b) => a - b);
  const ys = [
    ...new Set([
      a.y,
      b.y,
      ...obstacles.flatMap((r) => [r.y - 8, r.y + r.height + 8]),
    ]),
  ].sort((a, b) => a - b);
  const points = ys.flatMap((y) => xs.map((x) => ({ x, y })));
  const si = points.findIndex((p) => p.x === a.x && p.y === a.y),
    ti = points.findIndex((p) => p.x === b.x && p.y === b.y);
  const dist = new Map<number, number>([[si, 0]]),
    prev = new Map<number, number>();
  // A* with a binary heap: visit promising grid points without scanning the frontier.
  const todo: { v: number; cost: number; rank: number }[] = [];
  function enqueue(v: number, cost: number) {
    const entry = {
      v,
      cost,
      rank: cost + Math.abs(points[v].x - b.x) + Math.abs(points[v].y - b.y),
    };
    let i = todo.length;
    todo.push(entry);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (todo[p].rank <= entry.rank) break;
      todo[i] = todo[p];
      i = p;
    }
    todo[i] = entry;
  }
  function dequeue() {
    const first = todo[0],
      last = todo.pop()!;
    if (todo.length) {
      let i = 0;
      while (i * 2 + 1 < todo.length) {
        let child = i * 2 + 1;
        if (child + 1 < todo.length && todo[child + 1].rank < todo[child].rank)
          child++;
        if (todo[child].rank >= last.rank) break;
        todo[i] = todo[child];
        i = child;
      }
      todo[i] = last;
    }
    return first;
  }
  enqueue(si, 0);
  while (todo.length) {
    const { v: u, cost: best } = dequeue();
    if (best !== dist.get(u)) continue;
    if (u === ti) break;
    const col = u % xs.length,
      row = Math.floor(u / xs.length);
    for (const v of [
      col ? u - 1 : -1,
      col < xs.length - 1 ? u + 1 : -1,
      row ? u - xs.length : -1,
      row < ys.length - 1 ? u + xs.length : -1,
    ]) {
      if (v < 0 || blocked(points[u], points[v], obstacles)) continue;
      const cost =
        best +
        Math.abs(points[u].x - points[v].x) +
        Math.abs(points[u].y - points[v].y);
      if (cost < (dist.get(v) ?? Infinity)) {
        dist.set(v, cost);
        prev.set(v, u);
        enqueue(v, cost);
      }
    }
  }
  // Overlapping cards can make a route impossible: do not draw through a card.
  if (!dist.has(ti)) return [];
  const result: Point[] = [];
  let u = ti;
  while (u !== si) {
    result.unshift(points[u]);
    u = prev.get(u)!;
  }
  result.unshift(a);
  result.unshift(start);
  result.push(end);
  return simplifyRoute(result);
}
function simplifyRoute(points: Point[]): Point[] {
  const unique = points.filter(
    (p, i) => !i || p.x !== points[i - 1].x || p.y !== points[i - 1].y,
  );
  return unique.filter(
    (p, i) =>
      !i ||
      i === unique.length - 1 ||
      !(
        (unique[i - 1].x === p.x && p.x === unique[i + 1].x) ||
        (unique[i - 1].y === p.y && p.y === unique[i + 1].y)
      ),
  );
}

type Cubic = [Point, Point, Point, Point];
type Bounds = { left: number; top: number; right: number; bottom: number };
export type WireRoute = {
  path: string;
  points: Point[];
  midpoint: Point;
  bounds: Bounds;
};
const half = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});
const boundsOf = (points: Point[]): Bounds => ({
  left: Math.min(...points.map((p) => p.x)),
  top: Math.min(...points.map((p) => p.y)),
  right: Math.max(...points.map((p) => p.x)),
  bottom: Math.max(...points.map((p) => p.y)),
});
const intersects = (a: Bounds, b: Bounds) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const boxBounds = (r: Box): Bounds => ({
  left: r.x,
  top: r.y,
  right: r.x + r.width,
  bottom: r.y + r.height,
});
const inside = (p: Point, r: Bounds) =>
  p.x > r.left && p.x < r.right && p.y > r.top && p.y < r.bottom;

function split([a, b, c, d]: Cubic): [Cubic, Cubic] {
  const ab = half(a, b),
    bc = half(b, c),
    cd = half(c, d);
  const abc = half(ab, bc),
    bcd = half(bc, cd),
    mid = half(abc, bcd);
  return [
    [a, ab, abc, mid],
    [mid, bcd, cd, d],
  ];
}

// Reject empty control hulls first, then subdivide only near a card. This is
// conservative at subpixel precision and avoids 199 * every-card point probes.
function hitsCard(curve: Cubic, rect: Bounds, depth = 0): boolean {
  if (!intersects(boundsOf(curve), rect)) return false;
  if (inside(curve[0], rect) || inside(curve[3], rect)) return true;
  if (depth === 12) return true;
  const [a, b] = split(curve);
  return hitsCard(a, rect, depth + 1) || hitsCard(b, rect, depth + 1);
}
function clear(curves: Cubic[], boxes: Box[]) {
  const bounds = boundsOf(curves.flat());
  const nearby = boxes.map(boxBounds).filter((r) => intersects(bounds, r));
  return curves.every((c) => nearby.every((r) => !hitsCard(c, r)));
}
function sweepingCurve(a: Point, b: Point): Cubic {
  const dx = b.x - a.x;
  // Short forward gaps must not overshoot into the next card.
  const reach =
    dx > 0 ? Math.min(220, dx * 0.5) : Math.max(64, Math.min(220, -dx * 0.5));
  return [a, { x: a.x + reach, y: a.y }, { x: b.x - reach, y: b.y }, b];
}
const towards = (a: Point, b: Point, n: number): Point => {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  return {
    x: a.x + ((b.x - a.x) * n) / length,
    y: a.y + ((b.y - a.y) * n) / length,
  };
};
function roundedCurves(points: Point[]): Cubic[] {
  const curves: Cubic[] = [];
  let pen = points[0];
  const line = (end: Point) => {
    if (pen.x === end.x && pen.y === end.y) return;
    curves.push([
      pen,
      towards(pen, end, Math.hypot(end.x - pen.x, end.y - pen.y) / 3),
      towards(end, pen, Math.hypot(end.x - pen.x, end.y - pen.y) / 3),
      end,
    ]);
    pen = end;
  };
  for (let i = 1; i < points.length; i++) {
    const p = points[i],
      next = points[i + 1];
    const radius = next
      ? Math.min(
          96,
          Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) / 2,
          Math.hypot(next.x - p.x, next.y - p.y) / 2,
        )
      : 0;
    if (!radius) {
      line(p);
      continue;
    }
    const before = towards(p, points[i - 1], radius),
      after = towards(p, next, radius);
    line(before);
    // Cubic quarter turns have matching tangents at both joins. No artificial
    // bows on straight sections or little crossing humps that kink the wire.
    curves.push([
      before,
      towards(before, p, radius * 0.55228475),
      towards(after, p, radius * 0.55228475),
      after,
    ]);
    pen = after;
  }
  return curves;
}
function pathOf(curves: Cubic[]): string {
  if (!curves.length) return "";
  const n = (v: number) => Math.round(v * 100) / 100;
  return (
    `M${n(curves[0][0].x)} ${n(curves[0][0].y)}` +
    curves
      .map(
        ([, b, c, d]) =>
          ` C${n(b.x)} ${n(b.y)} ${n(c.x)} ${n(c.y)} ${n(d.x)} ${n(d.y)}`,
      )
      .join("")
  );
}
export function wirePath(points: Point[], _earlier: Point[][] = []): string {
  return pathOf(roundedCurves(points));
}
/** Crossing wires do not force a switch to a different routing style. */
export function smoothWirePath(
  points: Point[],
  boxes: Box[],
  _earlier: Point[][] = [],
): string | null {
  if (points.length < 2) return null;
  const curve = sweepingCurve(points[0], points[points.length - 1]);
  return clear([curve], boxes) ? pathOf([curve]) : null;
}
export function routeConnection(
  source: Box,
  target: Box,
  boxes: Box[],
  lane = 0,
): WireRoute {
  const start = { x: source.x + source.width, y: source.y + 65 },
    end = { x: target.x, y: target.y + 65 };
  const direct = sweepingCurve(start, end);
  let points = [start, end],
    curves = [direct];
  if (!clear(curves, boxes)) {
    points = routeWire(source, target, boxes, lane);
    curves = roundedCurves(points);
    // The padded orthogonal route leaves space for the rounded corners. If a
    // very tight arrangement cannot clear, retain its safe straight segments.
    if (curves.length && !clear(curves, boxes))
      curves = points.slice(1).map((p, i) => [points[i], points[i], p, p]);
  }
  const traces = curves.flatMap((curve, index) => {
    let parts = [curve];
    for (let i = 0; i < 3; i++) parts = parts.flatMap(split);
    return [...(index ? [] : [curve[0]]), ...parts.map((p) => p[3])];
  });
  let length = 0;
  const lengths = traces.slice(1).map((p, i) => {
    length += Math.hypot(p.x - traces[i].x, p.y - traces[i].y);
    return length;
  });
  const middle = lengths.findIndex((v) => v >= length / 2);
  const midpoint =
    middle >= 0 ? half(traces[middle], traces[middle + 1]) : start;
  return {
    path: pathOf(curves),
    points: traces,
    midpoint,
    bounds: boundsOf(curves.flat()),
  };
}

/** One cache per canvas. Invalidate endpoints and wires near old/new obstacles,
 * including added/removed/resized cards; unrelated wires keep their identity. */
export function createWireRouter() {
  let previous = new Map<string, Box>();
  let cache = new Map<string, { route: WireRoute; lane: number }>();
  return (boxes: Box[], edges: { from: string; to: string }[]): WireRoute[] => {
    const byId = new Map(boxes.map((b) => [b.id, b]));
    const changed: Bounds[] = [];
    const changedIds = new Set<string>();
    for (const id of new Set([...previous.keys(), ...byId.keys()])) {
      const a = previous.get(id),
        b = byId.get(id);
      if (
        !a ||
        !b ||
        a.x !== b.x ||
        a.y !== b.y ||
        a.width !== b.width ||
        a.height !== b.height
      ) {
        changedIds.add(id);
        if (a) changed.push(boxBounds(a));
        if (b) changed.push(boxBounds(b));
      }
    }
    const next = new Map<string, { route: WireRoute; lane: number }>();
    const lanes = new Map<string, number>();
    const result = edges.map((e) => {
      const key = JSON.stringify([e.from, e.to]);
      const lane = lanes.get(e.from) || 0;
      lanes.set(e.from, lane + 1);
      const cached = cache.get(key);
      const source = byId.get(e.from)!,
        target = byId.get(e.to)!;
      const reusable =
        cached &&
        cached.lane === lane &&
        cached.route.path &&
        !changedIds.has(e.from) &&
        !changedIds.has(e.to) &&
        !changed.some((b) => intersects(b, cached.route.bounds));
      const route = reusable
        ? cached.route
        : routeConnection(source, target, boxes, lane);
      next.set(key, { route, lane });
      return route;
    });
    previous = byId;
    cache = next;
    return result;
  };
}
