import { useId, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  ChevronDown,
  Plug,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { api } from "../api";
import type { Control } from "../types";
import { DeviceArtwork } from "./DeviceArtwork";
import {
  DeviceEnergyPicker,
  type DeviceEnergyMeter,
} from "./DeviceEnergyPicker";
import { EnergyHistoryChart, type HistoryBucket } from "./EnergyHistoryChart";
import {
  hasAirConditionerHint,
  hasWaterHeaterHint,
  householdApplianceArt,
  type EquipmentArt,
} from "./equipmentModel";
import "./deviceEnergyConsumption.css";

const periods = [
  { id: "24h", nb: "24 timer", en: "24 hours" },
  { id: "7d", nb: "7 dager", en: "7 days" },
  { id: "30d", nb: "30 dager", en: "30 days" },
] as const;
type Period = (typeof periods)[number]["id"];
type UsagePoint = {
  start: string;
  end: string;
  kwh: number | null;
  cost: number | null;
  coverage: number;
  cost_coverage: number;
};
type Usage = {
  id: string;
  name: string;
  room: string | null;
  kwh: number | null;
  coverage: number;
  cost: number | null;
  cost_coverage: number;
  kind: "measured" | "estimated";
  points: UsagePoint[];
};
type Consumption = {
  start: string;
  end: string;
  devices: Usage[];
};
type Sources = {
  sources: DeviceEnergyMeter[];
  selected_ids: string[];
  mode: "automatic" | "manual";
  can_edit: boolean;
};

export const deviceEnergyConsumptionQueryKey = [
  "energy-device-consumption",
] as const;
export const deviceEnergySourcesQueryKey = ["energy-device-sources"] as const;
const sourcesPath = "home/energy/device-sources";
const selectionLimit = 60;
const artworkDomains = [
  "water_heater",
  "climate",
  "vacuum",
  "media_player",
  "light",
  "fan",
  "cover",
  "lock",
  "switch",
  "input_boolean",
  "binary_sensor",
];

type UsageArtwork = { control?: Control; equipmentKind?: EquipmentArt };

function indexArtworkControls(controls: readonly Control[] | undefined) {
  const meters = new Map<string, Control>();
  const equipment = new Map<string, Control>();
  for (const control of controls ?? []) {
    meters.set(control.id, control);
    if (!control.device_id || control.diagnostic) continue;
    const priority = artworkDomains.indexOf(control.domain);
    if (priority === -1) continue;
    const current = equipment.get(control.device_id);
    if (!current || priority < artworkDomains.indexOf(current.domain))
      equipment.set(control.device_id, control);
  }
  return { meters, equipment };
}

function usageArtwork(
  usage: Usage,
  source: DeviceEnergyMeter | undefined,
  controls: ReturnType<typeof indexArtworkControls>,
): UsageArtwork {
  const meter = controls.meters.get(usage.id);
  const deviceId = source?.group.startsWith("device:")
    ? source.group.slice("device:".length)
    : meter?.device_id;
  const device = deviceId ? controls.equipment.get(deviceId) : undefined;
  const hints = [
    {
      name: usage.name,
      device_name: source?.meter,
      entity_id: meter?.entity_id ?? "",
      attributes: meter?.attributes ?? {},
    },
    ...(meter ? [meter] : []),
    ...(device ? [device] : []),
  ];
  const equipmentKind = hints.some(hasWaterHeaterHint)
    ? "water-heater"
    : hints.some(hasAirConditionerHint)
      ? "air-conditioner"
      : hints.map(householdApplianceArt).find(Boolean);
  return { control: device ?? meter, equipmentKind };
}

function localeFor(lang: string) {
  return lang === "en" ? "en-GB" : "nb-NO";
}

function formatEnergy(value: number, lang: string) {
  const smallest = value > 0 && value < 0.01;
  const formatted = (smallest ? 0.01 : value).toLocaleString(localeFor(lang), {
    maximumFractionDigits: 2,
  });
  return smallest ? `< ${formatted}` : formatted;
}

function formatCost(value: number, lang: string) {
  return value.toLocaleString(localeFor(lang), {
    style: "currency",
    currency: "NOK",
  });
}

function formatRange(data: Consumption | undefined, lang: string) {
  if (!data) return null;
  const start = new Date(data.start);
  const end = new Date(data.end);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()))
    return null;
  const formatter = new Intl.DateTimeFormat(localeFor(lang), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Oslo",
  });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

function coverageLabel(coverage: number, lang: string) {
  return (Math.max(0, Math.min(99.9, coverage)) / 100).toLocaleString(
    localeFor(lang),
    {
      style: "percent",
      maximumFractionDigits: 1,
    },
  );
}

function DeviceHistory({
  usage,
  lang,
  period,
}: {
  usage: Usage;
  lang: string;
  period: Period;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const [metric, setMetric] = useState<"kwh" | "cost">("kwh");
  const [selected, setSelected] = useState<number | null>(null);
  const metricOptions = [
    { id: "kwh" as const, label: t("Forbruk", "Usage") },
    { id: "cost" as const, label: t("Kostnad", "Cost") },
  ];
  const hourly = period === "24h";
  const tick = new Intl.DateTimeFormat(localeFor(lang), {
    ...(hourly
      ? { hour: "2-digit", minute: "2-digit" }
      : { day: "numeric", month: "short" }),
    timeZone: "Europe/Oslo",
  });
  const date = new Intl.DateTimeFormat(localeFor(lang), {
    day: "numeric",
    month: "long",
    ...(hourly ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "Europe/Oslo",
  });
  const points: HistoryBucket[] = usage.points.map((point) => ({
    ...point,
    partial: (metric === "cost" ? point.cost_coverage : point.coverage) < 100,
    kwh: point[metric],
    cost: point.cost ?? 0,
    priced: point.cost !== null,
    label: date.format(new Date(point.start)),
    tickLabel: tick.format(new Date(point.start)),
  }));
  const point = selected == null ? null : usage.points[selected];
  return (
    <div className="device-energy-chart">
      <div
        className="device-energy-chart-toggle"
        role="group"
        aria-label={t("Vis i graf", "Show in chart")}
      >
        {metricOptions.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={metric === id}
            onClick={() => setMetric(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {points.some(({ kwh }) => kwh !== null) ? (
        <>
          <EnergyHistoryChart
            points={points}
            prices={[]}
            selected={selected}
            onSelect={setSelected}
            unit={metric === "cost" ? "kr" : "kWh"}
            label={
              metric === "cost"
                ? t(`Kostnad for ${usage.name}`, `Cost for ${usage.name}`)
                : t(`Forbruk for ${usage.name}`, `Usage for ${usage.name}`)
            }
            lang={lang}
            fit
          />
          {point && (
            <p className="device-energy-point" aria-live="polite">
              <strong>{date.format(new Date(point.start))}</strong>
              <span>
                {point.kwh === null
                  ? t("Måling mangler", "Reading missing")
                  : `${formatEnergy(point.kwh, lang)} kWh`}
              </span>
              <span>
                {point.cost === null
                  ? t("Kostnad mangler", "Cost unavailable")
                  : formatCost(point.cost, lang)}
              </span>
            </p>
          )}
        </>
      ) : (
        <p className="device-energy-chart-empty" role="status">
          {metric === "cost"
            ? t(
                "Kostnad vises når det finnes forbruk og pris for samme tidsrom.",
                "Cost appears when usage and price are available for the same interval.",
              )
            : t(
                "Måleren har ingen historikk i denne perioden.",
                "This meter has no history for this period.",
              )}
        </p>
      )}
    </div>
  );
}

function DeviceRow({
  usage,
  artwork,
  offline,
  lang,
  period,
  expanded,
  onToggle,
}: {
  usage: Usage;
  artwork: UsageArtwork;
  offline: boolean;
  lang: string;
  period: Period;
  expanded: boolean;
  onToggle: () => void;
}) {
  const chartId = useId();
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const labels = [
    usage.room,
    usage.kind === "estimated"
      ? t("Fra effektmåling", "From power readings")
      : null,
  ].filter(Boolean);
  return (
    <li className="device-energy-row" data-expanded={expanded}>
      <button
        type="button"
        className="device-energy-row-button"
        aria-expanded={expanded}
        aria-controls={expanded ? chartId : undefined}
        onClick={onToggle}
      >
        <span className="device-energy-identity">
          <span className="device-energy-artwork" aria-hidden="true">
            {artwork.control ? (
              <DeviceArtwork
                c={artwork.control}
                equipmentKind={artwork.equipmentKind}
                available={!offline}
              />
            ) : (
              <img
                src={`./home/equipment/${artwork.equipmentKind ?? "meter"}.webp`}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
              />
            )}
          </span>
          <span className="device-energy-name">
            <span className="sr-only">
              {t("Historikk for", "History for")}{" "}
            </span>
            <strong>{usage.name}</strong>
            {labels.length > 0 && <small>{labels.join(" · ")}</small>}
          </span>
        </span>
        <span className="device-energy-reading device-energy-usage">
          <span className="device-energy-label">{t("Forbruk", "Usage")} </span>
          {usage.kwh === null ? (
            <strong aria-label={t("Måling mangler", "Reading missing")}>
              —
            </strong>
          ) : (
            <>
              <strong>
                {formatEnergy(usage.kwh, lang)} <small>kWh</small>
              </strong>
              {usage.coverage < 100 && (
                <small>
                  {coverageLabel(usage.coverage, lang)}{" "}
                  {t("dekning", "coverage")}
                </small>
              )}
            </>
          )}
        </span>
        <span className="device-energy-reading device-energy-cost">
          <span className="device-energy-label">
            {t("Estimert kostnad", "Estimated cost")}{" "}
          </span>
          <strong
            aria-label={
              usage.cost === null
                ? t("Kostnad mangler", "Cost unavailable")
                : undefined
            }
          >
            {usage.cost === null ? "—" : formatCost(usage.cost, lang)}
          </strong>
          {usage.cost !== null && usage.cost_coverage < 100 && (
            <small>
              {coverageLabel(usage.cost_coverage, lang)}{" "}
              {t("prisdekning", "priced")}
            </small>
          )}
        </span>
        <ChevronDown
          size={19}
          className="device-energy-disclosure"
          aria-hidden="true"
        />
      </button>
      {expanded && (
        <div id={chartId}>
          <DeviceHistory
            key={period}
            usage={usage}
            lang={lang}
            period={period}
          />
        </div>
      )}
    </li>
  );
}

export function DeviceEnergyConsumption({
  lang,
  offline,
  controls,
}: {
  lang: string;
  offline: boolean;
  controls?: readonly Control[];
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const [period, setPeriod] = useState<Period>("24h");
  const [active, setActive] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [picking, setPicking] = useState(false);
  const id = useId();
  const cache = useQueryClient();
  const artworkControls = useMemo(
    () => indexArtworkControls(controls),
    [controls],
  );
  const sources = useQuery({
    queryKey: deviceEnergySourcesQueryKey,
    queryFn: ({ signal }) =>
      api<Sources>(sourcesPath, "GET", undefined, signal),
    enabled: !offline,
    retry: false,
    staleTime: 60_000,
  });
  const history = useQuery({
    queryKey: [...deviceEnergyConsumptionQueryKey, period],
    queryFn: ({ signal }) =>
      api<Consumption>(
        `home/energy/device-consumption/history?period=${period}`,
        "GET",
        undefined,
        signal,
      ),
    enabled: !offline,
    retry: false,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
  const save = useMutation({
    mutationFn: (selection: string[] | null) =>
      api<Sources>(sourcesPath, "PUT", { selected_ids: selection }),
    onMutate: async () => {
      await Promise.all([
        cache.cancelQueries({ queryKey: deviceEnergySourcesQueryKey }),
        cache.cancelQueries({ queryKey: deviceEnergyConsumptionQueryKey }),
      ]);
    },
    onSuccess: async (data) => {
      cache.setQueryData(deviceEnergySourcesQueryKey, data);
      setActive(null);
      setShowAll(false);
      setPicking(false);
      await cache.invalidateQueries({
        queryKey: deviceEnergyConsumptionQueryKey,
      });
    },
  });

  const selected = sources.data ? new Set(sources.data.selected_ids) : null;
  const sourceById = new Map(
    sources.data?.sources.map((source) => [source.id, source]),
  );
  const devices = (history.data?.devices ?? [])
    .filter((meter) => !selected || selected.has(meter.id))
    .sort(
      (a, b) =>
        (b.kwh ?? -1) - (a.kwh ?? -1) ||
        a.name.localeCompare(b.name, localeFor(lang)),
    );
  const range = formatRange(history.data, lang);
  const cached = history.data && (offline || history.isError);
  const hasMeasurements = devices.some((meter) => meter.kwh !== null);
  const found = !!sources.data?.sources.length;
  const canEdit = sources.data?.can_edit === true;
  const sourcesUnavailable = sources.isError && !sources.data;
  const historyUnavailable = history.isError && !history.data;
  const emptyTitle = history.isLoading
    ? t("Henter enhetsforbruk…", "Loading device usage…")
    : offline && !history.data
      ? t("Frakoblet", "Offline")
      : historyUnavailable
        ? t("Kunne ikke hente enhetsforbruk", "Couldn’t load device usage")
        : found
          ? t("Velg enheter å følge", "Choose devices to track")
          : t(
              "Ingen effekt- eller energimålere funnet",
              "No power or energy meters found",
            );
  const emptyDetail =
    offline || history.isLoading || historyUnavailable
      ? null
      : found
        ? t(
            "Velg målerne du vil se i kortet.",
            "Choose which meters appear on the card.",
          )
        : t(
            "Enheter med effekt- eller energimåling fra hjemmet vises her.",
            "Devices with power or energy readings from your home appear here.",
          );

  return (
    <section
      className="device-energy"
      aria-labelledby={id}
      aria-busy={history.isLoading}
    >
      <header className="device-energy-heading">
        <div>
          <BarChart3 size={22} aria-hidden="true" />
          <h3 id={id}>{t("Forbruk per enhet", "Usage by device")}</h3>
        </div>
        {canEdit && (
          <button
            className="device-energy-choose"
            type="button"
            aria-haspopup="dialog"
            disabled={offline || save.isPending}
            onClick={() => {
              save.reset();
              setPicking(true);
            }}
          >
            <SlidersHorizontal size={17} aria-hidden="true" />
            {t("Velg enheter", "Choose devices")}
          </button>
        )}
      </header>
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
              onClick={() => setPeriod(item.id)}
            >
              {item[lang === "en" ? "en" : "nb"]}
            </button>
          ))}
        </div>
        {range && <span className="device-energy-range">{range}</span>}
      </div>
      {cached && (
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
      {sourcesUnavailable && (
        <p className="device-energy-notice">
          {t(
            "Kunne ikke hente listen med målere.",
            "Couldn’t load the meter list.",
          )}{" "}
          <button
            type="button"
            className="device-energy-retry"
            disabled={sources.isFetching || offline}
            onClick={() => void sources.refetch()}
          >
            {t("Prøv igjen", "Try again")}
          </button>
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
          <div className="device-energy-columns" aria-hidden="true">
            <span>{t("Enhet", "Device")}</span>
            <span>{t("Forbruk", "Usage")}</span>
            <span>{t("Estimert kostnad", "Estimated cost")}</span>
          </div>
          <ul
            className="device-energy-list"
            role="list"
            aria-label={t(
              "Forbruk og kostnad per enhet",
              "Usage and cost by device",
            )}
          >
            {(showAll ? devices : devices.slice(0, 5)).map((meter) => (
              <DeviceRow
                key={meter.id}
                usage={meter}
                artwork={usageArtwork(
                  meter,
                  sourceById.get(meter.id),
                  artworkControls,
                )}
                offline={offline}
                lang={lang}
                period={period}
                expanded={active === meter.id}
                onToggle={() =>
                  setActive(active === meter.id ? null : meter.id)
                }
              />
            ))}
          </ul>
          {devices.length > 5 && (
            <button
              className="device-energy-more"
              type="button"
              aria-expanded={showAll}
              onClick={() => setShowAll(!showAll)}
            >
              {showAll
                ? t("Vis færre", "Show fewer")
                : t(
                    `Vis alle ${devices.length} enheter`,
                    `Show all ${devices.length} devices`,
                  )}
              <ChevronDown size={16} aria-hidden="true" />
            </button>
          )}
          <p className="device-energy-footnote">
            {t(
              "Kostnaden beregnes med hjemmets strømavtale og nettleie for timer med kjent forbruk og pris, før strømstøtte og faste beløp.",
              "Cost uses your electricity plan and grid rates for hours with known usage and price, before electricity support and fixed charges.",
            )}
          </p>
        </>
      ) : (
        <div className="device-energy-empty">
          <Plug size={23} aria-hidden="true" />
          <div role="status">
            <strong>{emptyTitle}</strong>
            {emptyDetail && <p>{emptyDetail}</p>}
          </div>
          {historyUnavailable && !offline && (
            <button
              type="button"
              className="device-energy-retry"
              disabled={history.isFetching}
              onClick={() => void history.refetch()}
            >
              <RefreshCw size={16} aria-hidden="true" />{" "}
              {t("Prøv igjen", "Try again")}
            </button>
          )}
        </div>
      )}
      {picking && canEdit && sources.data && (
        <DeviceEnergyPicker
          lang={lang}
          meters={sources.data.sources}
          selection={sources.data.selected_ids}
          limit={selectionLimit}
          automatic={sources.data.mode === "automatic"}
          busy={save.isPending}
          failed={save.isError}
          onSave={(ids) => save.mutate(ids)}
          onClose={() => setPicking(false)}
        />
      )}
    </section>
  );
}
