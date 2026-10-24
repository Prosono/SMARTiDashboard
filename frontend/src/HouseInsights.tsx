import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, ScrollText, Zap, Printer } from "lucide-react";
import { api } from "./api";
import type { Home } from "./types";
import { ReportLoading } from "./ReportLoading";
import { HistoryExplorer } from "./HistoryExplorer";
import { EnergyReport } from "./home/EnergyReport";
import type { Dashboard } from "./home/EnergyPlatform";
import "./home/energyPlatform.css";
import "./home/energyReport.css";

type Report = {
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
const local = (d: Date) =>
  new Date(+d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const number = (v: number | string | null | undefined) =>
  v == null
    ? "—"
    : Number(v).toLocaleString("nb-NO", { maximumFractionDigits: 1 });
const osloDay = (d: string) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo" }).format(
    new Date(d),
  );
export function HouseInsights({ home, lang }: { home: Home; lang: string }) {
  const [tab, setTab] = useState("report");
  const [from, setFrom] = useState(local(new Date(Date.now() - 7 * 86400000)));
  const [to, setTo] = useState(local(new Date()));
  const [period, setPeriod] = useState<{
    start: string;
    end: string;
    serial: number;
  } | null>(null);
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
      const end = new Date(osloDay(period!.end) + "T12:00:00Z");
      end.setUTCDate(end.getUTCDate() + 1);
      return api<Dashboard>(
        `home/energy/platform/dashboard?start=${osloDay(period!.start)}&end=${osloDay(end.toISOString())}`,
      );
    },
  });
  const r = report.data;
  const grid = energy.data?.meters?.find((m) => m.role === "grid");
  const tabs = [
    { id: "report", label: "Hjemmerapport", Icon: FileText },
    { id: "log", label: "Huslogg", Icon: ScrollText },
    { id: "energy", label: "Energirapport", Icon: Zap },
  ];
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
    <section className="ep house-insights">
      <header className="er-intro">
        <span className="ep-eyebrow">HELE HJEMMET</span>
        <h1>Rapporter og innsikt</h1>
        <p>
          Husloggen og hjemmets målinger samlet. Se aktivitet, klima, sikkerhet
          og energi i sammenheng.
        </p>
      </header>
      <div
        className="ep-view-tabs"
        role="tablist"
        aria-label="Rapporter og huslogg"
      >
        {tabs.map(({ id, label, Icon }, i) => (
          <button
            key={id}
            id={`house-tab-${id}`}
            role="tab"
            aria-selected={tab === id}
            aria-controls={`house-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(e) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                e.preventDefault();
                const next =
                  e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? 2
                      : (i + (e.key === "ArrowRight" ? 1 : 2)) % 3;
                setTab(tabs[next].id);
                document.getElementById(`house-tab-${tabs[next].id}`)?.focus();
              }
            }}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </div>
      <div
        id={`house-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`house-tab-${tab}`}
      >
        {tab === "log" ? (
          <HistoryExplorer home={home} lang={lang} activity />
        ) : tab === "energy" ? (
          <EnergyReport />
        ) : (
          <div className="house-report-body">
            <form
              className="er-builder"
              onSubmit={(e) => {
                e.preventDefault();
                if (valid)
                  setPeriod({
                    start: new Date(from).toISOString(),
                    end: new Date(to).toISOString(),
                    serial: Date.now(),
                  });
              }}
            >
              <div className="er-presets">
                {[1, 7, 30].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => {
                      setFrom(local(new Date(Date.now() - days * 86400000)));
                      setTo(local(new Date()));
                    }}
                  >
                    Siste {days === 1 ? "døgn" : `${days} dager`}
                  </button>
                ))}
              </div>
              <div className="er-fields">
                <label>
                  Fra
                  <input
                    type="datetime-local"
                    required
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>
                <label>
                  Til
                  <input
                    type="datetime-local"
                    required
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </label>
                <button
                  className="ep-primary"
                  disabled={!valid || report.isFetching}
                >
                  Generer hjemmerapport
                </button>
              </div>
              <p>
                Inntil 31 dager per rapport. Tilgjengelig historikk avhenger av
                hva huben har lagret.
              </p>
              {!valid && (
                <p role="alert">
                  Velg et gyldig tidsrom på opptil 31 dager, frem til nå.
                </p>
              )}
            </form>
            {(report.isFetching || (period && energy.isFetching)) && <ReportLoading />}
            {report.isError && (
              <p role="alert">
                Husloggen kunne ikke hentes. Kontroller tilkoblingen til huben
                og prøv igjen.
              </p>
            )}
            {!period && (
              <div className="er-welcome">
                <FileText size={32} />
                <h2>Hva har skjedd hjemme?</h2>
                <p>
                  Generer en rapport for å se aktivitet på tvers av lys, klima,
                  sikkerhet, multimedia og automasjoner – med temperaturmålinger
                  og en energioppsummering.
                </p>
              </div>
            )}
            {r && period && (
              <article
                className="er-document"
                aria-label="Rapport for hele hjemmet"
              >
                <header className="er-document-head">
                  <div>
                    <span className="ep-eyebrow">SMARTi / HJEMMERAPPORT</span>
                    <h2>{home.home_name || "Hjemmet ditt"}</h2>
                    <p>
                      {new Date(period.start).toLocaleString("nb-NO")} –{" "}
                      {new Date(period.end).toLocaleString("nb-NO")}
                    </p>
                  </div>
                  <button className="er-print" onClick={print}>
                    <Printer size={18} />
                    Skriv ut / lagre PDF
                  </button>
                </header>
                <p>
                  Basert på lagrede hendelser og målinger. Ingen hendelser betyr
                  ikke nødvendigvis at ingenting har skjedd.
                </p>
                {r.truncated && (
                  <p role="status">
                    Rapporten teller {number(r.events)} hendelser. Fordeling og
                    nøkkeltall nedenfor bygger på de siste{" "}
                    {number(r.analyzed_events)}. Velg en kortere periode for mer
                    detalj.
                  </p>
                )}
                <dl className="er-kpis">
                  <div>
                    <dt>Lagrede hendelser</dt>
                    <dd>{number(r.events)}</dd>
                    <p>I valgt tidsrom</p>
                  </div>
                  <div>
                    <dt>Enheter med registrert aktivitet</dt>
                    <dd>{number(r.active_entities)}</dd>
                    <p>I analyserte hendelser</p>
                  </div>
                  <div>
                    <dt>Registrerte alarmutløsninger</dt>
                    <dd>{number(r.alarm_events)}</dd>
                    <p>Fra alarmanlegg · ikke alle sikkerhetshendelser</p>
                  </div>
                </dl>
                <div className="er-columns">
                  <section>
                    <h3>Aktivitet i hjemmet</h3>
                    <p>
                      Antall logghendelser, ikke brukstid eller energiforbruk.
                    </p>
                    <dl className="er-ledger">
                      {Object.entries(r.categories).map(([name, count]) => (
                        <div key={name}>
                          <dt>{name}</dt>
                          <dd>{number(count)}</dd>
                        </div>
                      ))}
                    </dl>
                    {!r.analyzed_events && (
                      <p>Ingen lagrede hendelser i perioden.</p>
                    )}
                  </section>
                  <section>
                    <h3>Mest registrert aktivitet</h3>
                    <dl className="er-ledger">
                      {r.top_entities.map((item, i) => (
                        <div key={i}>
                          <dt>{item.name}</dt>
                          <dd>{number(item.count)} hendelser</dd>
                        </div>
                      ))}
                    </dl>
                    <p>
                      Enheter rapporterer ulikt. Mange hendelser betyr ikke
                      nødvendigvis høyere bruk.
                    </p>
                  </section>
                </div>
                <section className="house-report-days">
                  <h3>Hendelser per dag</h3>
                  <p>
                    Dager uten registrerte hendelser vises ikke. Datoene følger
                    Oslo-tid.
                  </p>
                  {Object.entries(r.daily).map(([date, count]) => (
                    <div key={date}>
                      <span>{date}</span>
                      <meter
                        aria-label={`Hendelser ${date}`}
                        min={0}
                        max={Math.max(1, ...Object.values(r.daily))}
                        value={count}
                      />
                      <strong>{number(count)}</strong>
                    </div>
                  ))}
                </section>
                <section className="er-insight">
                  <div>
                    <h3>Sikkerhet og tilgjengelighet</h3>
                    <p>
                      {number(r.alarm_events)} registrerte alarmutløsninger og{" "}
                      {number(r.unavailable_events)} logghendelser med status
                      «utilgjengelig» i analyserte hendelser. Dette er ikke en
                      måling av oppetid eller en bekreftelse på at hjemmet var
                      sikkert.
                    </p>
                  </div>
                </section>
                <section>
                  <h3>Temperaturer i perioden</h3>
                  <p>
                    Laveste og høyeste lagrede verdi for opptil seks
                    temperaturmålere.{" "}
                    {r.temperature_sensor_count > 6 &&
                      `${r.temperature_sensor_count} målere finnes; bruk Historikk for å utforske andre.`}
                  </p>
                  {r.climate_unavailable ? (
                    <p>Temperaturhistorikken kunne ikke hentes.</p>
                  ) : (
                    <dl className="er-ledger">
                      {r.temperatures.map((t, i) => (
                        <div key={i}>
                          <dt>
                            {t.name}
                            <small>
                              {number(t.samples)} registrerte tilstander
                            </small>
                          </dt>
                          <dd>
                            {number(t.minimum)} – {number(t.maximum)} {t.unit}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {!r.temperatures.length && !r.climate_unavailable && (
                    <p>Ingen temperaturmålinger tilgjengelig.</p>
                  )}
                </section>
                <section className="er-solar">
                  <h3>Energi · kalenderdagene i perioden</h3>
                  <p>
                    Energisammendraget dekker hele dagene berørt av rapporten,
                    til siste tilgjengelige måling. Det følger ikke
                    klokkeslettene ovenfor.
                  </p>
                  {energy.isFetching ? (
                    <p>Henter energimålinger…</p>
                  ) : energy.isError ? (
                    <p>Energi kunne ikke hentes.</p>
                  ) : !grid ? (
                    <p>Ingen energimåler konfigurert eller tilgjengelig.</p>
                  ) : (
                    <>
                      <dl className="er-ledger">
                        <div>
                          <dt>Registrert forbruk</dt>
                          <dd>{number(grid.summary.available_kwh)} kWh</dd>
                        </div>
                        <div>
                          <dt>Estimert kostnad</dt>
                          <dd>
                            {number(grid.cost_total ?? grid.available_cost)} kr
                          </dd>
                        </div>
                      </dl>
                      <p>
                        {grid.cost_total == null
                          ? grid.available_cost_note ||
                            "Ufullstendig beregningsgrunnlag."
                          : "Estimat inkludert fordelte faste beløp."}
                      </p>
                      <p>
                        {grid.summary.complete
                          ? "Komplett målegrunnlag."
                          : "Ufullstendig målegrunnlag."}{" "}
                        Åpne Energirapport for grafer, priser og detaljer.
                      </p>
                    </>
                  )}
                </section>
                <footer>
                  <strong>SMARTi · Hele hjemmet i én oversikt.</strong>
                  <p>
                    Hendelser kommer fra hubens huslogg. Rapporten kan ikke
                    rekonstruere slettet historikk eller perioder uten
                    innsamling. Tall for hendelser er ikke det samme som antall
                    manuelle handlinger.
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
