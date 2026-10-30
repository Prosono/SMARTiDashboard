import { useId } from "react";
import { HarmonyTrend } from "./HarmonyTrend";
import { TemperatureValue } from "./TemperatureValue";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Droplets, Thermometer, Zap } from "lucide-react";
import { api } from "../api";
import type { Control, Home } from "../types";
import type { HistoryData } from "../ControlHistory";
import { numeric, reading } from "./homeModel";
import "./homeMetrics.css";

type FlowConfig = {
  home?: { source?: string | null };
  grid?: { source?: string | null };
};
type EnergySeries = {
  id: string;
  current: { points: { time: string; value: number | null }[] };
};
type Point = { time: string; value: number | null };

function Chart({ points, label }: { points: Point[]; label: string }) {
  const id = useId().replaceAll(":", "");
  const valid = points.filter(
    (p) =>
      p.value !== null &&
      Number.isFinite(p.value) &&
      Number.isFinite(Date.parse(p.time)),
  );
  if (!valid.length) return null;
  const times = valid.map((p) => Date.parse(p.time)),
    values = valid.map((p) => p.value!);
  const start = Math.min(...times),
    end = Math.max(...times),
    min = Math.min(...values),
    max = Math.max(...values);
  const x = (p: Point) =>
    4 + ((Date.parse(p.time) - start) / (end - start || 1)) * 292;
  const y = (p: Point) => 55 - ((p.value! - min) / (max - min || 1)) * 46;
  let drawing = false;
  const path = points
    .map((p) => {
      if (
        p.value === null ||
        !Number.isFinite(p.value) ||
        !Number.isFinite(Date.parse(p.time))
      ) {
        drawing = false;
        return "";
      }
      const item = `${drawing ? "L" : "M"} ${x(p).toFixed(1)} ${y(p).toFixed(1)}`;
      drawing = true;
      return item;
    })
    .join(" ");
  return (
    <svg
      className="home-metric-graph"
      viewBox="0 0 300 64"
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={id} x1="0" x2="1" y1="0" y2="0">
          <stop stopColor="#ff725e" />
          <stop offset=".38" stopColor="#ffae34" />
          <stop offset=".72" stopColor="#45c8bb" />
          <stop offset="1" stopColor="#6288f5" />
        </linearGradient>
      </defs>
      <path className="home-metric-guide" d="M4 55 H296" />
      <path
        d={path}
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {valid.length === 1 && (
        <circle cx={x(valid[0])} cy={y(valid[0])} r="3" fill="#ff9254" />
      )}
    </svg>
  );
}

function Metric({
  control,
  enhanced,
  kind,
  lang,
  offline,
  open,
}: {
  control: Control;
  enhanced: boolean;
  kind: "energy" | "temperature" | "humidity";
  lang: string;
  offline: boolean;
  open: () => void;
}) {
  const en = lang === "en",
    labels = {
      energy: en ? "Energy" : "Energi",
      temperature: en ? "Temperature" : "Temperatur",
      humidity: en ? "Humidity" : "Luftfuktighet",
    };
  const Icon =
    kind === "energy" ? Zap : kind === "temperature" ? Thermometer : Droplets;
  const historySupported = control.domain === "sensor";
  const currentTemperature = control.attributes.current_temperature;
  const climateTemperature =
    typeof currentTemperature === "number" &&
    Number.isFinite(currentTemperature)
      ? currentTemperature
      : null;
  const history = useQuery({
    queryKey:
      kind === "energy"
        ? ["highlight-energy", control.id]
        : ["control-history", control.entity_id, "24"],
    queryFn: async () =>
      kind === "energy"
        ? api<{ series: EnergySeries[] }>(
            `home/energy/statistics?${new URLSearchParams({ period: "24h", ids: control.id })}`,
          )
        : api<HistoryData>(
            `controls/${encodeURIComponent(control.entity_id)}/history?hours=24`,
          ),
    enabled:
      historySupported && !offline && control.availability === "available",
    retry: false,
    staleTime: 60000,
    refetchInterval: 300000,
  });
  const points = history.data
    ? ("series" in history.data
        ? history.data.series.find((s) => s.id === control.id)?.current.points
        : history.data.points) || []
    : [];
  const valid =
    !offline &&
    control.availability === "available" &&
    points.some(
      (p) =>
        p.value !== null &&
        Number.isFinite(p.value) &&
        Number.isFinite(Date.parse(p.time)),
    );
  return (
    <button
      className={`home-metric-card metric-${kind}`}
      onClick={open}
      aria-label={`${labels[kind]}: ${control.name}`}
    >
      <span className="home-metric-head">
        <span className={`home-metric-icon is-${kind}`}>
          <Icon size={20} />
        </span>
        <strong>{labels[kind]}</strong>
        <ChevronRight size={18} />
      </span>
      <span className="home-metric-reading">
        {enhanced && kind === "temperature" ? (
          <TemperatureValue
            lang={lang}
            unit={String(
              control.attributes.temperature_unit ||
                control.attributes.unit_of_measurement ||
                "°C",
            )}
            value={
              offline || control.availability !== "available"
                ? null
                : control.domain === "climate"
                  ? climateTemperature
                  : numeric(control)
            }
          />
        ) : offline || control.availability !== "available" ? (
          "—"
        ) : control.domain === "climate" && climateTemperature !== null ? (
          `${climateTemperature.toLocaleString(en ? "en-GB" : "nb-NO", { maximumFractionDigits: 1 })} ${String(control.attributes.temperature_unit || control.capabilities.find((c) => c.unit)?.unit || "°C")}`
        ) : (
          reading(control, lang)
        )}
      </span>
      <span className="home-metric-source">{control.name}</span>
      {valid && enhanced ? (
        <HarmonyTrend
          points={points}
          label={
            en
              ? `${labels[kind]} history, last 24 hours`
              : `${labels[kind]} siste 24 timer`
          }
          unit={String(control.attributes.unit_of_measurement || "")}
          lang={lang}
        />
      ) : valid ? (
        <Chart
          points={points}
          label={
            en
              ? `${labels[kind]} history, last 24 hours`
              : `${labels[kind]} siste 24 timer`
          }
        />
      ) : (
        <span className="home-metric-empty">
          {offline || control.availability !== "available"
            ? en
              ? "Waiting for connection"
              : "Venter på forbindelse"
            : !historySupported
              ? en
                ? "History unavailable for this reading"
                : "Historikk er ikke tilgjengelig for denne målingen"
              : history.isError
                ? en
                  ? "Could not load history"
                  : "Kunne ikke hente historikk"
                : history.isPending
                  ? en
                    ? "Loading history…"
                    : "Henter historikk…"
                  : en
                    ? "No history available"
                    : "Historikk er ikke tilgjengelig"}
        </span>
      )}
      <span className="home-metric-period">
        {en ? "Last 24 hours" : "Siste 24 timer"}
      </span>
    </button>
  );
}

export function HomeMetrics({
  home,
  selectedEnergy,
  enhanced = false,
  offline,
  lang,
  openEnergy,
  openClimate,
}: {
  home: Home;
  selectedEnergy: string | null;
  enhanced?: boolean;
  offline: boolean;
  lang: string;
  openEnergy: () => void;
  openClimate: () => void;
}) {
  const canEnergy =
    !home.permissions || home.permissions.includes("energy.view");
  const canClimate =
    !home.permissions || home.permissions.includes("climate.view");
  const flow = useQuery({
    queryKey: ["energy-flow-preferences"],
    queryFn: () => api<FlowConfig>("home/energy-flow/preferences"),
    enabled: canEnergy && !offline,
    staleTime: 60000,
    retry: false,
  });
  const sensors = home.controls.filter(
    (c) => c.domain === "sensor" && !c.diagnostic,
  );
  const meters = sensors.filter(
    (c) =>
      ["W", "kW", "Wh", "kWh"].includes(
        String(c.attributes.unit_of_measurement),
      ) &&
      ["", "power", "energy"].includes(String(c.attributes.device_class || "")),
  );
  const configured =
    flow.data?.home?.source || flow.data?.grid?.source || selectedEnergy;
  const energy =
    meters.find((c) => c.id === configured || c.entity_id === configured) ||
    (!configured && meters.length === 1 ? meters[0] : undefined);
  const temp =
    sensors.find(
      (c) =>
        c.attributes.device_class === "temperature" &&
        ["°C", "°F"].includes(String(c.attributes.unit_of_measurement)) &&
        numeric(c) !== null,
    ) ||
    home.controls.find(
      (c) =>
        c.domain === "climate" &&
        !c.diagnostic &&
        c.availability === "available" &&
        typeof c.attributes.current_temperature === "number" &&
        Number.isFinite(c.attributes.current_temperature),
    );
  const humidity = sensors.find(
    (c) =>
      c.attributes.device_class === "humidity" &&
      c.attributes.unit_of_measurement === "%" &&
      numeric(c) !== null,
  );
  return (
    <div className="home-metrics-grid">
      {canEnergy && energy && (
        <Metric
          enhanced={enhanced}
          control={energy}
          kind="energy"
          lang={lang}
          offline={offline}
          open={openEnergy}
        />
      )}
      {canClimate && temp && (
        <Metric
          enhanced={enhanced}
          control={temp}
          kind="temperature"
          lang={lang}
          offline={offline}
          open={openClimate}
        />
      )}
      {canClimate && humidity && (
        <Metric
          enhanced={enhanced}
          control={humidity}
          kind="humidity"
          lang={lang}
          offline={offline}
          open={openClimate}
        />
      )}
    </div>
  );
}
