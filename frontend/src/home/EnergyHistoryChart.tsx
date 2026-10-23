import { useId } from "react";

export type HistoryBucket = {
  partial?: boolean;
  label: string;
  start: string;
  end: string;
  kwh: number | null;
  cost: number;
  priced: boolean;
};
type Price = { time_start: string; time_end: string; NOK_per_kWh: number };
const number = (value: number) =>
  value.toLocaleString("nb-NO", { maximumFractionDigits: 2 });

/** Keep missing readings as gaps. Prices are aligned by timestamp, never by array index. */
export function EnergyHistoryChart({
  points,
  prices,
  selected,
  onSelect,
}: {
  points: HistoryBucket[];
  prices: Price[];
  selected: number | null;
  onSelect: (index: number) => void;
}) {
  const id = useId();
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
  const actualPrices = values.filter((p): p is number => p != null);
  const low = Math.min(0, ...actualPrices),
    high = Math.max(1, ...actualPrices);
  const left = 52,
    top = 28,
    width = 816,
    height = 216;
  const step = width / Math.max(1, points.length);
  const x = (i: number) => left + step * (i + 0.5);
  const y = (p: number) => top + height - ((p - low) / (high - low)) * height;
  let path = "";
  values.forEach((p, i) => {
    if (p != null)
      path += `${i === 0 || values[i - 1] == null ? "M" : "L"}${x(i)},${y(p)} `;
  });
  return (
    <div className="ep-chart-scroll">
      <svg
        className="ep-chart"
        viewBox="0 0 930 292"
        role="group"
        aria-label="Forbruksgraf"
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="var(--accent)" stopOpacity=".9" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity=".35" />
          </linearGradient>
        </defs>
        <text x={left} y="15">
          kWh
        </text>
        {actualPrices.length > 0 && (
          <text x="918" y="15" textAnchor="end">
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
              {number(ceiling * (1 - i / 4))}
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
                y={top + height - Math.max(1, (p.kwh / ceiling) * height)}
                width={step * 0.64}
                height={Math.max(1, (p.kwh / ceiling) * height)}
                rx="3"
                fill={`url(#${id})`}
              />
            ) : (
              <line
                x1={x(i) - 3}
                x2={x(i) + 3}
                y1={top + height}
                y2={top + height}
                stroke="var(--muted)"
                strokeDasharray="2 2"
              />
            )}
            {(i % Math.max(1, Math.ceil(points.length / 8)) === 0 ||
              i === points.length - 1) && (
              <text x={x(i)} y="272" textAnchor="middle">
                {p.label.includes(":") ? p.label.slice(0, 5) : p.label.slice(5)}
              </text>
            )}
          </g>
        ))}
        <path
          d={path}
          fill="none"
          stroke="var(--text)"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
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
            tabIndex={0}
            role="button"
            aria-label={`${p.label}${p.partial ? " (ufullstendig / pågående)" : ""}: ${p.kwh == null ? "Måling mangler" : number(p.kwh) + " kWh"}${values[i] == null ? "" : `, spotpris ${number(values[i]!)} øre/kWh`}`}
            aria-pressed={selected === i}
            onClick={() => onSelect(i)}
            onFocus={() => onSelect(i)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(i);
              }
            }}
          >
            <title>
              {p.label} ·{" "}
              {p.kwh == null ? "Måling mangler" : number(p.kwh) + " kWh"}
              {values[i] == null ? "" : ` · ${number(values[i]!)} øre/kWh`}
            </title>
          </rect>
        ))}
      </svg>
      <p className="ep-chart-mobile-hint">
        Sveip grafen for å se hele perioden. Trykk for detaljer.
      </p>
      <div className="ep-chart-legend">
        <span>
          <i />
          Forbruk (kWh)
        </span>
        {actualPrices.length > 0 && (
          <span>
            <i className="ep-price-key" />
            Spotpris (øre/kWh)
          </span>
        )}
      </div>
      {selected != null && values[selected] != null && (
        <p className="ep-selected-price" aria-live="polite">
          Spotpris for valgt tidsrom: {number(values[selected]!)} øre/kWh · uten
          mva., påslag og nettleie
        </p>
      )}
    </div>
  );
}
