import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  ArrowUpRight,
  CalendarDays,
  FileText,
  History,
  Info,
  Lightbulb,
  Printer,
  ScrollText,
  Shield,
  Thermometer,
  Users,
  Zap,
} from "lucide-react";
import { api } from "./api";
import type { Home } from "./types";
import { ReportBrand } from "./ReportBrand";
import {
  HouseReportStatistics,
  type HouseStatistics,
} from "./HouseReportStatistics";
import { ReportLoading } from "./ReportLoading";
import { HistoryExplorer } from "./HistoryExplorer";
import { EnergyReport } from "./home/EnergyReport";
import { EnergyHistoryChart } from "./home/EnergyHistoryChart";
import type { Dashboard } from "./home/EnergyPlatform";
import {
  downloadReportCSV,
  printReport,
  reportCalendarSpan,
  reportDuration,
  reportLocale,
  reportNumber,
  reportValue,
} from "./reportModel";
import "./home/energyPlatform.css";
import "./home/energyReport.css";
import "./home/houseReport.css";

type Report = {
  statistics?: HouseStatistics;
  events: number;
  analyzed_events: number;
  truncated: boolean;
  active_entities: number;
  alarm_events: number;
  unavailable_events: number;
  categories: Record<string, number>;
  daily: Record<string, number>;
  top_entities: { name: string; count: number }[];
  temperatures: {
    name: string;
    minimum: number | null;
    maximum: number | null;
    unit: string;
    samples: number;
  }[];
  temperature_sensor_count: number;
  climate_unavailable: boolean;
};
const local = (date: Date) =>
  new Date(+date - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export function HouseInsights({ home, lang }: { home: Home; lang: string }) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const fmt = (value: unknown, digits = 1) => reportNumber(value, lang, digits);
  const [tab, setTab] = useState("report");
  const [from, setFrom] = useState(local(new Date(Date.now() - 7 * 86400000)));
  const [to, setTo] = useState(local(new Date()));
  const [period, setPeriod] = useState<{
    start: string;
    end: string;
    serial: number;
  } | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [energyPeriod, setEnergyPeriod] = useState<
    { from: string; to: string } | undefined
  >();
  const valid =
    Number.isFinite(Date.parse(from)) &&
    Number.isFinite(Date.parse(to)) &&
    Date.parse(from) < Date.parse(to) &&
    Date.parse(to) - Date.parse(from) <= 31 * 86400000 &&
    Date.parse(to) <= Date.now() + 60000;
  const report = useQuery({
    queryKey: ["house-report", period],
    enabled: !!period,
    retry: false,
    queryFn: () =>
      api<Report>(
        `history/report?${new URLSearchParams({ start: period!.start, end: period!.end })}`,
      ),
  });
  const energy = useQuery({
    queryKey: ["house-report-energy", period],
    enabled: !!period,
    retry: false,
    queryFn: () => {
      const span = reportCalendarSpan(period!.start, period!.end);
      return api<Dashboard>(
        `home/energy/platform/dashboard?start=${span.from}&end=${span.end}`,
      );
    },
  });
  const r = report.data,
    grid = energy.data?.meters?.find((m) => m.role === "grid");
  const pending = report.isFetching || (!!period && energy.isFetching);
  const readings = r?.statistics
    ? Object.values(r.statistics).flatMap((group) => group.items)
    : [];
  const known = readings.reduce((sum, row) => sum + row.known_hours, 0),
    unknown = readings.reduce((sum, row) => sum + row.unknown_hours, 0);
  const coverage = known + unknown ? (known / (known + unknown)) * 100 : null;
  const lights =
    r?.statistics?.lights.items
      .filter((row) => row.active_hours !== null && row.known_hours > 0)
      .sort((a, b) => b.active_hours! - a.active_hours!) || [];
  const temps =
    r?.statistics?.temperatures.items.filter(
      (row) => row.minimum !== null && row.maximum !== null,
    ) || [];
  const unit = temps.some((row) => row.unit === "°C") ? "°C" : temps[0]?.unit;
  const variable = temps
    .filter((row) => row.unit === unit)
    .sort((a, b) => b.maximum! - b.minimum! - (a.maximum! - a.minimum!))[0];
  const tabs = [
    {
      id: "report",
      label: t("Hjemmerapport", "Home report"),
      hint: t(
        "Klima, lys og tilstedeværelse",
        "Climate, lighting and presence",
      ),
      Icon: FileText,
    },
    {
      id: "energy",
      label: t("Energirapport", "Energy report"),
      hint: t("Forbruk, kostnader og priser", "Consumption, costs and prices"),
      Icon: Zap,
    },
    {
      id: "history",
      label: t("Historikk", "History"),
      hint: t(
        "Målinger og tilstander over tid",
        "Measurements and states over time",
      ),
      Icon: History,
    },
    {
      id: "log",
      label: t("Huslogg", "Activity"),
      hint: t("Utforsk hendelser i detalj", "Explore individual events"),
      Icon: ScrollText,
    },
  ];
  function exportCSV() {
    if (!r || !period) return;
    const rows: unknown[][] = [
      [
        "section",
        "source",
        "entity_id",
        "unit",
        "minimum",
        "average",
        "maximum",
        "active_hours",
        "known_hours",
        "unknown_hours",
        "activations",
        "coverage",
      ],
    ];
    for (const [kind, group] of Object.entries(r.statistics || {}))
      for (const row of group.items)
        rows.push([
          kind,
          row.name,
          row.entity_id,
          row.unit,
          row.minimum,
          row.average,
          row.maximum,
          row.active_hours,
          row.known_hours,
          row.unknown_hours,
          row.activations,
          row.coverage,
        ]);
    rows.push(
      [],
      ["category", "registered_events"],
      ...Object.entries(r.categories),
      [],
      ["day_Europe_Oslo", "registered_events"],
      ...Object.entries(r.daily),
    );
    downloadReportCSV(
      rows,
      `smarti-hjemmerapport-${reportCalendarSpan(period.start, period.end).from}.csv`,
    );
  }
  const categories = Object.entries(r?.categories || {}).sort(
    (a, b) => b[1] - a[1],
  );
  const days = Object.entries(r?.daily || {});
  const maxEvents = Math.max(1, ...days.map(([, n]) => n));
  const selectedEvents = days.find(([day]) => day === selectedDay);
  return (
    <section className="ep house-insights">
      <header className="report-page-head">
        <div>
          <span className="report-kicker">
            {home.home_name || t("MITT HJEM", "MY HOME")}
          </span>
          <h1>{t("Rapporter og innsikt", "Reports and insights")}</h1>
          <p>
            {t(
              "Se mønstrene. Forstå hjemmet ditt.",
              "See the patterns. Understand your home.",
            )}
          </p>
        </div>
        <span className="report-page-mark" aria-hidden>
          <FileText size={30} />
        </span>
      </header>
      <div
        className="report-tabs"
        role="tablist"
        aria-label={t("Rapporter og huslogg", "Reports and activity")}
      >
        {tabs.map(({ id, label, hint, Icon }, i) => (
          <button
            key={id}
            id={`house-tab-${id}`}
            role="tab"
            aria-label={label}
            aria-description={hint}
            aria-selected={tab === id}
            aria-controls={`house-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? tabs.length - 1
                    : (i + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) %
                      tabs.length;
              setTab(tabs[next].id);
              document.getElementById(`house-tab-${tabs[next].id}`)?.focus();
            }}
          >
            <Icon size={21} />
            <span>
              <strong>{label}</strong>
              <small>{hint}</small>
            </span>
          </button>
        ))}
      </div>
      <div
        id={`house-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`house-tab-${tab}`}
      >
        {tab === "log" || tab === "history" ? (
          <HistoryExplorer
            key={tab}
            home={home}
            lang={lang}
            activity={tab === "log"}
          />
        ) : tab === "energy" ? (
          <EnergyReport lang={lang} initialPeriod={energyPeriod} />
        ) : (
          <div className="house-report-body">
            <form
              className="er-builder report-builder"
              onSubmit={(event) => {
                event.preventDefault();
                if (valid) {
                  setSelectedPoint(null);
                  setSelectedDay(null);
                  setPeriod({
                    start: new Date(from).toISOString(),
                    end: new Date(to).toISOString(),
                    serial: Date.now(),
                  });
                }
              }}
            >
              <div className="report-builder-top">
                <div>
                  <CalendarDays size={18} />
                  <strong>
                    {t("Velg rapportperiode", "Choose report period")}
                  </strong>
                </div>
                <div className="er-presets">
                  {[1, 7, 30].map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={
                        Math.abs(
                          (Date.parse(to) - Date.parse(from)) / 86400000 - n,
                        ) < 0.001
                      }
                      onClick={() => {
                        setFrom(local(new Date(Date.now() - n * 86400000)));
                        setTo(local(new Date()));
                      }}
                    >
                      {t(
                        `Siste ${n === 1 ? "døgn" : `${n} dager`}`,
                        `Last ${n === 1 ? "24 hours" : `${n} days`}`,
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <div className="er-fields">
                <label>
                  {t("Fra", "From")}
                  <input
                    type="datetime-local"
                    required
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>
                <label>
                  {t("Til", "To")}
                  <input
                    type="datetime-local"
                    required
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </label>
                <button className="ep-primary" disabled={!valid || pending}>
                  <FileText size={17} />
                  {pending
                    ? t("Lager rapport…", "Preparing report…")
                    : t("Generer hjemmerapport", "Generate home report")}
                </button>
              </div>
              <p className="report-form-hint">
                {t(
                  "Inntil 31 dager · bruker bare historikk som er lagret i hjemmet.",
                  "Up to 31 days · uses only history recorded in your home.",
                )}
              </p>
              {!valid && (
                <p role="alert">
                  {t(
                    "Velg et gyldig tidsrom på opptil 31 dager, frem til nå.",
                    "Choose a valid range of up to 31 days, ending no later than now.",
                  )}
                </p>
              )}
            </form>
            {pending && <ReportLoading lang={lang} />}
            {report.isError && (
              <div className="report-empty-inline" role="alert">
                <Info />
                <div>
                  <strong>
                    {t(
                      "Rapporten kunne ikke hentes",
                      "Could not retrieve the report",
                    )}
                  </strong>
                  <p>
                    {t(
                      "Kontroller tilkoblingen og prøv igjen. Datoene dine er beholdt.",
                      "Check the connection and try again. Your dates have been preserved.",
                    )}
                  </p>
                  <button onClick={() => report.refetch()}>
                    {t("Prøv igjen", "Retry")}
                  </button>
                </div>
              </div>
            )}
            {!period && (
              <div className="report-start">
                <div>
                  <span className="report-kicker">
                    {t("EN OVERSIKT SOM GIR MENING", "A CLEARER PICTURE")}
                  </span>
                  <h2>
                    {t("Hva har skjedd hjemme?", "What happened at home?")}
                  </h2>
                  <p>
                    {t(
                      "Fra lyset som sto på til temperaturen gjennom uken. Velg en periode, så samler vi målingene i en rapport du kan utforske, dele eller skrive ut.",
                      "From lights left on to temperatures over the week. Choose a period to bring the readings together in a report you can explore, share or print.",
                    )}
                  </p>
                </div>
                <div className="report-inclusions">
                  {[
                    [
                      Thermometer,
                      t("Inneklima", "Indoor climate"),
                      t(
                        "Temperaturspenn og fuktighet per måler",
                        "Temperature ranges and humidity by sensor",
                      ),
                    ],
                    [
                      Lightbulb,
                      t("Lys", "Lighting"),
                      t(
                        "Registrert på-tid og påslag",
                        "Recorded on-time and activations",
                      ),
                    ],
                    [
                      Users,
                      t("Tilstedeværelse", "Presence"),
                      t(
                        "Tid hjemme, person for person",
                        "Time at home, person by person",
                      ),
                    ],
                    [
                      Zap,
                      t("Energi", "Energy"),
                      t(
                        "Målt forbruk og kostnadsestimat",
                        "Measured consumption and estimated cost",
                      ),
                    ],
                  ].map(([Icon, label, detail]: any) => (
                    <div key={label}>
                      <Icon size={21} />
                      <span>
                        <strong>{label}</strong>
                        <small>{detail}</small>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {r && period && !pending && (
              <article
                className="er-document hr-document"
                aria-label={t("Rapport for hele hjemmet", "Whole-home report")}
              >
                <header className="er-document-head">
                  <div>
                    <ReportBrand title={t("Hjemmerapport", "Home report")} />
                    <h2>{t("Hjemmet, forklart.", "Your home, explained.")}</h2>
                    <p className="hr-home-name">{home.home_name}</p>
                    <p>
                      {new Date(period.start).toLocaleString(
                        reportLocale(lang),
                      )}{" "}
                      –{" "}
                      {new Date(period.end).toLocaleString(reportLocale(lang))}
                    </p>
                  </div>
                  <div className="report-document-actions">
                    <button className="er-print" onClick={exportCSV}>
                      <ArrowDownToLine size={17} />
                      {t("Last ned CSV", "Download CSV")}
                    </button>
                    <button className="er-print" onClick={printReport}>
                      <Printer size={17} />
                      {t("Skriv ut / lagre PDF", "Print / save PDF")}
                    </button>
                  </div>
                </header>
                <nav
                  className="report-jump"
                  aria-label={t("I rapporten", "In this report")}
                >
                  {[
                    ["report-findings", t("Oppsummering", "Summary")],
                    ["report-temperatures", t("Inneklima", "Climate")],
                    ["report-lights", t("Lys", "Lighting")],
                    ["report-people", t("Personer", "People")],
                    ["report-energy", t("Energi", "Energy")],
                    ["report-activity", t("Aktivitet", "Activity")],
                  ]
                    .filter(
                      ([id]) =>
                        (id !== "report-lights" && id !== "report-people") ||
                        !!r.statistics,
                    )
                    .map(([id, label]) => (
                      <a key={id} href={`#${id}`}>
                        {label}
                      </a>
                    ))}
                </nav>
                {r.truncated && (
                  <p className="report-inline-note" role="status">
                    <Info size={18} />
                    <span>
                      {t(
                        `Rapporten teller ${fmt(r.events)} hendelser. Fordeling og nøkkeltall nedenfor bygger på de siste ${fmt(r.analyzed_events)}. Velg en kortere periode for mer detalj.`,
                        `The report counts ${fmt(r.events)} events. Breakdowns below use the latest ${fmt(r.analyzed_events)}. Choose a shorter period for more detail.`,
                      )}
                    </span>
                  </p>
                )}
                <dl className="er-kpis hr-cover-kpis">
                  <div>
                    <dt>{t("Registrert forbruk", "Recorded consumption")}</dt>
                    <dd>
                      {fmt(grid?.summary.available_kwh)} <small>kWh</small>
                    </dd>
                    <p>
                      {grid
                        ? grid.summary.complete
                          ? t("Komplett målegrunnlag", "Complete measurements")
                          : t(
                              "Ufullstendig målegrunnlag",
                              "Partial measurements",
                            )
                        : t("Ingen energimålinger", "No energy readings")}
                    </p>
                  </div>
                  <div>
                    <dt>{t("Estimert kostnad", "Estimated cost")}</dt>
                    <dd>
                      {fmt(grid?.cost_total ?? grid?.available_cost)}{" "}
                      <small>kr</small>
                    </dd>
                    <p>
                      {grid?.cost_total != null
                        ? t(
                            "Inkludert fordelte faste beløp",
                            "Including allocated fixed charges",
                          )
                        : t(
                            "Registrert forbruk · uten faste beløp",
                            "Recorded consumption · excluding fixed charges",
                          )}
                    </p>
                  </div>
                  <div>
                    <dt>{t("Kjent historikk", "Known history")}</dt>
                    <dd>
                      {fmt(coverage, 0)}{" "}
                      <small>{coverage === null ? "" : "%"}</small>
                    </dd>
                    <p>
                      {t(
                        `${readings.length} analyserte statistikkilder`,
                        `${readings.length} analysed statistics sources`,
                      )}
                    </p>
                  </div>
                </dl>
                <section id="report-findings" className="report-findings">
                  <header className="report-section-head">
                    <div>
                      <span className="report-kicker">
                        {t("DET SOM SKILLER SEG UT", "WORTH A CLOSER LOOK")}
                      </span>
                      <h3>
                        {t("Dette viser målingene", "What the readings show")}
                      </h3>
                    </div>
                  </header>
                  <div className="report-finding-grid">
                    <div>
                      <Lightbulb />
                      <span>
                        {t(
                          "Lengst registrert på-tid",
                          "Longest recorded on-time",
                        )}
                      </span>
                      <strong>
                        {lights[0]
                          ? reportDuration(lights[0].active_hours, lang)
                          : "—"}
                      </strong>
                      <p>
                        {lights[0]
                          ? `${lights[0].name} · ${fmt(lights[0].coverage * 100)} % ${t("kjent historikk", "known history")}`
                          : t(
                              "Ingen lysmålinger i perioden.",
                              "No lighting history in this period.",
                            )}
                      </p>
                    </div>
                    <div>
                      <Thermometer />
                      <span>
                        {t(
                          "Størst temperaturspenn",
                          "Largest temperature range",
                        )}
                      </span>
                      <strong>
                        {variable
                          ? `${fmt(variable.maximum! - variable.minimum!)} ${unit}`
                          : "—"}
                      </strong>
                      <p>
                        {variable
                          ? `${variable.name} · ${fmt(variable.minimum)}–${fmt(variable.maximum)} ${unit}`
                          : t(
                              "Ingen temperaturmålinger i perioden.",
                              "No temperature history in this period.",
                            )}
                      </p>
                    </div>
                    <div>
                      <Shield />
                      <span>
                        {t(
                          "Tilgjengelighet i husloggen",
                          "Availability in the activity log",
                        )}
                      </span>
                      <strong>
                        {fmt(r.unavailable_events)}{" "}
                        <small>{t("hendelser", "events")}</small>
                      </strong>
                      <p>
                        {t(
                          "Status «utilgjengelig» i analyserte hendelser. Dette måler ikke oppetid.",
                          "Unavailable states in analysed events. This does not measure uptime.",
                        )}
                      </p>
                    </div>
                  </div>
                  <p className="report-form-hint">
                    {t(
                      `Funnene gjelder kildene som er analysert. Temperaturspenn sammenlignes i ${unit || "samme måleenhet"}.`,
                      `Findings apply to the analysed sources. Temperature ranges are compared in ${unit || "the same unit"}.`,
                    )}
                  </p>
                </section>
                {r.statistics ? (
                  <HouseReportStatistics
                    statistics={r.statistics}
                    home={home}
                    lang={lang}
                  />
                ) : (
                  <section id="report-temperatures">
                    <h3>
                      {t(
                        "Temperaturer i perioden",
                        "Temperature in this period",
                      )}
                    </h3>
                    {r.climate_unavailable ? (
                      <p>
                        {t(
                          "Temperaturhistorikken kunne ikke hentes.",
                          "Could not retrieve temperature history.",
                        )}
                      </p>
                    ) : (
                      <dl className="er-ledger">
                        {r.temperatures.map((row, i) => (
                          <div key={i}>
                            <dt>{row.name}</dt>
                            <dd>
                              {fmt(row.minimum)} – {fmt(row.maximum)} {row.unit}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </section>
                )}
                <section className="report-energy-summary" id="report-energy">
                  <header className="report-section-head">
                    <div>
                      <span className="report-section-label">
                        <Zap size={17} />
                        {t("ENERGI", "ENERGY")}
                      </span>
                      <h3>
                        {t(
                          "Forbruk gjennom perioden",
                          "Consumption over the period",
                        )}
                      </h3>
                    </div>
                    <button
                      className="report-text-link"
                      onClick={() => {
                        setEnergyPeriod(
                          reportCalendarSpan(period.start, period.end),
                        );
                        setTab("energy");
                      }}
                    >
                      {t("Åpne energirapport", "Open energy report")}
                      <ArrowUpRight size={17} />
                    </button>
                  </header>
                  <p className="report-section-description">
                    {t(
                      "Energi gjelder kalenderdagene som berøres av tidsrommet, frem til siste måling. Hendelser og sensortid følger klokkeslettene du valgte.",
                      "Energy covers the calendar days touched by this period up to the latest reading. Events and sensor durations follow your exact selected times.",
                    )}
                  </p>
                  {energy.isError ? (
                    <p role="status">
                      {t(
                        "Energi kunne ikke hentes.",
                        "Could not retrieve energy.",
                      )}
                    </p>
                  ) : !grid ? (
                    <div className="report-empty-inline">
                      <Zap />
                      <p>
                        {t(
                          "Ingen energimåler konfigurert eller tilgjengelig.",
                          "No energy meter configured or available.",
                        )}
                      </p>
                    </div>
                  ) : (
                    <>
                      {!!grid.points?.length && (
                        <EnergyHistoryChart
                          fit
                          points={grid.points.map((p) => ({
                            ...p,
                            label: new Date(p.start).toLocaleString(
                              reportLocale(lang),
                              { timeZone: "Europe/Oslo" },
                            ),
                            tickLabel:
                              Date.parse(p.end) - Date.parse(p.start) <= 3600000
                                ? new Date(p.start).toLocaleTimeString(
                                    reportLocale(lang),
                                    {
                                      timeZone: "Europe/Oslo",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    },
                                  )
                                : new Date(p.start).toLocaleDateString(
                                    reportLocale(lang),
                                    {
                                      timeZone: "Europe/Oslo",
                                      day: "2-digit",
                                      month: "2-digit",
                                    },
                                  ),
                            kwh: reportValue(p.kwh),
                            cost: reportValue(p.cost.total) ?? 0,
                            priced: reportValue(p.cost.total) !== null,
                          }))}
                          prices={[]}
                          selected={selectedPoint}
                          onSelect={setSelectedPoint}
                        />
                      )}
                      <p className="report-form-hint">
                        {grid.cost_total == null
                          ? grid.available_cost_note ||
                            t(
                              "Ufullstendig beregningsgrunnlag.",
                              "Incomplete calculation basis.",
                            )
                          : t(
                              "Kostnaden inkluderer fordelte faste beløp.",
                              "Cost includes allocated fixed charges.",
                            )}
                      </p>
                    </>
                  )}
                </section>
                <section id="report-activity" className="report-activity">
                  <header className="report-section-head">
                    <div>
                      <span className="report-section-label">
                        <ScrollText size={17} />
                        {t("HUSLOGG", "ACTIVITY LOG")}
                      </span>
                      <h3>{t("Hjemmets aktivitet", "Activity at home")}</h3>
                    </div>
                    <span className="report-source-count">
                      {fmt(r.analyzed_events)}{" "}
                      {t("analyserte hendelser", "analysed events")}
                    </span>
                  </header>
                  <p className="report-section-description">
                    {t(
                      "Logghendelser beskriver rapporterte endringer, ikke brukstid eller strømforbruk. Mange hendelser betyr ikke nødvendigvis høyere bruk.",
                      "Log events describe reported changes, not usage duration or energy consumption. More events do not necessarily mean greater use.",
                    )}
                  </p>
                  <div className="report-activity-grid">
                    <div>
                      <h4>{t("Fordeling på kategori", "By category")}</h4>
                      <div className="report-category-bars">
                        {categories.map(([name, count], i) => (
                          <div key={name}>
                            <span>{name}</span>
                            <strong>{fmt(count)}</strong>
                            <div aria-hidden>
                              <i
                                style={{
                                  width: `${r.analyzed_events ? (count / r.analyzed_events) * 100 : 0}%`,
                                  opacity: 1 - i * 0.1,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                      {!categories.length && (
                        <p>
                          {t(
                            "Ingen lagrede hendelser i perioden.",
                            "No saved events in this period.",
                          )}
                        </p>
                      )}
                    </div>
                    <div>
                      <h4>
                        {t(
                          "Mest registrert aktivitet",
                          "Most recorded activity",
                        )}
                      </h4>
                      <ol className="report-ranking">
                        {r.top_entities.map((row, i) => (
                          <li key={i}>
                            <span>{String(i + 1).padStart(2, "0")}</span>
                            <strong>{row.name}</strong>
                            <small>
                              {fmt(row.count)} {t("hendelser", "events")}
                            </small>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                  {!!days.length && (
                    <div className="report-day-chart">
                      <h4>{t("Hendelser per dag", "Events per day")}</h4>
                      <div
                        className="report-day-scroll"
                        role="group"
                        aria-label={t("Daglig aktivitet", "Daily activity")}
                      >
                        <div
                          className="report-day-bars"
                          style={{ minWidth: days.length * 44 }}
                        >
                          {days.map(([day, count]) => (
                            <button
                              key={day}
                              type="button"
                              aria-label={`${day}: ${fmt(count)} ${t("lagrede hendelser", "saved events")}`}
                              aria-pressed={selectedDay === day}
                              onClick={() => setSelectedDay(day)}
                            >
                              <span className="report-day-value">
                                {fmt(count)}
                              </span>
                              <span className="report-day-bar">
                                <i
                                  style={{
                                    height: `${(count / maxEvents) * 100}%`,
                                  }}
                                />
                              </span>
                              <small>
                                {new Date(
                                  `${day}T12:00:00Z`,
                                ).toLocaleDateString(reportLocale(lang), {
                                  day: "numeric",
                                  month: "short",
                                })}
                              </small>
                            </button>
                          ))}
                        </div>
                      </div>
                      <p role="status" className="report-form-hint">
                        {selectedEvents
                          ? `${selectedEvents[0]} · ${fmt(selectedEvents[1])} ${t("lagrede hendelser", "saved events")}`
                          : t(
                              "Velg en søyle for detaljer. Bare dager med lagrede hendelser vises. Datoene følger Oslo-tid.",
                              "Select a bar for details. Only days with saved events are shown. Dates use Oslo time.",
                            )}
                      </p>
                    </div>
                  )}
                  <p className="report-inline-note">
                    <Info size={16} />
                    {t(
                      `${fmt(r.alarm_events)} registrerte alarmutløsninger i hendelsesutvalget. Husloggen bekrefter ikke at hjemmet var sikkert.`,
                      `${fmt(r.alarm_events)} recorded alarm triggers in the event sample. The log does not certify that the home was secure.`,
                    )}
                  </p>
                </section>
                <footer>
                  <strong>SMARTi · Hjemmerapport</strong>
                  <p>
                    {t(
                      "Basert på historikk som er lagret i hjemmet. Manglende historikk kan ikke rekonstrueres, og tomme perioder regnes ikke som nullforbruk eller bekreftet fravær.",
                      "Based on history recorded in your home. Missing history cannot be reconstructed; empty periods do not imply zero consumption or confirmed absence.",
                    )}
                  </p>
                </footer>
              </article>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
