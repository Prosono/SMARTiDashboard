import type { Control } from "../types";
import type { CardConfig } from "./homeGridModel";
import type { TrendPoint } from "./HarmonyTrend";

export const defaultCardConfig = (sources: string[] = []): CardConfig => ({
  type: "auto",
  title: "",
  icon: "auto",
  image: "auto",
  sources,
  period: "24",
});
export const isGraphSource = (c: Control) =>
  c.domain === "sensor" && !c.diagnostic;

export function unitInfo(unit: string) {
  switch (unit.trim()) {
    case "°C":
      return { family: "temperature", unit: "°C", convert: (n: number) => n };
    case "°F":
      return {
        family: "temperature",
        unit: "°C",
        convert: (n: number) => ((n - 32) * 5) / 9,
      };
    case "W":
      return { family: "power", unit: "W", convert: (n: number) => n };
    case "kW":
      return { family: "power", unit: "W", convert: (n: number) => n * 1000 };
    case "Wh":
      return {
        family: "energy",
        unit: "kWh",
        convert: (n: number) => n / 1000,
      };
    case "kWh":
      return { family: "energy", unit: "kWh", convert: (n: number) => n };
    default:
      return {
        family: `unit:${unit.trim()}`,
        unit: unit.trim(),
        convert: (n: number) => n,
      };
  }
}
export const controlUnit = (c: Pick<Control, "attributes">) =>
  String(c.attributes.unit_of_measurement || "");
export const compatibleSources = (
  a: Pick<Control, "attributes">,
  b: Pick<Control, "attributes">,
) => unitInfo(controlUnit(a)).family === unitInfo(controlUnit(b)).family;

export function graphPoints(points: TrendPoint[], unit: string): TrendPoint[] {
  const convert = unitInfo(unit).convert;
  const result: TrendPoint[] = [];
  let chunk: TrendPoint[] = [];
  const flush = () => {
    result.push(
      ...chunk.sort((a, b) => Date.parse(a.time) - Date.parse(b.time)),
    );
    chunk = [];
  };
  for (const point of points) {
    if (!Number.isFinite(Date.parse(point.time))) {
      flush();
      result.push({ time: point.time, value: null });
    } else
      chunk.push({
        time: point.time,
        value:
          point.value !== null && Number.isFinite(point.value)
            ? convert(point.value)
            : null,
      });
  }
  flush();
  return result;
}

export function graphGeometry(series: { points: TrendPoint[] }[]) {
  const valid = series.flatMap((s) =>
    s.points.filter(
      (p) =>
        p.value !== null &&
        Number.isFinite(p.value) &&
        Number.isFinite(Date.parse(p.time)),
    ),
  );
  if (!valid.length) return null;
  const times = valid.map((p) => Date.parse(p.time));
  const values = valid.map((p) => p.value!);
  const start = Math.min(...times),
    end = Math.max(...times);
  const low = Math.min(...values),
    high = Math.max(...values);
  const padding =
    high === low ? Math.max(Math.abs(high) * 0.05, 0.5) : (high - low) * 0.1;
  const min = low - padding,
    max = high + padding;
  const x = (p: TrendPoint) =>
    8 + ((Date.parse(p.time) - start) / (end - start || 1)) * 464;
  const y = (p: TrendPoint) => 111 - ((p.value! - min) / (max - min)) * 102;
  const segments = (points: TrendPoint[]) => {
    const result: TrendPoint[][] = [];
    let current: TrendPoint[] = [];
    for (const p of points) {
      if (p.value === null || !Number.isFinite(p.value)) {
        if (current.length) result.push(current);
        current = [];
      } else current.push(p);
    }
    if (current.length) result.push(current);
    return result;
  };
  return { start, end, min, max, x, y, segments };
}

/** Works on local HTTP panels too; randomUUID requires a secure context. */
export function customCardId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `custom:${Array.from(bytes, (n) => n.toString(16).padStart(2, "0")).join("")}`;
}
