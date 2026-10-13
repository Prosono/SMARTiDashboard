import { useState } from "react";
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
  const en = lang === "en",
    locale = en ? "en-GB" : "nb-NO";
  const numbers = points.flatMap((p) => (p.value === null ? [] : [p.value]));
  if (!numbers.length)
    return compact ? null : (
      <p className="flow-chart-empty">
        {en
          ? "No hourly history yet. The sensor needs recorded power statistics."
          : "Ingen timehistorikk ennå. Måleren må ha lagret effektstatistikk."}
      </p>
    );
  const low = Math.min(0, ...numbers),
    high = Math.max(1, ...numbers),
    span = high - low;
  const x = (i: number) => 24 + (i / Math.max(points.length - 1, 1)) * 592;
  const y = (v: number) => 144 - ((v - low) / span) * 126;
  let pen = false;
  const path = points
    .map((p, i) => {
      if (p.value === null) {
        pen = false;
        return "";
      }
      const part = `${pen ? "L" : "M"}${x(i)},${y(p.value)}`;
      pen = true;
      return part;
    })
    .join(" ");
  const format = (v: number) =>
    `${(v / 1000).toLocaleString(locale, { maximumFractionDigits: 2 })} kW`;
  const last = points.reduce((last, p, i) => (p.value !== null ? i : last), 0);
  const index = Math.min(inspection ?? last, points.length - 1),
    point = points[index];
  const date = (stamp: string) =>
    new Date(stamp).toLocaleString(locale, {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  const svg = (
    <svg
      viewBox="0 0 640 180"
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
      onPointerMove={
        compact
          ? undefined
          : (e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              inspect(
                Math.max(
                  0,
                  Math.min(
                    points.length - 1,
                    Math.round(
                      ((((e.clientX - rect.left) / rect.width) * 640 - 24) /
                        592) *
                        (points.length - 1),
                    ),
                  ),
                ),
              );
            }
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
      {!compact &&
        [0, 0.5, 1].map((t) => (
          <line
            key={t}
            x1="24"
            x2="616"
            y1={18 + t * 126}
            y2={18 + t * 126}
            className="flow-chart-grid"
          />
        ))}
      {!compact && low < 0 && (
        <line
          x1="24"
          x2="616"
          y1={y(0)}
          y2={y(0)}
          className="flow-chart-zero"
        />
      )}
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={compact ? 3 : 2.5}
        strokeLinejoin="round"
      />
      {!compact &&
        points.map((p, i) =>
          p.value !== null &&
          (i === 0 || points[i - 1]?.value === null) &&
          (i === points.length - 1 || points[i + 1]?.value === null) ? (
            <circle
              key={i}
              cx={x(i)}
              cy={y(p.value)}
              r="3"
              fill="currentColor"
            />
          ) : null,
        )}
      {!compact && point && (
        <g>
          <line
            x1={x(index)}
            x2={x(index)}
            y1="18"
            y2="144"
            className="flow-chart-cursor"
          />
          {point.value !== null && (
            <circle
              cx={x(index)}
              cy={y(point.value)}
              r="5"
              fill="currentColor"
            />
          )}
        </g>
      )}
      {!compact && (
        <>
          <text x="24" y="172">
            {date(points[0].time)}
          </text>
          <text x="616" y="172" textAnchor="end">
            {date(points[points.length - 1].time)}
          </text>
        </>
      )}
    </svg>
  );
  if (compact) return svg;
  return (
    <div className="flow-history-chart">
      <div className="flow-chart-readout" aria-live="polite">
        <strong>
          {point?.value != null
            ? format(point.value)
            : en
              ? "Missing reading"
              : "Mangler måling"}
        </strong>
        <span>{point ? date(point.time) : ""}</span>
      </div>
      {svg}
      <div className="flow-chart-range">
        <span>
          Min <strong>{format(Math.min(...numbers))}</strong>
        </span>
        <span>
          Maks <strong>{format(Math.max(...numbers))}</strong>
        </span>
        <span>
          {en
            ? "Hourly averages · gaps preserved"
            : "Gjennomsnitt per time · hull betyr manglende data"}
        </span>
      </div>
    </div>
  );
}
