import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Clock3, Tag } from "lucide-react";

type Price = { time_start: string; time_end: string; NOK_per_kWh: number };
const fmt = (n: number) =>
  n.toLocaleString("nb-NO", { maximumFractionDigits: 1 });
const time = (stamp: string | number) =>
  new Date(stamp).toLocaleTimeString("nb-NO", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Oslo",
  });
const date = (stamp: number) =>
  new Date(stamp).toLocaleDateString("nb-NO", {
    day: "numeric",
    month: "long",
    timeZone: "Europe/Oslo",
  });
const dayKey = (stamp: number) =>
  new Date(stamp).toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" });

export function EnergyPriceChart({
  today,
  tomorrow,
  area,
}: {
  today: Price[] | null;
  tomorrow: Price[] | null;
  area: string;
}) {
  const [day, setDay] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  // Use Oslo calendar days, including days where DST changes the number of hours.
  const target = new Date(dayKey(now) + "T12:00:00Z");
  target.setUTCDate(target.getUTCDate() + day);
  const rows =
    (day === 0 ? today : tomorrow)
      ?.filter(
        (p) =>
          Number.isFinite(p.NOK_per_kWh) &&
          Date.parse(p.time_end) > Date.parse(p.time_start) &&
          dayKey(Date.parse(p.time_start)) === dayKey(target.getTime()),
      )
      .slice()
      .sort((a, b) => Date.parse(a.time_start) - Date.parse(b.time_start)) ||
    [];
  const first = Date.parse(rows[0]?.time_start || ""),
    last = Date.parse(rows.at(-1)?.time_end || "");
  const current = rows.find(
    (p) => Date.parse(p.time_start) <= now && now < Date.parse(p.time_end),
  );
  const picked = rows.find((p) => p.time_start === selected) || current;
  const lo = Math.min(0, ...rows.map((p) => p.NOK_per_kWh * 100));
  const hi = Math.max(1, ...rows.map((p) => p.NOK_per_kWh * 100));
  const lower = lo < 0 ? lo - (hi - lo) * 0.08 : 0;
  const upper = hi + (hi - lo) * 0.08;
  const x = (stamp: number) => 58 + ((stamp - first) / (last - first)) * 800;
  const y = (value: number) => 235 - ((value - lower) / (upper - lower)) * 195;
  const chooseDay = (value: number) => {
    setDay(value);
    setSelected(null);
  };
  const duration = rows.reduce(
    (sum, p) => sum + Date.parse(p.time_end) - Date.parse(p.time_start),
    0,
  );
  const average = duration
    ? rows.reduce(
        (sum, p) =>
          sum +
          p.NOK_per_kWh * (Date.parse(p.time_end) - Date.parse(p.time_start)),
        0,
      ) / duration
    : 0;
  return (
    <section
      id="ep-price-chart"
      tabIndex={-1}
      className="ep-spot-chart"
      aria-label="Strømpriser i dag og i morgen"
    >
      <header>
        <div>
          <h3>
            <Tag size={18} /> Strømpriser
          </h3>
          <p>
            {area} · {date(target.getTime())} · Oslo-tid
          </p>
        </div>
        <div className="ep-price-days" role="group" aria-label="Velg prisdag">
          <button
            aria-label="Forrige prisdag"
            disabled={day === 0}
            onClick={() => chooseDay(0)}
          >
            <ChevronLeft size={18} />
          </button>
          <button aria-pressed={day === 0} onClick={() => chooseDay(0)}>
            I dag
          </button>
          <button aria-pressed={day === 1} onClick={() => chooseDay(1)}>
            I morgen
          </button>
          <button
            aria-label="Neste prisdag"
            disabled={day === 1}
            onClick={() => chooseDay(1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </header>
      {rows.length ? (
        <>
          <div className="ep-spot-stats">
            <div>
              <small>Laveste</small>
              <strong>
                {fmt(Math.min(...rows.map((p) => p.NOK_per_kWh)) * 100)}
              </strong>
            </div>
            <div>
              <small>Gjennomsnitt</small>
              <strong>{fmt(average * 100)}</strong>
            </div>
            <div>
              <small>Høyeste</small>
              <strong>
                {fmt(Math.max(...rows.map((p) => p.NOK_per_kWh)) * 100)}
              </strong>
            </div>
            <span>øre/kWh</span>
          </div>
          <div className="ep-chart-scroll">
            <svg
              className="ep-chart"
              viewBox="0 0 890 280"
              role="group"
              aria-label="Strømprisgraf"
            >
              <text x="58" y="18">
                øre/kWh
              </text>
              {[0, 1, 2, 3, 4].map((i) => {
                const value = lower + ((upper - lower) * i) / 4;
                return (
                  <g key={i}>
                    <line
                      x1="58"
                      x2="858"
                      y1={y(value)}
                      y2={y(value)}
                      className="ep-gridline"
                    />
                    <text x="48" y={y(value) + 4} textAnchor="end">
                      {fmt(value)}
                    </text>
                  </g>
                );
              })}
              <line
                x1="58"
                x2="858"
                y1={y(0)}
                y2={y(0)}
                stroke="var(--muted)"
                opacity=".5"
              />
              {rows.map((p, i) => {
                const start = Date.parse(p.time_start),
                  end = Date.parse(p.time_end),
                  value = p.NOK_per_kWh * 100;
                return (
                  <g key={p.time_start}>
                    <rect
                      x={x(start) + 1}
                      y={Math.min(y(value), y(0))}
                      width={Math.max(1, x(end) - x(start) - 2)}
                      height={Math.max(1, Math.abs(y(value) - y(0)))}
                      rx="2"
                      fill="var(--accent)"
                      opacity={p === current || p === picked ? 1 : 0.45}
                    />
                    {i % Math.max(1, Math.ceil(rows.length / 8)) === 0 && (
                      <text x={x(start)} y="262" textAnchor="middle">
                        {time(p.time_start)}
                      </text>
                    )}
                    <rect
                      x={x(start)}
                      y="36"
                      width={x(end) - x(start)}
                      height="203"
                      fill="transparent"
                      className="ep-chart-hit"
                      tabIndex={0}
                      role="button"
                      aria-pressed={p === picked}
                      aria-label={`${time(p.time_start)}–${time(p.time_end)}: ${fmt(value)} øre/kWh`}
                      onClick={() => setSelected(p.time_start)}
                      onFocus={() => setSelected(p.time_start)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelected(p.time_start);
                        }
                      }}
                    >
                      <title>
                        {time(p.time_start)}–{time(p.time_end)} · {fmt(value)}{" "}
                        øre/kWh
                      </title>
                    </rect>
                  </g>
                );
              })}
              {current && (
                <g
                  className="ep-now-marker"
                  aria-label={`Nå klokken ${time(now)}`}
                >
                  <line
                    x1={x(now)}
                    x2={x(now)}
                    y1="30"
                    y2="239"
                    stroke="var(--text)"
                    strokeWidth="2"
                    strokeDasharray="5 4"
                  />
                  <rect
                    x={Math.min(818, Math.max(58, x(now) - 20))}
                    y="5"
                    width="40"
                    height="22"
                    rx="6"
                    fill="var(--text)"
                  />
                  <text
                    x={Math.min(838, Math.max(78, x(now)))}
                    y="21"
                    textAnchor="middle"
                    style={{ fill: "var(--surface)", fontWeight: 600 }}
                  >
                    Nå
                  </text>
                </g>
              )}
            </svg>
          </div>
          <p className="ep-chart-mobile-hint">
            Sveip grafen for å se hele dagen. Trykk på en søyle for pris.
          </p>
          <p className="ep-chart-detail" aria-live="polite">
            {picked
              ? `${time(picked.time_start)}–${time(picked.time_end)} · ${fmt(picked.NOK_per_kWh * 100)} øre/kWh${picked === current ? " · akkurat nå" : ""}`
              : "Velg et tidspunkt i grafen for å se prisen."}
          </p>
        </>
      ) : (
        <div className="ep-empty">
          <Clock3 size={28} />
          <h4>
            {day
              ? "Morgendagens priser er ikke tilgjengelige ennå"
              : "Dagens priser er ikke tilgjengelige"}
          </h4>
          <p>
            {day
              ? "De vises automatisk når de er publisert og hentet inn."
              : "Vi prøver igjen automatisk. Du kan også trykke Oppdater."}
          </p>
        </div>
      )}
      <small className="ep-price-source">
        Spotpris uten mva., påslag, nettleie og støtte. Kilde:{" "}
        <a
          href="https://www.hvakosterstrommen.no/strompris-api"
          target="_blank"
          rel="noreferrer"
        >
          Hva koster strømmen / ENTSO-E
        </a>
        . NOK-prisen kan avvike fra Nord Pool.
      </small>
    </section>
  );
}
