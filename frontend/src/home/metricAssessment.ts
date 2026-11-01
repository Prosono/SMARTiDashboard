import type { CSSProperties } from "react";
import type { Control } from "../types";
import { numeric, temperature, usable } from "./homeModel";
import {
  isEnergyCounter,
  metricUnit,
  type MetricHistory,
  type MetricKind,
} from "./metricHistory";

type Level =
  | "low"
  | "medium"
  | "high"
  | "cold"
  | "normal"
  | "warm"
  | "humidity"
  | "export"
  | "unknown";
export type Assessment = {
  level: Level;
  label: string;
  detail: string;
  style: CSSProperties;
};
const colors: Record<Exclude<Level, "humidity">, [number[], number[]]> = {
  low: [
    [14, 119, 87],
    [7, 79, 61],
  ],
  normal: [
    [14, 119, 87],
    [7, 79, 61],
  ],
  medium: [
    [243, 194, 84],
    [231, 169, 55],
  ],
  warm: [
    [243, 194, 84],
    [231, 169, 55],
  ],
  high: [
    [180, 50, 49],
    [125, 31, 42],
  ],
  cold: [
    [22, 102, 158],
    [19, 64, 103],
  ],
  export: [
    [22, 102, 158],
    [19, 64, 103],
  ],
  unknown: [
    [65, 76, 90],
    [39, 48, 62],
  ],
};
const lum = (rgb: number[]) =>
  rgb
    .map((v) => v / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
export function metricSurface(a: number[], b: number[]): CSSProperties {
  a = a.map(Math.round);
  b = b.map(Math.round);
  const rgb = (c: number[]) => `rgb(${c.map(Math.round).join(" ")})`;
  const start = rgb(a),
    end = rgb(b),
    ink =
      1.05 / (Math.max(lum(a), lum(b)) + 0.05) >= 4.5
        ? "#ffffff"
        : (Math.min(lum(a), lum(b)) + 0.05) / (lum([8, 11, 16]) + 0.05) >= 4.5
          ? "#080b10"
          : "#000000";
  return {
    background: `${end} linear-gradient(135deg,${start},${end})`,
    "--card-color": start,
    "--card-depth": end,
    "--text": ink,
    "--muted": ink,
    "--equipment-reading": ink,
    "--metric-color": ink,
    "--accent": ink,
    "--surface": end,
    "--soft": `color-mix(in srgb,${end} 86%,${ink === "#ffffff" ? "#000" : "#fff"})`,
    "--line": `color-mix(in srgb,${ink} 20%,${end})`,
    color: ink,
    colorScheme: ink === "#ffffff" ? "dark" : "light",
  } as CSSProperties;
}

/** Time-weighted quartiles avoid weighting frequently changing readings more.
 * Null intervals and negative export readings do not count as known consumption.
 */
export function consumptionRange(
  history: MetricHistory,
): [number, number] | null {
  if (history.basis === "counter") return null;
  const points = history.points,
    end = Date.parse(history.end || points.at(-1)?.time || "");
  const bins = points
    .flatMap((p, i) => {
      const start = Date.parse(p.time),
        stop = Date.parse(points[i + 1]?.time || history.end || p.time);
      const duration =
        Math.min(
          stop,
          end,
          history.basis === "hourly" ? start + 3600000 : Infinity,
        ) - start;
      return p.value !== null &&
        Number.isFinite(p.value) &&
        p.value >= 0 &&
        Number.isFinite(duration) &&
        duration > 0
        ? [{ value: p.value, weight: duration }]
        : [];
    })
    .sort((a, b) => a.value - b.value);
  const total = bins.reduce((n, b) => n + b.weight, 0);
  if (total < 2 * 3600000) return null;
  const quantile = (fraction: number) => {
    let weight = 0;
    for (const b of bins) {
      weight += b.weight;
      if (weight >= total * fraction) return b.value;
    }
    return bins.at(-1)!.value;
  };
  return [quantile(0.25), quantile(0.75)];
}
export function consumptionLevel(value: number, range: [number, number]) {
  return value === 0 ||
    value < range[0] ||
    (range[0] < range[1] && value === range[0])
    ? "low"
    : value > range[1]
      ? "high"
      : "medium";
}
export function metricAssessment(
  c: Control,
  kind: MetricKind,
  history: MetricHistory | undefined,
  offline: boolean,
  lang: string,
): Assessment {
  const en = lang === "en";
  let level: Level = "unknown",
    label = en ? "Waiting" : "Venter",
    detail = en
      ? "Waiting for a current reading"
      : "Venter på en aktuell måling",
    value = numeric(c);
  if (!offline && usable(c)) {
    if (
      kind === "humidity" &&
      metricUnit(c) === "%" &&
      value !== null &&
      value >= 0 &&
      value <= 100
    ) {
      const p = value / 100,
        color = [244, 249, 255].map((v, i) => v + ([20, 83, 160][i] - v) * p);
      return {
        level: "humidity",
        label: en ? "Relative" : "Relativ",
        detail: en
          ? "Relative humidity, white to blue from 0 to 100%"
          : "Relativ luftfuktighet, hvitt til blått fra 0 til 100 %",
        style: metricSurface(color, color),
      };
    }
    if (kind === "temperature") {
      const degrees = temperature(c);
      if (degrees !== null) {
        level =
          degrees < 18
            ? "cold"
            : degrees <= 24
              ? "normal"
              : degrees < 27
                ? "warm"
                : "high";
        label = {
          cold: en ? "Cool" : "Kjølig",
          normal: en ? "Mid range" : "Mellomnivå",
          warm: en ? "Warm" : "Varmt",
          high: en ? "High" : "Høyt",
        }[level];
        detail = en
          ? "Color scale: below 18°C, 18–24°C, 24–27°C, 27°C and above"
          : "Fargeskala: under 18 °C, 18–24 °C, 24–27 °C, fra 27 °C";
      }
    }
    if (kind === "energy") {
      if (isEnergyCounter(c))
        value =
          history?.basis === "hourly"
            ? (history.points.at(-1)?.value ?? null)
            : null;
      if (value !== null && value < 0 && !isEnergyCounter(c)) {
        level = "export";
        label = en ? "Exporting" : "Leverer";
        detail = en
          ? "Reported flow is negative"
          : "Rapportert effekt er negativ";
      } else {
        const range = history && consumptionRange(history);
        detail = en
          ? "Compared with this source's recorded last 24 hours; at least two hours of known readings required"
          : "Sammenlignet med denne kildens lagrede siste døgn; krever minst to timer med kjente målinger";
        if (range && value !== null && value >= 0) {
          level = consumptionLevel(value, range);
          label =
            level === "low"
              ? en
                ? "Low"
                : "Lavt"
              : level === "high"
                ? en
                  ? "High"
                  : "Høyt"
                : en
                  ? "Medium"
                  : "Middels";
        } else {
          label = en ? "No baseline" : "Uten grunnlag";
        }
      }
    }
  }
  const [a, b] = colors[level as Exclude<Level, "humidity">];
  return { level, label, detail, style: metricSurface(a, b) };
}
