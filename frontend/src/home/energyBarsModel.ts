import type { MetricHistory } from "./metricHistory";
import { consumptionRange, consumptionLevel } from "./metricAssessment";

export type EnergyBar = {
  time: number;
  end: number;
  value: number | null;
  coverage: number;
  ongoing: boolean;
  level: "low" | "medium" | "high" | "export" | "unknown";
};
const hour = 3600000;

/** Instantaneous readings are held only until the next recorded state (including
 * null), then averaged by known time. Completed-hour counter changes stay totals.
 */
export function energyBars(history: MetricHistory): EnergyBar[] {
  if (history.basis === "counter") return [];
  const end = Date.parse(history.end || ""),
    start = Date.parse(history.start || "");
  if (!Number.isFinite(end) || !Number.isFinite(start) || end <= start)
    return [];
  const first = Math.max(
      Math.floor(start / hour),
      Math.floor((end - 1) / hour) - 23,
    ),
    range = consumptionRange(history);
  const points = history.points
    .filter((p) => Number.isFinite(Date.parse(p.time)))
    .map((p) => ({ time: Date.parse(p.time), value: p.value }))
    .sort((a, b) => a.time - b.time);
  return Array.from(
    { length: Math.floor((end - 1) / hour) - first + 1 },
    (_, i) => {
      const time = (first + i) * hour,
        stop = Math.min(time + hour, end),
        begin = Math.max(time, start);
      let sum = 0,
        coverage = 0,
        value: number | null = null;
      if (history.basis === "hourly") {
        const point = points.find(
          (p) => p.time >= time && p.time < time + hour,
        );
        if (point?.value != null && Number.isFinite(point.value)) {
          value = point.value;
          coverage = hour;
        }
      } else {
        points.forEach((p, j) => {
          const duration =
            Math.min(stop, points[j + 1]?.time ?? end) -
            Math.max(begin, p.time);
          if (duration > 0 && p.value !== null && Number.isFinite(p.value)) {
            sum += p.value * duration;
            coverage += duration;
          }
        });
        if (coverage > 0) value = sum / coverage;
      }
      const level =
        value === null
          ? "unknown"
          : value < 0
            ? history.basis === "reading"
              ? "export"
              : "unknown"
            : !range
              ? "unknown"
              : consumptionLevel(value, range);
      return {
        time,
        end: stop,
        value,
        coverage,
        ongoing: stop < time + hour,
        level,
      };
    },
  );
}
