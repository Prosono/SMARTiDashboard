import type { TrendPoint } from "./HarmonyTrend";

export type MeasuredSeries = {
  id: string;
  name: string;
  color?: string;
  points: TrendPoint[];
};
export type ChartSample = { time: number; value: number | null };
export const chartColor = (index: number) =>
  [
    "var(--card-series-1,#e88d35)",
    "var(--card-series-2,#398fc5)",
    "var(--card-series-3,#399b80)",
    "var(--card-series-4,#b56999)",
    "var(--card-series-5,#95843c)",
    "var(--card-series-6,#8271be)",
  ][index % 6];

export function chartSegments(points: TrendPoint[]): ChartSample[][] {
  const result: ChartSample[][] = [];
  let chunk: ChartSample[] = [];
  const flush = () => {
    let segment: ChartSample[] = [];
    for (const point of chunk.sort((a, b) => a.time - b.time)) {
      if (point.value === null) {
        if (segment.length) result.push(segment);
        segment = [];
      } else segment.push(point);
    }
    if (segment.length) result.push(segment);
    chunk = [];
  };
  for (const p of points) {
    const time = Date.parse(p.time);
    if (!Number.isFinite(time)) {
      flush();
      continue;
    }
    chunk.push({
      time,
      value: p.value !== null && Number.isFinite(p.value) ? p.value : null,
    });
  }
  flush();
  return result;
}

/** Shape-preserving cubic Hermite interpolation; every vertex is a real sample. */
export function measuredPath(points: { x: number; y: number }[]) {
  if (!points.length) return "";
  const f = (n: number) => n.toFixed(3);
  let path = `M${f(points[0].x)},${f(points[0].y)}`;
  if (
    points.length < 3 ||
    points.some((p, i) => i > 0 && p.x <= points[i - 1].x)
  )
    return (
      path +
      points
        .slice(1)
        .map((p) => ` L${f(p.x)},${f(p.y)}`)
        .join("")
    );
  const slopes = points
    .slice(1)
    .map((p, i) => (p.y - points[i].y) / (p.x - points[i].x));
  const tangents = points.map((_, i) =>
    i === 0
      ? slopes[0]
      : i === points.length - 1
        ? slopes.at(-1)!
        : slopes[i - 1] * slopes[i] <= 0
          ? 0
          : 2 / (1 / slopes[i - 1] + 1 / slopes[i]),
  );
  slopes.forEach((s, i) => {
    if (s === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      return;
    }
    const norm = Math.hypot(tangents[i] / s, tangents[i + 1] / s);
    if (norm > 3) {
      tangents[i] = (3 / norm) * tangents[i];
      tangents[i + 1] = (3 / norm) * tangents[i + 1];
    }
  });
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i],
      b = points[i + 1],
      third = (b.x - a.x) / 3;
    path += ` C${f(a.x + third)},${f(a.y + tangents[i] * third)} ${f(b.x - third)},${f(b.y - tangents[i + 1] * third)} ${f(b.x)},${f(b.y)}`;
  }
  return path;
}

export function measuredGeometry(
  series: MeasuredSeries[],
  domain?: { start: number; end: number },
) {
  const segments = series.map((s) => chartSegments(s.points));
  const valid = segments
    .flat(2)
    .filter((p): p is { time: number; value: number } => p.value !== null);
  if (!valid.length) return null;
  const values = valid.map((p) => p.value),
    times = series
      .flatMap((s) => s.points.map((p) => Date.parse(p.time)))
      .filter(Number.isFinite);
  const low = Math.min(...values),
    high = Math.max(...values);
  const observedStart = Math.min(...times),
    observedEnd = Math.max(...times);
  const start =
    domain && Number.isFinite(domain.start) && domain.start <= observedStart
      ? domain.start
      : observedStart;
  const end =
    domain && Number.isFinite(domain.end) && domain.end >= observedEnd
      ? domain.end
      : observedEnd;
  const span = high === low ? Math.max(Math.abs(low) * 0.1, 1) : high - low;
  const raw =
    (Number.isFinite(span) ? span : Math.max(Math.abs(low), Math.abs(high))) /
    2;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step =
    ([1, 2, 2.5, 5, 10].find((n) => n * magnitude >= raw) || 10) * magnitude;
  let min = Math.floor(low / step) * step,
    max = Math.ceil(high / step) * step;
  if (min === max) {
    min -= step;
    max += step;
  }
  const scale = Math.max(Math.abs(min), Math.abs(max), 1);
  const x = (time: number) =>
    end === start ? 240 : 8 + ((time - start) / (end - start)) * 464;
  const y = (value: number) =>
    112 - ((value / scale - min / scale) / (max / scale - min / scale)) * 104;
  const ticks = Array.from(
    { length: Math.min(7, Math.round(max / step - min / step) + 1) },
    (_, i) => min + i * step,
  ).reverse();
  const stamps = [
    ...new Set(
      series
        .flatMap((s) => s.points.map((p) => Date.parse(p.time)))
        .filter(Number.isFinite),
    ),
  ].sort((a, b) => a - b);
  return {
    segments,
    low,
    high,
    min,
    max,
    start,
    end,
    step,
    ticks,
    stamps,
    x,
    y,
  };
}

export function nearestSample(points: TrendPoint[], time: number) {
  const samples = points.filter((p) => Number.isFinite(Date.parse(p.time)));
  if (!samples.length) return null;
  const first = Math.min(...samples.map((p) => Date.parse(p.time))),
    last = Math.max(...samples.map((p) => Date.parse(p.time)));
  if (time < first || time > last) return null;
  return samples.reduce((a, b) =>
    Math.abs(Date.parse(a.time) - time) <= Math.abs(Date.parse(b.time) - time)
      ? a
      : b,
  );
}
