import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Settings2,
  TrendingDown,
  TrendingUp,
  BarChart3,
  ChartNoAxesCombined,
  X,
  Check,
  Sun,
  Battery,
  Plug,
} from "lucide-react";
import { api } from "../api";
import type { Control } from "../types";
import { reading } from "./homeModel";
import "./energy.css";
type Part = "summary" | "chart" | "comparison" | "meters" | "sources";
type Preferences = {
  meters: string[];
  hidden: Part[];
  period: "24h" | "7d" | "30d";
  chart: "bar" | "line";
};
type Summary = {
  value: number | null;
  complete: boolean;
  coverage: number;
  peak: number | null;
  points: { time: string; value: number | null }[];
};
type Series = {
  id: string;
  name: string;
  unit: string;
  kind: "energy" | "power";
  current: Summary;
  previous: Summary;
  change_percent: number | null;
};
type Statistics = {
  start: string;
  end: string;
  previous_start: string;
  period: string;
  series: Series[];
  demo: boolean;
};
const defaults: Preferences = {
  meters: [],
  hidden: [],
  period: "24h",
  chart: "bar",
};
const colors = [
  "#248c79",
  "#cf8536",
  "#638fd0",
  "#b179af",
  "#9b8e46",
  "#ca756a",
];
export function Energy({
  meters,
  selected,
  onSelect,
  offline,
  lang,
  controls,
}: {
  meters: Control[];
  selected: string | null;
  onSelect: (id: string) => void;
  offline: boolean;
  lang: string;
  controls: Control[];
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb),
    locale = lang === "en" ? "en-GB" : "nb-NO";
  const qc = useQueryClient(),
    gradient = useId().replaceAll(":", "");
  const chartRef = useRef<SVGSVGElement>(null);
  const [chartWidth, setChartWidth] = useState(760);
  const prefQuery = useQuery({
    queryKey: ["energy-preferences"],
    queryFn: () => api<Preferences>("home/energy/preferences"),
  });
  const pref = prefQuery.data || defaults;
  const ids = (
    pref.meters.length ? pref.meters : meters.slice(0, 4).map((c) => c.id)
  ).filter((id) => meters.some((c) => c.id === id));
  const [configured, configure] = useState(false),
    [draft, setDraft] = useState<Preferences>(defaults),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [point, setPoint] = useState<number | null>(null);
  const chosen = ids.includes(selected || "") ? selected! : ids[0];
  const stats = useQuery({
    queryKey: ["energy-statistics", pref.period, ids],
    queryFn: () =>
      api<Statistics>(
        `home/energy/statistics?${new URLSearchParams([["period", pref.period], ...ids.map((id) => ["ids", id])])}`,
      ),
    enabled: !offline && !!prefQuery.data && !!ids.length,
    staleTime: 60000,
    refetchInterval: 300000,
    retry: false,
  });
  const sources = useQuery({
    queryKey: ["home-energy-sources"],
    queryFn: () =>
      api<{ id: string; type: string; measurement: string }[]>(
        "home/energy-sources",
      ),
    enabled: !offline && !pref.hidden.includes("sources"),
    staleTime: 300000,
    retry: false,
  });
  const series = stats.data?.series.find((s) => s.id === chosen),
    meter = meters.find((c) => c.id === chosen),
    points = series?.current.points || [],
    previous = series?.previous.points || [];
  const number = (v: number | null | undefined) =>
    v == null ? "—" : v.toLocaleString(locale, { maximumFractionDigits: 2 });
  const date = (v: string, detail = false) =>
    new Date(v).toLocaleString(
      locale,
      pref.period === "24h" && !detail
        ? { hour: "2-digit", minute: "2-digit" }
        : {
            day: "numeric",
            month: "short",
            ...(detail ? { hour: "2-digit", minute: "2-digit" } : {}),
          },
    );
  const show = (part: Part) => !pref.hidden.includes(part);
  async function save(value: Preferences) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const saved = await api<Preferences>(
        "home/energy/preferences",
        "PUT",
        value,
      );
      qc.setQueryData(["energy-preferences"], saved);
      setPoint(null);
      configure(false);
    } catch {
      setError(
        t(
          "Kunne ikke lagre energivalgene. Prøv igjen.",
          "Could not save energy preferences. Retry.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  const samples = [...points, ...(show("comparison") ? previous : [])].flatMap(
    (p) => (p.value === null ? [] : [p.value]),
  );
  useEffect(() => {
    if (!chartRef.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setChartWidth(Math.max(260, Math.round(entry.contentRect.width))),
    );
    observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, [series?.id, pref.period, pref.hidden, samples.length]);
  const chartLeft = 46,
    chartRight = chartWidth - 14,
    chartSpan = chartRight - chartLeft;
  const min = Math.min(0, ...samples),
    max = Math.max(0.001, ...samples),
    span = max - min;
  const x = (i: number) =>
      chartLeft + ((i + 0.5) / Math.max(points.length, 1)) * chartSpan,
    y = (value: number) => 188 - ((value - min) / span) * 160;
  const path = (values: typeof points) => {
    let pen = false;
    return values
      .map((p, i) => {
        if (p.value === null) {
          pen = false;
          return "";
        }
        const d = `${pen ? "L" : "M"}${x(i)} ${y(p.value)}`;
        pen = true;
        return d;
      })
      .join(" ");
  };
  const activePoint = point !== null ? points[point] : null;
  const sections: [Part, string][] = [
    ["summary", t("Nøkkeltall", "Key readings")],
    ["chart", t("Graf", "Chart")],
    ["comparison", t("Forrige periode", "Previous period")],
    ["meters", t("Måleroversikt", "Meter overview")],
    [
      "sources",
      t("Sol, batteri og forbrukere", "Solar, battery and consumers"),
    ],
  ];
  return (
    <section className="home-panel energy-workspace">
      <header className="energy-workspace-heading">
        <div>
          <span className="eyebrow">
            {t("Historikk & innsikt", "History & insights")}
          </span>
          <h2>{t("Energien over tid", "Your energy over time")}</h2>
          <p>
            {t(
              "Se mønstrene i forbruket, time for time.",
              "Discover how your energy use changes, hour by hour.",
            )}
          </p>
        </div>
        <button
          className="home-customize"
          disabled={!prefQuery.data || busy}
          aria-expanded={configured}
          onClick={() => {
            setDraft({ ...pref, meters: ids });
            configure(!configured);
          }}
        >
          <Settings2 size={17} />
          {t("Tilpass energi", "Customize energy")}
        </button>
      </header>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {prefQuery.isError && (
        <p role="alert">
          {t(
            "Energivalgene kunne ikke lastes.",
            "Energy preferences could not load.",
          )}{" "}
          <button onClick={() => prefQuery.refetch()}>
            {t("Prøv igjen", "Retry")}
          </button>
        </p>
      )}
      {configured && (
        <div className="energy-settings">
          <header>
            <h3>{t("Din energioversikt", "Your energy overview")}</h3>
            <button
              className="icon-button"
              aria-label={t("Lukk energivalg", "Close energy preferences")}
              disabled={busy}
              onClick={() => configure(false)}
            >
              <X size={19} />
            </button>
          </header>
          <fieldset disabled={busy}>
            <legend>
              {t(
                "Velg opptil seks målere. De summeres ikke med hverandre.",
                "Select up to six meters. They are not added together.",
              )}
            </legend>
            <div className="energy-meter-options">
              {meters.map((c) => (
                <label key={c.id}>
                  <input
                    type="checkbox"
                    checked={draft.meters.includes(c.id)}
                    disabled={
                      !draft.meters.includes(c.id) && draft.meters.length >= 6
                    }
                    onChange={() =>
                      setDraft({
                        ...draft,
                        meters: draft.meters.includes(c.id)
                          ? draft.meters.filter((id) => id !== c.id)
                          : [...draft.meters, c.id],
                      })
                    }
                  />
                  <span>
                    <strong>{c.name}</strong>
                    <small>
                      {String(c.attributes.unit_of_measurement || "")}
                    </small>
                  </span>
                </label>
              ))}
            </div>
            <div className="energy-section-options">
              {sections.map(([id, label]) => (
                <label key={id}>
                  <input
                    type="checkbox"
                    checked={!draft.hidden.includes(id)}
                    onChange={() =>
                      setDraft({
                        ...draft,
                        hidden: draft.hidden.includes(id)
                          ? draft.hidden.filter((v) => v !== id)
                          : [...draft.hidden, id],
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            <label>
              {t("Graftype", "Chart type")}
              <select
                value={draft.chart}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    chart: e.target.value as Preferences["chart"],
                  })
                }
              >
                <option value="bar">{t("Søyler", "Bars")}</option>
                <option value="line">{t("Linje", "Line")}</option>
              </select>
            </label>
            <button
              className="energy-save"
              disabled={!draft.meters.length}
              onClick={() => void save(draft)}
            >
              <Check size={16} />
              {t("Lagre visning", "Save view")}
            </button>
            {!draft.meters.length && (
              <small>
                {t("Velg minst én måler.", "Select at least one meter.")}
              </small>
            )}
          </fieldset>
        </div>
      )}
      <div className="energy-toolbar">
        <div
          className="energy-periods"
          aria-label={t("Energiperiode", "Energy period")}
        >
          {(["24h", "7d", "30d"] as const).map((p, i) => (
            <button
              key={p}
              aria-pressed={pref.period === p}
              disabled={busy || !prefQuery.data}
              onClick={() => void save({ ...pref, period: p })}
            >
              {
                [
                  t("Døgn", "24 hours"),
                  t("7 dager", "7 days"),
                  t("30 dager", "30 days"),
                ][i]
              }
            </button>
          ))}
        </div>
        <label className="energy-main-meter">
          {t("Vis måler", "Show meter")}
          <select
            value={chosen || ""}
            onChange={(e) => {
              onSelect(e.target.value);
              setPoint(null);
            }}
          >
            {ids.map((id) => (
              <option key={id} value={id}>
                {meters.find((c) => c.id === id)?.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {offline ? (
        <p className="notice" role="status">
          {t(
            "Hjemmet er frakoblet. Historikk vises ikke som ferske målinger.",
            "Home is disconnected. History is not shown as fresh readings.",
          )}
        </p>
      ) : (
        <>
          {stats.isError && (
            <p role="alert" className="notice">
              {t(
                "Kunne ikke hente energistatistikk.",
                "Could not fetch energy statistics.",
              )}{" "}
              <button onClick={() => stats.refetch()}>
                {t("Prøv igjen", "Retry")}
              </button>
            </p>
          )}
          {show("summary") && (
            <div className="energy-summary-grid">
              <article>
                <small>{t("Akkurat nå", "Right now")}</small>
                <strong>{meter ? reading(meter, lang) : "—"}</strong>
                <span>
                  {meter?.attributes.unit_of_measurement === "W" ||
                  meter?.attributes.unit_of_measurement === "kW"
                    ? t("Nåværende effekt", "Current power")
                    : t(
                        "Målerstand · ikke periodeforbruk",
                        "Meter reading · not period usage",
                      )}
                </span>
              </article>
              <article>
                <small>
                  {series?.kind === "power"
                    ? t("Gjennomsnittlig effekt", "Average power")
                    : t("Energi i perioden", "Energy over period")}
                </small>
                <strong>
                  {number(series?.current.value)} <em>{series?.unit}</em>
                </strong>
                <span>
                  {series?.current.complete
                    ? t("Komplett timehistorikk", "Complete hourly history")
                    : `${t("Datadekning", "Data coverage")}: ${series?.current.coverage ?? 0}% · ${t("ufullstendig", "incomplete")}`}
                </span>
                {series && (
                  <meter
                    className="energy-coverage"
                    min={0}
                    max={100}
                    value={series.current.coverage}
                    aria-label={t("Datadekning", "Data coverage")}
                  />
                )}
              </article>
              {show("comparison") && (
                <article className="energy-comparison">
                  <small>
                    {t(
                      "Mot forrige like lange periode",
                      "Versus previous equal period",
                    )}
                  </small>
                  <strong>
                    {series?.change_percent != null ? (
                      <>
                        {series.change_percent < 0 ? (
                          <TrendingDown size={23} />
                        ) : (
                          <TrendingUp size={23} />
                        )}{" "}
                        {series.change_percent > 0 ? "+" : ""}
                        {number(series.change_percent)}%
                      </>
                    ) : (
                      "—"
                    )}
                  </strong>
                  <span>
                    {series?.change_percent != null
                      ? t(
                          "Basert på komplette perioder",
                          "Based on complete periods",
                        )
                      : t(
                          "Trenger komplette data i begge perioder",
                          "Needs complete data for both periods",
                        )}
                  </span>
                </article>
              )}
            </div>
          )}
          {show("chart") && (
            <div className="energy-chart-panel">
              <div className="energy-chart-heading">
                <div>
                  <h3>
                    {series?.kind === "power"
                      ? t("Effekt gjennom perioden", "Power over time")
                      : t("Forbruk gjennom perioden", "Energy over time")}
                  </h3>
                  <small>
                    {stats.data
                      ? `${date(stats.data.start, true)} – ${date(stats.data.end, true)}`
                      : t("Laster historikk…", "Loading history…")}
                  </small>
                </div>
                <span className="energy-chart-key">
                  <i />
                  {t("Valgt periode", "Selected period")}
                  {show("comparison") && (
                    <>
                      <i className="previous" />
                      {t("Forrige", "Previous")}
                    </>
                  )}
                </span>
              </div>
              {samples.length && series ? (
                <>
                  <svg
                    ref={chartRef}
                    className="energy-large-chart"
                    viewBox={`0 0 ${chartWidth} 225`}
                    role="group"
                    onPointerMove={(e) => {
                      const bounds = e.currentTarget.getBoundingClientRect();
                      const position =
                        (((e.clientX - bounds.left) / bounds.width) *
                          chartWidth -
                          chartLeft) /
                        chartSpan;
                      if (position >= 0 && position <= 1)
                        setPoint(
                          Math.min(
                            points.length - 1,
                            Math.floor(position * points.length),
                          ),
                        );
                    }}
                    aria-label={t(
                      "Interaktiv energigraf",
                      "Interactive energy chart",
                    )}
                  >
                    <defs>
                      <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
                        <stop stopColor="#35a38a" />
                        <stop offset="1" stopColor="#83c7ad" stopOpacity=".5" />
                      </linearGradient>
                    </defs>
                    {[0, 0.5, 1].map((f) => (
                      <g key={f}>
                        <line
                          x1={chartLeft}
                          x2={chartRight}
                          y1={28 + 160 * f}
                          y2={28 + 160 * f}
                          className="energy-gridline"
                        />
                        <text
                          x={chartLeft - 8}
                          y={32 + 160 * f}
                          textAnchor="end"
                        >
                          {number(max - span * f)}
                        </text>
                      </g>
                    ))}
                    {show("comparison") && (
                      <path
                        d={path(previous)}
                        className="energy-previous-line"
                      />
                    )}
                    {pref.chart === "line" && (
                      <path d={path(points)} className="energy-current-line" />
                    )}
                    {point !== null && points[point] && (
                      <line
                        className="energy-inspection-line"
                        x1={x(point)}
                        x2={x(point)}
                        y1="28"
                        y2="188"
                      />
                    )}
                    {points.map((p, i) =>
                      p.value === null ? (
                        <text key={i} x={x(i)} y="187" textAnchor="middle">
                          ·
                        </text>
                      ) : (
                        <g
                          key={i}
                          role="button"
                          tabIndex={0}
                          aria-label={`${date(p.time, true)}: ${number(p.value)} ${series.unit}`}
                          onFocus={() => setPoint(i)}
                          onMouseEnter={() => setPoint(i)}
                          onClick={() => setPoint(i)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setPoint(i);
                            }
                          }}
                        >
                          <rect
                            x={
                              x(i) -
                              Math.max(1, (chartSpan / points.length) * 0.32)
                            }
                            y={Math.min(y(p.value), y(0))}
                            width={Math.max(
                              2,
                              (chartSpan / points.length) * 0.64,
                            )}
                            height={Math.max(2, Math.abs(y(p.value) - y(0)))}
                            rx="3"
                            fill={
                              pref.chart === "bar"
                                ? `url(#${gradient})`
                                : "transparent"
                            }
                            opacity={point === null || point === i ? 1 : 0.65}
                          />
                          {pref.chart === "line" && (
                            <circle
                              cx={x(i)}
                              cy={y(p.value)}
                              r={point === i ? 5 : 3}
                              fill="#248c79"
                            />
                          )}
                          <title>
                            {date(p.time, true)} · {number(p.value)}{" "}
                            {series.unit}
                          </title>
                        </g>
                      ),
                    )}
                    <text x={chartLeft} y="217">
                      {points[0] ? date(points[0].time) : ""}
                    </text>
                    <text x={chartRight} y="217" textAnchor="end">
                      {points.at(-1) ? date(points.at(-1)!.time) : ""}
                    </text>
                  </svg>
                  <div className="energy-insight" aria-live="polite">
                    {activePoint ? (
                      <>
                        <strong>{date(activePoint.time, true)}</strong>
                        <span>
                          {number(activePoint.value)} {series.unit}
                          {show("comparison")
                            ? ` · ${t("Forrige", "Previous")}: ${number(previous[point!]?.value)} ${series.unit}`
                            : ""}
                        </span>
                      </>
                    ) : (
                      <>
                        <BarChart3 size={18} />
                        <span>
                          {t(
                            "Trykk på en søyle eller et punkt for detaljer.",
                            "Select a bar or point for details.",
                          )}
                        </span>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <div className="energy-chart-empty">
                  <ChartNoAxesCombined size={36} />
                  <strong>
                    {stats.isLoading
                      ? t("Henter energihistorikk…", "Loading energy history…")
                      : t(
                          "Historikken er ikke klar ennå",
                          "History is not ready yet",
                        )}
                  </strong>
                  <p>
                    {t(
                      "Måleren trenger timebasert statistikk i SMARTi. Manglende målinger vises ikke som null.",
                      "This meter needs hourly statistics in SMARTi. Missing readings are not shown as zero.",
                    )}
                  </p>
                </div>
              )}
            </div>
          )}
          {show("meters") && (
            <div className="energy-meter-overview">
              <header>
                <h3>{t("Dine målere", "Your meters")}</h3>
                <small>
                  {t(
                    "Hver måler vises separat",
                    "Each meter is shown separately",
                  )}
                </small>
              </header>
              {ids.map((id, i) => {
                const item = stats.data?.series.find((s) => s.id === id),
                  c = meters.find((c) => c.id === id)!;
                return (
                  <button
                    key={id}
                    aria-pressed={chosen === id}
                    onClick={() => onSelect(id)}
                  >
                    <span
                      className="energy-meter-dot"
                      style={{ background: colors[i % colors.length] }}
                    />
                    <span>
                      <strong>{c.name}</strong>
                      <small>
                        {item?.kind === "energy"
                          ? t("Registrert energi", "Recorded energy")
                          : t("Gjennomsnittseffekt", "Average power")}
                      </small>
                    </span>
                    <span className="energy-meter-reading">
                      <strong>
                        {number(item?.current.value)} {item?.unit}
                      </strong>
                      <small>
                        {item?.current.complete
                          ? t("Komplett", "Complete")
                          : `${item?.current.coverage ?? 0}% ${t("datadekning", "data coverage")}`}
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {show("sources") && !!sources.data?.length && (
            <div className="energy-sources">
              <h3>
                {t(
                  "Sol, lagring og forbrukere",
                  "Solar, storage and consumers",
                )}
              </h3>
              {sources.data.map((s, i) => {
                const c = controls.find((c) => c.id === s.id);
                if (!c) return null;
                const Icon =
                  s.type === "solar"
                    ? Sun
                    : s.type === "battery"
                      ? Battery
                      : Plug;
                return (
                  <article key={i}>
                    <Icon size={22} />
                    <span>
                      {c.name}
                      <small>
                        {s.type === "solar"
                          ? t("Sol", "Solar")
                          : s.type === "battery"
                            ? t("Batteri", "Battery")
                            : t("Forbruker", "Consumer")}
                      </small>
                    </span>
                    <strong>{reading(c, lang)}</strong>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
      <p className="energy-method">
        {t(
          "Fullførte timer fra SMARTi. kWh viser registrert energiendring, kW viser gjennomsnittseffekt. Målerne summeres ikke; delvis historikk merkes og hull beholdes.",
          "Completed hours from SMARTi. kWh is recorded energy change; kW is average power. Meters are not added together; partial history is labelled and gaps are preserved.",
        )}
      </p>
    </section>
  );
}
