import { useState } from "react";
export type Sample = {
  time: number;
  cpu: number | null;
  memory: number | null;
  storage: number | null;
};
export function SystemGraph({
  history,
  metric,
  unit,
  lang,
}: {
  history: Sample[];
  metric: "cpu" | "memory" | "storage";
  unit: string;
  lang: string;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const points = history.filter((p) => Number.isFinite(p[metric]));
  if (points.length < 2)
    return (
      <small className="system-graph-empty">
        {lang === "en" ? "Collecting history …" : "Samler historikk …"}
      </small>
    );
  const start = history[0].time,
    end = history[history.length - 1].time,
    max = Math.max(...points.map((p) => p[metric]!), 1);
  const x = (p: Sample) => ((p.time - start) / (end - start || 1)) * 300,
    y = (p: Sample) => 85 - (p[metric]! / max) * 70;
  let last: Sample | undefined;
  const d = history
    .map((p) => {
      if (p[metric] == null) {
        last = undefined;
        return "";
      }
      const command = !last || p.time - last.time > 90 ? "M" : "L";
      last = p;
      return `${command}${x(p)},${y(p)}`;
    })
    .join(" ");
  const selected = index == null ? null : points[index];
  return (
    <div
      className="system-graph"
      tabIndex={0}
      role="img"
      aria-label={`${metric}: ${points.length} ${lang === "en" ? "samples. Use arrow keys to inspect." : "målinger. Bruk piltastene for detaljer."}`}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          setIndex((i) =>
            Math.max(
              0,
              Math.min(
                points.length - 1,
                (i ?? points.length - 1) + (e.key === "ArrowLeft" ? -1 : 1),
              ),
            ),
          );
        }
      }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const t = start + ((e.clientX - r.left) / r.width) * (end - start);
        setIndex(
          points.reduce(
            (best, p, i) =>
              Math.abs(p.time - t) < Math.abs(points[best].time - t) ? i : best,
            0,
          ),
        );
      }}
      onPointerLeave={() => setIndex(null)}
    >
      <svg viewBox="0 0 300 90" preserveAspectRatio="none" aria-hidden="true">
        <path
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        {selected && (
          <circle cx={x(selected)} cy={y(selected)} r="4" fill="currentColor" />
        )}
      </svg>
      {selected && (
        <output>
          {new Date(selected.time * 1000).toLocaleTimeString(
            lang === "en" ? "en-GB" : "nb-NO",
          )}{" "}
          ·{" "}
          {selected[metric]?.toLocaleString(undefined, {
            maximumFractionDigits: 1,
          })}{" "}
          {unit}
        </output>
      )}
    </div>
  );
}
