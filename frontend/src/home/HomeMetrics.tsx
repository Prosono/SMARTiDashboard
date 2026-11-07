import {
  Children,
  Fragment,
  useId,
  type ReactNode,
  type CSSProperties,
} from "react";
import type { HomeGridCard } from "./HomeGrid";
import { HarmonyTrend } from "./HarmonyTrend";
import { TemperatureValue } from "./TemperatureValue";
import { CardIcon, CardTitle } from "./CardPresentation";
import { DeviceArtwork } from "./DeviceArtwork";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Droplets, Thermometer, Zap } from "lucide-react";
import { api } from "../api";
import type { Control, Home } from "../types";
import {
  loadMetricHistory,
  hasMetricPoints,
  metricUnit,
  type MetricKind,
} from "./metricHistory";
import { metricAssessment } from "./metricAssessment";
import { EnergyBars } from "./EnergyBars";
import { numeric, reading, usable } from "./homeModel";
import "./homeMetrics.css";

type FlowConfig = {
  home?: { source?: string | null };
  grid?: { source?: string | null };
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

export function HomeMetric({
  control,
  enhanced,
  kind,
  lang,
  offline,
  open,
  deviceArtwork = false,
}: {
  control: Control;
  enhanced: boolean;
  kind: MetricKind;
  lang: string;
  offline: boolean;
  open: () => void;
  deviceArtwork?: boolean;
}) {
  const en = lang === "en",
    labels = {
      energy: en ? "Energy" : "Energi",
      temperature: en ? "Temperature" : "Temperatur",
      humidity: en ? "Humidity" : "Luftfuktighet",
    };
  const Icon =
    kind === "energy" ? Zap : kind === "temperature" ? Thermometer : Droplets;
  const historySupported = ["sensor", "climate"].includes(control.domain);
  const history = useQuery({
    queryKey: [
      "home-metric-history",
      control.entity_id,
      kind,
      metricUnit(control),
    ],
    queryFn: () => loadMetricHistory(control, kind),
    enabled: historySupported && !offline && usable(control),
    retry: false,
    staleTime: 60000,
    refetchInterval: 300000,
  });
  const points = history.data?.points || [];
  const available = !offline && usable(control);
  const valid = available && hasMetricPoints(history.data);
  const assessment = metricAssessment(
    control,
    kind,
    history.data,
    !available,
    lang,
  );
  const hourly = kind === "energy" && history.data?.basis === "hourly";
  const counter = kind === "energy" && history.data?.basis === "counter";
  const currentTemperature = control.attributes.current_temperature;
  const climateTemperature =
    typeof currentTemperature === "number" &&
    Number.isFinite(currentTemperature)
      ? currentTemperature
      : null;
  const latest = hourly ? points.at(-1)?.value : null;
  const Root = enhanced ? "article" : "button",
    Heading = enhanced ? "button" : "span";
  const start = Date.parse(history.data?.start || ""),
    end = Date.parse(history.data?.end || "");
  const label = en
    ? `${labels[kind]} history, last 24 hours`
    : `${labels[kind]} siste 24 timer`;
  return (
    <Root
      className={`home-metric-card metric-${kind}`}
      onClick={enhanced ? undefined : open}
      aria-label={`${labels[kind]}: ${control.name}`}
      data-metric-level={enhanced ? assessment.level : undefined}
      style={
        enhanced
          ? ({
              "--metric-status": (assessment.style as Record<string, string>)[
                "--card-color"
              ],
              "--metric-status-ink": assessment.style.color,
            } as CSSProperties)
          : undefined
      }
    >
      <Heading
        className="home-metric-head"
        onClick={enhanced ? open : undefined}
        aria-label={enhanced ? `${labels[kind]}: ${control.name}` : undefined}
      >
        <span
          className={`home-metric-icon is-${kind}`}
          style={
            deviceArtwork
              ? { width: 40, height: 40, flex: "0 0 40px" }
              : undefined
          }
        >
          {deviceArtwork ? (
            <DeviceArtwork c={control} available={available} size={40} />
          ) : (
            <CardIcon fallback={Icon} size={20} />
          )}
        </span>
        <strong>
          <CardTitle>{labels[kind]}</CardTitle>
        </strong>
        <ChevronRight size={18} />
      </Heading>
      <div className="home-metric-value-row">
        <span className="home-metric-reading">
          {!available ? (
            "—"
          ) : hourly ? (
            latest !== null && latest !== undefined ? (
              `${latest.toLocaleString(en ? "en-GB" : "nb-NO", { maximumFractionDigits: 2 })} kWh`
            ) : (
              "—"
            )
          ) : enhanced && kind === "temperature" ? (
            <TemperatureValue
              lang={lang}
              unit={metricUnit(control) || "°C"}
              value={
                control.domain === "climate"
                  ? climateTemperature
                  : numeric(control)
              }
            />
          ) : control.domain === "climate" && climateTemperature !== null ? (
            `${climateTemperature.toLocaleString(en ? "en-GB" : "nb-NO", { maximumFractionDigits: 1 })} ${metricUnit(control) || "°C"}`
          ) : enhanced &&
            kind === "energy" &&
            metricUnit(control) === "W" &&
            numeric(control) !== null &&
            Math.abs(numeric(control)!) >= 1000 ? (
            `${(numeric(control)! / 1000).toLocaleString(en ? "en-GB" : "nb-NO", { maximumFractionDigits: 1 })} kW`
          ) : (
            reading(control, lang)
          )}
        </span>
        {enhanced && (
          <span
            className="home-metric-level"
            title={assessment.detail}
            aria-label={`${assessment.label}. ${assessment.detail}`}
          >
            {assessment.label}
          </span>
        )}
      </div>
      <span className="home-metric-source">
        {hourly
          ? en
            ? "Last completed hour · "
            : "Siste hele time · "
          : counter
            ? en
              ? "Meter total · "
              : "Totalmåler · "
            : ""}
        {control.name}
      </span>
      {valid &&
      enhanced &&
      kind === "energy" &&
      !counter &&
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      history.data ? (
        <EnergyBars history={history.data} label={label} lang={lang} />
      ) : valid && enhanced ? (
        <HarmonyTrend
          points={points}
          label={label}
          unit={history.data?.unit || metricUnit(control)}
          lang={lang}
          domain={
            Number.isFinite(start) && Number.isFinite(end)
              ? { start, end }
              : undefined
          }
        />
      ) : valid ? (
        <Chart points={points} label={label} />
      ) : (
        <span className="home-metric-empty">
          {!available
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
        {enhanced && kind === "energy" && !counter
          ? en
            ? " · own history"
            : " · egen historikk"
          : ""}
      </span>
    </Root>
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
  renderCards,
}: {
  home: Home;
  selectedEnergy: string | null;
  enhanced?: boolean;
  offline: boolean;
  lang: string;
  openEnergy: () => void;
  openClimate: () => void;
  renderCards?: (cards: HomeGridCard[]) => ReactNode;
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
  const tiles = (
    <>
      {canEnergy && energy && (
        <HomeMetric
          enhanced={enhanced}
          control={energy}
          kind="energy"
          lang={lang}
          offline={offline || !home.connected}
          open={openEnergy}
        />
      )}
      {canClimate && temp && (
        <HomeMetric
          enhanced={enhanced}
          control={temp}
          kind="temperature"
          lang={lang}
          offline={offline || !home.connected}
          open={openClimate}
        />
      )}
      {canClimate && humidity && (
        <HomeMetric
          enhanced={enhanced}
          control={humidity}
          kind="humidity"
          lang={lang}
          offline={offline || !home.connected}
          open={openClimate}
        />
      )}
    </>
  );
  const kinds = ["energy", "temperature", "humidity"];
  const titles = [
    lang === "en" ? "Energy" : "Energi",
    lang === "en" ? "Temperature" : "Temperatur",
    lang === "en" ? "Humidity" : "Luftfuktighet",
  ];
  const indices = [
    canEnergy && energy,
    canClimate && temp,
    canClimate && humidity,
  ].flatMap((value, index) => (value ? [index] : []));
  const cards = Children.toArray(tiles.props.children).map(
    (content, index) => ({
      id: `metric:${kinds[indices[index]]}`,
      entityId: [energy, temp, humidity][indices[index]]?.entity_id,
      title: titles[indices[index]],
      content,
    }),
  );
  return renderCards ? (
    renderCards(cards)
  ) : (
    <div className="home-metrics-grid">
      {cards.map((card) => (
        <Fragment key={card.id}>{card.content}</Fragment>
      ))}
    </div>
  );
}
