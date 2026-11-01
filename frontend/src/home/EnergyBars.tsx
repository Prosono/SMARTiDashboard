import { useId, useMemo, useState, type CSSProperties } from "react";
import type { MetricHistory } from "./metricHistory";
import { energyBars } from "./energyBarsModel";
import "./energyBars.css";

export function EnergyBars({
  history,
  label,
  lang,
}: {
  history: MetricHistory;
  label: string;
  lang: string;
}) {
  const bars = useMemo(() => energyBars(history), [history]),
    [selected, setSelected] = useState<number | null>(null),
    id = useId(),
    en = lang === "en",
    locale = en ? "en-GB" : "nb-NO";
  const values = bars.flatMap((b) => (b.value === null ? [] : [b.value])),
    min = Math.min(0, ...values),
    max = Math.max(0, ...values) || (min === 0 ? 1 : 0),
    span = max - min || 1,
    zero = (max / span) * 100,
    active =
      selected === null ? null : bars[Math.min(selected, bars.length - 1)],
    peak = values.length ? Math.max(...values) : null,
    format = (n: number) =>
      n.toLocaleString(locale, {
        maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 2,
      }),
    time = (n: number) =>
      new Date(n).toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
      });
  const summary =
    history.basis === "hourly"
      ? en
        ? "Consumption per hour"
        : "Forbruk per time"
      : en
        ? "Hourly average"
        : "Gjennomsnitt per time";
  const selectAt = (clientX: number, element: HTMLDivElement) => {
    const r = element.getBoundingClientRect();
    setSelected(
      Math.max(
        0,
        Math.min(
          bars.length - 1,
          Math.floor(((clientX - r.left) / r.width) * bars.length),
        ),
      ),
    );
  };
  return (
    <div className="energy-bars" data-basis={history.basis}>
      <div className="energy-bars-caption">
        <span>{summary}</span>
        <span>{history.unit}</span>
      </div>
      <div
        className="energy-bars-chart"
        role="img"
        tabIndex={0}
        aria-label={`${label}. ${summary}. ${en ? "Use arrow keys to explore" : "Bruk piltastene for å utforske"}`}
        aria-describedby={active ? id : undefined}
        onPointerDown={(e) => selectAt(e.clientX, e.currentTarget)}
        onPointerMove={(e) => selectAt(e.clientX, e.currentTarget)}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse" && !e.currentTarget.matches(":focus"))
            setSelected(null);
        }}
        onBlur={() => setSelected(null)}
        onKeyDown={(e) => {
          if (
            !["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(
              e.key,
            )
          )
            return;
          e.preventDefault();
          if (e.key === "Escape") setSelected(null);
          else
            setSelected((n) =>
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? bars.length - 1
                  : Math.max(
                      0,
                      Math.min(
                        bars.length - 1,
                        (n ?? (e.key === "ArrowLeft" ? bars.length : -1)) +
                          (e.key === "ArrowLeft" ? -1 : 1),
                      ),
                    ),
            );
        }}
      >
        <div className="energy-bars-grid" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div
          className="energy-bars-zero"
          style={{ top: `calc(${zero}% + ${(1 - zero / 100) * 14}px)` }}
          aria-hidden="true"
        />
        {bars.map((bar, i) => (
          <div
            key={bar.time}
            className="energy-bar-slot"
            data-selected={selected === i || undefined}
            aria-hidden="true"
          >
            <span
              className="energy-bar"
              data-level={bar.level}
              data-value={bar.value ?? "missing"}
              data-coverage={bar.coverage}
              data-ongoing={bar.ongoing || undefined}
              style={
                {
                  "--bar-top": `${bar.value === null ? zero : ((max - Math.max(0, bar.value)) / span) * 100}%`,
                  "--bar-height": `${bar.value === null ? 0 : (Math.abs(bar.value) / span) * 100}%`,
                } as CSSProperties
              }
            />
            {bar.value === peak &&
              peak !== null &&
              selected === null &&
              i === bars.findIndex((b) => b.value === peak) && (
                <span className="energy-bars-peak" data-level={bar.level}>
                  {format(peak)}
                </span>
              )}
          </div>
        ))}
      </div>
      <div className="energy-bars-axis" aria-hidden="true">
        {bars.map((b, i) => (
          <span key={b.time}>
            {i === 0 || i === bars.length - 1 || i % 4 === 0
              ? new Date(b.time).toLocaleTimeString(locale, { hour: "2-digit" })
              : ""}
          </span>
        ))}
      </div>
      <div
        id={id}
        className="energy-bars-detail"
        role="status"
        aria-live="polite"
      >
        {active ? (
          <>
            <span>
              {new Date(active.time).toLocaleDateString(locale, {
                day: "numeric",
                month: "short",
              })}{" "}
              · {time(active.time)}–{time(active.end)}
            </span>
            <strong>
              {active.value === null
                ? en
                  ? "No reading"
                  : "Ingen måling"
                : `${format(active.value)} ${history.unit}`}
              {active.value !== null &&
              (active.ongoing || active.coverage < active.end - active.time)
                ? ` · ${active.ongoing ? (en ? "ongoing" : "pågår") : en ? "partial" : "delvis"}`
                : ""}
            </strong>
          </>
        ) : bars.some((b) => ["low", "medium", "high"].includes(b.level)) ? (
          <span
            className="energy-bars-legend"
            aria-label={
              en
                ? "Green: low, amber: medium, red: high"
                : "Grønt: lavt, gult: middels, rødt: høyt"
            }
          >
            {[
              en ? "Low" : "Lavt",
              en ? "Medium" : "Middels",
              en ? "High" : "Høyt",
            ].map((text) => (
              <span key={text}>
                <i />
                {text}
              </span>
            ))}
          </span>
        ) : (
          <span>
            {en ? "Grey: insufficient baseline" : "Grått: for lite historikk"}
            {bars.some((b) => b.level === "export")
              ? en
                ? " · blue: export"
                : " · blått: levering"
              : ""}
          </span>
        )}
      </div>
    </div>
  );
}
