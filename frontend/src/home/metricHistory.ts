import { api } from "../api";
import type { Control } from "../types";
import type { TrendPoint } from "./HarmonyTrend";
import { unitInfo } from "./cardConfigModel";

export type MetricKind = "energy" | "temperature" | "humidity";
export type MetricHistory = {
  points: TrendPoint[];
  unit: string;
  basis: "reading" | "hourly" | "counter";
  start?: string;
  end?: string;
};
type Response = {
  points?: TrendPoint[];
  unit?: string;
  start?: string;
  end?: string;
  series?: { id: string; unit?: string; current: { points: TrendPoint[] } }[];
};
export const metricUnit = (c: Control) =>
  String(
    c.attributes.unit_of_measurement || c.attributes.temperature_unit || "",
  );
export const isEnergyCounter = (c: Control) =>
  ["Wh", "kWh"].includes(metricUnit(c));
const finite = (p: TrendPoint) =>
  p.value !== null &&
  Number.isFinite(p.value) &&
  Number.isFinite(Date.parse(p.time));
export const hasMetricPoints = (data?: MetricHistory) =>
  !!data?.points.some(finite);

function normalize(
  data: Response,
  points: TrendPoint[],
  sourceUnit: string,
  unit: string,
  basis: MetricHistory["basis"],
): MetricHistory {
  const source = unitInfo(sourceUnit),
    target = unitInfo(unit);
  if (source.family !== target.family) return { points: [], unit, basis };
  const inverse = (n: number) =>
    unit === "kW"
      ? n / 1000
      : unit === "Wh"
        ? n * 1000
        : unit === "°F"
          ? (n * 9) / 5 + 32
          : n;
  const sorted = points
    .filter((p) => Number.isFinite(Date.parse(p.time)))
    .map((p) => ({
      time: p.time,
      value:
        p.value !== null && Number.isFinite(p.value)
          ? inverse(source.convert(p.value))
          : null,
    }))
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  const start = Date.parse(data.start || ""),
    end = Date.parse(data.end || "");
  const clipped = sorted.filter(
    (p) => !Number.isFinite(end) || Date.parse(p.time) <= end,
  );
  if (Number.isFinite(start)) {
    const initial = clipped.filter((p) => Date.parse(p.time) < start).at(-1);
    const inside = clipped.filter((p) => Date.parse(p.time) >= start);
    clipped.splice(
      0,
      clipped.length,
      ...(initial ? [{ ...initial, time: new Date(start).toISOString() }] : []),
      ...inside,
    );
  }
  return { points: clipped, unit, basis, start: data.start, end: data.end };
}

/** Recorder states for instantaneous readings; completed-hour changes for counters.
 * Empty/failed primary history may fall back, but gaps and units are never invented.
 */
export async function loadMetricHistory(
  c: Control,
  kind: MetricKind,
  read = (path: string) => api<Response>(path),
): Promise<MetricHistory> {
  const unit = metricUnit(c),
    counter = kind === "energy" && isEnergyCounter(c);
  const raw = async () => {
    const data = await read(
      `controls/${encodeURIComponent(c.entity_id)}/history?hours=24`,
    );
    return normalize(
      data,
      data.points || [],
      data.unit || unit,
      unit,
      counter ? "counter" : "reading",
    );
  };
  const stats = async () => {
    const data = await read(
      `home/energy/statistics?${new URLSearchParams({ period: "24h", ids: c.id })}`,
    );
    const series = data.series?.find(
      (s) => s.id === c.id || s.id === c.entity_id,
    );
    const target = counter ? "kWh" : unit;
    return normalize(
      data,
      series?.current.points || [],
      series?.unit || (counter ? "kWh" : "kW"),
      target,
      counter ? "hourly" : "reading",
    );
  };
  const readers =
    kind !== "energy" ? [raw] : counter ? [stats, raw] : [raw, stats];
  let empty: MetricHistory | undefined, error: unknown;
  for (const reader of readers) {
    try {
      const result = await reader();
      if (hasMetricPoints(result)) return result;
      empty = result;
    } catch (e) {
      error = e;
    }
  }
  if (empty) return empty;
  throw error;
}
