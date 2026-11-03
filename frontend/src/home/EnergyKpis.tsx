import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Clock3,
  Gauge,
  UtilityPole,
} from "lucide-react";
import type { Dashboard, Setup } from "./EnergyPlatform";
import { EnergyModule, EnergyModuleGroup } from "./EnergyModules";
import { finiteReading } from "./energySummaryModel";
import { priceHours } from "./energyControlModel";
import "./energyControl.css";
import { PhoneCapacity, PhoneEnergyRate } from "./PhoneEnergy";

const format = (n: number | string | null | undefined, digits = 1) => {
  const value = finiteReading(n);
  return value === null
    ? "—"
    : value.toLocaleString("nb-NO", { maximumFractionDigits: digits });
};
const time = (stamp: number) =>
  new Date(stamp).toLocaleTimeString("nb-NO", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Oslo",
  });

export function energyKpiModules(
  data: Dashboard | undefined,
  setup: Setup,
  lang = "nb",
) {
  const current = data?.current,
    capacity = current?.capacity;
  const now = Date.now(),
    day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo" }).format(
      now,
    );
  const hours = priceHours(data?.spot || [], day);
  const cheapest = hours.reduce<(typeof hours)[number] | undefined>(
    (best, h) => (!best || h.price < best.price ? h : best),
    undefined,
  );
  const priciest = hours.reduce<(typeof hours)[number] | undefined>(
    (best, h) => (!best || h.price > best.price ? h : best),
    undefined,
  );
  const tier =
    capacity?.threshold === undefined
      ? capacity?.manual
        ? "Manuell sats"
        : "Avventer målinger"
      : `${format(capacity.threshold)}${capacity.next_threshold_kw != null ? `–${format(capacity.next_threshold_kw)}` : "+"} kW`;
  const rate = finiteReading(current?.tariff.energy_ex_vat);
  const company =
    current?.company.name ||
    setup.companies.find((c) => c.id === setup.config?.company)?.name ||
    setup.config?.company ||
    "Ikke valgt";
  const openPrices = () => {
    const card = document.querySelector<HTMLElement>(
      '[data-card="energy:prices"]',
    );
    const expand = card?.querySelector<HTMLButtonElement>(
      ".home-canvas-expand,.mobile-card-tile",
    );
    if (expand) expand.click();
    else {
      const chart = document.getElementById("ep-price-chart");
      chart?.focus({ preventScroll: true });
      chart?.scrollIntoView({
        block: "center",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    }
  };
  return (
    <EnergyModuleGroup className="energy-kpis">
      <EnergyModule
        id="energy:capacity"
        phoneSize={{ w: 2, h: 1, order: 4 }}
        phoneContent={(open) => (
          <PhoneCapacity data={data} lang={lang} open={open} />
        )}
        title="Kapasitetstrinn"
        summary={{
          reading: tier,
          detail: capacity
            ? `${format(capacity.monthly, 2)} kr/mnd · foreløpig`
            : "Månedens registrerte topper",
          icon: "energy",
        }}
      >
        <section className="energy-capacity">
          <div className="energy-kpi-top">
            <Gauge size={18} />
            <span>
              {capacity?.manual ? "Manuell sats" : "Foreløpig denne måneden"}
            </span>
          </div>
          <strong className="energy-kpi-number">{tier}</strong>
          {capacity ? (
            <>
              <div className="energy-capacity-fee">
                <strong>
                  {format(capacity.monthly, 2)} <small>kr/mnd</small>
                </strong>
                <span>
                  {capacity.vat_included ? "inkl. mva." : "uten mva."}
                </span>
              </div>
              {capacity.peak_kw !== undefined && (
                <div
                  className="energy-capacity-progress"
                  role="meter"
                  aria-label="Registrert kapasitetsgrunnlag"
                  aria-valuemin={0}
                  aria-valuemax={
                    Number(capacity.next_threshold_kw || capacity.peak_kw) || 1
                  }
                  aria-valuenow={Number(capacity.peak_kw)}
                >
                  <i
                    style={{
                      width: `${Math.min(100, (Number(capacity.peak_kw) / Number(capacity.next_threshold_kw || capacity.peak_kw || 1)) * 100)}%`,
                    }}
                  />
                </div>
              )}
              <p>
                Grunnlag <b>{format(capacity.peak_kw, 2)} kW</b>
                {capacity.next_threshold_kw != null
                  ? ` · neste grense ${format(capacity.next_threshold_kw)} kW`
                  : ""}
              </p>
              <small>
                {capacity.days_required &&
                capacity.days_recorded < capacity.days_required
                  ? `${capacity.days_recorded} av ${capacity.days_required} måledøgn`
                  : capacity.coverage < 1
                    ? "Delvis månedshistorikk"
                    : capacity.estimated
                      ? "Estimert fra effektmålinger"
                      : "Registrerte timemålinger"}
              </small>
              <div
                className="energy-capacity-peaks"
                aria-label="Høyeste registrerte døgnmakser"
              >
                {capacity.peaks.map((p) => (
                  <span key={p.day} title={`${p.day}: ${format(p.kw)} kW`}>
                    <i
                      style={{
                        height: `${Math.max(2, (Number(p.kw) / Math.max(1, ...capacity.peaks.map((p) => Number(p.kw)))) * 22)}px`,
                      }}
                    />
                    <small>{p.day.slice(8)}.</small>
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p>
              Trinnet vises når vi har timemålinger og en støttet nettariff.
              Nettselskapet fastsetter endelig beløp.
            </p>
          )}
        </section>
      </EnergyModule>
      <EnergyModule
        id="energy:tariff"
        phoneSize={{ w: 1, h: 1, order: 2 }}
        phoneContent={(open) => (
          <PhoneEnergyRate
            kind="tariff"
            value={rate === null ? null : rate * 100}
            lang={lang}
            open={open}
          />
        )}
        title="Nettleie nå"
        summary={{
          reading:
            rate === null ? "Avventer tariff" : `${format(rate * 100)} øre/kWh`,
          detail: company,
          icon: "energy",
        }}
      >
        <section className="energy-tariff">
          <strong className="energy-kpi-number">
            {rate === null ? "—" : format(rate * 100)} <small>øre/kWh</small>
          </strong>
          <p>
            Energiledd · eks. avgifter
            {current?.tariff.manual ? " · manuelt" : ""}
          </p>
          <div className="energy-provider">
            <Building2 size={24} />
            <div>
              <strong>{company}</strong>
              <span>
                {current?.area || setup.config?.area} ·{" "}
                {setup.config?.contract === "fixed"
                  ? "Fastprisavtale"
                  : "Spotavtale"}
              </span>
            </div>
          </div>
          <div className="energy-agreement">
            <UtilityPole size={14} />
            <span>
              {(
                {
                  none: "Uten støtteordning",
                  stromstotte: "Strømstøtte",
                  norgespris: "Norgespris",
                } as Record<string, string>
              )[setup.config?.scheme || ""] || "Avtale ikke valgt"}
            </span>
          </div>
          <small>
            {current?.tariff.stale
              ? "Tariffgrunnlaget kan være utdatert"
              : rate === null
                ? "Venter på gyldig tariff"
                : current?.tariff.valid_from
                  ? `Tariff fra ${new Date(current.tariff.valid_from + "T12:00:00Z").toLocaleDateString("nb-NO")}`
                  : "Valgt nettariff"}
          </small>
        </section>
      </EnergyModule>
      <EnergyModule
        id="energy:price-hours"
        title="Døgnets pristimer"
        h={3}
        summary={{
          reading: cheapest
            ? `${time(cheapest.start)} · ${format(cheapest.price * 100)} øre/kWh`
            : "Venter på priser",
          detail: "Billigste hele time i dag",
          icon: "energy",
        }}
      >
        <section className="energy-price-hours">
          <span className="energy-price-basis">
            <Clock3 size={14} /> I dag · spot uten mva. og tillegg
          </span>
          {(
            [
              ["Billigste time", cheapest, ArrowDownRight, "low"],
              ["Dyreste time", priciest, ArrowUpRight, "high"],
            ] as const
          ).map(([label, hour, Icon, level]) => (
            <button
              key={label}
              className="energy-price-hour"
              data-level={level}
              onClick={openPrices}
            >
              <span>
                <Icon size={20} />
                {label}
                <small>
                  {hour
                    ? hour.end <= now
                      ? "Passert"
                      : hour.start <= now
                        ? "Pågår"
                        : "Kommer"
                    : "Ikke tilgjengelig"}
                </small>
              </span>
              <strong>
                {hour ? format(hour.price * 100) : "—"} <small>øre/kWh</small>
              </strong>
              <time>
                {hour
                  ? `${time(hour.start)}–${time(hour.end)}`
                  : "Venter på en komplett pristime"}
              </time>
            </button>
          ))}
          <small>
            Timesnitt fra publiserte prisintervaller. Nettleie og støtte vises
            separat.
          </small>
        </section>
      </EnergyModule>
    </EnergyModuleGroup>
  );
}
