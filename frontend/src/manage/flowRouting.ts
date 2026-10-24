/** Orthogonal obstacle routing, rounded corners and bridges. Canvas units, not pixels. */
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

export function wirePath(points: Point[], earlier: Point[][]): string {
  if (points.length < 2) return "";
  let d = `M${points[0].x} ${points[0].y}`;
  const towards = (a: Point, b: Point, n: number): Point => {
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    return { x: a.x + ((b.x - a.x) * n) / l, y: a.y + ((b.y - a.y) * n) / l };
  };
  let pen = points[0];
  // A small bow keeps even aligned connections curved, inside routing clearance.
  const curveTo = (end: Point) => {
    const dx = end.x - pen.x,
      dy = end.y - pen.y,
      len = Math.hypot(dx, dy);
    if (!len) return;
    const bow = Math.min(5, len / 8),
      nx = (-dy / len) * bow,
      ny = (dx / len) * bow;
    d += ` C${pen.x + dx / 3 + nx} ${pen.y + dy / 3 + ny} ${pen.x + (dx * 2) / 3 + nx} ${pen.y + (dy * 2) / 3 + ny} ${end.x} ${end.y}`;
    pen = end;
  };
  let cursor = points[0];
  for (let i = 1; i < points.length; i++) {
    const p = points[i],
      next = points[i + 1];
    const r = next
      ? Math.min(
          36,
          Math.hypot(p.x - cursor.x, p.y - cursor.y) / 2,
          Math.hypot(next.x - p.x, next.y - p.y) / 2,
        )
      : 0;
    const finish = r ? towards(p, cursor, r) : p;
    if (cursor.y === finish.y) {
      const crossings = earlier.flatMap((line) =>
        line.slice(1).flatMap((q, j) => {
          const v = line[j];
          return v.x === q.x &&
            cursor.y > Math.min(v.y, q.y) + 8 &&
            cursor.y < Math.max(v.y, q.y) - 8 &&
            v.x > Math.min(cursor.x, finish.x) + 10 &&
            v.x < Math.max(cursor.x, finish.x) - 10
            ? [v.x]
            : [];
        }),
      );
      const direction = Math.sign(finish.x - cursor.x);
      let last = cursor.x;
      for (const x of [...new Set(crossings)].sort(
        (a, b) => (a - b) * direction,
      )) {
        if (Math.abs(x - last) < 18) continue;
        curveTo({ x: x - 7 * direction, y: cursor.y });
        d += ` Q${x} ${cursor.y - 14} ${x + 7 * direction} ${cursor.y}`;
        pen = { x: x + 7 * direction, y: cursor.y };
        last = x;
      }
    }
    if (cursor.x === finish.x) {
      const crossings = earlier.flatMap((line) =>
        line.slice(1).flatMap((q, j) => {
          const v = line[j];
          return v.y === q.y &&
            cursor.x > Math.min(v.x, q.x) + 8 &&
            cursor.x < Math.max(v.x, q.x) - 8 &&
            v.y > Math.min(cursor.y, finish.y) + 10 &&
            v.y < Math.max(cursor.y, finish.y) - 10
            ? [v.y]
            : [];
        }),
      );
      const direction = Math.sign(finish.y - cursor.y);
      let last = cursor.y;
      for (const y of [...new Set(crossings)].sort(
        (a, b) => (a - b) * direction,
      )) {
        if (Math.abs(y - last) < 18) continue;
        curveTo({ x: cursor.x, y: y - 7 * direction });
        d += ` Q${cursor.x + 14} ${y} ${cursor.x} ${y + 7 * direction}`;
        pen = { x: cursor.x, y: y + 7 * direction };
        last = y;
      }
    }
    curveTo(finish);
    if (r) {
      const after = towards(p, next, r);
      d += ` Q${p.x} ${p.y} ${after.x} ${after.y}`;
      cursor = after;
      pen = after;
    } else cursor = p;
  }
  return d;
}

/** Prefer a single flowing Bezier when its full curve clears every card. */
export function smoothWirePath(
  points: Point[],
  boxes: Box[],
  earlier: Point[][] = [],
): string | null {
  if (points.length < 2) return null;
  const a = points[0],
    b = points[points.length - 1];
  // Retain the bridge-aware router wherever another connection could cross.
  if (
    earlier.some((line) =>
      line.some(
        (p) =>
          p.x > Math.min(a.x, b.x) &&
          p.x < Math.max(a.x, b.x) &&
          p.y >= Math.min(a.y, b.y) - 24 &&
          p.y <= Math.max(a.y, b.y) + 24,
      ),
    )
  )
    return null;
  const reach = Math.max(60, Math.abs(b.x - a.x) * 0.48);
  const aligned = Math.abs(b.y - a.y) < 2;
  const c = { x: a.x + reach, y: a.y - (aligned ? 24 : 0) };
  const d = { x: b.x - reach, y: b.y - (aligned ? 24 : 0) };
  for (let i = 1; i < 200; i++) {
    const t = i / 200,
      u = 1 - t;
    const x =
      u * u * u * a.x +
      3 * u * u * t * c.x +
      3 * u * t * t * d.x +
      t * t * t * b.x;
    const y =
      u * u * u * a.y +
      3 * u * u * t * c.y +
      3 * u * t * t * d.y +
      t * t * t * b.y;
    if (
      boxes.some(
        (r) => x > r.x && x < r.x + r.width && y > r.y && y < r.y + r.height,
      )
    )
      return null;
  }
  return `M${a.x} ${a.y} C${c.x} ${c.y} ${d.x} ${d.y} ${b.x} ${b.y}`;
}
