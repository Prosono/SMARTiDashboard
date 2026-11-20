import { useId } from "react";
import { BarChart3, Coins, Zap } from "lucide-react";
import { finiteReading } from "./energySummaryModel";
import "./energyTodayOverview.css";

type TodayTotals = {
  available_kwh: number | string | null;
  cost?: number | string | null;
  complete: boolean;
  coverage?: number;
};

export function EnergyTodayOverview({
  today,
  estimated,
  stale,
  loading,
  lang,
}: {
  today?: TodayTotals;
  estimated: boolean;
  stale: boolean;
  loading: boolean;
  lang: string;
}) {
  const title = useId();
  const en = lang === "en";
  const t = (nb: string, english: string) => (en ? english : nb);
  const locale = en ? "en-GB" : "nb-NO";
  const kwh = finiteReading(today?.available_kwh);
  const cost = finiteReading(today?.cost);
  const coverage = finiteReading(today?.coverage);
  const energyLabel =
    kwh === null
      ? t("Venter på målinger", "Waiting for readings")
      : estimated
        ? t("Estimert fra effektmålinger", "Estimated from power readings")
        : today?.complete
          ? t("Målt forbruk", "Metered consumption")
          : t("Tilgjengelige målinger", "Available meter readings");
  const partialCoverage =
    kwh !== null &&
    !today?.complete &&
    coverage != null &&
    coverage >= 0 &&
    coverage < 1
      ? Math.min(coverage, 0.999).toLocaleString(locale, {
          style: "percent",
          maximumFractionDigits: 1,
        })
      : null;

  return (
    <section
      className="energy-today-overview"
      data-energy-tone="energy-use"
      aria-labelledby={title}
      aria-busy={loading}
    >
      <div className="energy-today-layout">
        <header>
          <BarChart3 size={24} aria-hidden="true" />
          <div>
            <h3 id={title}>
              {t("Forbruk og kostnad i dag", "Usage and cost today")}
            </h3>
            <p>{t("Ferdige timer", "Completed hours")}</p>
          </div>
        </header>
        <dl>
          <div>
            <dt>
              <Zap size={15} aria-hidden="true" />{" "}
              {t("Kjøpt strøm", "Grid usage")}
            </dt>
            <dd>
              <strong>
                {kwh === null ? (
                  "—"
                ) : (
                  <>
                    {kwh.toLocaleString(locale, { maximumFractionDigits: 2 })}{" "}
                    <span>kWh</span>
                  </>
                )}
              </strong>
              <small>
                {energyLabel}
                {partialCoverage &&
                  ` · ${partialCoverage} ${t("dekning", "coverage")}`}
              </small>
            </dd>
          </div>
          <div>
            <dt>
              <Coins size={15} aria-hidden="true" />{" "}
              {t("Estimert kostnad", "Estimated cost")}
            </dt>
            <dd>
              <strong>
                {cost === null
                  ? "—"
                  : cost.toLocaleString(locale, {
                      style: "currency",
                      currency: "NOK",
                    })}
              </strong>
              <small>
                {cost === null
                  ? t(
                      "Venter på målinger og priser",
                      "Waiting for readings and prices",
                    )
                  : t(
                      "Basert på tilgjengelige målinger og priser",
                      "Based on available readings and rates",
                    )}
              </small>
            </dd>
          </div>
        </dl>
      </div>
      {stale && (kwh !== null || cost !== null) && (
        <p className="energy-today-stale" role="status">
          {t("Viser sist hentede tall.", "Showing the last retrieved figures.")}
        </p>
      )}
    </section>
  );
}
