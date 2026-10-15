import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpRight } from "lucide-react";
import { api } from "../api";
import type { Control } from "../types";
import { reading } from "./homeModel";

type Series = {
  id: string;
  unit: string;
  kind: "energy" | "power";
  change_percent: number | null;
  current: {
    value: number | null;
    complete: boolean;
    points: { time: string; value: number | null }[];
  };
};
export function HighlightEnergy({
  c,
  lang,
  open,
}: {
  c: Control;
  lang: string;
  open: () => void;
}) {
  const en = lang === "en",
    locale = en ? "en-GB" : "nb-NO";
  const [selected, select] = useState<number | null>(null);
  const q = useQuery({
    queryKey: ["highlight-energy", c.id],
    queryFn: () =>
      api<{ series: Series[] }>(
        `home/energy/statistics?${new URLSearchParams({ period: "24h", ids: c.id })}`,
      ),
    staleTime: 60000,
    refetchInterval: 300000,
    retry: false,
  });
  const series = q.data?.series.find((s) => s.id === c.id);
  const points = series?.current.points || [];
  const valid = points.flatMap((p, i) => (p.value == null ? [] : [i]));
  const max = Math.max(0.001, ...points.map((p) => Math.abs(p.value ?? 0)));
  const hasTotal = series?.kind === "energy" && series.current.value != null;
  const number = (v: number) =>
    v.toLocaleString(locale, { maximumFractionDigits: 2 });
  const hour = (v: string) =>
    new Date(v).toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
    });
  const point = selected == null ? undefined : points[selected];
  const change = series?.change_percent;
  return (
    <div className="he-body">
      <div className="he-measurement">
        <div>
          <strong>
            {hasTotal ? (
              <>
                {number(series.current.value!)} <small>{series.unit}</small>
              </>
            ) : (
              reading(c, lang)
            )}
          </strong>
          <span>
            {hasTotal
              ? series.current.complete
                ? en
                  ? "Total · last 24 hours"
                  : "Totalt · siste 24 timer"
                : en
                  ? "Partial data · last 24 hours"
                  : "Ufullstendig · siste 24 timer"
              : en
                ? "Latest reading"
                : "Siste måling"}
          </span>
        </div>
        {change != null && (
          <div className="he-change" data-lower={change < 0}>
            <strong>
              {change < 0 ? <ArrowDown size={18} /> : <ArrowUp size={18} />}{" "}
              {Math.abs(change).toLocaleString(locale, {
                maximumFractionDigits: 0,
              })}
              %
            </strong>
            <small>{en ? "vs previous 24 h" : "mot forrige 24 t"}</small>
          </div>
        )}
      </div>
      <div className="he-chart-wrap">
        {valid.length ? (
          <>
            <div
              className="he-chart"
              role="slider"
              tabIndex={0}
              aria-label={
                en
                  ? "Energy history, use arrow keys"
                  : "Energihistorikk, bruk piltastene"
              }
              aria-valuemin={1}
              aria-valuemax={points.length}
              aria-valuenow={(selected ?? valid[0]) + 1}
              aria-valuetext={
                point?.value != null
                  ? `${hour(point.time)}: ${number(point.value)} ${series?.unit}`
                  : en
                    ? "Select an hour"
                    : "Velg en time"
              }
              onBlur={() => select(null)}
              onMouseLeave={() => select(null)}
              onKeyDown={(e) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
                  return;
                e.preventDefault();
                const position = Math.max(
                  0,
                  valid.indexOf(selected ?? valid[0]),
                );
                select(
                  e.key === "Home"
                    ? valid[0]
                    : e.key === "End"
                      ? valid.at(-1)!
                      : valid[
                          Math.max(
                            0,
                            Math.min(
                              valid.length - 1,
                              position + (e.key === "ArrowLeft" ? -1 : 1),
                            ),
                          )
                        ],
                );
              }}
            >
              <svg
                viewBox="0 0 300 150"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <path
                    key={i}
                    d={`M ${i * 37.5} 0 V 150`}
                    className="he-grid"
                  />
                ))}
                {points.map((p, i) =>
                  p.value == null ? null : (
                    <rect
                      key={p.time}
                      className={selected === i ? "he-selected" : ""}
                      x={(i * 300) / points.length + 1}
                      y={149 - (Math.abs(p.value) / max) * 120}
                      width={Math.max(1, 300 / points.length - 3)}
                      height={Math.max(1, (Math.abs(p.value) / max) * 120)}
                      rx="4"
                    />
                  ),
                )}
              </svg>
              <div
                className="he-chart-hit"
                onPointerMove={(e) => {
                  const b = e.currentTarget.getBoundingClientRect();
                  select(
                    Math.max(
                      0,
                      Math.min(
                        points.length - 1,
                        Math.floor(
                          ((e.clientX - b.left) / b.width) * points.length,
                        ),
                      ),
                    ),
                  );
                }}
                onPointerDown={(e) => {
                  const b = e.currentTarget.getBoundingClientRect();
                  select(
                    Math.max(
                      0,
                      Math.min(
                        points.length - 1,
                        Math.floor(
                          ((e.clientX - b.left) / b.width) * points.length,
                        ),
                      ),
                    ),
                  );
                }}
              />
              {point && (
                <output
                  className="he-tooltip"
                  style={{
                    left: `${Math.max(16, Math.min(84, ((selected! + 0.5) / points.length) * 100))}%`,
                  }}
                >
                  {hour(point.time)} ·{" "}
                  {point.value == null
                    ? "—"
                    : `${number(point.value)} ${series?.unit}`}
                </output>
              )}
            </div>
            <div className="he-axis">
              {[0, Math.floor(points.length / 2), points.length - 1].map(
                (i) => (
                  <span key={i}>{hour(points[i].time)}</span>
                ),
              )}
            </div>
          </>
        ) : (
          <div className="he-empty">
            {q.isPending
              ? en
                ? "Loading history…"
                : "Henter historikk…"
              : en
                ? "No history available yet"
                : "Ingen historikk tilgjengelig ennå"}
            {q.isError && (
              <button onClick={() => void q.refetch()}>
                {en ? "Retry" : "Prøv igjen"}
              </button>
            )}
          </div>
        )}
      </div>
      <button className="highlight-text-link" onClick={open}>
        <span title={c.name}>{c.name}</span>
        <span>
          {en ? "Details" : "Detaljer"}
          <ArrowUpRight size={15} />
        </span>
      </button>
    </div>
  );
}
