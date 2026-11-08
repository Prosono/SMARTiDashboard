/** Relative spot-price levels, shared by the available today/tomorrow periods.
 * This describes the chart's price spread, not the household's final bill. */
export type SpotPriceLevel =
  "low" | "medium" | "high" | "peak" | "steady" | "unknown";
export type SpotPriceScale = { min: number; max: number } | null;
export const spotPriceLabels: Record<SpotPriceLevel, string> = {
  low: "Lavere pris",
  medium: "Middels pris",
  high: "Høyere pris",
  peak: "Høyest pris",
  steady: "Jevn pris",
  unknown: "Prisnivå ukjent",
};
export function spotPriceScale(values: readonly number[]): SpotPriceScale {
  const valid = values.filter(Number.isFinite);
  return valid.length
    ? { min: Math.min(...valid), max: Math.max(...valid) }
    : null;
}
export function spotPriceLevel(
  value: number,
  scale: SpotPriceScale,
): SpotPriceLevel {
  if (!Number.isFinite(value) || !scale) return "unknown";
  if (value <= 0) return "low";
  // Do not paint sub-display-precision differences as large peaks.
  if (scale.max - scale.min < 0.001) return "steady";
  // Negative prices never make a positive period look cheap just by extending
  // the lower end of the range. Zero and negative spot prices remain green.
  const floor = Math.max(0, scale.min),
    span = scale.max - floor;
  const ratio = span > 0 ? Math.max(0, Math.min(1, (value - floor) / span)) : 0;
  return ratio < 0.25
    ? "low"
    : ratio < 0.5
      ? "medium"
      : ratio < 0.75
        ? "high"
        : "peak";
}
