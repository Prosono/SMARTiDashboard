import { Thermometer, Droplets, Users, Lightbulb, Info } from "lucide-react";
import type { Home } from "./types";
import { DeviceArtwork } from "./home/DeviceArtwork";
import { reportDuration, reportNumber, reportValue } from "./reportModel";

export type ReportReading = {
  entity_id: string;
  name: string;
  unit: string;
  samples: number;
  active_hours: number | null;
  known_hours: number;
  unknown_hours: number;
  coverage: number;
  activations: number;
  average: number | null;
  minimum: number | null;
  maximum: number | null;
};
type Group = {
  items: ReportReading[];
  total: number;
  limit: number;
  unavailable: boolean;
};
export type HouseStatistics = Record<
  "people" | "lights" | "temperatures" | "humidity",
  Group
>;

export function HouseReportStatistics({
  statistics,
  home,
  lang = "nb",
}: {
  statistics: HouseStatistics;
  home?: Home;
  lang?: string;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const fmt = (n: unknown) => reportNumber(n, lang);
  return (
    <div className="house-statistics">
      {(["temperatures", "humidity", "lights", "people"] as const).map(
        (kind) => {
          const group = statistics[kind];
          if (!group) return null;
          const numeric = kind === "temperatures" || kind === "humidity";
          const Icon = {
            people: Users,
            lights: Lightbulb,
            temperatures: Thermometer,
            humidity: Droplets,
          }[kind];
          const title = {
            people: t("Hvem har vært hjemme?", "Time at home"),
            lights: t("Lys i hjemmet", "Lighting"),
            temperatures: t("Temperaturer", "Temperature"),
            humidity: t("Luftfuktighet", "Humidity"),
          }[kind];
          const label = {
            people: t("Tilstedeværelse", "Presence"),
            lights: t("Lysstatistikk", "Lighting statistics"),
            temperatures: t("Temperaturstatistikk", "Temperature statistics"),
            humidity: t("Luftfuktighet", "Humidity"),
          }[kind];
          return (
            <section
              key={kind}
              id={`report-${kind}`}
              className={`hr-stat-section hr-stat-${kind}`}
              aria-label={label}
            >
              <header className="report-section-head">
                <div>
                  <span className="report-section-label">
                    <Icon size={17} />
                    {t("MÅLINGER", "MEASUREMENTS")}
                  </span>
                  <h3>{title}</h3>
                </div>
                <span className="report-source-count">
                  {group.items.length} / {group.total} {t("kilder", "sources")}
                </span>
              </header>
              <p className="report-section-description">
                {numeric
                  ? t(
                      "Spennet viser laveste og høyeste målte verdi. Prikken viser det tidsvektede gjennomsnittet.",
                      "The range shows the lowest and highest reading. The dot marks the time-weighted average.",
                    )
                  : kind === "people"
                    ? t(
                        "Registrert tid hjemme for hver person. Bevegelsessensorer brukes ikke til å identifisere personer.",
                        "Recorded time at home for each person. Motion sensors do not identify people.",
                      )
                    : t(
                        "Registrert tid på for hvert lys. Enkeltlys og grupper kan overlappe og summeres ikke.",
                        "Recorded on-time for each light. Individual lights and groups can overlap and are not added together.",
                      )}
              </p>
              {group.unavailable && (
                <p className="report-inline-note" role="status">
                  <Info size={16} />
                  {t(
                    "Noe historikk kunne ikke hentes. Visningen kan være ufullstendig.",
                    "Some history could not be retrieved. These results may be incomplete.",
                  )}
                </p>
              )}
              {group.total > group.limit && (
                <p className="report-inline-note">
                  {t(
                    `Viser opptil ${group.limit} av ${group.total} kilder. Flere kan undersøkes under Historikk.`,
                    `Showing up to ${group.limit} of ${group.total} sources. Explore others in History.`,
                  )}
                </p>
              )}
              {!group.items.length && (
                <div className="report-empty-inline">
                  <Icon size={24} />
                  <p>
                    {group.total
                      ? t(
                          "Ingen målinger tilgjengelig i perioden.",
                          "No readings available in this period.",
                        )
                      : t(
                          "Ingen kilder konfigurert for dette i hjemmet.",
                          "No sources configured for this category.",
                        )}
                  </p>
                </div>
              )}
              <div className="house-stat-list">
                {group.items.map((item) => {
                  const control = home?.controls.find(
                    (c) => c.entity_id === item.entity_id,
                  );
                  const endpoints = group.items
                    .filter((i) => i.unit === item.unit)
                    .flatMap((i) => [
                      reportValue(i.minimum),
                      reportValue(i.maximum),
                    ])
                    .filter((v): v is number => v !== null);
                  const low = Math.min(...endpoints),
                    high = Math.max(...endpoints);
                  const position = (v: number) =>
                    !endpoints.length || high === low
                      ? 50
                      : Math.max(
                          0,
                          Math.min(100, ((v - low) / (high - low)) * 100),
                        );
                  const min = reportValue(item.minimum),
                    max = reportValue(item.maximum),
                    avg = reportValue(item.average);
                  const known = Math.max(0, item.known_hours || 0),
                    unknown = Math.max(0, item.unknown_hours || 0);
                  const total = known + unknown,
                    active = Math.min(
                      known,
                      Math.max(0, item.active_hours || 0),
                    );
                  return (
                    <div className="house-stat-row" key={item.entity_id}>
                      <div className="house-stat-name">
                        {control && kind !== "people" ? (
                          <DeviceArtwork c={control} size={40} />
                        ) : (
                          <Icon
                            size={23}
                            className="hr-reading-icon"
                            aria-hidden
                          />
                        )}
                        <div>
                          <strong>{item.name}</strong>
                          <small>
                            {fmt(item.coverage * 100)} %{" "}
                            {t("kjent tilstand", "known state")} ·{" "}
                            {reportDuration(unknown, lang)}{" "}
                            {t("ukjent", "unknown")}
                          </small>
                        </div>
                      </div>
                      <div className="report-reading-visual" aria-hidden="true">
                        {numeric ? (
                          <div className="report-range-track">
                            {min !== null && max !== null && (
                              <span
                                className="report-range-fill"
                                style={{
                                  left: `${position(min)}%`,
                                  width: `${position(max) - position(min)}%`,
                                }}
                              />
                            )}{" "}
                            {avg !== null && (
                              <i style={{ left: `${position(avg)}%` }} />
                            )}
                          </div>
                        ) : (
                          <div className="report-duration-track">
                            <span
                              style={{
                                width: `${total ? (active / total) * 100 : 0}%`,
                              }}
                            />
                            <i
                              style={{
                                width: `${total ? ((known - active) / total) * 100 : 0}%`,
                              }}
                            />
                            <b
                              style={{
                                width: `${total ? (unknown / total) * 100 : 100}%`,
                              }}
                            />
                          </div>
                        )}
                      </div>
                      <dl>
                        {numeric ? (
                          <>
                            <div>
                              <dt>{t("Laveste", "Lowest")}</dt>
                              <dd>
                                {fmt(min)} {item.unit}
                              </dd>
                            </div>
                            <div className="report-reading-primary">
                              <dt>{t("Gjennomsnitt", "Average")}</dt>
                              <dd>
                                {fmt(avg)} {item.unit}
                              </dd>
                            </div>
                            <div>
                              <dt>{t("Høyeste", "Highest")}</dt>
                              <dd>
                                {fmt(max)} {item.unit}
                              </dd>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="report-reading-primary">
                              <dt>
                                {kind === "people"
                                  ? t("Tid hjemme", "Time at home")
                                  : t("Tid på", "On-time")}
                              </dt>
                              <dd>{reportDuration(item.active_hours, lang)}</dd>
                            </div>
                            <div>
                              <dt>
                                {kind === "people"
                                  ? t(
                                      "Registrerte hjemkomster",
                                      "Recorded arrivals",
                                    )
                                  : t("Slått på", "Switched on")}
                              </dt>
                              <dd>{known ? fmt(item.activations) : "—"}</dd>
                            </div>
                          </>
                        )}
                      </dl>
                    </div>
                  );
                })}
              </div>
              {!numeric && !!group.items.length && (
                <p className="report-legend">
                  <span>
                    <i />
                    {kind === "people" ? t("Hjemme", "Home") : t("På", "On")}
                  </span>
                  <span>
                    <i />
                    {kind === "people" ? t("Borte", "Away") : t("Av", "Off")}
                  </span>
                  <span>
                    <i />
                    {t("Ukjent", "Unknown")}
                  </span>
                </p>
              )}
            </section>
          );
        },
      )}
      <details className="report-method" id="report-method">
        <summary>
          {t(
            "Slik beregnes tid og gjennomsnitt",
            "How duration and averages are calculated",
          )}
        </summary>
        <p>
          {t(
            "Sist rapporterte tilstand gjelder frem til neste endring. Ukjent eller utilgjengelig tid tas ikke med i gjennomsnittet. Første tilstand telles ikke som en hjemkomst eller et påslag. Historikken kan ikke avdekke avbrudd huben ikke har registrert. Ulike måleenheter blandes ikke.",
            "The last reported state applies until the next change. Unknown or unavailable time is excluded from averages. The initial state is not counted as an arrival or activation. History cannot reveal outages that the hub did not record. Different units are not combined.",
          )}
        </p>
      </details>
    </div>
  );
}
