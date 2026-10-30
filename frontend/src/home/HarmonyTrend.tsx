import { useId } from "react";

export type TrendPoint = { time: string; value: number | null };
/** A gap remains a gap. Time positions and the scale come only from recorded data. */
export function HarmonyTrend({
  points,
  label,
  unit,
  lang,
}: {
  points: TrendPoint[];
  label: string;
  unit: string;
  lang: string;
}) {
  const id = useId().replaceAll(":", "");
  const valid = points.filter(
    (p) =>
      p.value !== null &&
      Number.isFinite(p.value) &&
      Number.isFinite(Date.parse(p.time)),
  );
  if (!valid.length) return null;
  const values = valid.map((p) => p.value!),
    times = valid.map((p) => Date.parse(p.time));
  const start = Math.min(...times),
    end = Math.max(...times);
  const low = Math.min(...values),
    high = Math.max(...values);
  const padding =
    high === low ? Math.max(Math.abs(high) * 0.05, 0.5) : (high - low) * 0.1;
  const min = low - padding,
    max = high + padding;
  const x = (p: TrendPoint) =>
    2 + ((Date.parse(p.time) - start) / (end - start || 1)) * 296;
  const y = (p: TrendPoint) => 88 - ((p.value! - min) / (max - min)) * 80;
  const segments: TrendPoint[][] = [];
  let segment: TrendPoint[] = [];
  for (const p of points) {
    if (
      p.value === null ||
      !Number.isFinite(p.value) ||
      !Number.isFinite(Date.parse(p.time))
    ) {
      if (segment.length) segments.push(segment);
      segment = [];
    } else segment.push(p);
  }
  if (segment.length) segments.push(segment);
  const format = (v: number) =>
    v.toLocaleString(lang === "en" ? "en-GB" : "nb-NO", {
      maximumFractionDigits: 1,
    });
  const time = (v: number) =>
    new Date(v).toLocaleTimeString(lang === "en" ? "en-GB" : "nb-NO", {
      hour: "2-digit",
      minute: "2-digit",
    });
  return (
    <span
      className="harmony-trend"
      role="img"
      aria-label={`${label}. ${lang === "en" ? "Recorded range" : "Målt spenn"}: ${format(low)}–${format(high)} ${unit}. ${time(start)}–${time(end)}.`}
    >
      <span className="harmony-trend-scale" aria-hidden="true">
        <span>
          {format(max)} <small>{unit}</small>
        </span>
        <span>{format((max + min) / 2)}</span>
        <span>{format(min)}</span>
      </span>
      <svg viewBox="0 0 300 96" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="currentColor" stopOpacity=".22" />
            <stop offset="1" stopColor="currentColor" stopOpacity=".01" />
          </linearGradient>
        </defs>
        <path
          className="harmony-trend-guide"
          d="M2 8 H298 M2 48 H298 M2 88 H298"
        />
        {segments.map((items, i) => {
          const path = items
            .map(
              (p, index) =>
                `${index ? "L" : "M"}${x(p).toFixed(2)},${y(p).toFixed(2)}`,
            )
            .join(" ");
          return (
            <g key={i}>
              {items.length > 1 && (
                <path
                  d={`${path} L${x(items.at(-1)!).toFixed(2)},94 L${x(items[0]).toFixed(2)},94 Z`}
                  fill={`url(#${id})`}
                />
              )}
              <path
                d={path}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              {items.length === 1 && (
                <circle
                  cx={x(items[0])}
                  cy={y(items[0])}
                  r="2.5"
                  fill="currentColor"
                />
              )}
            </g>
          );
        })}
      </svg>
      <span className="harmony-trend-times" aria-hidden="true">
        <span>{time(start)}</span>
        {end !== start && (
          <>
            <span>{time((start + end) / 2)}</span>
            <span>{time(end)}</span>
          </>
        )}
      </span>
    </span>
  );
}
