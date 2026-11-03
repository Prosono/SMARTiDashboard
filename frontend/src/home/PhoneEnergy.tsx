import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronRight,
  Gauge,
  UtilityPole,
  Zap,
} from "lucide-react";
import { api } from "../api";
import type { Home } from "../types";
import type { Dashboard } from "./EnergyPlatform";
import type { FlowPoint } from "./FlowHistory";
import { HarmonyTrend } from "./HarmonyTrend";
import { EnergySummaryCard } from "./EnergySummaryCard";
import { finiteReading } from "./energySummaryModel";
import { usable } from "./homeModel";

const format = (n: unknown, lang: string, digits = 1) => {
  const number = finiteReading(n as number | string | null | undefined);
  return number === null
    ? "—"
    : number.toLocaleString(lang === "en" ? "en-GB" : "nb-NO", {
        maximumFractionDigits: digits,
      });
};

export function PhoneEnergyPower({
  home,
  offline,
  source,
  data,
  lang,
  open,
}: {
  home?: Home;
  offline: boolean;
  source?: string | null;
  data?: Dashboard;
  lang: string;
  open: () => void;
}) {
  const control = home?.controls.find((c) => c.entity_id === source);
  const available =
    !offline && home?.connected && finiteReading(data?.power_kw) !== null;
  const history = useQuery({
    queryKey: ["phone-power-history", source],
    queryFn: () =>
      api<{ points: FlowPoint[]; unit?: string; start?: string; end?: string }>(
        `controls/${encodeURIComponent(source!)}/history?hours=1`,
      ),
    enabled:
      !!source &&
      !!available &&
      !!control &&
      usable(control) &&
      ["W", "kW"].includes(String(control.attributes.unit_of_measurement)),
    retry: false,
    staleTime: 60000,
    refetchInterval: 60000,
  });
  const unit = history.data?.unit || control?.attributes.unit_of_measurement;
  const points = ["W", "kW"].includes(String(unit))
    ? (history.data?.points || []).map((p) => ({
        ...p,
        value:
          p.value === null
            ? null
            : Number.isFinite(p.value)
              ? p.value * (unit === "kW" ? 1000 : 1)
              : null,
      }))
    : [];
  const known = available && points.some((p) => p.value !== null);
  return (
    <article className="phone-energy-power">
      <header>
        <strong>{lang === "en" ? "Power now" : "Effekt nå"}</strong>
        <span data-live={available || undefined}>
          <i />
          {available
            ? "Live"
            : lang === "en"
              ? "No fresh reading"
              : "Venter på måling"}
        </span>
      </header>
      <div className="phone-power-value">
        {available ? format(data?.power_kw, lang) : "—"}
        <small>kW</small>
      </div>
      <div className="phone-power-history">
        {known ? (
          <HarmonyTrend
            points={points.map((p) => ({
              ...p,
              value: p.value === null ? null : p.value / 1000,
            }))}
            label={
              lang === "en"
                ? "Power, last 60 minutes"
                : "Effekt siste 60 minutter"
            }
            lang={lang}
            unit="kW"
            domain={{
              start:
                Date.parse(history.data?.start || "") || Date.now() - 3600000,
              end: Date.parse(history.data?.end || "") || Date.now(),
            }}
          />
        ) : (
          <span>
            {lang === "en" ? "Collecting history" : "Historikk samles inn"}
          </span>
        )}
      </div>
      <footer>
        <span>{lang === "en" ? "Last 60 min" : "Siste 60 min"}</span>
        <button onClick={open}>
          {lang === "en" ? "Energy flow" : "Energiflyt"}
          <ChevronRight size={18} />
        </button>
      </footer>
    </article>
  );
}

export function PhoneEnergyRate({
  kind,
  value,
  lang,
  open,
}: {
  kind: "spot" | "tariff";
  value: number | null;
  lang: string;
  open: () => void;
}) {
  const Icon = kind === "spot" ? Zap : UtilityPole;
  return (
    <button className="phone-energy-rate" onClick={open}>
      <span>
        <Icon size={21} />
        {kind === "spot"
          ? lang === "en"
            ? "Spot price now"
            : "Spotpris nå"
          : lang === "en"
            ? "Grid tariff now"
            : "Nettleie nå"}
      </span>
      <strong>{format(value, lang)}</strong>
      <small>øre/kWh</small>
    </button>
  );
}

export function PhoneCapacity({
  data,
  lang,
  open,
}: {
  data?: Dashboard;
  lang: string;
  open: () => void;
}) {
  const capacity = data?.current?.capacity;
  const tier =
    capacity?.threshold === undefined
      ? capacity?.manual
        ? lang === "en"
          ? "Manual rate"
          : "Manuell sats"
        : lang === "en"
          ? "Waiting for readings"
          : "Avventer målinger"
      : `${format(capacity.threshold, lang)}${capacity.next_threshold_kw != null ? `–${format(capacity.next_threshold_kw, lang)}` : "+"} kW`;
  return (
    <button
      className="phone-energy-capacity"
      data-waiting={capacity?.threshold === undefined || undefined}
      onClick={open}
    >
      <span className="phone-capacity-icon">
        <Gauge size={25} />
      </span>
      <span>
        <small>{lang === "en" ? "Capacity tier" : "Kapasitetstrinn"}</small>
        <strong>{tier}</strong>
        <small>
          {capacity
            ? `${format(capacity.monthly, lang, 2)} kr/mnd · ${lang === "en" ? "provisional" : "foreløpig"}`
            : lang === "en"
              ? "Shown when hourly data is available"
              : "Vises når vi har timeverdier"}
        </small>
      </span>
      <ChevronRight size={20} />
    </button>
  );
}

export function PhoneConsumption({
  data,
  start,
  end,
  day,
  period,
  lang,
  changeDay,
  changePeriod,
  open,
}: {
  data?: Dashboard;
  start: string;
  end: string;
  day: string;
  period: string;
  lang: string;
  changeDay: (day: string) => void;
  changePeriod: (period: string) => void;
  open: () => void;
}) {
  const grid = data?.meters?.find((m) => m.role === "grid");
  const en = lang === "en";
  return (
    <article className="phone-energy-consumption">
      <header>
        <button
          className="phone-consumption-open"
          onClick={open}
          aria-label={en ? "Open consumption details" : "Åpne forbruksdetaljer"}
        >
          {en ? "Consumption" : "Forbruk"}
          <ChevronRight size={16} />
        </button>
        <label>
          <CalendarDays size={17} />
          <span>
            {new Date(day + "T12:00:00Z").toLocaleDateString(
              en ? "en-GB" : "nb-NO",
              { day: "numeric", month: "short", timeZone: "Europe/Oslo" },
            )}
          </span>
          <input
            type="date"
            max={new Intl.DateTimeFormat("sv-SE", {
              timeZone: "Europe/Oslo",
            }).format(Date.now())}
            aria-label={en ? "Consumption date" : "Forbruksdato"}
            value={day}
            onChange={(event) => {
              if (event.target.value) changeDay(event.target.value);
            }}
          />
        </label>
      </header>
      <div
        className="phone-energy-period"
        role="group"
        aria-label={en ? "Consumption period" : "Forbruksperiode"}
      >
        {[
          ["day", en ? "Day" : "Døgn"],
          ["week", en ? "Week" : "Uke"],
          ["month", en ? "Month" : "Måned"],
          ["year", en ? "Year" : "År"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-pressed={period === id}
            onClick={() => changePeriod(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <EnergySummaryCard
        kind="consumption"
        total={grid?.summary.available_kwh}
        points={grid?.points}
        start={start}
        end={end}
        now={Date.now()}
        lang={lang}
        label={en ? "Consumption" : "Forbruk"}
        note={en ? "kWh" : "kWh"}
        description={
          en
            ? "Recorded consumption, with missing readings left as gaps"
            : "Registrert forbruk. Manglende målinger vises som hull."
        }
        context=""
        onOpen={open}
      />
    </article>
  );
}
