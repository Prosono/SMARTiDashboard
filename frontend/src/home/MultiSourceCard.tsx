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
  graphPoints,
  isGraphSource,
  unitInfo,
} from "./cardConfigModel";
import { numeric, usable } from "./homeModel";
import { MeasuredChart } from "./MeasuredChart";
import { chartColor } from "./chartModel";

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
      color: chartColor(index),
    };
  });
  const shown = series
    .filter((s) => !hidden.includes(s.id) && s.compatible)
    .map((s) => ({
      id: s.id,
      name: s.c!.name,
      color: s.color,
      points: s.points,
    }));
  const hasData = shown.some((s) =>
    s.points.some(
      (p) =>
        p.value !== null &&
        Number.isFinite(p.value) &&
        Number.isFinite(Date.parse(p.time)),
    ),
  );
  const format = (n: number) =>
    n.toLocaleString(en ? "en-GB" : "nb-NO", { maximumFractionDigits: 1 });
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
      {hasData ? (
        <MeasuredChart
          series={shown}
          unit={unit}
          lang={lang}
          label={config.title || t("Sammenligning", "Comparison")}
          className="personal-graph-plot"
        />
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
