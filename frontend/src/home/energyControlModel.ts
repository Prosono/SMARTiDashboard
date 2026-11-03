import {
  finiteReading,
  osloMidnight,
  type SummaryPrice,
} from "./energySummaryModel";

export type PriceHour = { start: number; end: number; price: number };

/** Whole Oslo clock hours, weighted by the published interval duration. Gaps stay unknown. */
export function priceHours(prices: SummaryPrice[], day: string): PriceHour[] {
  const start = osloMidnight(day);
  if (!Number.isFinite(start)) return [];
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  const end = osloMidnight(date.toISOString().slice(0, 10));
  const rows = prices
    .map((p) => ({
      start: Date.parse(p.time_start),
      end: Date.parse(p.time_end),
      price: finiteReading(p.NOK_per_kWh),
    }))
    .filter((p) => p.price !== null && p.end > p.start)
    .sort((a, b) => a.start - b.start);
  const result: PriceHour[] = [];
  for (let hour = start; hour < end; hour += 3600000) {
    let cursor = hour,
      sum = 0,
      valid = true;
    for (const row of rows) {
      const a = Math.max(hour, row.start),
        b = Math.min(hour + 3600000, row.end);
      if (b <= a) continue;
      if (a !== cursor) {
        valid = false;
        break;
      }
      sum += row.price! * (b - a);
      cursor = b;
    }
    if (valid && cursor === hour + 3600000)
      result.push({ start: hour, end: cursor, price: sum / 3600000 });
  }
  return result;
}

export type EnergyCurrent = {
  at: string;
  company: { id: string; name: string };
  area: string;
  contract: string;
  scheme: string;
  tariff: {
    energy_ex_vat: number | string | null;
    manual: boolean;
    revision: string | null;
    valid_from: string | null;
    updated: string | null;
    stale: boolean;
  };
  capacity: null | {
    threshold?: number;
    next_threshold_kw?: number | null;
    peak_kw?: number | string;
    monthly: number | string;
    manual: boolean;
    vat_included: boolean;
    method: string | null;
    days_recorded: number;
    days_required: number | null;
    peaks: { day: string; kw: number | string }[];
    coverage: number;
    estimated: boolean;
    provisional: boolean;
  };
};

export const energyControlDefaults = [
  "flow",
  "capacity",
  "tariff",
  "spot",
  "today",
  "today-cost",
  "history",
  "price-hours",
  "prices",
  "solar",
].map((id) => `energy:${id}`);
