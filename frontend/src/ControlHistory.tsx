import { useMemo, useState } from "react";
import { MeasuredChart } from "./home/MeasuredChart";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { controlState } from "./controlState";
import type { Control, Home } from "./types";
type Point = { time: string; value: number | null; state: string };
export type HistoryData = {
  points: Point[];
  unit?: string | null;
  start: string;
  end: string;
  samples: number;
  minimum: number | null;
  maximum: number | null;
  coverage_start?: string | null;
  source?: "recorder" | "statistics" | "mixed";
};

export type HistoryPeriodHours = "6" | "24" | "168" | "336" | "720";

const historyPeriods: [HistoryPeriodHours, string, string][] = [
  ["6", "Siste 6 timer", "Last 6 hours"],
  ["24", "Siste døgn", "Last 24 hours"],
  ["168", "Siste 7 dager", "Last 7 days"],
  ["336", "Siste 14 dager", "Last 14 days"],
  ["720", "Siste 30 dager", "Last 30 days"],
];

export function HistoryPeriodSelect({
  value,
  onChange,
  lang,
  label = lang === "en" ? "Period" : "Tidsrom",
}: {
  value: HistoryPeriodHours;
  onChange: (value: HistoryPeriodHours) => void;
  lang: string;
  label?: string;
}) {
  return (
    <label>
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value as HistoryPeriodHours)}
      >
        {historyPeriods.map(([hours, nb, en]) => (
          <option key={hours} value={hours}>
            {lang === "en" ? en : nb}
          </option>
        ))}
      </select>
    </label>
  );
}

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
  const [hours, period] = useState<HistoryPeriodHours>("24");
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
        <HistoryPeriodSelect value={hours} onChange={period} lang={lang} />
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
      ) : (
        <HistoryResult
          key={`${selected.entity_id}:${hours}`}
          data={query.data}
          control={selected}
          lang={lang}
        />
      )}
    </section>
  );
}
type HistoryProps = {
  data: HistoryData;
  control: Control;
  lang: string;
};

export function HistoryResult({ data, control, lang }: HistoryProps) {
  const english = lang === "en";
  const first = Date.parse(data.coverage_start || "");
  const startsLater = first > Date.parse(data.start);
  return (
    <>
      {data.points.length ? (
        <HistoryChart data={data} control={control} lang={lang} />
      ) : (
        <p className="control-history-empty">
          {english
            ? "No recorded history in this period."
            : "Ingen lagret historikk i dette tidsrommet."}
        </p>
      )}
      {(startsLater ||
        data.source === "statistics" ||
        data.source === "mixed") && (
        <div className="control-history-coverage">
          {startsLater && (
            <p>
              {english
                ? "History available from"
                : "Historikk tilgjengelig fra"}{" "}
              <time dateTime={data.coverage_start!}>
                {new Date(first).toLocaleString(english ? "en-GB" : "nb-NO", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
              .
            </p>
          )}
          {data.source === "statistics" && (
            <p>{english ? "Hourly statistics" : "Timestatistikk"}</p>
          )}
          {data.source === "mixed" && (
            <p>
              {english
                ? "Older readings are shown as hourly statistics."
                : "Eldre målinger vises som timestatistikk."}
            </p>
          )}
        </div>
      )}
    </>
  );
}

export function HistoryChart({ data, control, lang }: HistoryProps) {
  const { start, end } = data;
  const points = useMemo(() => {
    const begin = Date.parse(start);
    const finish = Date.parse(end);
    return data.points
      .map((point) => ({ point, time: Date.parse(point.time) }))
      .filter(({ time }) => time >= begin && time <= finish)
      .sort((a, b) => a.time - b.time)
      .map(({ point }) => point);
  }, [data.points, start, end]);
  if (!points.length) return null;
  const history = { ...data, points };
  return ["sensor", "number", "input_number", "counter", "climate"].includes(
    control.domain,
  ) && points.some((p) => p.value !== null && Number.isFinite(p.value)) ? (
    <NumericHistoryChart data={history} control={control} lang={lang} />
  ) : (
    <StateHistoryChart data={history} control={control} lang={lang} />
  );
}

function NumericHistoryChart({
  data,
  control,
  lang,
}: {
  data: HistoryData;
  control: Control;
  lang: string;
}) {
  const [stamp, choose] = useState<number | null>(null);
  const series = useMemo(
    () => [
      {
        id: control.entity_id,
        name: control.name,
        points: data.points,
        color: "var(--accent)",
      },
    ],
    [control.entity_id, control.name, data.points],
  );
  const chosen =
    stamp === null
      ? data.points.at(-1)
      : data.points.find((p) => Date.parse(p.time) === stamp);
  const en = lang === "en",
    locale = en ? "en-GB" : "nb-NO";
  const shown =
    chosen?.time ?? (stamp === null ? data.end : new Date(stamp).toISOString());
  return (
    <div className="control-history-chart control-history-numeric">
      <div className="control-history-reading" aria-live="polite">
        <strong>
          {chosen && chosen.value !== null && Number.isFinite(chosen.value)
            ? `${chosen.value.toLocaleString(locale, { maximumFractionDigits: 2 })} ${data.unit || ""}`
            : en
              ? "Reading missing"
              : "Måling mangler"}
        </strong>
        <time dateTime={shown}>
          {new Date(shown).toLocaleString(locale, {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
      </div>
      <MeasuredChart
        series={series}
        unit={data.unit || ""}
        lang={lang}
        label={control.name}
        domain={{ start: Date.parse(data.start), end: Date.parse(data.end) }}
        onInspect={choose}
      />
      <small>
        {en
          ? "Point, tap or use arrow keys to inspect recorded values."
          : "Pek, trykk eller bruk piltastene for å lese lagrede verdier."}
      </small>
      {data.samples > data.points.length && (
        <small>
          {en
            ? "Some brief changes may be omitted in this simplified view."
            : "Den forenklede visningen kan utelate enkelte korte endringer."}
        </small>
      )}
    </div>
  );
}

function StateHistoryChart({ data, control, lang }: HistoryProps) {
  const [inspection, inspect] = useState<number | null>(null);
  const en = lang === "en";
  const locale = en ? "en-GB" : "nb-NO";
  const { points } = data;
  const stamps = useMemo(
    () => points.map((point) => Date.parse(point.time)),
    [points],
  );
  const start = Date.parse(data.start);
  const end = Date.parse(data.end);
  const selected = inspection ?? stamps[stamps.length - 1];
  let index = stamps.length - 1;
  while (index >= 0 && stamps[index] > selected) index--;
  const chosen = points[index];
  const x = (time: number) =>
    52 +
    Math.max(0, Math.min(1, (time - start) / Math.max(1, end - start))) * 550;
  const formatTime = (time: number, full = false) =>
    new Date(time).toLocaleString(
      locale,
      full
        ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
        : end - start > 36 * 3600000
          ? { day: "numeric", month: "short" }
          : { hour: "2-digit", minute: "2-digit" },
    );
  const states = [...new Set(points.map((point) => point.state))];
  const color = (state: string) =>
    ["unknown", "unavailable"].includes(state)
      ? "var(--muted)"
      : ["off", "closed", "locked"].includes(state)
        ? "var(--accent)"
        : `var(--history-color-${states.indexOf(state) % 4})`;
  function pointer(svg: SVGSVGElement, clientX: number) {
    const rect = svg.getBoundingClientRect();
    const progress = (((clientX - rect.left) / rect.width) * 640 - 52) / 550;
    inspect(start + Math.max(0, Math.min(1, progress)) * (end - start));
  }

  return (
    <div className="control-history-chart">
      <div className="control-history-reading" aria-live="polite">
        <strong>
          {chosen
            ? controlState(control, chosen.state, lang)
            : en
              ? "No recorded state"
              : "Ingen lagret status"}
        </strong>
        <time dateTime={new Date(selected).toISOString()}>
          {formatTime(selected, true)}
        </time>
      </div>
      <svg
        viewBox="0 0 640 215"
        role="img"
        tabIndex={0}
        aria-label={`${en ? "History chart" : "Historikkgraf"}. ${formatTime(start, true)}–${formatTime(end, true)}. ${en ? "Use arrow keys to inspect readings." : "Bruk piltastene for å lese verdier."}`}
        onPointerMove={(event) => pointer(event.currentTarget, event.clientX)}
        onPointerDown={(event) => pointer(event.currentTarget, event.clientX)}
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
            return;
          event.preventDefault();
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? points.length - 1
                : Math.max(
                    0,
                    Math.min(
                      points.length - 1,
                      index + (event.key === "ArrowLeft" ? -1 : 1),
                    ),
                  );
          inspect(stamps[next]);
        }}
      >
        {points.map((point, i) => (
          <rect
            key={i}
            x={x(stamps[i])}
            y="65"
            width={Math.max(1, x(stamps[i + 1] ?? end) - x(stamps[i]))}
            height="70"
            fill={color(point.state)}
            opacity={inspection === null || i === index ? 0.85 : 0.35}
          />
        ))}
        <line
          x1={x(selected)}
          x2={x(selected)}
          y1="20"
          y2="172"
          stroke="var(--text)"
          strokeDasharray="4 4"
        />
        <text x="52" y="199">
          {formatTime(start)}
        </text>
        {end - start > 36 * 3600000 && (
          <text x="327" y="199" textAnchor="middle">
            {formatTime((start + end) / 2)}
          </text>
        )}
        <text x="602" y="199" textAnchor="end">
          {formatTime(end)}
        </text>
      </svg>
      <div className="control-history-legend">
        {states.map((state) => (
          <span key={state}>
            <i style={{ background: color(state) }} />
            {controlState(control, state, lang)}
          </span>
        ))}
      </div>
      <small>
        {en
          ? "Point, tap or use arrow keys to inspect recorded states."
          : "Pek, trykk eller bruk piltastene for å lese lagrede tilstander."}
      </small>
      {data.samples > points.length && (
        <small>
          {en
            ? "Some brief changes may be omitted in this simplified view."
            : "Den forenklede visningen kan utelate enkelte korte endringer."}
        </small>
      )}
    </div>
  );
}
