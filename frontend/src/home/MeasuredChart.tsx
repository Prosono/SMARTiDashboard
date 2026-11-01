import { useId, useMemo, useState, type CSSProperties } from "react";
import {
  chartColor,
  measuredGeometry,
  measuredPath,
  nearestSample,
  type MeasuredSeries,
} from "./chartModel";

// Round caps stay circular when a responsive SVG has a non-square viewBox scale.
function ChartDot({
  x,
  y,
  color,
  selected = false,
}: {
  x: number;
  y: number;
  color: string;
  selected?: boolean;
}) {
  return (
    <g className="measured-chart-dot" aria-hidden="true">
      <line
        x1={x}
        x2={x + 0.001}
        y1={y}
        y2={y}
        stroke="var(--surface)"
        strokeWidth={selected ? 11 : 9}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={x}
        x2={x + 0.001}
        y1={y}
        y2={y}
        stroke={color}
        strokeWidth={selected ? 8 : 6}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

/** One visual language for real recorder curves. Inspection never invents intermediate values. */
export function MeasuredChart({
  series,
  unit,
  lang,
  label,
  className = "",
  interactive = true,
  domain,
  onInspect,
}: {
  series: MeasuredSeries[];
  unit: string;
  lang: string;
  label: string;
  className?: string;
  interactive?: boolean;
  domain?: { start: number; end: number };
  onInspect?: (time: number) => void;
}) {
  const id = useId().replaceAll(":", "");
  const [selected, select] = useState<number | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  const geometry = useMemo(
    () => measuredGeometry(series, domain),
    [series, domain?.start, domain?.end],
  );
  if (!geometry) return null;
  const { x, y, segments, ticks, stamps, start, end, low, high } = geometry;
  const en = lang === "en";
  const format = (value: number) =>
    value.toLocaleString(en ? "en-GB" : "nb-NO", {
      maximumFractionDigits:
        geometry.step < 1
          ? Math.min(9, Math.max(1, Math.ceil(-Math.log10(geometry.step)) + 1))
          : 1,
    });
  const time = (value: number, full = false) =>
    new Date(value).toLocaleString(
      en ? "en-GB" : "nb-NO",
      full || end - start > 36 * 3600000
        ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
        : { hour: "2-digit", minute: "2-digit" },
    );
  const choose = (value: number) => {
    const nearest = stamps.reduce((a, b) =>
      Math.abs(a - value) <= Math.abs(b - value) ? a : b,
    );
    select(nearest);
    onInspect?.(nearest);
  };
  const point = (svg: SVGSVGElement, clientX: number) => {
    const box = svg.getBoundingClientRect();
    choose(
      start +
        Math.max(
          0,
          Math.min(1, (((clientX - box.left) / box.width) * 480 - 8) / 464),
        ) *
          (end - start),
    );
  };
  const chosen =
    selected !== null && selected >= start && selected <= end ? selected : null;
  const description = `${label}. ${en ? "Recorded range" : "Målt spenn"}: ${format(low)}–${format(high)} ${unit}. ${time(start, true)}–${time(end, true)}.`;
  return (
    <span
      className={`measured-chart ${className}`}
      data-inspecting={chosen !== null}
    >
      <span className="measured-chart-scale" aria-hidden="true">
        {ticks.map((tick, i) => (
          <span key={i} style={{ top: `${(y(tick) / 128) * 100}%` }}>
            {format(tick)}
            {i === 0 && <small>{unit}</small>}
          </span>
        ))}
      </span>
      <span className="measured-chart-stage">
        <svg
          viewBox="0 0 480 128"
          preserveAspectRatio="none"
          role="img"
          tabIndex={interactive ? 0 : undefined}
          aria-label={`${description}${interactive ? (en ? " Use arrow keys to inspect recorded readings." : " Bruk piltastene for å lese lagrede målinger.") : ""}`}
          onPointerMove={
            interactive
              ? (e) => {
                  setKeyboard(false);
                  point(e.currentTarget, e.clientX);
                }
              : undefined
          }
          onPointerDown={
            interactive
              ? (e) => {
                  setKeyboard(false);
                  point(e.currentTarget, e.clientX);
                }
              : undefined
          }
          onPointerLeave={
            interactive
              ? () => {
                  if (!keyboard) select(null);
                }
              : undefined
          }
          onPointerCancel={() => select(null)}
          onFocus={
            interactive
              ? () => {
                  setKeyboard(true);
                  if (selected === null) choose(stamps.at(-1)!);
                }
              : undefined
          }
          onBlur={() => {
            select(null);
            setKeyboard(false);
          }}
          onKeyDown={
            interactive
              ? (e) => {
                  if (
                    ![
                      "ArrowLeft",
                      "ArrowRight",
                      "Home",
                      "End",
                      "Escape",
                    ].includes(e.key)
                  )
                    return;
                  e.preventDefault();
                  setKeyboard(true);
                  if (e.key === "Escape") {
                    select(null);
                    return;
                  }
                  const index =
                    chosen === null
                      ? stamps.length - 1
                      : Math.max(0, stamps.indexOf(chosen));
                  choose(
                    stamps[
                      e.key === "Home"
                        ? 0
                        : e.key === "End"
                          ? stamps.length - 1
                          : Math.max(
                              0,
                              Math.min(
                                stamps.length - 1,
                                index + (e.key === "ArrowLeft" ? -1 : 1),
                              ),
                            )
                    ],
                  );
                }
              : undefined
          }
        >
          <defs>
            {series.map((s, i) => (
              <linearGradient
                key={s.id}
                id={`${id}-${i}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop stopColor={s.color || "currentColor"} stopOpacity=".17" />
                <stop
                  offset="1"
                  stopColor={s.color || "currentColor"}
                  stopOpacity=".01"
                />
              </linearGradient>
            ))}
          </defs>
          {ticks.map((tick, i) => (
            <line
              key={i}
              className="measured-chart-guide"
              data-zero={tick === 0}
              x1="8"
              x2="472"
              y1={y(tick)}
              y2={y(tick)}
            />
          ))}
          {series.map((s, i) => (
            <g key={s.id} data-source={s.id}>
              {segments[i].map((segment, j) => {
                const positions = segment.map((p) => ({
                  x: x(p.time),
                  y: y(p.value!),
                }));
                const path = measuredPath(positions);
                return (
                  <g key={j}>
                    {series.length === 1 && segment.length > 1 && (
                      <path
                        className="measured-chart-area"
                        d={`${path} L${positions.at(-1)!.x},120 L${positions[0].x},120 Z`}
                        fill={`url(#${id}-${i})`}
                      />
                    )}
                    <path
                      className="measured-chart-line"
                      d={path}
                      fill="none"
                      stroke={s.color || "currentColor"}
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                    {segment.length === 1 && (
                      <ChartDot
                        x={positions[0].x}
                        y={positions[0].y}
                        color={s.color || "currentColor"}
                      />
                    )}
                  </g>
                );
              })}
              {chosen === null && segments[i].at(-1)?.at(-1) && (
                <ChartDot
                  x={x(segments[i].at(-1)!.at(-1)!.time)}
                  y={y(segments[i].at(-1)!.at(-1)!.value!)}
                  color={s.color || "currentColor"}
                />
              )}
            </g>
          ))}
          {chosen !== null && (
            <g className="measured-chart-inspection">
              <line
                className="measured-chart-cursor"
                x1={x(chosen)}
                x2={x(chosen)}
                y1="4"
                y2="120"
              />
              {series.map((s) => {
                const p = nearestSample(s.points, chosen);
                return p?.value !== null &&
                  p?.value !== undefined &&
                  Number.isFinite(p.value) ? (
                  <ChartDot
                    key={s.id}
                    x={x(Date.parse(p.time))}
                    y={y(p.value)}
                    color={s.color || "currentColor"}
                    selected
                  />
                ) : null;
              })}
            </g>
          )}
        </svg>
        {chosen !== null && (
          <span
            className="measured-chart-tooltip"
            data-many={series.length > 3}
            data-side={x(chosen) < 240 ? "right" : "left"}
            role="status"
            aria-live={keyboard ? "polite" : "off"}
          >
            <time>{time(chosen, true)}</time>
            {series.map((s, i) => {
              const p = nearestSample(s.points, chosen);
              const value = p?.value;
              return (
                <span
                  className="measured-chart-tooltip-row"
                  key={s.id}
                  style={
                    {
                      "--series-color":
                        s.color ||
                        (series.length === 1
                          ? "var(--metric-color,var(--accent))"
                          : chartColor(i)),
                    } as CSSProperties
                  }
                >
                  <i />
                  <span>
                    {s.name}
                    {p && Date.parse(p.time) !== chosen && (
                      <small>{time(Date.parse(p.time))}</small>
                    )}
                  </span>
                  <strong>
                    {value !== null &&
                    value !== undefined &&
                    Number.isFinite(value)
                      ? `${format(value)} ${unit}`
                      : "—"}
                  </strong>
                </span>
              );
            })}
            <small>{en ? "Recorded readings" : "Lagrede målinger"}</small>
          </span>
        )}
      </span>
      <span className="measured-chart-times" aria-hidden="true">
        <span>{time(start)}</span>
        {end > start && (
          <>
            {end - start > 3600000 && <span>{time((start + end) / 2)}</span>}
            <span>{time(end)}</span>
          </>
        )}
      </span>
    </span>
  );
}
