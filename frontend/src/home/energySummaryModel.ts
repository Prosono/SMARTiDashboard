import { consumptionLevel, consumptionRange } from "./metricAssessment";

export type SummaryKind = "spot" | "consumption" | "cost";
export type SummaryPart = "electricity" | "grid" | "tax" | "support" | "other";
export type SummaryPoint = {
  start: string;
  end: string;
  partial?: boolean;
  kwh: number | string | null;
  cost: {
    total: number | string | null;
    parts?: Record<string, number | string>;
  };
};
export type SummaryPrice = {
  time_start: string;
  time_end: string;
  NOK_per_kWh: number;
};
export type SummaryBar = {
  start: number;
  end: number;
  value: number | null;
  partial: boolean;
  future: boolean;
  level: "low" | "medium" | "high" | "unknown";
  parts: Partial<Record<SummaryPart, number>> | null;
};
export const finiteReading = (value: unknown): number | null =>
  !["string", "number"].includes(typeof value) ||
  String(value).trim() === "" ||
  !Number.isFinite(Number(value))
    ? null
    : Number(value);

const hour = 3600000;
const dateFormat = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Oslo",
});
const localDate = (stamp: number) => dateFormat.format(stamp);

/** Resolve Oslo midnight independently of the browser zone, including DST days. */
export function osloMidnight(day: string) {
  const target = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(target)) return NaN;
  let stamp = target;
  const format = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(
      format.formatToParts(stamp).map((p) => [p.type, p.value]),
    );
    stamp +=
      target -
      Date.parse(
        `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`,
      );
  }
  return stamp;
}

const partGroups: Record<string, SummaryPart> = {
  electricity: "electricity",
  markup: "electricity",
  grid: "grid",
  electricity_tax: "tax",
  enova: "tax",
  vat: "tax",
  support: "support",
};
function costParts(row: SummaryPoint): SummaryBar["parts"] {
  if (!row.cost.parts || !Object.keys(row.cost.parts).length) return null;
  const result: Partial<Record<SummaryPart, number>> = {};
  for (const [key, raw] of Object.entries(row.cost.parts)) {
    const value = finiteReading(raw);
    if (value === null) return null;
    const group = partGroups[key] || "other";
    result[group] = (result[group] || 0) + value;
  }
  const total = finiteReading(row.cost.total);
  const sum = Object.values(result).reduce((n, v) => n + v, 0);
  // A mismatched breakdown is not an explanation of the reported total.
  return total !== null &&
    Math.abs(sum - total) <= 0.00001 * Math.max(1, Math.abs(total))
    ? result
    : null;
}

/** Native interval values only. No filling, counter interpolation or synthetic fees. */
export function energySummaryBars({
  kind,
  points = [],
  prices = [],
  start,
  end,
  now,
}: {
  kind: SummaryKind;
  points?: SummaryPoint[];
  prices?: SummaryPrice[];
  start: string;
  end: string;
  now: number;
}): SummaryBar[] {
  const first = osloMidnight(start),
    last = osloMidnight(end);
  if (
    !Number.isFinite(first) ||
    !Number.isFinite(last) ||
    !Number.isFinite(now) ||
    last <= first ||
    last - first > 367 * 24 * hour
  )
    return [];
  let bars: SummaryBar[];
  if (kind === "spot") {
    bars = prices
      .flatMap((p) => {
        const a = Date.parse(p.time_start),
          b = Date.parse(p.time_end),
          value = finiteReading(p.NOK_per_kWh);
        return a >= first && b <= last && b > a && value !== null
          ? [
              {
                start: a,
                end: b,
                value: value * 100,
                partial: false,
                future: false,
                level: "unknown" as const,
                parts: null,
              },
            ]
          : [];
      })
      .sort((a, b) => a.start - b.start);
    const filled: SummaryBar[] = [];
    let cursor = first;
    for (const bar of bars) {
      if (bar.start < cursor) continue;
      if (bar.start > cursor)
        filled.push({ ...bar, start: cursor, end: bar.start, value: null });
      filled.push(bar);
      cursor = bar.end;
    }
    if (cursor < last)
      filled.push({
        start: cursor,
        end: last,
        value: null,
        partial: false,
        future: false,
        level: "unknown",
        parts: null,
      });
    bars = filled;
  } else {
    const groups = new Map<string, SummaryBar>();
    for (let stamp = first; stamp < last; stamp += hour) {
      const key =
        last - first <= 26 * hour
          ? String(stamp)
          : last - first > 32 * 24 * hour
            ? localDate(stamp).slice(0, 7)
            : localDate(stamp);
      const item = groups.get(key);
      if (item) item.end = Math.min(stamp + hour, last);
      else
        groups.set(key, {
          start: stamp,
          end: Math.min(stamp + hour, last),
          value: null,
          partial: false,
          future: stamp >= now,
          level: "unknown",
          parts: null,
        });
    }
    bars = [...groups.values()].map((bar) => {
      let coverage = 0,
        parts: SummaryBar["parts"] = {};
      const rows = points.filter(
        (p) =>
          Date.parse(p.start) >= bar.start &&
          Date.parse(p.start) < Math.min(bar.end, now) &&
          Date.parse(p.end) <= bar.end &&
          Date.parse(p.end) > Date.parse(p.start),
      );
      for (const row of rows) {
        const value = finiteReading(kind === "cost" ? row.cost.total : row.kwh);
        if (value === null) {
          bar.partial = true;
          continue;
        }
        bar.value = (bar.value ?? 0) + value;
        bar.partial ||= !!row.partial || Date.parse(row.end) > now;
        coverage += Math.max(
          0,
          Math.min(Date.parse(row.end), now) - Date.parse(row.start),
        );
        if (kind === "cost") {
          const split = costParts(row);
          if (!split) parts = null;
          else if (parts)
            for (const [key, amount] of Object.entries(split)) {
              const part = key as SummaryPart;
              parts[part] = (parts[part] || 0) + amount;
            }
        }
      }
      bar.partial ||=
        !bar.future && coverage < Math.min(bar.end, now) - bar.start;
      return {
        ...bar,
        parts: kind === "cost" && bar.value !== null ? parts : null,
      };
    });
  }
  if (kind === "cost") return bars;
  // Share Home's time-weighted consumption baseline; shift prices so negative
  // prices also participate, rather than being mistaken for missing consumption.
  const offset =
    kind === "spot" ? -Math.min(0, ...bars.map((b) => b.value ?? 0)) : 0;
  const baselineEnd = kind === "spot" ? last : Math.min(last, now);
  const observations = bars
    .flatMap((b) => [
      {
        time: new Date(b.start).toISOString(),
        value: b.value === null ? null : b.value + offset,
      },
      { time: new Date(b.end).toISOString(), value: null },
    ])
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  // At a shared boundary, the next interval supersedes the preceding null.
  const unique = [...new Map(observations.map((p) => [p.time, p])).values()];
  const range = consumptionRange({
    points: unique,
    unit: kind === "spot" ? "øre/kWh" : "kWh",
    basis: "reading",
    end: new Date(baselineEnd).toISOString(),
  });
  return bars.map((bar) => ({
    ...bar,
    level:
      bar.value === null || !range || (kind === "consumption" && bar.value < 0)
        ? "unknown"
        : consumptionLevel(bar.value + offset, range),
  }));
}
