import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  ArrowDownRight,
  ArrowUpRight,
  FileText,
  Printer,
  BarChart3,
  Info,
  CalendarDays,
  Tag,
  Leaf,
} from "lucide-react";
import { ReportBrand } from "../ReportBrand";
import { ReportLoading } from "../ReportLoading";
import { api } from "../api";
import type { Dashboard } from "./EnergyPlatform";
import { EnergyHistoryChart } from "./EnergyHistoryChart";
import {
  comparisonChange,
  downloadReportCSV,
  priceSummary,
  printReport,
  reportDay,
  reportLocale,
  reportNumber,
  reportValue,
  shiftReportDay,
} from "../reportModel";
import "./energyReport.css";

export function EnergyReport({
  lang = "nb",
  initialPeriod,
}: {
  lang?: string;
  initialPeriod?: { from: string; to: string };
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const fmt = (value: unknown, digits = 1) => reportNumber(value, lang, digits);
  const date = (value: string) =>
    new Date(
      value.length === 10 ? `${value}T12:00:00Z` : value,
    ).toLocaleDateString(reportLocale(lang), {
      timeZone: "Europe/Oslo",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  const today = reportDay(new Date());
  const [from, setFrom] = useState(
      initialPeriod?.from || shiftReportDay(today, -6),
    ),
    [to, setTo] = useState(initialPeriod?.to || today);
  const [request, setRequest] = useState<{
    from: string;
    to: string;
    serial: number;
  } | null>(null);
  const [selected, setSelected] = useState<number | null>(null),
    [metric, setMetric] = useState("consumption"),
    [showPrices, setShowPrices] = useState(false);
  const length = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  const valid = !!from && !!to && length > 0 && length <= 366 && to <= today;
  const report = useQuery({
    queryKey: ["energy-report", request],
    enabled: !!request,
    retry: false,
    queryFn: () =>
      api<Dashboard>(
        `home/energy/platform/dashboard?start=${request!.from}&end=${shiftReportDay(request!.to, 1)}&report=true`,
      ),
  });
  const data = report.data,
    grid = data?.meters?.find((m) => m.role === "grid");
  const total = reportValue(grid?.summary.available_kwh),
    cost = reportValue(grid?.cost_total ?? grid?.available_cost);
  const coverage = Math.max(
    0,
    Math.min(100, (grid?.summary.coverage || 0) * 100),
  );
  const change = comparisonChange(
    total,
    data?.previous?.kwh,
    !!grid?.summary.complete,
  );
  const prices = (data?.period_prices || []).filter(
    (p) =>
      reportValue(p.NOK_per_kWh) !== null &&
      Date.parse(p.time_end) > Date.parse(p.time_start),
  );
  const price = priceSummary(prices);
  const points = (grid?.points || []).map((p) => ({
    ...p,
    kwh: reportValue(p.kwh),
    cost: reportValue(p.cost.total) ?? 0,
    priced: reportValue(p.cost.total) !== null,
    label: new Date(p.start).toLocaleString(reportLocale(lang), {
      timeZone: "Europe/Oslo",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }),
    tickLabel:
      Date.parse(p.end) - Date.parse(p.start) <= 3600000
        ? new Date(p.start).toLocaleTimeString(reportLocale(lang), {
            timeZone: "Europe/Oslo",
            hour: "2-digit",
            minute: "2-digit",
          })
        : new Date(p.start).toLocaleDateString(reportLocale(lang), {
            timeZone: "Europe/Oslo",
            day: "2-digit",
            month: "2-digit",
          }),
  }));
  const peak = points
    .filter((p) => p.kwh !== null && !p.partial)
    .sort((a, b) => b.kwh! - a.kwh!)[0];
  const consumers =
    data?.meters?.filter((m) => ["consumer", "ev"].includes(m.role)) || [];
  const costNames: Record<string, string> = {
    electricity: t("Strøm fra leverandør", "Electricity"),
    markup: t("Påslag", "Supplier markup"),
    grid: t("Nettleie · energiledd", "Grid energy charge"),
    electricity_tax: t("Elavgift", "Electricity tax"),
    enova: "Enova",
    support: t("Prisjustering / strømstøtte", "Price adjustment / support"),
    vat: t("Merverdiavgift", "VAT"),
  };
  const breakdown = Object.entries(grid?.breakdown || {})
    .map(([key, value]) => ({ key, value: reportValue(value) }))
    .filter((row): row is { key: string; value: number } => row.value !== null);
  const largestCost = Math.max(
    1,
    ...breakdown.map((row) => Math.abs(row.value)),
  );
  function exportCSV() {
    downloadReportCSV(
      [
        ["start", "end", "kWh", "cost_NOK", "partial"],
        ...(grid?.points || []).map((p) => [
          p.start,
          p.end,
          p.kwh,
          p.cost.total,
          p.partial ?? false,
        ]),
        [],
        ["price_start", "price_end", "spot_NOK_per_kWh_ex_VAT"],
        ...prices.map((p) => [p.time_start, p.time_end, p.NOK_per_kWh]),
      ],
      `smarti-energirapport-${request!.from}.csv`,
    );
  }
  return (
    <div
      role="region"
      aria-label={t("Energirapportgenerator", "Energy report generator")}
      className="er report-energy"
    >
      <header className="report-energy-intro">
        <h2>
          {t("Forstå energien i hjemmet.", "Understand your home's energy.")}
        </h2>
        <p>
          {t(
            "Se forbruket i sammenheng med priser, kostnader og tidligere målinger.",
            "Connect consumption with prices, costs and previous readings.",
          )}
        </p>
      </header>
      <form
        className="er-builder report-builder"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) {
            setSelected(null);
            setRequest({ from, to, serial: Date.now() });
          }
        }}
      >
        <div className="report-builder-top">
          <div>
            <CalendarDays size={18} />
            <strong>{t("Velg rapportperiode", "Choose report period")}</strong>
          </div>
          <div
            className="er-presets"
            aria-label={t(
              "Hurtigvalg for rapportperiode",
              "Report period presets",
            )}
          >
            {[7, 30, 90].map((n) => (
              <button
                type="button"
                key={n}
                aria-pressed={length === n}
                onClick={() => {
                  setFrom(shiftReportDay(today, 1 - n));
                  setTo(today);
                }}
              >
                {t(`Siste ${n} dager`, `Last ${n} days`)}
              </button>
            ))}
          </div>
        </div>
        <div className="er-fields">
          <label>
            {t("Fra og med", "From")}
            <input
              type="date"
              required
              max={today}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            {t("Til og med", "Through")}
            <input
              type="date"
              required
              min={from}
              max={today}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <button className="ep-primary" disabled={!valid || report.isFetching}>
            <FileText size={17} />
            {report.isFetching
              ? t("Lager rapport…", "Preparing report…")
              : t("Generer rapport", "Generate report")}
          </button>
        </div>
        <p className="report-form-hint">
          {t(
            "Inntil 366 dager · kalenderdager i Oslo-tid.",
            "Up to 366 days · calendar days in Oslo time.",
          )}
        </p>
        {!valid && (
          <p role="alert">
            {t(
              "Velg en gyldig periode på inntil 366 dager, frem til i dag.",
              "Choose a valid period of up to 366 days, ending no later than today.",
            )}
          </p>
        )}
      </form>
      {report.isFetching && <ReportLoading lang={lang} />}
      {report.isError && (
        <div className="report-empty-inline" role="alert">
          <Info />
          <div>
            <strong>
              {t(
                "Rapporten kunne ikke hentes.",
                "Could not retrieve the report.",
              )}
            </strong>
            <p>
              {t(
                "Datoene er beholdt. Kontroller forbindelsen og prøv igjen.",
                "Your dates are preserved. Check the connection and retry.",
              )}
            </p>
            <button onClick={() => report.refetch()}>
              {t("Prøv igjen", "Retry")}
            </button>
          </div>
        </div>
      )}
      {!request && (
        <div className="report-start">
          <div>
            <span className="report-kicker">
              {t("FRA MÅLING TIL OVERSIKT", "FROM READINGS TO UNDERSTANDING")}
            </span>
            <h3>{t("Ditt hjem. Dine tall.", "Your home. Your numbers.")}</h3>
            <p>
              {t(
                "Få oversikt over forbruk, sammenlign perioder og se hvordan kostnaden er satt sammen. Rapporten kan lastes ned eller lagres som PDF.",
                "Understand consumption, compare periods and see how costs are made up. Download the readings or save the report as a PDF.",
              )}
            </p>
          </div>
          <div className="report-inclusions">
            <div>
              <BarChart3 />
              <span>
                <strong>{t("Se utviklingen", "See the trend")}</strong>
                <small>
                  {t(
                    "Forbruk og beregnet kostnad per intervall",
                    "Consumption and calculated cost per interval",
                  )}
                </small>
              </span>
            </div>
            <div>
              <Tag />
              <span>
                <strong>{t("Forstå prisen", "Understand the price")}</strong>
                <small>
                  {t(
                    "Spotpris, nettleie og øvrige kostnadsposter",
                    "Spot prices, grid fees and other cost components",
                  )}
                </small>
              </span>
            </div>
          </div>
        </div>
      )}
      {data && request && !report.isFetching && (
        <article
          className="er-document"
          aria-label={t("Energirapport", "Energy report")}
        >
          <header className="er-document-head">
            <div>
              <ReportBrand title={t("Energirapport", "Energy report")} />
              <h2>
                {date(request.from)} – {date(request.to)}
              </h2>
              <p>
                {t("Generert", "Generated")}{" "}
                {new Date(report.dataUpdatedAt).toLocaleString(
                  reportLocale(lang),
                )}{" "}
                · Europe/Oslo
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
          <div className="er-coverage">
            <span>
              {grid?.summary.complete
                ? t("Komplett målegrunnlag", "Complete measurements")
                : t("Ufullstendig målegrunnlag", "Partial measurements")}
            </span>
            <strong>
              {fmt(coverage, 0)} % {t("datadekning", "data coverage")}
            </strong>
            <progress max={100} value={coverage} />
          </div>
          {total === null ? (
            <div className="report-empty-inline">
              <Info size={24} />
              <div>
                <h3>
                  {t(
                    "Ingen forbruksmålinger i perioden",
                    "No consumption readings in this period",
                  )}
                </h3>
                <p>
                  {t(
                    "Velg en nyere periode, eller kontroller at en forbruksmåler er valgt i energiinnstillingene.",
                    "Choose a more recent period or check that a consumption meter is selected in energy settings.",
                  )}
                </p>
              </div>
            </div>
          ) : (
            <>
              <dl className="er-kpis">
                <div>
                  <dt>{t("Registrert forbruk", "Recorded consumption")}</dt>
                  <dd>
                    {fmt(total)} <small>kWh</small>
                  </dd>
                  <p>
                    {data.history_estimated
                      ? t(
                          "Beregnet fra effektmålinger",
                          "Estimated from power readings",
                        )
                      : t("Fra hjemmets energimåler", "From your energy meter")}
                  </p>
                </div>
                <div>
                  <dt>
                    {t("Estimert energikostnad", "Estimated energy cost")}
                  </dt>
                  <dd>
                    {fmt(cost, 2)} <small>kr</small>
                  </dd>
                  <p>
                    {cost === null
                      ? t(
                          "Beregningsgrunnlag mangler",
                          "Calculation basis unavailable",
                        )
                      : grid?.cost_total == null
                        ? t(
                            "Uten faste beløp og kapasitetsledd",
                            "Excluding fixed and capacity charges",
                          )
                        : t(
                            "Inkludert fordelte faste beløp",
                            "Including allocated fixed charges",
                          )}
                  </p>
                </div>
                <div className="report-comparison">
                  <dt>
                    {t(
                      "Mot forrige like lange periode",
                      "Compared with previous equal period",
                    )}
                  </dt>
                  <dd>
                    {change === null ? (
                      "—"
                    ) : (
                      <>
                        {change < 0 ? (
                          <ArrowDownRight size={26} />
                        ) : (
                          <ArrowUpRight size={26} />
                        )}{" "}
                        {change > 0 ? "+" : ""}
                        {fmt(change)} <small>%</small>
                      </>
                    )}
                  </dd>
                  <p>
                    {change === null
                      ? t(
                          "Krever komplette målinger i begge perioder",
                          "Requires complete readings in both periods",
                        )
                      : change > 0
                        ? t("Høyere strømforbruk", "Higher consumption")
                        : change < 0
                          ? t("Lavere strømforbruk", "Lower consumption")
                          : t("Uendret strømforbruk", "Unchanged consumption")}
                  </p>
                </div>
              </dl>
              <section className="er-chart">
                <header className="report-section-head">
                  <div>
                    <span className="report-section-label">
                      <BarChart3 size={17} />
                      {t("UTVIKLING", "TREND")}
                    </span>
                    <h3>
                      {t(
                        "Forbruk gjennom perioden",
                        "Consumption over the period",
                      )}
                    </h3>
                  </div>
                  <div
                    className="report-chart-switch"
                    role="group"
                    aria-label={t("Grafvisning", "Chart metric")}
                  >
                    {[
                      ["consumption", t("Forbruk", "Consumption")],
                      ["cost", t("Kostnad", "Cost")],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        aria-pressed={metric === value}
                        onClick={() => {
                          setMetric(value);
                          setSelected(null);
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </header>
                <p className="report-section-description">
                  {t(
                    "Velg en søyle for måleverdien. Hull viser manglende data; null er en måling på null.",
                    "Select a bar for the reading. Gaps indicate missing data; zero is a measured zero.",
                  )}
                </p>
                {metric === "consumption" && prices.length > 0 && (
                  <label className="report-price-toggle">
                    <input
                      type="checkbox"
                      checked={showPrices}
                      onChange={(e) => setShowPrices(e.target.checked)}
                    />
                    {t(
                      "Vis spotpris i grafen",
                      "Show spot prices on the chart",
                    )}
                  </label>
                )}
                <EnergyHistoryChart
                  fit
                  points={
                    metric === "consumption"
                      ? points
                      : points.map((p) => ({
                          ...p,
                          kwh: p.priced ? p.cost : null,
                        }))
                  }
                  prices={metric === "consumption" && showPrices ? prices : []}
                  selected={selected}
                  onSelect={setSelected}
                  unit={metric === "consumption" ? "kWh" : "kr"}
                  label={
                    metric === "consumption"
                      ? t("Forbruksgraf", "Consumption chart")
                      : t("Kostnadsgraf", "Cost chart")
                  }
                  lang={lang}
                />
                {selected !== null && points[selected] && (
                  <p className="ep-chart-detail" role="status">
                    <strong>{points[selected].label}</strong> ·{" "}
                    {metric === "consumption"
                      ? `${fmt(points[selected].kwh)} kWh`
                      : points[selected].priced
                        ? `${fmt(points[selected].cost, 2)} kr`
                        : t("Kostnad mangler", "Cost unavailable")}
                    {points[selected].partial
                      ? t(
                          " · ufullstendig / pågående",
                          " · partial / in progress",
                        )
                      : ""}
                  </p>
                )}
              </section>
              <div className="report-findings report-energy-finding">
                <BarChart3 size={23} />
                <div>
                  <h3>
                    {t("Dette forteller målingene", "What the readings show")}
                  </h3>
                  <p>
                    {peak
                      ? t(
                          `Største komplette måleintervall startet ${peak.label}, med ${fmt(peak.kwh)} kWh.`,
                          `The largest complete interval started ${peak.label}, with ${fmt(peak.kwh)} kWh.`,
                        )
                      : t(
                          "Ingen komplette intervaller å sammenligne ennå.",
                          "No complete intervals to compare yet.",
                        )}
                  </p>
                  <p className="report-form-hint">
                    {coverage < 100
                      ? t(
                          "Forbruket gjelder bare registrerte målinger. Det kan ikke brukes som hele periodens strømregning.",
                          "Consumption covers recorded readings only and does not represent a complete bill.",
                        )
                      : t(
                          "Kostnader er beregninger og kan avvike fra fakturaen.",
                          "Costs are estimates and may differ from the bill.",
                        )}
                  </p>
                </div>
              </div>
            </>
          )}
          <section className="er-price-summary">
            <header className="report-section-head">
              <div>
                <span className="report-section-label">
                  <Tag size={17} />
                  {t("PRISGRUNNLAG", "PRICE BASIS")}
                </span>
                <h3>
                  {t("Spotpriser", "Spot prices")} ·{" "}
                  {data.price_area || t("valgt prisområde", "selected area")}
                </h3>
              </div>
              <span className="report-source-count">
                {fmt(price.hours)} {t("timer med priser", "hours with prices")}
              </span>
            </header>
            <dl className="report-price-stats">
              <div>
                <dt>
                  {t("Laveste registrerte pris", "Lowest recorded price")}
                </dt>
                <dd>
                  {fmt(price.low)} <small>øre/kWh</small>
                </dd>
              </div>
              <div>
                <dt>{t("Tidsvektet gjennomsnitt", "Time-weighted average")}</dt>
                <dd>
                  {fmt(price.average)} <small>øre/kWh</small>
                </dd>
              </div>
              <div>
                <dt>
                  {t("Høyeste registrerte pris", "Highest recorded price")}
                </dt>
                <dd>
                  {fmt(price.high)} <small>øre/kWh</small>
                </dd>
              </div>
            </dl>
            <p className="report-form-hint">
              {t(
                "Spotpris uten mva., påslag, nettleie og støtte. Dette er ikke din samlede strømpris.",
                "Spot prices exclude VAT, supplier markup, grid fees and support. They are not your total electricity price.",
              )}
            </p>
          </section>
          {total !== null && (
            <div className="er-columns report-cost-columns">
              <section>
                <header className="report-section-head">
                  <div>
                    <span className="report-kicker">
                      {t("KRONER OG ØRE", "COST COMPONENTS")}
                    </span>
                    <h3>{t("Kostnadene forklart", "Costs explained")}</h3>
                  </div>
                </header>
                {breakdown.length ? (
                  <div className="report-cost-bars">
                    {breakdown.map((row) => (
                      <div
                        key={row.key}
                        data-credit={row.value < 0 || undefined}
                      >
                        <div>
                          <span>{costNames[row.key] || row.key}</span>
                          <strong>{fmt(row.value, 2)} kr</strong>
                        </div>
                        <span className="report-cost-track" aria-hidden>
                          <i
                            style={{
                              width: `${(Math.abs(row.value) / largestCost) * 100}%`,
                            }}
                          />
                        </span>
                      </div>
                    ))}
                    {grid?.cost_total != null && (
                      <p className="report-cost-total">
                        <span>
                          {t("Fordelte faste beløp", "Allocated fixed charges")}
                        </span>
                        <strong>{fmt(grid.monthly_fees, 2)} kr</strong>
                      </p>
                    )}
                  </div>
                ) : (
                  <p>
                    {grid?.available_cost_note ||
                      t(
                        "Kostnadsgrunnlaget er ufullstendig. Forbruket vises selv om prisen mangler.",
                        "Cost data is incomplete. Consumption is shown even when prices are unavailable.",
                      )}
                  </p>
                )}
                <p className="report-cost-total">
                  <span>{t("Totalt estimat", "Total estimate")}</span>
                  <strong>{fmt(cost, 2)} kr</strong>
                </p>
                <p className="report-form-hint">
                  {grid?.cost_total == null
                    ? grid?.available_cost_note ||
                      t(
                        "Uten faste beløp og kapasitetsledd.",
                        "Excluding fixed and capacity charges.",
                      )
                    : t(
                        "Inkludert fordelte faste beløp.",
                        "Including allocated fixed charges.",
                      )}
                </p>
              </section>
              <section>
                <header className="report-section-head">
                  <div>
                    <span className="report-kicker">
                      {t("MÅLER FOR MÅLER", "METER BY METER")}
                    </span>
                    <h3>{t("Målte forbrukere", "Measured consumers")}</h3>
                  </div>
                </header>
                <p className="report-section-description">
                  {t(
                    "Separate målinger kan overlappe. Dette er ikke en full fordeling av hjemmet.",
                    "Separate readings may overlap. This is not a complete household breakdown.",
                  )}
                </p>
                {consumers.length ? (
                  <dl className="er-ledger">
                    {consumers.map((meter, i) => (
                      <div key={i}>
                        <dt>
                          {meter.name}
                          <small>
                            {meter.summary.complete
                              ? t("Komplett", "Complete")
                              : t("Ufullstendig", "Partial")}
                          </small>
                        </dt>
                        <dd>{fmt(meter.summary.available_kwh)} kWh</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p>
                    {t(
                      "Ingen separate energimålinger i rapporten. Enheter som bare viser effekt nå, inngår ikke i historisk fordeling.",
                      "No separate energy readings in this report. Instantaneous power readings do not provide a historical breakdown.",
                    )}
                  </p>
                )}
              </section>
            </div>
          )}
          {data.solar && (
            <section className="er-solar">
              <header className="report-section-head">
                <div>
                  <span className="report-section-label">
                    <Leaf size={17} />
                    {t("SOLENERGI", "SOLAR")}
                  </span>
                  <h3>
                    {t(
                      "Egen energi i perioden",
                      "Your solar energy in this period",
                    )}
                  </h3>
                </div>
              </header>
              <dl className="report-price-stats">
                {[
                  [t("Produksjon", "Production"), data.solar.production],
                  [t("Eksportert", "Exported"), data.solar.export],
                  [
                    t("Egenforbruk av solenergi", "Solar self-consumption"),
                    data.solar.self_consumption,
                  ],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <dt>{label}</dt>
                    <dd>
                      {fmt(value)} <small>kWh</small>
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="report-form-hint">{data.solar.note}</p>
            </section>
          )}
          <footer>
            <strong>SMARTi · Energirapport</strong>
            <p>
              {t(
                "Rapporten gjelder valgt periode frem til siste tilgjengelige måling. Kostnader følger registrerte priser og avtaler. Estimatene er ikke en faktura.",
                "This report covers the selected period up to the last available reading. Costs follow recorded prices and contracts. Estimates are not a bill.",
              )}
            </p>
          </footer>
        </article>
      )}
    </div>
  );
}
