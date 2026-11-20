import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  Plug,
  RefreshCw,
} from "lucide-react";
import { api } from "../api";
import "./deviceEnergyConsumption.css";

const periods = [
  { id: "24h", nb: "24 timer", en: "24 hours" },
  { id: "7d", nb: "7 dager", en: "7 days" },
  { id: "30d", nb: "30 dager", en: "30 days" },
] as const;
type Period = (typeof periods)[number]["id"];
type Meter = {
  id: string;
  name: string;
  room: string | null;
  kwh: number | null;
  coverage: number;
};
type Consumption = {
  start: string;
  end: string;
  devices: Meter[];
};
type Props = { lang: string; offline: boolean };

export const deviceEnergyConsumptionQueryKey = [
  "energy-device-consumption",
] as const;

function useDeviceConsumption(period: Period, offline: boolean) {
  return useQuery({
    queryKey: [...deviceEnergyConsumptionQueryKey, period],
    queryFn: ({ signal }) =>
      api<Consumption>(
        `home/energy/device-consumption?period=${period}`,
        "GET",
        undefined,
        signal,
      ),
    enabled: !offline,
    retry: false,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}

function formatEnergy(value: number, lang: string) {
  const locale = lang === "en" ? "en-GB" : "nb-NO";
  const digits = value < 10 ? 2 : 1;
  const rounded = value > 0 && value < 0.01 ? 0.01 : value;
  return `${value < rounded ? "< " : ""}${rounded.toLocaleString(locale, {
    maximumFractionDigits: digits,
  })}`;
}

function formatRange(data: Consumption | undefined, lang: string) {
  if (!data) return null;
  const start = new Date(data.start);
  const end = new Date(data.end);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()))
    return null;
  const formatter = new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "nb-NO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Oslo",
  });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

function MeterRow({
  meter,
  max,
  lang,
}: {
  meter: Meter;
  max: number;
  lang: string;
}) {
  const { name, room, kwh, coverage } = meter;
  const en = lang === "en";
  const partial = kwh !== null && coverage < 100;
  return (
    <li className="device-energy-row" data-missing={kwh === null || undefined}>
      <div className="device-energy-name">
        <strong>{name}</strong>
        {room && <span>{room}</span>}
      </div>
      <div className="device-energy-value">
        {kwh === null ? (
          <span>{en ? "No reading" : "Ingen måling"}</span>
        ) : (
          <>
            <strong>
              {formatEnergy(kwh, lang)} <span>kWh</span>
            </strong>
            {partial && (
              <span className="device-energy-partial">
                {Math.min(99, Math.floor(coverage))} %{" "}
                {en ? "coverage" : "dekning"}
              </span>
            )}
          </>
        )}
      </div>
      {kwh !== null && (
        <span className="device-energy-bar" aria-hidden="true">
          <i style={{ width: `${max > 0 ? (kwh / max) * 100 : 0}%` }} />
        </span>
      )}
    </li>
  );
}

export function DeviceEnergyConsumption({ lang, offline }: Props) {
  const en = lang === "en";
  const t = (nb: string, english: string) => (en ? english : nb);
  const [period, setPeriod] = useState<Period>("24h");
  const [all, setAll] = useState(false);
  const listId = useId();
  const query = useDeviceConsumption(period, offline);
  const devices = query.data?.devices ?? [];
  const max = devices.reduce(
    (highest, meter) => Math.max(highest, meter.kwh ?? 0),
    0,
  );
  const hasMeasurements = devices.some((meter) => meter.kwh !== null);
  const range = formatRange(query.data, lang);
  const hasMore = devices.length > 4;
  return (
    <div className="device-energy" aria-busy={query.isLoading}>
      <div className="device-energy-toolbar">
        <div
          className="device-energy-period"
          role="group"
          aria-label={t("Måleperiode", "Measurement period")}
        >
          {periods.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={period === item.id}
              onClick={() => {
                setPeriod(item.id);
                setAll(false);
              }}
            >
              {en ? item.en : item.nb}
            </button>
          ))}
        </div>
        {range && <span className="device-energy-range">{range}</span>}
      </div>
      {query.data && (offline || query.isError) && (
        <p className="device-energy-notice" role="status">
          {offline
            ? t(
                "Frakoblet. Viser sist hentede målinger.",
                "Offline. Showing the last retrieved readings.",
              )
            : t(
                "Oppdatering feilet. Viser sist hentede målinger.",
                "Refresh failed. Showing the last retrieved readings.",
              )}
        </p>
      )}
      {devices.length > 0 ? (
        <>
          {!hasMeasurements && (
            <p className="device-energy-notice" role="status">
              {t(
                "Ingen målinger i den valgte perioden.",
                "No readings in the selected period.",
              )}
            </p>
          )}
          <ol
            className="device-energy-list"
            id={listId}
            role="list"
            aria-label={t(
              "Rangert forbruk per enhet",
              "Ranked energy use by device",
            )}
          >
            {(all ? devices : devices.slice(0, 4)).map((meter) => (
              <MeterRow key={meter.id} meter={meter} max={max} lang={lang} />
            ))}
          </ol>
          {hasMore && (
            <button
              type="button"
              className="device-energy-more"
              aria-expanded={all}
              aria-controls={listId}
              onClick={() => setAll(!all)}
            >
              {all
                ? t("Vis færre", "Show fewer")
                : t(
                    `Vis alle ${devices.length} enheter`,
                    `Show all ${devices.length} devices`,
                  )}
              <ChevronDown size={16} aria-hidden="true" />
            </button>
          )}
        </>
      ) : (
        <div className="device-energy-empty">
          <Plug size={23} aria-hidden="true" />
          <div>
            <strong>
              {query.isLoading
                ? t("Henter enhetsforbruk…", "Loading device energy use…")
                : offline && !query.data
                  ? t("Frakoblet", "Offline")
                  : query.isError && !query.data
                    ? t(
                        "Kunne ikke hente enhetsforbruk",
                        "Couldn’t load device energy use",
                      )
                    : t(
                        "Ingen enheter med energimåler",
                        "No devices with an energy meter",
                      )}
            </strong>
            {!query.isLoading && (
              <p>
                {offline && !query.data
                  ? t(
                      "Koble til hjemmet for å hente energimålinger.",
                      "Connect to your home to retrieve energy readings.",
                    )
                  : query.isError && !query.data
                    ? t(
                        "Prøv å hente målingene på nytt.",
                        "Try retrieving the readings again.",
                      )
                    : t(
                        "Kortet viser enheter som rapporterer energiforbruk i kWh.",
                        "This card shows devices that report energy use in kWh.",
                      )}
              </p>
            )}
          </div>
          {!offline && query.isError && !query.data && (
            <button
              type="button"
              className="device-energy-retry"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
            >
              <RefreshCw size={16} aria-hidden="true" />{" "}
              {t("Prøv igjen", "Try again")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function PhoneDeviceEnergyConsumption({
  lang,
  offline,
  onOpen,
}: Props & { onOpen: () => void }) {
  const en = lang === "en";
  const t = (nb: string, english: string) => (en ? english : nb);
  const query = useDeviceConsumption("24h", offline);
  const top = (query.data?.devices ?? [])
    .filter((meter): meter is Meter & { kwh: number } => meter.kwh !== null)
    .slice(0, 2);
  const cached = !!query.data && (offline || query.isError);
  const range = cached
    ? t("Sist hentede målinger", "Last retrieved readings")
    : t("Siste 24 timer", "Last 24 hours");
  const partial = top.some((meter) => meter.coverage < 100);
  const empty = query.isLoading
    ? t("Henter målinger…", "Loading readings…")
    : offline && !query.data
      ? t("Frakoblet", "Offline")
      : query.isError && !query.data
        ? t("Målinger utilgjengelige", "Readings unavailable")
        : query.data?.devices.length
          ? t("Ingen målinger i perioden", "No readings in the period")
          : t(
              "Ingen enheter med energimåler",
              "No devices with an energy meter",
            );
  return (
    <button type="button" className="device-energy-preview" onClick={onOpen}>
      <span className="device-energy-preview-heading">
        <BarChart3 size={20} aria-hidden="true" />
        <strong>{t("Forbruk per enhet", "Usage by device")}</strong>
      </span>
      <span className="device-energy-preview-range">
        {range}
        {partial && t(" · Delvis dekning", " · Partial coverage")}
      </span>
      {top.length ? (
        <span className="device-energy-preview-list">
          {top.map((meter) => (
            <span key={meter.id}>
              <span>{meter.name}</span>
              <strong>
                {formatEnergy(meter.kwh, lang)} <span>kWh</span>
              </strong>
            </span>
          ))}
        </span>
      ) : (
        <span className="device-energy-preview-empty">{empty}</span>
      )}
      <span className="device-energy-preview-action">
        {t("Se forbruk", "View usage")}
        <ChevronRight size={17} aria-hidden="true" />
      </span>
    </button>
  );
}
