import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { ChartNoAxesCombined } from "lucide-react";
import { api } from "../api";
import type { Home } from "../types";
import type { HistoryData } from "../ControlHistory";
import type { CardConfig } from "./homeGridModel";
import { CardIcon, CardTitle } from "./CardPresentation";
import {
  compatibleSources,
  controlUnit,
  graphGeometry,
  graphPoints,
  isGraphSource,
  unitInfo,
} from "./cardConfigModel";
import { numeric, usable } from "./homeModel";

const colors = [
  "#ed9336",
  "#3a9bd8",
  "#4aa58c",
  "#c077b4",
  "#9c9245",
  "#9a85d0",
];
export function MultiSourceCard({
  config,
  home,
  lang,
  offline,
}: {
  config: CardConfig;
  home: Home;
  lang: string;
  offline: boolean;
}) {
  const en = lang === "en",
    t = (nb: string, english: string) => (en ? english : nb);
  const [hidden, hide] = useState<string[]>([]);
  const controls = config.sources.map((id) =>
    home.controls.find((c) => c.entity_id === id && isGraphSource(c)),
  );
  const queries = useQueries({
    queries: controls.map((c, index) => ({
      queryKey: [
        "control-history",
        c?.entity_id || config.sources[index],
        config.period,
      ],
      queryFn: () =>
        api<HistoryData>(
          `controls/${encodeURIComponent(c!.entity_id)}/history?hours=${config.period}`,
        ),
      enabled: !!c && !offline && home.connected,
      retry: false,
      staleTime: 60000,
      refetchInterval: 300000,
    })),
  });
  const reference = controls.find(Boolean);
  const unit = reference ? unitInfo(controlUnit(reference)).unit : "";
  const series = controls.map((c, index) => {
    const query = queries[index];
    const historyUnit = query.data?.unit ?? (c ? controlUnit(c) : "");
    const compatible =
      !!c &&
      !!reference &&
      compatibleSources(reference, c) &&
      unitInfo(historyUnit).family === unitInfo(controlUnit(reference)).family;
    const points =
      compatible && !offline && home.connected
        ? graphPoints(query.data?.points || [], historyUnit)
        : [];
    return {
      c,
      id: config.sources[index],
      compatible,
      points,
      query,
      color: colors[index],
    };
  });
  const geometry = graphGeometry(series.filter((s) => !hidden.includes(s.id)));
  const format = (n: number) =>
    n.toLocaleString(en ? "en-GB" : "nb-NO", { maximumFractionDigits: 1 });
  const time = (n: number) =>
    new Date(n).toLocaleString(
      en ? "en-GB" : "nb-NO",
      config.period === "168"
        ? { day: "2-digit", month: "short", hour: "2-digit" }
        : { hour: "2-digit", minute: "2-digit" },
    );
  return (
    <section
      className="personal-graph"
      aria-label={
        config.title || t("Graf med flere datakilder", "Multi-source graph")
      }
    >
      <header>
        <CardIcon fallback={ChartNoAxesCombined} size={24} />
        <h3>
          <CardTitle>{t("Sammenligning", "Comparison")}</CardTitle>
        </h3>
        <small>
          {config.period === "168"
            ? t("7 dager", "7 days")
            : `${config.period} ${t("timer", "hours")}`}
        </small>
      </header>
      {geometry ? (
        <div
          className="personal-graph-plot"
          role="img"
          aria-label={`${t("Målt historikk", "Recorded history")}, ${unit}, ${time(geometry.start)}–${time(geometry.end)}`}
        >
          <div className="personal-graph-scale" aria-hidden="true">
            <span>
              {format(geometry.max)} {unit}
            </span>
            <span>{format((geometry.min + geometry.max) / 2)}</span>
            <span>{format(geometry.min)}</span>
          </div>
          <svg
            viewBox="0 0 480 122"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              className="harmony-trend-guide"
              d="M8 9H472 M8 60H472 M8 111H472"
            />
            {series
              .filter((s) => !hidden.includes(s.id))
              .map((s) => (
                <g key={s.id} data-source={s.id}>
                  {geometry.segments(s.points).map((segment, i) => (
                    <g key={i}>
                      <path
                        d={segment
                          .map(
                            (p, j) =>
                              `${j ? "L" : "M"}${geometry.x(p).toFixed(2)},${geometry.y(p).toFixed(2)}`,
                          )
                          .join(" ")}
                        fill="none"
                        stroke={s.color}
                        strokeWidth="2.5"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                      />
                      {segment.length === 1 && (
                        <circle
                          cx={geometry.x(segment[0])}
                          cy={geometry.y(segment[0])}
                          r="3"
                          fill={s.color}
                        />
                      )}
                    </g>
                  ))}
                </g>
              ))}
          </svg>
          <div className="personal-graph-times" aria-hidden="true">
            <span>{time(geometry.start)}</span>
            <span>{time(geometry.end)}</span>
          </div>
        </div>
      ) : (
        <p className="personal-graph-empty" role="status">
          {series.some((s) => s.points.length > 0) &&
          series.every((s) => hidden.includes(s.id) || !s.points.length)
            ? t(
                "Velg en datakilde i tegnforklaringen for å vise kurven.",
                "Select a data source in the legend to show its curve.",
              )
            : offline || !home.connected
              ? t(
                  "Venter på forbindelse. Historikken lastes når hjemmet er tilkoblet.",
                  "Waiting for a connection. History loads when your home is connected.",
                )
              : queries.some((q) => q.isFetching)
                ? t("Henter historikk…", "Loading history…")
                : t(
                    "Ingen tilgjengelige målepunkter i valgt tidsrom.",
                    "No available readings in the selected period.",
                  )}
        </p>
      )}
      <div
        className="personal-graph-legend"
        aria-label={t("Datakilder", "Data sources")}
      >
        {series.map((s) => {
          const value =
            s.c && s.compatible && usable(s.c) && !offline && home.connected
              ? numeric(s.c)
              : null;
          return (
            <div key={s.id}>
              <button
                type="button"
                aria-pressed={!hidden.includes(s.id)}
                disabled={!s.c || !s.compatible}
                onClick={() =>
                  hide((previous) =>
                    previous.includes(s.id)
                      ? previous.filter((id) => id !== s.id)
                      : [...previous, s.id],
                  )
                }
              >
                <i style={{ background: s.color }} aria-hidden="true" />
                <span>
                  {s.c?.name || t("Datakilde mangler", "Missing data source")}
                </span>
                <strong>
                  {value !== null && s.c
                    ? `${format(unitInfo(controlUnit(s.c)).convert(value))} ${unit}`
                    : "—"}
                </strong>
              </button>
              {(!s.c ||
                !s.compatible ||
                s.query.isError ||
                (!s.points.length && !s.query.isFetching) ||
                (s.c && !usable(s.c))) && (
                <small>
                  {!s.c ? (
                    t(
                      "Velg en ny datakilde i Rediger kort.",
                      "Choose another data source in Edit card.",
                    )
                  ) : !s.compatible ? (
                    t(
                      "Enhetene kan ikke sammenlignes på samme skala.",
                      "The units cannot share the same scale.",
                    )
                  ) : s.query.isError ? (
                    <>
                      {t(
                        "Kunne ikke hente historikk.",
                        "Could not load history.",
                      )}{" "}
                      <button onClick={() => void s.query.refetch()}>
                        {t("Prøv igjen", "Retry")}
                      </button>
                    </>
                  ) : !usable(s.c) ? (
                    t(
                      "Enheten er utilgjengelig. Eventuell kurve viser lagret historikk.",
                      "Device unavailable. Any displayed curve is recorded history.",
                    )
                  ) : (
                    t("Historikk mangler.", "No recorded history.")
                  )}
                </small>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
