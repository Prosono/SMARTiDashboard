import { MeasuredChart } from "./MeasuredChart";

export type TrendPoint = { time: string; value: number | null };
/** Shared, inspectable recorder curves, with gaps and real timestamps preserved. */
export function HarmonyTrend({
  points,
  label,
  unit,
  lang,
  domain,
}: {
  points: TrendPoint[];
  label: string;
  unit: string;
  lang: string;
  domain?: { start: number; end: number };
}) {
  return (
    <MeasuredChart
      series={[{ id: "reading", name: label, points }]}
      label={label}
      unit={unit}
      lang={lang}
      className="harmony-trend"
      domain={domain}
    />
  );
}
