import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Printer, BarChart3, AlertCircle } from "lucide-react";
import { api } from "../api";
import type { Dashboard } from "./EnergyPlatform";
import { EnergyHistoryChart } from "./EnergyHistoryChart";
import "./energyReport.css";

const day = (d: Date) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo" }).format(d);
const shift = (d: string, n: number) => {
  const v = new Date(d + "T12:00:00Z");
  v.setUTCDate(v.getUTCDate() + n);
  return day(v);
};
const number = (n: number | string | null | undefined, digits = 1) =>
  n == null
    ? "—"
    : Number(n).toLocaleString("nb-NO", { maximumFractionDigits: digits });
const date = (v: string) =>
  new Date(v.length === 10 ? v + "T12:00:00Z" : v).toLocaleDateString("nb-NO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Oslo",
  });
const costs: Record<string, string> = {
  electricity: "Strøm fra leverandør",
  markup: "Påslag",
  grid: "Nettleie · energiledd",
  electricity_tax: "Elavgift",
  enova: "Enova",
  support: "Prisjustering / strømstøtte",
  vat: "Merverdiavgift",
};

export function EnergyReport() {
  const today = day(new Date());
  const [from, setFrom] = useState(shift(today, -6));
  const [to, setTo] = useState(today);
  const [request, setRequest] = useState<{
    from: string;
    to: string;
    serial: number;
  } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const length = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  const valid = !!from && !!to && length > 0 && length <= 366 && to <= today;
  const report = useQuery({
    queryKey: ["energy-report", request],
    enabled: !!request,
    queryFn: () =>
      api<Dashboard>(
        `home/energy/platform/dashboard?start=${request!.from}&end=${shift(request!.to, 1)}&report=true`,
      ),
    retry: false,
  });
  const data = report.data;
  const grid = data?.meters.find((m) => m.role === "grid");
  const total = grid?.summary.available_kwh;
  const cost = grid?.cost_total ?? grid?.available_cost;
  const coverage = Math.max(
    0,
    Math.min(100, (grid?.summary.coverage ?? 0) * 100),
  );
  const points = (grid?.points ?? []).map((p) => ({
    ...p,
    tickLabel:
      Date.parse(p.end) - Date.parse(p.start) <= 3600000
        ? new Date(p.start).toLocaleTimeString("nb-NO", {
            timeZone: "Europe/Oslo",
            hour: "2-digit",
            minute: "2-digit",
          })
        : new Date(p.start).toLocaleDateString("nb-NO", {
            timeZone: "Europe/Oslo",
            day: "2-digit",
            month: "2-digit",
          }),
    label: new Date(p.start).toLocaleString("nb-NO", {
      timeZone: "Europe/Oslo",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }),
    kwh: p.kwh == null ? null : Number(p.kwh),
    cost: Number(p.cost.total ?? 0),
    priced: p.cost.total != null,
  }));
  const peak = points
    .filter((p) => p.kwh != null && !p.partial)
    .sort((a, b) => b.kwh! - a.kwh!)[0];
  const previous = data?.previous?.kwh;
  const change =
    grid?.summary.complete &&
    previous != null &&
    Number(previous) > 0 &&
    total != null
      ? (Number(total) / Number(previous) - 1) * 100
      : null;
  const prices = (data?.period_prices ?? []).filter((p) =>
    Number.isFinite(p.NOK_per_kWh),
  );
  const priceHours = prices.reduce(
    (sum, p) =>
      sum + (Date.parse(p.time_end) - Date.parse(p.time_start)) / 3600000,
    0,
  );
  const averagePrice =
    priceHours > 0
      ? (prices.reduce(
          (sum, p) =>
            sum +
            (p.NOK_per_kWh *
              (Date.parse(p.time_end) - Date.parse(p.time_start))) /
              3600000,
          0,
        ) /
          priceHours) *
        100
      : null;
  const consumers =
    data?.meters.filter((m) => ["consumer", "ev"].includes(m.role)) ?? [];
  function preset(days: number) {
    setFrom(shift(today, 1 - days));
    setTo(today);
  }
  function print() {
    document.body.classList.add("printing-energy-report");
    window.addEventListener(
      "afterprint",
      () => document.body.classList.remove("printing-energy-report"),
      { once: true },
    );
    window.print();
  }
  return (
    <div
      role="tabpanel"
      id="energy-panel-reports"
      aria-labelledby="energy-view-reports"
      className="er"
    >
      <header className="er-intro">
        <span className="ep-eyebrow">RAPPORTER OG INNSIKT</span>
        <h2>Forstå energien i hjemmet.</h2>
        <p>
          Velg en periode. Få oversikten, se hva som skiller seg ut, og ta
          rapporten med deg.
        </p>
      </header>
      <form
        className="er-builder"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) {
            setSelected(null);
            setRequest({ from, to, serial: Date.now() });
          }
        }}
      >
        <div className="er-presets" aria-label="Hurtigvalg for rapportperiode">
          {[
            [7, "Siste 7 dager"],
            [30, "Siste 30 dager"],
            [90, "Siste 90 dager"],
          ].map(([n, label]) => (
            <button type="button" key={n} onClick={() => preset(Number(n))}>
              {label}
            </button>
          ))}
        </div>
        <div className="er-fields">
          <label>
            Fra og med
            <input
              type="date"
              required
              max={today}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            Til og med
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
            <FileText size={18} />
            {report.isFetching ? "Lager rapport…" : "Generer rapport"}
          </button>
        </div>
        {!valid && (
          <p role="alert">
            Velg en gyldig periode på inntil 366 dager, frem til i dag.
          </p>
        )}
      </form>
      {report.isFetching && (
        <p role="status">Henter målinger og beregner rapporten…</p>
      )}
      {report.isError && (
        <p role="alert">
          Rapporten kunne ikke hentes. Prøv å generere den på nytt.
        </p>
      )}
      {!request && (
        <div className="er-welcome">
          <FileText size={32} />
          <h3>Ditt hjem. Dine tall.</h3>
          <p>
            Rapporten samler registrert forbruk, beregnede kostnader, utvikling
            og målte forbrukere. Manglende målinger blir aldri regnet som null.
          </p>
        </div>
      )}
      {data && request && (
        <article className="er-document" aria-label="Energirapport">
          <header className="er-document-head">
            <div>
              <span className="ep-eyebrow">SMARTi / ENERGIRAPPORT</span>
              <h2>
                {date(request.from)} – {date(request.to)}
              </h2>
              <p>
                Generert{" "}
                {new Date(report.dataUpdatedAt).toLocaleString("nb-NO")} ·
                Europe/Oslo
              </p>
            </div>
            <button className="er-print" onClick={print}>
              <Printer size={18} /> Skriv ut / lagre PDF
            </button>
          </header>
          <div className="er-coverage">
            <span>
              {grid?.summary.complete
                ? "Komplett målegrunnlag"
                : "Ufullstendig målegrunnlag"}
            </span>
            <strong>{number(coverage, 0)} % datadekning</strong>
            <progress max={100} value={coverage} />
          </div>
          {total == null ? (
            <div className="er-welcome">
              <AlertCircle size={28} />
              <h3>Ingen forbruksmålinger i perioden</h3>
              <p>
                Velg en nyere periode, eller kontroller at en forbruksmåler er
                valgt i energiinnstillingene. Historikk bygges opp når målingene
                kommer inn.
              </p>
            </div>
          ) : (
            <>
              <dl className="er-kpis">
                <div>
                  <dt>Registrert forbruk</dt>
                  <dd>
                    {number(total)} <small>kWh</small>
                  </dd>
                  <p>
                    {data.history_estimated
                      ? "Beregnet fra effektmålinger"
                      : "Fra hjemmets energimåler"}
                  </p>
                </div>
                <div>
                  <dt>Estimert energikostnad</dt>
                  <dd>
                    {number(cost, 2)} <small>kr</small>
                  </dd>
                  <p>
                    {cost == null
                      ? "Beregningsgrunnlag mangler"
                      : grid?.cost_total == null
                        ? "Uten faste beløp og kapasitetsledd"
                        : "Inkludert fordelte faste beløp"}
                  </p>
                </div>
                <div>
                  <dt>Mot forrige like lange periode</dt>
                  <dd>
                    {change == null
                      ? "—"
                      : `${change > 0 ? "+" : ""}${number(change)}`}{" "}
                    <small>{change != null ? "%" : ""}</small>
                  </dd>
                  <p>
                    {change == null
                      ? "Krever komplette målinger i begge perioder"
                      : change > 0
                        ? "Høyere strømforbruk"
                        : change < 0
                          ? "Lavere strømforbruk"
                          : "Uendret strømforbruk"}
                  </p>
                </div>
              </dl>
              <section className="er-chart">
                <h3>Forbruk gjennom perioden</h3>
                <p>
                  Trykk på en søyle for å se målingen. Hull betyr at data
                  mangler.
                </p>
                <EnergyHistoryChart
                  points={points}
                  prices={prices}
                  selected={selected}
                  onSelect={setSelected}
                />
                {selected != null && points[selected] && (
                  <p className="ep-chart-detail" role="status">
                    {points[selected].label} · {number(points[selected].kwh)}{" "}
                    kWh
                    {points[selected].partial
                      ? " · ufullstendig / pågående"
                      : ""}
                  </p>
                )}
              </section>
              <section className="er-price-summary">
                <h3>Spotpriser · {data.price_area || "valgt prisområde"}</h3>
                <dl className="er-ledger">
                  <div>
                    <dt>Tidsvektet gjennomsnitt</dt>
                    <dd>{number(averagePrice)} øre/kWh</dd>
                  </div>
                  <div>
                    <dt>Laveste registrerte pris</dt>
                    <dd>
                      {number(
                        prices.length
                          ? Math.min(...prices.map((p) => p.NOK_per_kWh)) * 100
                          : null,
                      )}{" "}
                      øre/kWh
                    </dd>
                  </div>
                  <div>
                    <dt>Høyeste registrerte pris</dt>
                    <dd>
                      {number(
                        prices.length
                          ? Math.max(...prices.map((p) => p.NOK_per_kWh)) * 100
                          : null,
                      )}{" "}
                      øre/kWh
                    </dd>
                  </div>
                </dl>
                <p>
                  {number(priceHours)} timer med prisdata i valgt periode.
                  Spotprisene er uten mva., påslag, nettleie og støtte, og er
                  ikke din faktiske strømpris.
                </p>
              </section>
              <section className="er-insight">
                <BarChart3 size={24} />
                <div>
                  <h3>Dette forteller målingene</h3>
                  <p>
                    {peak
                      ? `Største komplette måleintervall startet ${peak.label}, med ${number(peak.kwh)} kWh. Sammenlign tidspunktet med oppvarming, lading og andre aktiviteter i hjemmet.`
                      : "Det finnes ennå ingen komplette intervaller å sammenligne. Rapporten viser det som er registrert så langt."}
                  </p>
                  <p>
                    {coverage < 100
                      ? "Datadekningen er ufullstendig. Tallene beskriver registrert forbruk og kan ikke brukes som hele periodens strømregning."
                      : "Forbruket har komplett datadekning. Kostnadene er fortsatt beregninger, og kan avvike fra fakturaen."}
                  </p>
                </div>
              </section>
              <div className="er-columns">
                <section>
                  <h3>Kostnadene forklart</h3>
                  {grid?.cost_total != null ? (
                    <dl className="er-ledger">
                      {Object.entries(grid.breakdown ?? {}).map(
                        ([key, value]) => (
                          <div key={key}>
                            <dt>{costs[key] || key}</dt>
                            <dd>{number(value, 2)} kr</dd>
                          </div>
                        ),
                      )}
                      <div>
                        <dt>Fordelte faste beløp</dt>
                        <dd>{number(grid.monthly_fees, 2)} kr</dd>
                      </div>
                      <div className="er-total">
                        <dt>Totalt estimat</dt>
                        <dd>{number(cost, 2)} kr</dd>
                      </div>
                    </dl>
                  ) : (
                    <p>
                      {cost != null
                        ? grid?.available_cost_note
                        : "Kostnad kan ikke beregnes uten tilstrekkelige målinger og pris- og avtalegrunnlag. Forbruket vises likevel."}
                    </p>
                  )}
                </section>
                <section>
                  <h3>Målte forbrukere</h3>
                  <p>
                    Separate målinger – ikke en full fordeling av huset. Målerne
                    kan overlappe.
                  </p>
                  {consumers.length ? (
                    <dl className="er-ledger">
                      {consumers.map((m, i) => (
                        <div key={i}>
                          <dt>
                            {m.name}
                            <small>
                              {m.summary.complete ? "Komplett" : "Ufullstendig"}
                            </small>
                          </dt>
                          <dd>{number(m.summary.available_kwh)} kWh</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p>
                      Ingen separate energimålinger i rapporten. Enheter som
                      bare viser effekt akkurat nå, inngår ikke i historisk
                      fordeling.
                    </p>
                  )}
                </section>
              </div>
              {data.solar && (
                <section className="er-solar">
                  <h3>Solenergi i perioden</h3>
                  <dl className="er-ledger">
                    <div>
                      <dt>Produksjon</dt>
                      <dd>{number(data.solar.production)} kWh</dd>
                    </div>
                    <div>
                      <dt>Eksportert</dt>
                      <dd>{number(data.solar.export)} kWh</dd>
                    </div>
                    <div>
                      <dt>Egenforbruk av solenergi</dt>
                      <dd>{number(data.solar.self_consumption)} kWh</dd>
                    </div>
                  </dl>
                  <p>{data.solar.note}</p>
                </section>
              )}
            </>
          )}
          <footer>
            <strong>SMARTi · Et hjem som spiller på lag.</strong>
            <p>
              Rapporten gjelder valgt periode, til siste tilgjengelige måling.
              Norgespris og strømstøtte følger historiske avtaler og månedlige
              forbrukstak. Estimater er ikke en faktura.
            </p>
          </footer>
        </article>
      )}
    </div>
  );
}
