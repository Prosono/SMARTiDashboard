import { useId, useLayoutEffect, useRef, useState } from "react";

export type HistoryBucket = {
  partial?: boolean;
  label: string;
  tickLabel?: string;
  start: string;
  end: string;
  kwh: number | null;
  cost: number;
  priced: boolean;
};
type Price = { time_start: string; time_end: string; NOK_per_kWh: number };

/** Keep missing readings as gaps. Prices are aligned by timestamp, never by array index. */
export function EnergyHistoryChart({
  points,
  prices,
  selected,
  onSelect,
  unit = "kWh",
  label = "Forbruksgraf",
  lang = "nb",
  fit = false,
}: {
  points: HistoryBucket[];
  prices: Price[];
  selected: number | null;
  onSelect: (index: number) => void;
  unit?: string;
  label?: string;
  lang?: string;
  fit?: boolean;
}) {
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const [measuredWidth, setMeasuredWidth] = useState(930);
  useLayoutEffect(() => {
    if (!fit || !container.current) return;
    const update = () =>
      setMeasuredWidth(Math.round(container.current!.clientWidth));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [fit]);
  const canvasWidth = fit ? Math.max(260, Math.min(930, measuredWidth)) : 930;
  const number = (value: number) =>
    value.toLocaleString(lang === "en" ? "en-GB" : "nb-NO", {
      maximumFractionDigits: 2,
    });
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const values = points.map((p) => {
    const start = Date.parse(p.start),
      end = Date.parse(p.end);
    const matches = prices
      .map((price) => ({
        price: price.NOK_per_kWh * 100,
        duration: Math.max(
          0,
          Math.min(end, Date.parse(price.time_end)) -
            Math.max(start, Date.parse(price.time_start)),
        ),
      }))
      .filter((p) => p.duration > 0 && Number.isFinite(p.price));
    const covered = matches.reduce((n, p) => n + p.duration, 0);
    return covered >= end - start && covered > 0
      ? matches.reduce((n, p) => n + p.price * p.duration, 0) / covered
      : null;
  });
  const maximum = Math.max(1, ...points.map((p) => p.kwh ?? 0));
  const ceiling = Math.ceil(maximum * 1.15 * 10) / 10;
  const floor = Math.min(0, ...points.map((p) => p.kwh ?? 0)) * 1.15;
  const actualPrices = values.filter((p): p is number => p != null);
  const low = Math.min(0, ...actualPrices),
    high = Math.max(1, ...actualPrices);
  const left = 52,
    top = 28,
    width = canvasWidth - left - 62,
    height = 216;
  const ticks = fit ? Math.max(2, Math.floor(width / 90)) : 8;
  const step = width / Math.max(1, points.length);
  const x = (i: number) => left + step * (i + 0.5);
  const y = (p: number) => top + height - ((p - low) / (high - low)) * height;
  const valueY = (value: number) =>
    top + height - ((value - floor) / (ceiling - floor)) * height;
  let path = "";
  values.forEach((p, i) => {
    if (p != null)
      path += `${i === 0 || values[i - 1] == null ? "M" : "L"}${x(i)},${y(p)} `;
  });
  return (
    <div
      className={`ep-chart-scroll${fit ? " ep-chart-fit" : ""}`}
      ref={container}
    >
      <svg
        className="ep-chart"
        viewBox={`0 0 ${canvasWidth} 292`}
        role="group"
        aria-label={label}
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="var(--accent)" stopOpacity=".95" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity=".55" />
          </linearGradient>
        </defs>
        <text x={left} y="15">
          {unit}
        </text>
        {actualPrices.length > 0 && (
          <text x={canvasWidth - 12} y="15" textAnchor="end">
            øre/kWh
          </text>
        )}
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <line
              x1={left}
              x2={left + width}
              y1={top + (height * i) / 4}
              y2={top + (height * i) / 4}
              className="ep-gridline"
            />
            <text x={left - 10} y={top + (height * i) / 4 + 4} textAnchor="end">
              {number(ceiling - ((ceiling - floor) * i) / 4)}
            </text>
            {actualPrices.length > 0 && (
              <text x={left + width + 12} y={top + (height * i) / 4 + 4}>
                {number(high - ((high - low) * i) / 4)}
              </text>
            )}
          </g>
        ))}
        {points.map((p, i) => (
          <g key={p.start}>
            {selected === i && (
              <rect
                x={left + step * i}
                y={top}
                width={step}
                height={height}
                fill="var(--accent)"
                opacity=".08"
              />
            )}
            {p.kwh != null ? (
              <rect
                x={left + step * i + step * 0.18}
                y={Math.min(valueY(p.kwh), valueY(0)) - (p.kwh === 0 ? 1 : 0)}
                width={step * 0.64}
                height={Math.max(1, Math.abs(valueY(p.kwh) - valueY(0)))}
                rx="4"
                fill={`url(#${id})`}
              />
            ) : (
              <line
                x1={x(i) - 3}
                x2={x(i) + 3}
                y1={valueY(0)}
                y2={valueY(0)}
                stroke="var(--muted)"
                strokeDasharray="2 2"
              />
            )}
            {(i % Math.max(1, Math.ceil(points.length / ticks)) === 0 ||
              i === points.length - 1) && (
              <text x={x(i)} y="272" textAnchor="middle">
                {p.tickLabel ??
                  (p.label.includes(":")
                    ? p.label.slice(0, 5)
                    : p.label.slice(5))}
              </text>
            )}
          </g>
        ))}
        {floor < 0 && (
          <line
            x1={left}
            x2={left + width}
            y1={valueY(0)}
            y2={valueY(0)}
            stroke="var(--muted)"
            strokeDasharray="3 3"
          />
        )}
        <path
          d={path}
          fill="none"
          stroke="var(--text)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {selected !== null && points[selected] && (
          <g aria-hidden="true">
            <line
              x1={x(selected)}
              x2={x(selected)}
              y1={top}
              y2={top + height}
              stroke="var(--muted)"
              strokeOpacity=".4"
              strokeDasharray="3 4"
            />
            {values[selected] !== null && (
              <circle
                cx={x(selected)}
                cy={y(values[selected]!)}
                r="4"
                fill="var(--text)"
                stroke="var(--surface)"
                strokeWidth="2"
              />
            )}
          </g>
        )}
        {points.map((p, i) => (
          <rect
            key={p.start}
            className="ep-chart-hit"
            data-missing={p.kwh == null || undefined}
            x={left + step * i}
            y={top}
            width={step}
            height={height}
            fill="transparent"
            tabIndex={selected === i || (selected === null && i === 0) ? 0 : -1}
            role="button"
            aria-label={`${p.label}${p.partial ? t(" (ufullstendig / pågående)", " (partial / in progress)") : ""}: ${p.kwh == null ? t("Måling mangler", "Reading missing") : number(p.kwh) + " " + unit}${values[i] == null ? "" : `, ${t("spotpris", "spot price")} ${number(values[i]!)} øre/kWh`}`}
            aria-pressed={selected === i}
            onClick={() => onSelect(i)}
            onFocus={() => onSelect(i)}
            onPointerEnter={() => onSelect(i)}
            onKeyDown={(e) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                e.preventDefault();
                const next =
                  e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? points.length - 1
                      : Math.max(
                          0,
                          Math.min(
                            points.length - 1,
                            i + (e.key === "ArrowRight" ? 1 : -1),
                          ),
                        );
                e.currentTarget.parentElement
                  ?.querySelectorAll<SVGRectElement>(".ep-chart-hit")
                  [next]?.focus();
                onSelect(next);
              }
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(i);
              }
            }}
          >
            <title>
              {p.label} ·{" "}
              {p.kwh == null
                ? t("Måling mangler", "Reading missing")
                : number(p.kwh) + " " + unit}
              {values[i] == null ? "" : ` · ${number(values[i]!)} øre/kWh`}
            </title>
          </rect>
        ))}
      </svg>
      <p className="ep-chart-mobile-hint">
        {fit
          ? t("Trykk på en søyle for detaljer.", "Select a bar for details.")
          : t(
              "Sveip grafen for å se hele perioden. Trykk for detaljer.",
              "Swipe to see the full period. Select a bar for details.",
            )}
      </p>
      <div className="ep-chart-legend">
        <span>
          <i />
          {unit === "kr"
            ? t("Kostnad (kr)", "Cost (kr)")
            : t("Forbruk (kWh)", "Consumption (kWh)")}
        </span>
        {actualPrices.length > 0 && (
          <span>
            <i className="ep-price-key" />
            {t("Spotpris (øre/kWh)", "Spot price (øre/kWh)")}
          </span>
        )}
      </div>
      {selected != null && values[selected] != null && (
        <p className="ep-selected-price" aria-live="polite">
          {t(
            "Spotpris for valgt tidsrom:",
            "Spot price for the selected interval:",
          )}{" "}
          {number(values[selected]!)} øre/kWh ·{" "}
          {t(
            "uten mva., påslag og nettleie",
            "excluding VAT, markup and grid fees",
          )}
        </p>
      )}
    </div>
  );
}
