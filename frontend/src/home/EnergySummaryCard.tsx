import { useId, useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import {
  energySummaryBars,
  finiteReading,
  osloMidnight,
  type SummaryBar,
  type SummaryKind,
  type SummaryPart,
  type SummaryPoint,
  type SummaryPrice,
} from "./energySummaryModel";
import "./energySummary.css";

const partLabels: Record<SummaryPart, [string, string]> = {
  electricity: ["Strøm", "Electricity"],
  grid: ["Nettleie", "Grid"],
  tax: ["Avgifter", "Taxes"],
  support: ["Støtte", "Support"],
  other: ["Annet", "Other"],
};
const partsOf = (bar: SummaryBar) => {
  const parts = Object.entries(bar.parts || {})
    .filter(([, value]) => value !== 0)
    .map(([key, value]) => ({ key, value }))
    .sort(
      (a, b) =>
        ["electricity", "grid", "tax", "support", "other"].indexOf(a.key) -
        ["electricity", "grid", "tax", "support", "other"].indexOf(b.key),
    );
  return parts.length
    ? parts
    : bar.value !== null
      ? [{ key: "total", value: bar.value }]
      : [];
};

/** Small native energy charts explain their actual interval values before opening details. */
export function EnergySummaryCard({
  kind,
  total,
  points,
  prices,
  start,
  end,
  now,
  lang,
  label,
  note,
  description,
  context,
  onOpen,
}: {
  kind: SummaryKind;
  total: number | string | null | undefined;
  points?: SummaryPoint[];
  prices?: SummaryPrice[];
  start: string;
  end: string;
  now: number;
  lang: string;
  label: string;
  note: string;
  description: string;
  context: string;
  onOpen: () => void;
}) {
  const [selected, select] = useState<number | null>(null),
    id = useId();
  const en = lang === "en",
    locale = en ? "en-GB" : "nb-NO";
  const bars = useMemo(
    () => energySummaryBars({ kind, points, prices, start, end, now }),
    [kind, points, prices, start, end, now],
  );
  const active = selected === null ? undefined : bars[selected];
  const unit = kind === "spot" ? "øre/kWh" : kind === "cost" ? "kr" : "kWh";
  const format = (value: number | null | undefined, digits = 1) =>
    value == null
      ? "—"
      : value.toLocaleString(locale, { maximumFractionDigits: digits });
  const time = (stamp: number) =>
    new Date(stamp).toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Oslo",
    });
  const day = (stamp: number) =>
    new Date(stamp).toLocaleDateString(locale, {
      day: "numeric",
      month: "short",
      timeZone: "Europe/Oslo",
    });
  const isDay = osloMidnight(end) - osloMidnight(start) <= 26 * 3600000;
  const interval = (bar: SummaryBar) =>
    isDay ? `${time(bar.start)}–${time(bar.end)}` : day(bar.start);
  const known = bars.some((bar) => bar.value !== null);
  const current =
    kind === "spot"
      ? bars.findIndex(
          (bar) => bar.value !== null && bar.start <= now && now < bar.end,
        )
      : -1;
  const keys = [
    ...new Set(
      bars.flatMap((bar) =>
        partsOf(bar)
          .filter((part) => part.value !== 0)
          .map((part) => part.key),
      ),
    ),
  ];
  const stacked = kind === "cost" && keys.some((key) => key !== "total");
  if (kind === "cost" && known && !keys.length) keys.push("total");
  const extents = bars.map((bar) => {
    const parts = kind === "cost" ? partsOf(bar) : [{ value: bar.value || 0 }];
    return [
      parts.reduce((sum, p) => sum + Math.max(0, p.value), 0),
      parts.reduce((sum, p) => sum + Math.min(0, p.value), 0),
    ];
  });
  const maximum = Math.max(0, ...extents.map(([positive]) => positive)),
    minimum = Math.min(0, ...extents.map(([, negative]) => negative)),
    high = maximum ? maximum * 1.12 : minimum ? 0 : 1,
    low = minimum * 1.12,
    span = high - low;
  const left = 30,
    width = 282,
    top = 11,
    height = 69;
  const first = osloMidnight(start),
    last = osloMidnight(end);
  const x = (stamp: number) =>
    left + ((stamp - first) / (last - first)) * width;
  const y = (value: number) => top + ((high - value) / span) * height;
  const chooseAt = (clientX: number, element: HTMLDivElement) => {
    if (!bars.length) return;
    const rect = element.getBoundingClientRect();
    const stamp =
      first +
      ((((clientX - rect.left) / rect.width) * 320 - left) / width) *
        (last - first);
    select(bars.findIndex((bar) => stamp >= bar.start && stamp < bar.end));
  };
  const partLabel = (key: string) =>
    key === "total"
      ? en
        ? "Interval cost"
        : "Timekostnad"
      : partLabels[key as SummaryPart]?.[en ? 1 : 0] || key;
  return (
    <div className="energy-summary" data-kind={kind}>
      <button
        className="energy-summary-reading"
        onClick={onOpen}
        aria-label={`${label}: ${format(finiteReading(total), 2)} ${unit}. ${description}. ${en ? "View details" : "Vis detaljer"}`}
      >
        <strong>
          {format(finiteReading(total), kind === "cost" ? 2 : 1)}{" "}
          <span>{unit}</span>
        </strong>
        <ArrowUpRight size={17} aria-hidden="true" />
      </button>
      <div className="energy-summary-caption">
        <span title={description}>{note}</span>
        <span>{context}</span>
      </div>
      <div
        className="energy-summary-chart"
        tabIndex={known ? 0 : -1}
        role="group"
        aria-label={`${label}. ${en ? "Use arrow keys to explore intervals" : "Bruk piltastene for å utforske intervallene"}`}
        aria-describedby={id}
        onPointerDown={(event) => chooseAt(event.clientX, event.currentTarget)}
        onPointerMove={(event) => {
          if (event.pointerType === "mouse" || event.buttons)
            chooseAt(event.clientX, event.currentTarget);
        }}
        onPointerLeave={(event) => {
          if (
            event.pointerType === "mouse" &&
            !event.currentTarget.matches(":focus")
          )
            select(null);
        }}
        onBlur={() => select(null)}
        onKeyDown={(event) => {
          if (
            !["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(
              event.key,
            )
          )
            return;
          event.preventDefault();
          if (event.key === "Escape") select(null);
          else
            select(
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? bars.length - 1
                  : Math.max(
                      0,
                      Math.min(
                        bars.length - 1,
                        (selected ??
                          (event.key === "ArrowLeft" ? bars.length : -1)) +
                          (event.key === "ArrowLeft" ? -1 : 1),
                      ),
                    ),
            );
        }}
      >
        <svg
          viewBox="0 0 320 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {[high, (high + low) / 2, low].map((value) => (
            <g key={value}>
              <line
                className="es-gridline"
                x1={left}
                x2={left + width}
                y1={y(value)}
                y2={y(value)}
              />
              <text x={left - 6} y={y(value) + 3} textAnchor="end">
                {format(value)}
              </text>
            </g>
          ))}
          <line
            className="es-zero"
            x1={left}
            x2={left + width}
            y1={y(0)}
            y2={y(0)}
          />
          {bars.map((bar, index) => {
            const a = x(bar.start),
              b = x(bar.end),
              barWidth = Math.max(1, (b - a) * 0.72);
            let positive = 0,
              negative = 0;
            const chunks =
              kind === "cost"
                ? partsOf(bar)
                : bar.value !== null
                  ? [{ key: bar.level, value: bar.value }]
                  : [];
            return (
              <g
                key={bar.start}
                data-summary-bar
                data-value={bar.value ?? "missing"}
                data-future={bar.future || undefined}
                data-partial={bar.partial || undefined}
                data-current={current === index || undefined}
              >
                {selected === index && (
                  <rect
                    className="es-highlight"
                    x={a}
                    y={top - 4}
                    width={Math.max(1, b - a)}
                    height={height + 8}
                    rx="3"
                  />
                )}
                {chunks.map((part) => {
                  const bottom = part.value >= 0 ? positive : negative;
                  const upper = bottom + part.value;
                  if (part.value >= 0) positive = upper;
                  else negative = upper;
                  return (
                    <rect
                      key={part.key}
                      data-part={part.key}
                      data-amount={part.value}
                      x={(a + b - barWidth) / 2}
                      y={
                        Math.min(y(bottom), y(upper)) -
                        (part.value === 0 ? 1 : 0)
                      }
                      width={barWidth}
                      height={Math.max(
                        part.value === 0 ? 1.5 : 0.75,
                        Math.abs(y(upper) - y(bottom)) - (stacked ? 0.7 : 0),
                      )}
                      rx="2"
                    />
                  );
                })}
                {bar.value === null && !bar.future && (
                  <line
                    className="es-missing"
                    x1={a + (b - a) * 0.25}
                    x2={b - (b - a) * 0.25}
                    y1={y(0)}
                    y2={y(0)}
                  />
                )}
                {current === index && (
                  <g className="es-now">
                    <line
                      x1={(a + b) / 2}
                      x2={(a + b) / 2}
                      y1={top - 2}
                      y2={top + height + 3}
                    />
                    <circle cx={(a + b) / 2} cy={y(bar.value!)} r="2.8" />
                  </g>
                )}
              </g>
            );
          })}
          {[0, 0.25, 0.5, 0.75, 1].map((position) => (
            <text
              key={position}
              x={left + width * position}
              y="97"
              textAnchor={
                position === 0 ? "start" : position === 1 ? "end" : "middle"
              }
            >
              {isDay
                ? position === 1
                  ? "24:00"
                  : time(first + (last - first) * position)
                : day(first + (last - first - 1) * position)}
            </text>
          ))}
        </svg>
        {!known && (
          <span className="energy-summary-empty">
            {kind === "spot"
              ? en
                ? "Prices unavailable"
                : "Ingen priser tilgjengelig"
              : en
                ? "Waiting for history"
                : "Venter på historikk"}
          </span>
        )}
      </div>
      <div
        id={id}
        className="energy-summary-detail"
        role="status"
        aria-live="polite"
      >
        {active ? (
          <>
            <span>
              {interval(active)}
              {active.partial && active.value !== null
                ? en
                  ? " · partial"
                  : " · delvis"
                : ""}
            </span>
            <strong>
              {active.value === null
                ? active.future
                  ? en
                    ? "Not measured yet"
                    : "Ikke målt ennå"
                  : kind === "spot"
                    ? en
                      ? "No price"
                      : "Ingen pris"
                    : en
                      ? "No reading"
                      : "Ingen måling"
                : `${format(active.value, 2)} ${unit}`}
            </strong>
            {kind === "cost" && active.parts && (
              <span className="energy-summary-parts">
                {partsOf(active)
                  .map(
                    (part) =>
                      `${partLabel(part.key)} ${format(part.value, 2)} kr`,
                  )
                  .join(" · ")}
              </span>
            )}
          </>
        ) : kind === "cost" ? (
          <span
            className="energy-summary-legend"
            aria-label={en ? "Cost components" : "Kostnadsdeler"}
          >
            {keys.map((key) => (
              <span key={key}>
                <i data-part={key} />
                {partLabel(key)}
              </span>
            ))}
          </span>
        ) : bars.some((bar) => bar.level !== "unknown") ? (
          <span
            className="energy-summary-legend"
            title={
              kind === "spot"
                ? "Sammenlignet med prisene denne dagen"
                : "Sammenlignet med hjemmets registrerte forbruk i perioden"
            }
          >
            {["low", "medium", "high"].map((key, i) => (
              <span key={key}>
                <i data-part={key} />
                {
                  (en
                    ? ["Low", "Medium", "High"]
                    : ["Lavt", "Middels", "Høyt"])[i]
                }
              </span>
            ))}
            {current >= 0 && (
              <span className="energy-summary-now">
                {en ? "Now" : "Nå"} {time(bars[current].start)}
              </span>
            )}
          </span>
        ) : (
          <span>
            {en ? "Grey: insufficient history" : "Grått: for lite historikk"}
          </span>
        )}
      </div>
    </div>
  );
}
