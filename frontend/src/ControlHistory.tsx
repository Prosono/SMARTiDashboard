import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { controlState } from "./controlState";
import type { Control, Home } from "./types";
type Point = { time: string; value: number | null; state: string };
export type HistoryData = {
  points: Point[];
  unit?: string;
  start: string;
  end: string;
  samples: number;
  minimum: number | null;
  maximum: number | null;
};

export function ControlHistory({
  control,
  home,
  lang,
}: {
  control: Control;
  home: Home;
  lang: string;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const [entity, select] = useState(control.entity_id);
  const [hours, period] = useState("24");
  const choices = home.controls.filter(
    (c) =>
      c.entity_id === control.entity_id ||
      (control.device_id && c.device_id === control.device_id),
  );
  const selected = choices.find((c) => c.entity_id === entity) || control;
  const query = useQuery({
    queryKey: ["control-history", selected.entity_id, hours],
    queryFn: () =>
      api<HistoryData>(
        `controls/${encodeURIComponent(selected.entity_id)}/history?hours=${hours}`,
      ),
    staleTime: 30000,
  });
  return (
    <section
      className="control-history"
      aria-label={t("Enhetshistorikk", "Device history")}
    >
      <div className="control-history-filters">
        <label>
          {t("Måling / status", "Reading / state")}
          <select
            aria-label={t("Måling / status", "Reading / state")}
            value={selected.entity_id}
            onChange={(e) => select(e.target.value)}
          >
            {choices.map((c) => (
              <option key={c.entity_id} value={c.entity_id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Tidsrom", "Period")}
          <select
            aria-label={t("Tidsrom", "Period")}
            value={hours}
            onChange={(e) => period(e.target.value)}
          >
            <option value="6">{t("Siste 6 timer", "Last 6 hours")}</option>
            <option value="24">{t("Siste døgn", "Last 24 hours")}</option>
            <option value="168">{t("Siste 7 dager", "Last 7 days")}</option>
          </select>
        </label>
      </div>
      {query.isPending ? (
        <p role="status">{t("Henter historikk …", "Loading history …")}</p>
      ) : query.isError ? (
        <p role="alert">
          {t("Kunne ikke hente historikken.", "Could not load history.")}{" "}
          <button onClick={() => void query.refetch()}>
            {t("Prøv igjen", "Retry")}
          </button>
        </p>
      ) : query.data.points.length ? (
        <HistoryChart
          key={`${selected.entity_id}:${hours}`}
          data={query.data}
          control={selected}
          lang={lang}
        />
      ) : (
        <p className="control-history-empty">
          {t(
            "Ingen lagret historikk i dette tidsrommet. Enheten må ha historikk aktivert på hjemmesentralen.",
            "No recorded history for this period. History must be enabled for the entity on the controller.",
          )}
        </p>
      )}
    </section>
  );
}
export function HistoryChart({
  data,
  control,
  lang,
}: {
  data: HistoryData;
  control: Control;
  lang: string;
}) {
  const [index, inspect] = useState<number | null>(null);
  const locale = lang === "en" ? "en-GB" : "nb-NO";
  const points = data.points.filter((p) => Number.isFinite(Date.parse(p.time)));
  if (!points.length) return null;
  const numeric =
    ["sensor", "number", "input_number", "counter"].includes(control.domain) && points.some((p) => p.value !== null);
  const start = Date.parse(data.start),
    end = Date.parse(data.end);
  const x = (time: string) =>
    52 +
    Math.max(
      0,
      Math.min(1, (Date.parse(time) - start) / Math.max(1, end - start)),
    ) *
      550;
  const values = points.flatMap((p) => (p.value === null ? [] : [p.value]));
  const low = Math.min(...values),
    high = Math.max(...values);
  const y = (value: number) => 155 - ((value - low) / (high - low || 1)) * 120;
  const formatTime = (time: string) =>
    new Date(time).toLocaleString(locale, {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  const format = (p: Point) =>
    numeric && p.value !== null
      ? `${p.value.toLocaleString(locale, { maximumFractionDigits: 2 })} ${data.unit || ""}`
      : controlState(control, p.state, lang);
  const chosen =
    points[Math.min(index ?? points.length - 1, points.length - 1)];
  const states = [...new Set(points.map((p) => p.state))];
  const color = (state: string) =>
    ["unknown", "unavailable"].includes(state)
      ? "var(--muted)"
      : ["off", "closed", "locked"].includes(state)
        ? "var(--accent)"
        : `var(--history-color-${states.indexOf(state) % 4})`;
  const pointer = (el: SVGSVGElement, clientX: number) => {
    const rect = el.getBoundingClientRect();
    const time =
      start +
      Math.max(
        0,
        Math.min(1, (((clientX - rect.left) / rect.width) * 640 - 52) / 550),
      ) *
        (end - start);
    if (numeric) {
      let nearest = 0;
      points.forEach((p, i) => {
        if (
          Math.abs(Date.parse(p.time) - time) <
          Math.abs(Date.parse(points[nearest].time) - time)
        )
          nearest = i;
      });
      inspect(nearest);
    } else {
      let active = 0;
      points.forEach((p, i) => {
        if (Date.parse(p.time) <= time) active = i;
      });
      inspect(active);
    }
  };
  let path = "",
    drawing = false;
  for (const p of points) {
    if (p.value === null) {
      drawing = false;
      continue;
    }
    path += `${drawing ? "L" : "M"}${x(p.time)},${y(p.value)} `;
    drawing = true;
  }
  return (
    <div className="control-history-chart">
      <div className="control-history-reading" aria-live="polite">
        <strong>{format(chosen)}</strong>
        <time>{formatTime(chosen.time)}</time>
      </div>
      <svg
        viewBox="0 0 640 215"
        role="img"
        tabIndex={0}
        aria-label={
          lang === "en"
            ? "History chart. Use arrow keys to inspect readings."
            : "Historikkgraf. Bruk piltastene for å lese verdier."
        }
        onPointerMove={(e) => pointer(e.currentTarget, e.clientX)}
        onPointerDown={(e) => pointer(e.currentTarget, e.clientX)}
        onKeyDown={(e) => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            inspect(
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? points.length - 1
                  : Math.max(
                      0,
                      Math.min(
                        points.length - 1,
                        (index ?? points.length - 1) +
                          (e.key === "ArrowLeft" ? -1 : 1),
                      ),
                    ),
            );
          }
        }}
      >
        {numeric ? (
          <>
            {[low, (low + high) / 2, high].map((v, i) => (
              <g key={i}>
                <line
                  x1="52"
                  x2="602"
                  y1={y(v)}
                  y2={y(v)}
                  stroke="var(--line)"
                />
                <text x="46" y={y(v) + 4} textAnchor="end">
                  {v.toLocaleString(locale, { maximumFractionDigits: 1 })}
                </text>
              </g>
            ))}
            <path d={path} fill="none" stroke="var(--accent)" strokeWidth="3" />
            {points.map(
              (p, i) =>
                p.value !== null && (
                  <circle
                    key={i}
                    cx={x(p.time)}
                    cy={y(p.value)}
                    r="2.5"
                    fill="var(--accent)"
                  />
                ),
            )}
          </>
        ) : (
          <>
            {points.map((p, i) => (
              <rect
                key={i}
                x={x(p.time)}
                y="65"
                width={Math.max(
                  1,
                  x(points[i + 1]?.time || data.end) - x(p.time),
                )}
                height="70"
                fill={color(p.state)}
                opacity={index === null || index === i ? 0.85 : 0.35}
              />
            ))}
          </>
        )}
        <line
          x1={x(chosen.time)}
          x2={x(chosen.time)}
          y1="20"
          y2="172"
          stroke="var(--text)"
          strokeDasharray="4 4"
        />
        <text x="52" y="199">
          {formatTime(data.start)}
        </text>
        <text x="602" y="199" textAnchor="end">
          {formatTime(data.end)}
        </text>
      </svg>
      {!numeric && (
        <div className="control-history-legend">
          {states.map((state) => (
            <span key={state}>
              <i style={{ background: color(state) }} />
              {controlState(control, state, lang)}
            </span>
          ))}
        </div>
      )}
      <small>
        {lang === "en"
          ? "Point, tap or use arrow keys to inspect recorded values."
          : "Pek, trykk eller bruk piltastene for å lese lagrede verdier."}
      </small>
      {data.samples > points.length && (
        <small>
          {lang === "en"
            ? "Aggregated view; some brief changes may be omitted."
            : "Forenklet visning; enkelte korte endringer kan være utelatt."}
        </small>
      )}
    </div>
  );
}
