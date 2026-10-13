import { useEffect, useId, useRef, useState } from "react";
export type FlowPoint = { time: string; value: number | null };
export type FlowHistoryData = {
  period: string;
  series: Partial<Record<string, FlowPoint[]>>;
};
export function FlowHistory({
  points,
  lang,
  compact = false,
}: {
  points: FlowPoint[];
  lang: string;
  compact?: boolean;
}) {
  const [inspection, inspect] = useState<number | null>(null);
  const [width, setWidth] = useState(640);
  const host = useRef<HTMLDivElement>(null);
  const gradient = useId().replaceAll(":", "");
  useEffect(() => {
    if (compact || !host.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(260, Math.round(entry.contentRect.width)));
    });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [compact, points.length]);
  const en = lang === "en",
    locale = en ? "en-GB" : "nb-NO";
  const numbers = points.flatMap((p) =>
    p.value !== null && Number.isFinite(p.value) ? [p.value] : [],
  );
  if (!numbers.length)
    return compact ? null : (
      <div ref={host} className="flow-chart-empty">
        <span>
          {en ? "Your history starts here" : "Her begynner historikken din"}
        </span>
        <p>
          {en
            ? "No hourly history yet. The sensor needs recorded power statistics."
            : "Ingen timehistorikk ennå. Måleren må ha lagret effektstatistikk."}
        </p>
      </div>
    );
  const low = Math.min(0, ...numbers),
    high = Math.max(1, ...numbers),
    span = high - low,
    chartWidth = compact ? 320 : width,
    left = compact ? 2 : 46,
    right = compact ? chartWidth - 2 : chartWidth - 14,
    top = compact ? 5 : 16,
    bottom = compact ? 49 : 182,
    chartHeight = compact ? 54 : 222;
  const x = (i: number) =>
    left + (i / Math.max(points.length - 1, 1)) * (right - left);
  const y = (v: number) => bottom - ((v - low) / span) * (bottom - top);
  // Start a new area at each gap, so missing hours never look like measured flow.
  const segments: { index: number; value: number }[][] = [];
  let segment: { index: number; value: number }[] = [];
  points.forEach((p, index) => {
    if (p.value === null || !Number.isFinite(p.value)) {
      if (segment.length) segments.push(segment);
      segment = [];
    } else segment.push({ index, value: p.value });
  });
  if (segment.length) segments.push(segment);
  const path = (items: typeof segment) =>
    items
      .map((p, i) => `${i ? "L" : "M"}${x(p.index)},${y(p.value)}`)
      .join(" ");
  const format = (v: number) =>
    `${(v / 1000).toLocaleString(locale, { maximumFractionDigits: 2 })} kW`;
  const last = points.reduce(
    (previous, p, i) => (p.value !== null ? i : previous),
    0,
  );
  const index = Math.min(inspection ?? last, points.length - 1),
    point = points[index];
  const date = (stamp: string) =>
    new Date(stamp).toLocaleString(locale, {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  const inspectPointer = (element: SVGSVGElement, clientX: number) => {
    const rect = element.getBoundingClientRect();
    inspect(
      Math.max(
        0,
        Math.min(
          points.length - 1,
          Math.round(
            ((((clientX - rect.left) / rect.width) * chartWidth - left) /
              (right - left)) *
              (points.length - 1),
          ),
        ),
      ),
    );
  };
  const svg = (
    <svg
      viewBox={`0 0 ${chartWidth} ${chartHeight}`}
      preserveAspectRatio={compact ? "none" : "xMidYMid meet"}
      className={compact ? "flow-sparkline" : "flow-history-svg"}
      aria-hidden={compact || undefined}
      role={compact ? undefined : "img"}
      tabIndex={compact ? undefined : 0}
      aria-label={
        compact
          ? undefined
          : en
            ? "Hourly power history. Use arrow keys to inspect readings."
            : "Effekt per time. Bruk piltastene for å undersøke målingene."
      }
      onPointerDown={
        compact ? undefined : (e) => inspectPointer(e.currentTarget, e.clientX)
      }
      onPointerMove={
        compact ? undefined : (e) => inspectPointer(e.currentTarget, e.clientX)
      }
      onKeyDown={
        compact
          ? undefined
          : (e) => {
              let next = index;
              if (e.key === "ArrowLeft") next--;
              else if (e.key === "ArrowRight") next++;
              else if (e.key === "Home") next = 0;
              else if (e.key === "End") next = points.length - 1;
              else return;
              e.preventDefault();
              inspect(Math.max(0, Math.min(points.length - 1, next)));
            }
      }
    >
      <defs>
        <linearGradient
          id={`flow-area-${gradient}`}
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop
            offset="0"
            stopColor="currentColor"
            stopOpacity={compact ? ".2" : ".16"}
          />
          <stop offset="1" stopColor="currentColor" stopOpacity=".015" />
        </linearGradient>
      </defs>
      {!compact &&
        [high, low + span / 2, low].map((value, i) => (
          <g key={i}>
            <line
              x1={left}
              x2={right}
              y1={y(value)}
              y2={y(value)}
              className="flow-chart-grid"
            />
            <text x={left - 9} y={y(value) + 4} textAnchor="end">
              {(value / 1000).toLocaleString(locale, {
                maximumFractionDigits: 1,
              })}
            </text>
          </g>
        ))}
      {!compact && low < 0 && (
        <line
          x1={left}
          x2={right}
          y1={y(0)}
          y2={y(0)}
          className="flow-chart-zero"
        />
      )}
      {segments.map((items, i) => (
        <g key={i}>
          {items.length > 1 && (
            <path
              d={`${path(items)} L${x(items[items.length - 1].index)},${y(0)} L${x(items[0].index)},${y(0)} Z`}
              fill={`url(#flow-area-${gradient})`}
            />
          )}
          <path
            d={path(items)}
            fill="none"
            stroke="currentColor"
            strokeWidth={compact ? 1.75 : 2.25}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {items.length === 1 && (
            <circle
              cx={x(items[0].index)}
              cy={y(items[0].value)}
              r={compact ? 2 : 3}
              fill="currentColor"
            />
          )}
        </g>
      ))}
      {!compact && point && (
        <g>
          <line
            x1={x(index)}
            x2={x(index)}
            y1={top}
            y2={bottom}
            className="flow-chart-cursor"
          />
          {point.value !== null && (
            <>
              <circle
                cx={x(index)}
                cy={y(point.value)}
                r="8"
                fill="currentColor"
                opacity=".13"
              />
              <circle
                cx={x(index)}
                cy={y(point.value)}
                r="4"
                fill="currentColor"
                className="flow-chart-point"
              />
            </>
          )}
        </g>
      )}
      {!compact && (
        <>
          <text x={left} y={chartHeight - 12}>
            {date(points[0].time)}
          </text>
          <text x={right} y={chartHeight - 12} textAnchor="end">
            {date(points[points.length - 1].time)}
          </text>
        </>
      )}
    </svg>
  );
  if (compact) return svg;
  return (
    <div ref={host} className="flow-history-chart">
      <div className="flow-chart-readout" aria-live="polite">
        <div>
          <span className="flow-chart-caption">
            {en ? "Hourly average" : "Gjennomsnitt denne timen"}
          </span>
          <strong>
            {point?.value != null
              ? format(point.value)
              : en
                ? "Missing reading"
                : "Mangler måling"}
          </strong>
        </div>
        <span>{point ? date(point.time) : ""}</span>
      </div>
      <div className="flow-chart-unit" aria-hidden="true">
        kW
      </div>
      {svg}
      <div className="flow-chart-range">
        <span>
          Min <strong>{format(Math.min(...numbers))}</strong>
        </span>
        <span>
          {en ? "Max" : "Maks"} <strong>{format(Math.max(...numbers))}</strong>
        </span>
        <span>
          {en ? "Gaps mean missing readings" : "Hull betyr manglende målinger"}
        </span>
      </div>
    </div>
  );
}
