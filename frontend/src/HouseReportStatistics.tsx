type Reading = {
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
  items: Reading[];
  total: number;
  limit: number;
  unavailable: boolean;
};
export type HouseStatistics = Record<
  "people" | "lights" | "temperatures" | "humidity",
  Group
>;
const fmt = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("nb-NO", { maximumFractionDigits: 1 });
function duration(n: number | null) {
  if (n == null) return "—";
  const minutes = Math.round(n * 60);
  return `${Math.floor(minutes / 60)} t ${minutes % 60} min`;
}
export function HouseReportStatistics({
  statistics,
}: {
  statistics: HouseStatistics;
}) {
  return (
    <div className="house-statistics">
      {(["people", "lights", "temperatures", "humidity"] as const).map(
        (kind) => {
          const group = statistics[kind];
          const numeric = kind === "temperatures" || kind === "humidity";
          return (
            <section
              key={kind}
              aria-label={
                {
                  people: "Tilstedeværelse",
                  lights: "Lysstatistikk",
                  temperatures: "Temperaturstatistikk",
                  humidity: "Luftfuktighet",
                }[kind]
              }
            >
              <h3>
                {
                  {
                    people: "Hvem har vært hjemme?",
                    lights: "Lys i hjemmet",
                    temperatures: "Temperaturer",
                    humidity: "Luftfuktighet",
                  }[kind]
                }
              </h3>
              <p>
                {kind === "people"
                  ? "Registrert tid hjemme fra personene i SMARTi. Ingen navn utledes fra bevegelsessensorer."
                  : kind === "lights"
                    ? "Registrert tid på og overganger fra av til på. Grupper og enkeltlys kan overlappe; tidene summeres derfor ikke som en husholdningstotal."
                    : "Minimum, maksimum og tidsvektet gjennomsnitt for hver måler. Ulike måleenheter blandes ikke."}
              </p>
              {group.unavailable && (
                <p role="status">
                  Noe av historikken kunne ikke hentes. Oversikten kan være
                  ufullstendig.
                </p>
              )}
              {group.total > group.limit && (
                <p>
                  Viser opptil {group.limit} av {group.total} kilder. Flere kan
                  undersøkes under Historikk.
                </p>
              )}
              {!group.items.length && (
                <p>
                  {group.total
                    ? "Ingen målinger tilgjengelig i perioden."
                    : "Ingen kilder konfigurert for dette i hjemmet."}
                </p>
              )}
              <div className="house-stat-list">
                {group.items.map((item) => (
                  <div className="house-stat-row" key={item.entity_id}>
                    <div className="house-stat-name">
                      <strong>{item.name}</strong>
                      <small>
                        {fmt(item.coverage * 100)} % kjent tilstand ·{" "}
                        {duration(item.unknown_hours)} ukjent
                      </small>
                    </div>
                    {numeric ? (
                      <dl>
                        <div>
                          <dt>Laveste</dt>
                          <dd>
                            {fmt(item.minimum)} {item.unit}
                          </dd>
                        </div>
                        <div>
                          <dt>Gjennomsnitt</dt>
                          <dd>
                            {fmt(item.average)} {item.unit}
                          </dd>
                        </div>
                        <div>
                          <dt>Høyeste</dt>
                          <dd>
                            {fmt(item.maximum)} {item.unit}
                          </dd>
                        </div>
                      </dl>
                    ) : (
                      <dl>
                        <div>
                          <dt>{kind === "people" ? "Tid hjemme" : "Tid på"}</dt>
                          <dd>{duration(item.active_hours)}</dd>
                        </div>
                        <div>
                          <dt>
                            {kind === "people"
                              ? "Registrerte hjemkomster"
                              : "Slått på"}
                          </dt>
                          <dd>
                            {item.known_hours ? fmt(item.activations) : "—"}
                          </dd>
                        </div>
                      </dl>
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        },
      )}
      <p className="house-stat-method">
        Tid og gjennomsnitt bygger på sist rapporterte tilstand frem til neste
        endring. Perioder merket «ukjent» eller «utilgjengelig» tas ikke med.
        Hvis huben ikke har registrert et avbrudd, kan vi ikke oppdage dette fra
        historikken alene. Første tilstand i perioden telles ikke som en
        hjemkomst eller et påslag.
      </p>
    </div>
  );
}
