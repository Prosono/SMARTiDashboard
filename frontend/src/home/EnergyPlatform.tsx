import { type ReactNode, useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Cloud,
  Settings2,
  Zap,
  RefreshCw,
  Info,
} from "lucide-react";
import { api } from "../api";
import { SettingsDialog } from "./SettingsDialog";
import "./energyPlatform.css";
import { EnergySensorPicker } from "./EnergySensorPicker";

type Meter = { role: string; entity: string; name: string };
type Config = {
  equipment?: Record<"solar" | "ev" | "battery", boolean>;
  effective_from?: string;
  country: "NO";
  area: string;
  company: string;
  segment: string;
  contract: string;
  fixed_price: string | number;
  markup: string | number;
  monthly_fee: string | number;
  scheme: string;
  vat_exempt: boolean;
  electricity_tax_exempt: boolean;
  manual_grid_rate: string | number | null;
  manual_capacity: string | number | null;
  meters: Meter[];
  power_entity: string | null;
  power?: Record<string, string>;
  battery_level?: string | null;
  cloud_history: boolean;
};
type Setup = {
  config: Config | null;
  can_edit: boolean;
  country: string;
  companies: { id: string; name: string }[];
  sensors: { entity: string; name: string; unit: string }[];
  tariff_source: { url: string; updated: string };
};
type Point = {
  start: string;
  end: string;
  kwh: number | string | null;
  cost: {
    total: number | string | null;
    reason?: string;
    parts?: Record<string, number | string>;
  };
};
type Dashboard = {
  outlook?: {
    start: string;
    end: string;
    spot: number;
    variable_rate: string | number | null;
  }[];
  solar?: {
    production: string | number | null;
    export: string | number | null;
    self_consumption: string | number | null;
    export_spot_value: string | number | null;
    note: string;
  } | null;
  totals?: Record<
    string,
    {
      available_kwh: number | string | null;
      total_kwh: number | string | null;
      cost?: number | string | null;
      complete: boolean;
    }
  >;
  forecast?: { value: number | string; method: string } | null;
  comparisons?: { scheme: string; cost: number | string | null }[];
  previous?: {
    kwh: number | string | null;
    cost: number | string | null;
  } | null;
  configured: boolean;
  power_kw: number | null;
  cloud: string;
  cloud_at: string;
  collected_at: string;
  meters: {
    role: string;
    name: string;
    summary: {
      available_kwh: number | string | null;
      complete: boolean;
      coverage: number;
    };
    points: Point[];
    cost_total: number | string | null;
    monthly_fees: number | string | null;
    breakdown: Record<string, number | string>;
    capacity: {
      peak_kw: number | string;
      monthly_ex_vat: number | string;
      next_threshold_kw?: number | string | null;
    } | null;
  }[];
  spot: { time_start: string; time_end: string; NOK_per_kWh: number }[] | null;
  tomorrow: Dashboard["spot"];
  cost_note: string;
};
const defaults: Config = {
  country: "NO",
  area: "NO1",
  company: "",
  segment: "husholdning",
  contract: "spot",
  fixed_price: 0,
  markup: 0,
  monthly_fee: 0,
  scheme: "stromstotte",
  vat_exempt: false,
  electricity_tax_exempt: false,
  manual_grid_rate: null,
  manual_capacity: null,
  meters: [],
  power_entity: null,
  cloud_history: true,
};
const fmt = (v: string | number | null | undefined, digits = 1) =>
  v == null
    ? "—"
    : Number(v).toLocaleString("nb-NO", { maximumFractionDigits: digits });
const dayString = (d: Date) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo" }).format(d);
function range(day: string, period: string) {
  const start = new Date(day + "T12:00:00Z"),
    end = new Date(start);
  if (period === "month") {
    start.setUTCDate(1);
    end.setUTCMonth(end.getUTCMonth() + 1, 1);
  } else if (period === "year") {
    start.setUTCMonth(0, 1);
    end.setUTCFullYear(end.getUTCFullYear() + 1, 0, 1);
  } else end.setUTCDate(end.getUTCDate() + (period === "week" ? 7 : 1));
  return [dayString(start), dayString(end)];
}

export function EnergyPlatform({
  admin,
  lang,
  overview,
  historyExtras,
}: {
  admin: boolean;
  lang: string;
  overview?: (managedEquipment: boolean) => ReactNode;
  historyExtras?: ReactNode;
}) {
  const cache = useQueryClient();
  const [view, setView] = useState("overview");
  const setup = useQuery({
    queryKey: ["energy-platform-setup"],
    queryFn: () => api<Setup>("home/energy/platform/setup"),
  });
  const [editing, setEditing] = useState<boolean | null>(null),
    [period, setPeriod] = useState("day"),
    [day, setDay] = useState(dayString(new Date()));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<number | null>(null);
  const [start, end] = range(day, period);
  const dashboard = useQuery({
    queryKey: ["energy-platform", start, end],
    queryFn: () =>
      api<Dashboard>(
        `home/energy/platform/dashboard?start=${start}&end=${end}`,
      ),
    enabled: !!setup.data?.config,
    refetchInterval: 60000,
  });
  const data = dashboard.data,
    grid = data?.meters?.find((m) => m.role === "grid");
  const grouped = new Map<
    string,
    { label: string; kwh: number | null; cost: number; priced: boolean }
  >();
  for (const p of grid?.points || []) {
    const d = new Date(p.start),
      key =
        period === "day"
          ? p.start
          : period === "year"
            ? dayString(d).slice(0, 7)
            : dayString(d);
    const item = grouped.get(key) || {
      label:
        period === "day"
          ? d.toLocaleTimeString("nb-NO", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Europe/Oslo",
              timeZoneName: "shortOffset",
            })
          : key,
      kwh: 0,
      cost: 0,
      priced: true,
    };
    item.kwh =
      p.kwh == null || item.kwh == null ? null : item.kwh + Number(p.kwh);
    item.cost += Number(p.cost.total || 0);
    item.priced &&= p.cost.total != null;
    grouped.set(key, item);
  }
  const points = [...grouped.values()],
    max = Math.max(1, ...points.map((p) => p.kwh ?? 0)),
    active = selected == null ? null : points[selected];
  const totalCost = grid?.cost_total;
  const currentPrice = data?.spot?.find(
    (p) =>
      new Date(p.time_start).getTime() <= Date.now() &&
      new Date(p.time_end).getTime() > Date.now(),
  );
  const cheapest = data?.spot
    ?.filter((p) => new Date(p.time_end).getTime() > Date.now())
    .sort((a, b) => a.NOK_per_kWh - b.NOK_per_kWh)[0];
  const liveRate = data?.outlook?.find(
    (p) =>
      new Date(p.start).getTime() <= Date.now() &&
      new Date(p.end).getTime() > Date.now(),
  );
  const bestRate = data?.outlook
    ?.filter(
      (p) => p.variable_rate != null && new Date(p.end).getTime() > Date.now(),
    )
    .sort((a, b) => Number(a.variable_rate) - Number(b.variable_rate))[0];
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      await api("home/energy/platform/refresh", "POST");
      await cache.invalidateQueries({ queryKey: ["energy-platform"] });
    } catch {
      setError(
        "Kunne ikke hente alle kildene nå. Lagret historikk er fortsatt tilgjengelig.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (setup.isLoading)
    return (
      <section className="ep" aria-busy="true">
        <p>Henter energioppsettet…</p>
      </section>
    );
  if (setup.isError)
    return (
      <section className="ep">
        <p role="alert">Kunne ikke hente energioppsettet.</p>
        <button onClick={() => setup.refetch()}>Prøv igjen</button>
      </section>
    );
  return (
    <>
      <section className="ep" aria-label="Energi og kostnader">
        <header className="ep-heading">
          <div>
            <small className="ep-eyebrow">DIN ENERGI</small>
            <h2>Mer innsikt. Bedre valg.</h2>
            <p>Forbruk, strømavtale og nettleie, samlet for hjemmet ditt.</p>
          </div>
          {admin && setup.data?.config && (
            <button onClick={() => setEditing(true)}>
              <Settings2 size={18} /> Energiinnstillinger
            </button>
          )}
        </header>
        {setup.data?.config && (
          <div
            className="ep-view-tabs"
            role="tablist"
            aria-label="Energivisning"
          >
            {[
              ["overview", "3D-oversikt"],
              ["history", "Historikk og strømpriser"],
            ].map(([id, label]) => (
              <button
                key={id}
                id={`energy-view-${id}`}
                type="button"
                role="tab"
                aria-selected={view === id}
                aria-controls={`energy-panel-${id}`}
                tabIndex={view === id ? 0 : -1}
                onClick={() => setView(id)}
                onKeyDown={(e) => {
                  if (
                    ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                  ) {
                    e.preventDefault();
                    const next =
                      e.key === "Home"
                        ? "overview"
                        : e.key === "End"
                          ? "history"
                          : view === "overview"
                            ? "history"
                            : "overview";
                    setView(next);
                    document.getElementById(`energy-view-${next}`)?.focus();
                  }
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {!setup.data?.config ? (
          <div className="ep-start">
            <Zap size={30} />
            <div>
              <h3>La oss bli kjent med energien din.</h3>
              <p>
                Velg nettselskap, strømavtale og måler. Du kan endre alt senere.
              </p>
            </div>
            {admin ? (
              <button className="ep-primary" onClick={() => setEditing(true)}>
                Sett opp energien <ArrowRight size={18} />
              </button>
            ) : (
              <p>En administrator må sette opp energien først.</p>
            )}
          </div>
        ) : view === "history" ? (
          <div
            role="tabpanel"
            id="energy-panel-history"
            aria-labelledby="energy-view-history"
          >
            <div className="ep-toolbar">
              <div role="group" aria-label="Periode">
                {[
                  ["day", "Døgn"],
                  ["week", "Uke"],
                  ["month", "Måned"],
                  ["year", "År"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    aria-pressed={period === id}
                    onClick={() => {
                      setPeriod(id);
                      setSelected(null);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label>
                Dato
                <input
                  type="date"
                  value={day}
                  max={dayString(new Date())}
                  onChange={(e) => {
                    setDay(e.target.value || dayString(new Date()));
                    setSelected(null);
                  }}
                />
              </label>
              {admin && (
                <button disabled={busy} onClick={() => void refresh()}>
                  <RefreshCw size={16} className={busy ? "ep-spin" : ""} />{" "}
                  {busy ? "Henter…" : "Oppdater"}
                </button>
              )}
            </div>
            {(error || dashboard.isError) && (
              <p role="alert">
                {error ||
                  "Kunne ikke hente energihistorikken. Prøv å oppdatere."}
              </p>
            )}
            <div className="ep-metrics">
              <article>
                <small>Akkurat nå</small>
                <strong>
                  {fmt(data?.power_kw)} <span>kW</span>
                </strong>
                <p>
                  {data?.power_kw == null
                    ? "Ingen fersk effektmåling"
                    : "Målt effekt fra hjemmet"}
                </p>
              </article>
              <article>
                <small>Forbruk i perioden</small>
                <strong>
                  {fmt(grid?.summary.available_kwh)} <span>kWh</span>
                </strong>
                <p>
                  {grid?.summary.complete
                    ? "Komplett målegrunnlag"
                    : `${fmt((grid?.summary.coverage || 0) * 100, 0)} % datadekning · ufullstendig`}
                </p>
              </article>
              <article>
                <small>Beregnet energikostnad</small>
                <strong>
                  {fmt(totalCost)} <span>kr</span>
                </strong>
                <p>
                  {totalCost != null
                    ? "Estimat inkl. fordelte faste beløp"
                    : "Mangler komplett pris- eller støttegrunnlag"}
                </p>
              </article>
              <article>
                <small>Spotpris akkurat nå</small>
                <strong>
                  {fmt(
                    currentPrice?.NOK_per_kWh == null
                      ? null
                      : currentPrice.NOK_per_kWh * 100,
                  )}{" "}
                  <span>øre/kWh</span>
                </strong>
                <p>Uten mva., påslag og nettleie</p>
              </article>
            </div>
            {liveRate?.variable_rate != null && (
              <p className="ep-current-rate">
                Din energipris nå:{" "}
                <strong>
                  {fmt(Number(liveRate.variable_rate) * 100, 1)} øre/kWh
                </strong>{" "}
                inkl. påslag, energiledd, avgifter og foreløpig støtte. Faste
                beløp kommer i tillegg.
              </p>
            )}
            {bestRate?.variable_rate != null &&
              liveRate?.variable_rate != null &&
              Number(bestRate.variable_rate) <
                Number(liveRate.variable_rate) && (
                <p className="ep-help">
                  Flytter du 10 kWh til kl.{" "}
                  {new Date(bestRate.start).toLocaleString("nb-NO", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Europe/Oslo",
                  })}
                  , er beregnet besparelse{" "}
                  {fmt(
                    (Number(liveRate.variable_rate) -
                      Number(bestRate.variable_rate)) *
                      10,
                    2,
                  )}{" "}
                  kr. Estimat uten eventuell endring i kapasitetstrinn.
                </p>
              )}
            {data?.solar && (
              <div className="ep-solar">
                <h3>Solenergien din</h3>
                <div className="ep-period-summary">
                  <div>
                    <span>Produsert</span>
                    <strong>{fmt(data.solar.production)} kWh</strong>
                  </div>
                  <div>
                    <span>Brukt i hjemmet</span>
                    <strong>{fmt(data.solar.self_consumption)} kWh</strong>
                  </div>
                  <div>
                    <span>Eksportert</span>
                    <strong>{fmt(data.solar.export)} kWh</strong>
                  </div>
                  <div>
                    <span>Beregnet spotverdi · eksport</span>
                    <strong>{fmt(data.solar.export_spot_value, 2)} kr</strong>
                  </div>
                </div>
                <small>{data.solar.note}</small>
              </div>
            )}
            <div className="ep-period-summary" aria-label="Forbruksoversikt">
              {[
                ["today", "I dag"],
                ["month", "Denne måneden"],
                ["year", "Hittil i år"],
              ].map(([key, label]) => (
                <div key={key}>
                  <span>{label}</span>
                  <strong>{fmt(data?.totals?.[key]?.available_kwh)} kWh</strong>
                  <small>
                    Estimert kostnad: {fmt(data?.totals?.[key]?.cost, 2)} kr
                  </small>
                  <small>
                    {data?.totals?.[key]?.complete
                      ? "Målt forbruk"
                      : "Ufullstendig målegrunnlag"}
                  </small>
                </div>
              ))}
            </div>
            {grid?.capacity?.next_threshold_kw != null &&
              Number(grid.capacity.peak_kw) >=
                Number(grid.capacity.next_threshold_kw) * 0.9 && (
                <p role="status">
                  Kapasitetsgrunnlaget er {fmt(grid.capacity.peak_kw)} kW, nær
                  neste nettleietrinn på {fmt(grid.capacity.next_threshold_kw)}{" "}
                  kW. Unngå gjerne å lade bilen og varme varmtvann samtidig.
                  Dette er et foreløpig grunnlag for måneden.
                </p>
              )}
            <div className="ep-history">
              <header>
                <h3>Forbruket ditt</h3>
                <span>
                  {start} – {end} · Oslo-tid
                </span>
              </header>
              {points.some((p) => p.kwh != null) ? (
                <>
                  <div
                    className="ep-bars"
                    role="group"
                    aria-label="Forbruksgraf"
                  >
                    {points.map((p, i) => (
                      <button
                        key={i}
                        style={{
                          height: `${Math.max(3, ((p.kwh ?? 0) / max) * 100)}%`,
                        }}
                        data-missing={p.kwh == null || undefined}
                        aria-label={`${p.label}: ${p.kwh == null ? "Måling mangler" : fmt(p.kwh) + " kWh"}`}
                        aria-pressed={selected === i}
                        onClick={() => setSelected(i)}
                        onFocus={() => setSelected(i)}
                        title={`${p.label}: ${fmt(p.kwh)} kWh`}
                      />
                    ))}
                  </div>
                  <p className="ep-chart-detail" aria-live="polite">
                    {active
                      ? `${active.label} · ${fmt(active.kwh)} kWh · ${active.priced ? fmt(active.cost) + " kr uten faste beløp" : "kostnad ikke tilgjengelig"}`
                      : "Trykk på en søyle for å se forbruk og kostnad."}
                  </p>
                </>
              ) : (
                <div className="ep-empty">
                  <Zap size={28} />
                  <h4>
                    {dashboard.isLoading
                      ? "Henter historikken…"
                      : "Her kommer forbruket ditt"}
                  </h4>
                  <p>
                    Vi henter fullførte timer fra måleren. Manglende målinger
                    blir aldri vist som null.
                  </p>
                </div>
              )}
            </div>
            {grid?.cost_total != null && (
              <div className="ep-cost-breakdown">
                <h3>Slik fordeler kostnaden seg</h3>
                <dl>
                  {Object.entries(grid.breakdown).map(([key, value]) => (
                    <div key={key}>
                      <dt>
                        {(
                          {
                            electricity: "Strøm",
                            markup: "Påslag",
                            grid: "Nettleie · energi",
                            electricity_tax: "Elavgift",
                            enova: "Energifondet",
                            support: "Støtte / Norgespris",
                            vat: "Merverdiavgift",
                          } as Record<string, string>
                        )[key] || key}
                      </dt>
                      <dd>{fmt(value, 2)} kr</dd>
                    </div>
                  ))}
                  <div>
                    <dt>Fordelte faste beløp inkl. mva.</dt>
                    <dd>{fmt(grid.monthly_fees, 2)} kr</dd>
                  </div>
                </dl>
                <small>
                  Foreløpig beregning. Endelig kapasitetstrinn og støtte kan
                  endres ved månedsslutt.
                </small>
                {grid.capacity && (
                  <p>
                    Kapasitetsgrunnlag så langt: {fmt(grid.capacity.peak_kw)}{" "}
                    kW.
                  </p>
                )}
              </div>
            )}
            {data?.previous?.kwh != null && grid?.summary.complete && (
              <p>
                Forrige like lange periode: {fmt(data.previous.kwh)} kWh ·{" "}
                {fmt(
                  Number(grid.summary.available_kwh) -
                    Number(data.previous.kwh),
                )}{" "}
                kWh endring.
              </p>
            )}
            {data?.forecast && (
              <div className="ep-forecast">
                <small>FORVENTET DENNE MÅNEDEN</small>
                <strong>{fmt(data.forecast.value, 0)} kr</strong>
                <p>
                  {data.forecast.method} Estimatet tar ikke hensyn til kommende
                  vær eller prisendringer.
                </p>
              </div>
            )}
            {!!data?.comparisons?.some((c) => c.cost != null) && (
              <div className="ep-alternatives">
                <h3>Hva ville støtteordningene betydd?</h3>
                <p>
                  Samme forbruk og strømavtale hittil denne måneden. Beregnet
                  med ulike støttevalg.
                </p>
                {data.comparisons.map((c) => (
                  <div key={c.scheme}>
                    <span>
                      {c.scheme === "none"
                        ? "Uten støtte"
                        : c.scheme === "norgespris"
                          ? "Norgespris"
                          : "Strømstøtte"}
                    </span>
                    <strong>{fmt(c.cost, 2)} kr</strong>
                  </div>
                ))}
                <small>Dette er et estimat og endrer ikke avtalen din.</small>
              </div>
            )}
            <div className="ep-details">
              <article>
                <h3>Et godt tidspunkt å bruke strøm</h3>
                <p>
                  {cheapest
                    ? `Laveste gjenværende spotpris i dag er ${fmt(cheapest.NOK_per_kWh * 100)} øre/kWh kl. ${new Date(cheapest.time_start).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Oslo" })}.`
                    : "Vi venter på dagens priser."}
                </p>
                <small>
                  Spotpris uten avgifter. Din avtale og nettleie kan endre hva
                  som lønner seg.
                </small>
              </article>
              <article>
                <Cloud size={20} />
                <h3>Historikken følger hjemmet</h3>
                <p>
                  {!setup.data.config.cloud_history
                    ? "Skylagring er slått av."
                    : data?.cloud === "synced"
                      ? "Målehistorikken er synkronisert til SMARTi-skyen."
                      : "Målehistorikken lagres lokalt. Venter på synkronisering til skyen."}
                </p>
                {data?.cloud_at && (
                  <small>
                    Sist bekreftet:{" "}
                    {new Date(data.cloud_at).toLocaleString("nb-NO")}
                  </small>
                )}
              </article>
            </div>
            {data?.meters
              ?.filter((m) => m.role !== "grid")
              .map((m) => (
                <div className="ep-consumer" key={m.name}>
                  <span>
                    {m.name}
                    <small>
                      {m.role === "solar"
                        ? "Solproduksjon"
                        : m.role === "export"
                          ? "Solgt til nettet"
                          : m.role === "ev"
                            ? "Elbillading"
                            : "Energimåler"}
                    </small>
                  </span>
                  <strong>
                    {fmt(m.summary.available_kwh)} kWh
                    {m.cost_total != null && (
                      <small>Estimert kostnad: {fmt(m.cost_total, 2)} kr</small>
                    )}
                    <small>
                      {fmt(m.summary.coverage * 100, 0)} % datadekning
                    </small>
                  </strong>
                </div>
              ))}
            <p className="ep-source">
              Priser fra{" "}
              <a
                href="https://www.hvakosterstrommen.no/strompris-api"
                target="_blank"
                rel="noreferrer"
              >
                Hva koster strømmen
              </a>
              . Nettleie fra{" "}
              <a
                href={setup.data.tariff_source.url}
                target="_blank"
                rel="noreferrer"
              >
                Fri Nettleie (CC BY 4.0)
              </a>
              , datagrunnlag {setup.data.tariff_source.updated}. Beregninger er
              et estimat, ikke en strømregning.
            </p>
            {historyExtras}
          </div>
        ) : null}
        {(editing ?? (admin && !setup.data?.config)) && setup.data && (
          <EnergyWizard
            setup={setup.data}
            lang={lang}
            onClose={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              if (!setup.data?.config) setView("overview");
              void cache.invalidateQueries({
                queryKey: ["energy-platform-setup"],
              });
              void cache.invalidateQueries({ queryKey: ["energy-platform"] });
              void cache.invalidateQueries({
                queryKey: ["energy-flow-preferences"],
              });
              void refresh();
            }}
          />
        )}
      </section>
      {setup.data?.config && (
        <div
          role="tabpanel"
          hidden={view !== "overview"}
          id="energy-panel-overview"
          aria-labelledby="energy-view-overview"
        >
          {overview?.(setup.data?.config?.equipment != null)}
        </div>
      )}
    </>
  );
}
function EnergyWizard({
  setup,
  lang,
  onClose,
  onSaved,
}: {
  setup: Setup;
  lang: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editingExisting = !!setup.config;
  const editSections = [
    "Hjem og nettleie",
    "Strømavtale",
    "Utstyr og målere",
    "Historikk og lagring",
  ];
  const [draft, setDraft] = useState<Config>({
      ...(setup.config || defaults),
      equipment: Object.fromEntries(
        ["solar", "ev", "battery"].map((role) => [
          role,
          setup.config?.equipment?.[role as "solar" | "ev" | "battery"] ??
            !!(
              setup.config?.power?.[role] ||
              setup.config?.meters.some(
                (m) =>
                  m.role === role ||
                  (role === "solar" && m.role === "export") ||
                  (role === "battery" && m.role.startsWith("battery_")),
              ) ||
              (role === "battery" && setup.config?.battery_level)
            ),
        ]),
      ) as Config["equipment"],
      effective_from: dayString(new Date()),
    }),
    [step, setStep] = useState(0),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    formRef.current
      ?.closest(".dashboard-settings-content")
      ?.scrollTo({ top: 0 });
    const heading = formRef.current?.querySelector("h3");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }, [step]);
  const change = (patch: Partial<Config>) => setDraft({ ...draft, ...patch });
  const labels = ["Hjemmet", "Avtalen", "Utstyret", "Klar"];
  function energyMeter(role: string, label: string) {
    return (
      <EnergySensorPicker
        label={label}
        hint="Forbruk over tid · kWh / Wh"
        value={draft.meters.find((m) => m.role === role)?.entity || ""}
        sensors={setup.sensors.filter(
          (s) =>
            ["Wh", "kWh"].includes(s.unit) &&
            !draft.meters.some((m) => m.entity === s.entity && m.role !== role),
        )}
        onChange={(entity) => {
          const sensor = setup.sensors.find((s) => s.entity === entity);
          change({
            meters: [
              ...draft.meters.filter((m) => m.role !== role),
              ...(sensor ? [{ role, entity, name: sensor.name }] : []),
            ],
          });
        }}
      />
    );
  }
  function powerMeter(role: string, label: string) {
    return (
      <EnergySensorPicker
        label={label}
        hint="Strøm akkurat nå · W / kW"
        value={
          (role === "grid" ? draft.power_entity : draft.power?.[role]) || ""
        }
        sensors={setup.sensors.filter((s) => ["W", "kW"].includes(s.unit))}
        onChange={(entity) => {
          if (role === "grid") change({ power_entity: entity || null });
          else {
            const power = { ...draft.power };
            if (entity) power[role] = entity;
            else delete power[role];
            change({ power });
          }
        }}
      />
    );
  }
  function equipment(role: "solar" | "ev" | "battery", yes: boolean) {
    const power = { ...draft.power };
    if (!yes) delete power[role];
    change({
      equipment: { ...draft.equipment!, [role]: yes },
      power,
      ...(!yes
        ? {
            meters: draft.meters.filter(
              (m) =>
                !(
                  m.role === role ||
                  (role === "solar" && m.role === "export") ||
                  (role === "battery" && m.role.startsWith("battery_"))
                ),
            ),
            ...(role === "battery" ? { battery_level: null } : {}),
          }
        : {}),
    });
  }
  const valid = editingExisting
    ? !!draft.company &&
      !!draft.effective_from &&
      [draft.fixed_price, draft.markup, draft.monthly_fee].every(
        (v) => String(v).trim() !== "" && Number.isFinite(Number(v)),
      )
    : step === 0
      ? !!draft.company
      : step === 1
        ? [draft.fixed_price, draft.markup, draft.monthly_fee].every(
            (v) => String(v).trim() !== "" && Number.isFinite(Number(v)),
          )
        : true;
  async function save() {
    setBusy(true);
    setError("");
    try {
      await api("home/energy/platform/setup", "PUT", draft);
      onSaved();
    } catch {
      setError(
        "Kunne ikke lagre. Kontroller feltene og at målerne fortsatt finnes.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <SettingsDialog
      title={
        editingExisting ? "Energiinnstillinger" : "Energien i hjemmet ditt"
      }
      lang={lang}
      busy={busy}
      onClose={onClose}
    >
      <form
        ref={formRef}
        className="ep-wizard"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) {
            if (!editingExisting && step < 3) setStep(step + 1);
            else void save();
          }
        }}
      >
        {editingExisting ? (
          <>
            <p>
              Velg det du vil endre, og trykk «Lagre endringer». Resten av
              oppsettet beholdes.
            </p>
            <nav className="ep-edit-sections" aria-label="Energiinnstillinger">
              {editSections.map((label, index) => (
                <button
                  type="button"
                  key={label}
                  aria-pressed={step === index}
                  disabled={busy}
                  onClick={() => {
                    setStep(index);
                    setError("");
                  }}
                >
                  {label}
                </button>
              ))}
            </nav>
          </>
        ) : (
          <ol className="ep-steps">
            {labels.map((label, i) => (
              <li key={label} aria-current={i === step ? "step" : undefined}>
                <span>{i < step ? <Check size={14} /> : i + 1}</span>
                {label}
              </li>
            ))}
          </ol>
        )}
        {step === 0 && (
          <>
            <h3>Hvilket nettselskap har du?</h3>
            <p>
              Oppsett for norske boliger. Finn nettselskapet på strømregningen
              din.
            </p>
            <div className="ep-fields">
              <label>
                Strømprisområde
                <select
                  value={draft.area}
                  onChange={(e) => change({ area: e.target.value })}
                >
                  {[
                    ["NO1", "Østlandet"],
                    ["NO2", "Sørlandet"],
                    ["NO3", "Midt-Norge"],
                    ["NO4", "Nord-Norge"],
                    ["NO5", "Vestlandet"],
                  ].map(([id, name]) => (
                    <option key={id} value={id}>
                      {id} · {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Boligtype
                <select
                  value={draft.segment}
                  onChange={(e) =>
                    change({
                      segment: e.target.value,
                      scheme:
                        e.target.value === "fritid" &&
                        draft.scheme === "stromstotte"
                          ? "none"
                          : draft.scheme,
                    })
                  }
                >
                  <option value="husholdning">Helårsbolig</option>
                  <option value="fritid">Fritidsbolig</option>
                </select>
              </label>
            </div>
            <label>
              Søk etter nettselskap
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Skriv navnet på nettselskapet"
              />
            </label>
            <div
              className="ep-company-list"
              role="group"
              aria-label="Nettselskaper"
            >
              {setup.companies
                .filter((c) =>
                  c.name.toLowerCase().includes(search.toLowerCase()),
                )
                .map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    aria-pressed={draft.company === c.id}
                    onClick={() => change({ company: c.id })}
                  >
                    {c.name}
                    {draft.company === c.id && <Check size={18} />}
                  </button>
                ))}
            </div>
            <p className="ep-help">
              {setup.companies.find((c) => c.id === draft.company)?.name ||
                "Velg nettselskapet ditt for å fortsette."}
            </p>
          </>
        )}
        {step === 1 && (
          <>
            <h3>Hvilken strømavtale har du?</h3>
            <p>
              Fyll inn prisene uten mva. Du finner dem hos strømleverandøren.
            </p>
            <div className="ep-fields">
              <label>
                Strømavtale
                <select
                  value={draft.contract}
                  onChange={(e) => change({ contract: e.target.value })}
                >
                  <option value="spot">Spotpris</option>
                  <option value="fixed">Fastpris</option>
                </select>
              </label>
              <label>
                Støtteordning
                <select
                  value={draft.scheme}
                  onChange={(e) => change({ scheme: e.target.value })}
                >
                  <option value="none">Ingen</option>
                  {draft.segment === "husholdning" && (
                    <option value="stromstotte">Strømstøtte</option>
                  )}
                  <option value="norgespris">Norgespris</option>
                </select>
              </label>
              {draft.contract === "fixed" && (
                <label>
                  Fastpris · kr/kWh
                  <input
                    required
                    type="number"
                    min="0"
                    max="100"
                    step="0.0001"
                    value={draft.fixed_price}
                    onChange={(e) => change({ fixed_price: e.target.value })}
                  />
                </label>
              )}
              <label>
                Påslag · kr/kWh
                <input
                  required
                  type="number"
                  min="-10"
                  max="100"
                  step="0.0001"
                  value={draft.markup}
                  onChange={(e) => change({ markup: e.target.value })}
                />
              </label>
              <label>
                Fast beløp · kr/måned
                <input
                  required
                  type="number"
                  min="0"
                  max="10000"
                  step="0.01"
                  value={draft.monthly_fee}
                  onChange={(e) => change({ monthly_fee: e.target.value })}
                />
              </label>
            </div>
            <p className="ep-help">
              <Info size={18} /> Valget her bestiller ikke Norgespris. Du må
              allerede ha valgt ordningen hos Elhub/nettselskapet.
            </p>
            <details>
              <summary>Avgifter og manuelle nettleiesatser</summary>
              <label className="ep-check">
                <input
                  type="checkbox"
                  checked={draft.vat_exempt}
                  onChange={(e) => change({ vat_exempt: e.target.checked })}
                />{" "}
                Boligen er fritatt for mva. på strøm og nettleie
              </label>
              <label className="ep-check">
                <input
                  type="checkbox"
                  checked={draft.electricity_tax_exempt}
                  onChange={(e) =>
                    change({ electricity_tax_exempt: e.target.checked })
                  }
                />{" "}
                Boligen er fritatt for elavgift
              </label>
              <p>
                Bekreft fritak på regningen din. Prisområde alene er ikke nok
                til å avgjøre avgiftsfritak.
              </p>
              <label>
                Overstyr energiledd · kr/kWh uten avgifter
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.0001"
                  value={draft.manual_grid_rate ?? ""}
                  placeholder="Bruk nettselskapets sats"
                  onChange={(e) =>
                    change({
                      manual_grid_rate:
                        e.target.value === "" ? null : e.target.value,
                    })
                  }
                />
              </label>
              <label>
                Overstyr kapasitetsledd · kr/måned uten mva.
                <input
                  type="number"
                  min="0"
                  max="100000"
                  step="0.01"
                  value={draft.manual_capacity ?? ""}
                  placeholder="Bruk nettselskapets trinn"
                  onChange={(e) =>
                    change({
                      manual_capacity:
                        e.target.value === "" ? null : e.target.value,
                    })
                  }
                />
              </label>
            </details>
          </>
        )}
        {step === 2 && (
          <>
            <h3>Hva har du hjemme?</h3>
            <p>
              Velg det du har. Koble til målinger nå, eller legg dem til senere.
              3D-huset tilpasses valgene dine.
            </p>
            <section className="ep-equipment-card">
              <h4>Strøm til hjemmet</h4>
              <p>
                Velg hovedmåleren din. Dette gir oversikt over forbruk og
                kostnader.
              </p>
              {energyMeter("grid", "Kjøpt strøm fra nettet")}
              {powerMeter("grid", "Effekt fra strømnettet")}
              <details>
                <summary>Egen måling for hele boligen</summary>
                {powerMeter("home", "Boligen · samlet effekt")}
              </details>
            </section>
            {(
              [
                ["solar", "Har du solceller?"],
                ["ev", "Har du elbil?"],
                ["battery", "Har du hjemmebatteri?"],
              ] as const
            ).map(([role, question]) => (
              <section className="ep-equipment-card" key={role}>
                <h4>{question}</h4>
                {role === "battery" && (
                  <p>
                    Et batteri som lagrer strøm til boligen, ikke batteriet i
                    bilen.
                  </p>
                )}
                <div className="ep-choice" role="group" aria-label={question}>
                  {[false, true].map((yes) => (
                    <button
                      key={String(yes)}
                      type="button"
                      aria-pressed={draft.equipment?.[role] === yes}
                      onClick={() => equipment(role, yes)}
                    >
                      {yes ? "Ja" : "Nei"}
                      {draft.equipment?.[role] === yes && <Check size={18} />}
                    </button>
                  ))}
                </div>
                {draft.equipment?.[role] && (
                  <div className="ep-equipment-readings">
                    <p>
                      Velg målingene du har tilgjengelig. Ingen måler ennå? Du
                      kan fortsatt vise utstyret i 3D-huset.
                    </p>
                    {role === "solar" && (
                      <>
                        {energyMeter("solar", "Strøm fra solcellene")}
                        {energyMeter("export", "Strøm solgt til nettet")}
                        {powerMeter("solar", "Solproduksjon akkurat nå")}
                      </>
                    )}
                    {role === "ev" && (
                      <>
                        {energyMeter("ev", "Strøm til elbillading")}
                        {powerMeter("ev", "Elbillading akkurat nå")}
                      </>
                    )}
                    {role === "battery" && (
                      <>
                        {energyMeter(
                          "battery_charge",
                          "Strøm inn på batteriet",
                        )}
                        {energyMeter(
                          "battery_discharge",
                          "Strøm fra batteriet",
                        )}
                        {powerMeter(
                          "battery",
                          "Batteri akkurat nå · positiv verdi betyr lading",
                        )}
                        <EnergySensorPicker
                          label="Batterinivå"
                          hint="Hvor fullt batteriet er · %"
                          sensors={setup.sensors.filter((s) => s.unit === "%")}
                          value={draft.battery_level || ""}
                          onChange={(entity) =>
                            change({ battery_level: entity || null })
                          }
                        />
                      </>
                    )}
                  </div>
                )}
              </section>
            ))}
            <details>
              <summary>Varmepumpe, varmtvann og andre forbrukere</summary>
              {setup.sensors
                .filter(
                  (s) =>
                    ["kWh", "Wh"].includes(s.unit) &&
                    (!draft.meters.some((m) => m.entity === s.entity) ||
                      draft.meters.some(
                        (m) => m.entity === s.entity && m.role === "consumer",
                      )),
                )
                .map((s) => (
                  <label className="ep-check" key={s.entity}>
                    <input
                      type="checkbox"
                      checked={draft.meters.some((m) => m.entity === s.entity)}
                      onChange={(e) =>
                        change({
                          meters: e.target.checked
                            ? [
                                ...draft.meters,
                                {
                                  entity: s.entity,
                                  name: s.name,
                                  role: "consumer",
                                },
                              ]
                            : draft.meters.filter((m) => m.entity !== s.entity),
                        })
                      }
                    />
                    {s.name}
                  </label>
                ))}
            </details>
            <div className="ep-help">
              <Info size={20} />
              <p>
                <strong>Elhub kommer senere</strong>
                <br />
                SMARTi må først etablere virksomhetstilgang. Du kan bruke
                målerne i hjemmet nå og koble til Elhub når tjenesten er klar.
              </p>
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <h3>
              {editingExisting
                ? "Historikk og lagring"
                : "Dette blir din energioversikt."}
            </h3>

            <dl className="ep-review">
              <dt>Nettselskap</dt>
              <dd>
                {setup.companies.find((c) => c.id === draft.company)?.name}
              </dd>
              <dt>Prisområde</dt>
              <dd>{draft.area}</dd>
              <dt>Avtale</dt>
              <dd>{draft.contract === "spot" ? "Spotpris" : "Fastpris"}</dd>
              <dt>Støtte</dt>
              <dd>
                {draft.scheme === "none"
                  ? "Ingen"
                  : draft.scheme === "norgespris"
                    ? "Norgespris"
                    : "Strømstøtte"}
              </dd>
              <dt>Utstyr i 3D-huset</dt>
              <dd>
                {[
                  ["solar", "Solceller"],
                  ["ev", "Elbil"],
                  ["battery", "Hjemmebatteri"],
                ]
                  .filter(
                    ([role]) =>
                      draft.equipment?.[role as "solar" | "ev" | "battery"],
                  )
                  .map(([, label]) => label)
                  .join(", ") || "Hus og strømnett"}
              </dd>
              <dt>Energimålere</dt>
              <dd>{draft.meters.length}</dd>
            </dl>
            <label className="ep-check">
              <input
                type="checkbox"
                checked={draft.cloud_history}
                onChange={(e) => change({ cloud_history: e.target.checked })}
              />{" "}
              Lagre målehistorikk i SMARTi-skyen i tillegg til på huben
            </label>
            <p>
              Innstillingene brukes fra valgt dato frem til neste lagrede
              avtale. Velg bare en tidligere dato hvis avtalen også gjaldt da.
              Målingene beholdes. Historikken fylles gradvis fra målerne.
            </p>
            {!draft.meters.some((m) => m.role === "grid") && (
              <p className="ep-help">
                Du har ikke valgt en måler for kjøpt strøm. Forbruk og kostnader
                vises når en slik måler er koblet til.
              </p>
            )}
          </>
        )}
        {(editingExisting || step === 3) && (
          <div className="ep-edit-date">
            {" "}
            <label>
              Endringene gjelder fra
              <input
                type="date"
                required
                min="2021-12-01"
                max={dayString(new Date())}
                value={draft.effective_from}
                onChange={(e) => change({ effective_from: e.target.value })}
              />
            </label>
            {editingExisting && (
              <small>
                Endringene gjelder fra denne datoen. Tidligere målinger
                beholdes.
              </small>
            )}
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        <footer>
          {editingExisting && (
            <button type="button" disabled={busy} onClick={onClose}>
              Avbryt
            </button>
          )}
          {!editingExisting && step > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setStep(step - 1)}
            >
              <ChevronLeft size={18} /> Tilbake
            </button>
          )}
          <button
            type="submit"
            disabled={!valid || busy}
            className="ep-primary"
          >
            {busy
              ? "Lagrer…"
              : editingExisting
                ? "Lagre endringer"
                : step === 3
                  ? "Åpne energioversikten"
                  : "Fortsett"}
            <ArrowRight size={18} />
          </button>
        </footer>
      </form>
    </SettingsDialog>
  );
}
