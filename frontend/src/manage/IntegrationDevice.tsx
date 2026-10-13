import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Box, ChartNoAxesCombined } from "lucide-react";
import { api } from "../api";
import { smartiName } from "../branding";
import { DeviceControl } from "../DeviceDetails";
import type { Control } from "../types";
import "../home/extras.css";
type Detail = {
  id: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  firmware: string | null;
  hardware: string | null;
  area: string | null;
  connected: boolean;
  controls: Control[];
};
type History = {
  unit: string | null;
  points: { time: string; value: number | null; state: string }[];
  minimum: number | null;
  maximum: number | null;
  samples: number;
  start: string;
  end: string;
};
export function IntegrationDevice({
  id,
  lang,
  close,
}: {
  id: string;
  lang: string;
  close: () => void;
}) {
  const en = lang === "en",
    t = (nb: string, english: string) => (en ? english : nb),
    ref = useRef<HTMLDialogElement>(null);
  const q = useQuery({
    queryKey: ["integration-device", id],
    queryFn: () => api<Detail>(`manage/device/${encodeURIComponent(id)}`),
    refetchInterval: 10000,
    retry: false,
  });
  const [chosen, choose] = useState(""),
    [hours, setHours] = useState(24),
    [tab, setTab] = useState("overview");
  useEffect(() => {
    const opener = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => {
      opener?.focus();
    };
  }, []);
  const d = q.data,
    sensors =
      d?.controls.filter((c) =>
        ["sensor", "binary_sensor"].includes(c.domain),
      ) || [];
  const sensor = sensors.find((c) => c.entity_id === chosen) || sensors[0];
  const history = useQuery({
    queryKey: ["integration-history", id, sensor?.entity_id, hours],
    queryFn: () =>
      api<History>(
        `manage/device/${encodeURIComponent(id)}/history?${new URLSearchParams({ entity_id: sensor!.entity_id, hours: String(hours) })}`,
      ),
    enabled: tab === "history" && !!sensor && !!d?.connected,
    staleTime: 60000,
    retry: false,
  });
  const data = history.data,
    points = data?.points || [],
    values = points.flatMap((p) => (p.value === null ? [] : [p.value]));
  const lo = Math.min(...values),
    hi = Math.max(...values),
    start = Date.parse(data?.start || ""),
    end = Date.parse(data?.end || "");
  const [inspection, inspect] = useState<{
    points: History["points"];
    index: number;
  } | null>(null);
  const activeIndex = inspection?.points === points ? inspection.index : -1;
  const active = points[activeIndex];
  const activeX = active
    ? 40 + ((Date.parse(active.time) - start) / (end - start || 1)) * 640
    : 0;
  function inspectAt(svg: SVGSVGElement, clientX: number, clientY: number) {
    const matrix = svg.getScreenCTM();
    if (!matrix || !points.length) return;
    const x = new DOMPoint(clientX, clientY).matrixTransform(
      matrix.inverse(),
    ).x;
    const time = start + ((x - 40) / 640) * (end - start);
    let index = 0;
    points.forEach((point, i) => {
      if (
        Math.abs(Date.parse(point.time) - time) <
        Math.abs(Date.parse(points[index].time) - time)
      )
        index = i;
    });
    inspect({ points, index });
  }
  let move = true;
  const path = points
    .map((p) => {
      if (p.value === null) {
        move = true;
        return "";
      }
      const x = 40 + ((Date.parse(p.time) - start) / (end - start || 1)) * 640,
        y = 155 - ((p.value - lo) / (hi - lo || 1)) * 120;
      const cmd = `${move ? "M" : "L"}${x},${y}`;
      move = false;
      return cmd;
    })
    .join(" ");
  const number = (n: number | null | undefined) =>
    n == null
      ? "—"
      : n.toLocaleString(en ? "en-GB" : "nb-NO", { maximumFractionDigits: 2 });
  return (
    <dialog
      ref={ref}
      className="integration-device-dialog"
      aria-label={
        d ? smartiName(d.name) : t("Enhetsinformasjon", "Device information")
      }
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header>
        <Box size={25} />
        <div>
          <span>{t("ENHETEN DIN", "YOUR DEVICE")}</span>
          <h2>
            {d
              ? smartiName(d.name)
              : t("Enhetsinformasjon", "Device information")}
          </h2>
        </div>
        <button aria-label={t("Lukk enhet", "Close device")} onClick={close}>
          <X />
        </button>
      </header>
      {q.isPending && <p>{t("Henter enheten…", "Loading device…")}</p>}
      {q.isError && (
        <p role="alert">
          {t("Enheten kunne ikke hentes.", "Could not load device.")}{" "}
          <button onClick={() => q.refetch()}>
            {t("Prøv igjen", "Retry")}
          </button>
        </p>
      )}
      {d && (
        <>
          <div className="tabs">
            <button
              aria-pressed={tab === "overview"}
              onClick={() => setTab("overview")}
            >
              {t("Oversikt & styring", "Overview & controls")}
            </button>
            <button
              aria-pressed={tab === "history"}
              onClick={() => setTab("history")}
            >
              <ChartNoAxesCombined size={17} />
              {t("Statistikk", "Statistics")}
            </button>
          </div>
          {!d.connected && (
            <p className="notice">
              {t(
                "Frakoblet. Tidligere data kan være utdaterte.",
                "Disconnected. Previous readings may be stale.",
              )}
            </p>
          )}
          {tab === "overview" ? (
            <>
              <dl className="integration-device-facts">
                {[
                  [t("Produsent", "Manufacturer"), d.manufacturer],
                  [t("Modell", "Model"), d.model],
                  [t("Rom", "Room"), d.area],
                  [t("Programvare", "Firmware"), d.firmware],
                  [t("Maskinvare", "Hardware"), d.hardware],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value ? smartiName(value) : "—"}</dd>
                  </div>
                ))}
              </dl>
              <h3>{t("Kontroller & målinger", "Controls & readings")}</h3>
              {d.controls.length ? (
                d.controls.map((c) => (
                  <DeviceControl
                    key={c.id}
                    c={{ ...c, name: smartiName(c.name) }}
                    no={!en}
                    disabled={!d.connected}
                    refresh={() => void q.refetch()}
                  />
                ))
              ) : (
                <p>
                  {t(
                    "Ingen støttede kontroller eller målinger på denne enheten.",
                    "No supported controls or readings on this device.",
                  )}
                </p>
              )}
            </>
          ) : (
            <section className="integration-history">
              {sensor ? (
                <>
                  <div className="history-selectors">
                    <label>
                      {t("Målepunkt", "Sensor")}
                      <select
                        aria-label={t("Målepunkt", "Sensor")}
                        value={sensor.entity_id}
                        onChange={(e) => choose(e.target.value)}
                      >
                        {sensors.map((c) => (
                          <option key={c.entity_id} value={c.entity_id}>
                            {smartiName(c.name)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t("Periode", "Period")}
                      <select
                        aria-label={t("Periode", "Period")}
                        value={hours}
                        onChange={(e) => setHours(Number(e.target.value))}
                      >
                        <option value={24}>
                          {t("Siste døgn", "Last 24 hours")}
                        </option>
                        <option value={168}>
                          {t("Siste 7 dager", "Last 7 days")}
                        </option>
                      </select>
                    </label>
                  </div>
                  {history.isFetching && (
                    <p>{t("Henter historikk…", "Loading history…")}</p>
                  )}
                  {history.isError && (
                    <p role="alert">
                      {t(
                        "Historikk kunne ikke hentes.",
                        "History could not be loaded.",
                      )}{" "}
                      <button onClick={() => history.refetch()}>
                        {t("Prøv igjen", "Retry")}
                      </button>
                    </p>
                  )}
                  {d.connected &&
                    !history.isFetching &&
                    !history.isError &&
                    data &&
                    (values.length ? (
                      <>
                        <div className="history-extremes">
                          <span>
                            {t("Laveste måling", "Lowest reading")}
                            <strong>
                              {number(data.minimum)} {data.unit}
                            </strong>
                          </span>
                          <span>
                            {t("Høyeste måling", "Highest reading")}
                            <strong>
                              {number(data.maximum)} {data.unit}
                            </strong>
                          </span>
                        </div>
                        <div className="history-interactive">
                          <div
                            className="history-readout"
                            aria-live="polite"
                            aria-atomic="true"
                          >
                            {active ? (
                              <>
                                <time dateTime={active.time}>
                                  {new Date(active.time).toLocaleString(
                                    en ? "en-GB" : "nb-NO",
                                  )}
                                </time>
                                <strong>
                                  {active.value === null
                                    ? t("Ingen måling", "No reading")
                                    : `${number(active.value)} ${data.unit || ""}`}
                                </strong>
                              </>
                            ) : (
                              <span>
                                {t(
                                  "Pek eller trykk på grafen for å se en måling.",
                                  "Point or tap on the chart to inspect a reading.",
                                )}
                              </span>
                            )}
                          </div>
                          <svg
                            className="device-history-chart"
                            tabIndex={0}
                            onPointerMove={(e) =>
                              inspectAt(e.currentTarget, e.clientX, e.clientY)
                            }
                            onPointerDown={(e) =>
                              inspectAt(e.currentTarget, e.clientX, e.clientY)
                            }
                            onPointerLeave={(e) => {
                              if (e.pointerType === "mouse") inspect(null);
                            }}
                            onFocus={() =>
                              inspect((current) =>
                                current?.points === points
                                  ? current
                                  : { points, index: 0 },
                              )
                            }
                            onBlur={() => inspect(null)}
                            onKeyDown={(e) => {
                              if (
                                ![
                                  "ArrowLeft",
                                  "ArrowRight",
                                  "Home",
                                  "End",
                                ].includes(e.key)
                              )
                                return;
                              e.preventDefault();
                              const index =
                                e.key === "Home"
                                  ? 0
                                  : e.key === "End"
                                    ? points.length - 1
                                    : Math.max(
                                        0,
                                        Math.min(
                                          points.length - 1,
                                          activeIndex +
                                            (e.key === "ArrowRight" ? 1 : -1),
                                        ),
                                      );
                              inspect({ points, index });
                            }}
                            viewBox="0 0 720 200"
                            role="img"
                            aria-label={t(
                              "Målehistorikk med hull ved ukjente verdier",
                              "Reading history with gaps for unknown values",
                            )}
                          >
                            <text x="4" y="25">
                              {number(hi)}
                            </text>
                            <text x="4" y="156">
                              {number(lo)}
                            </text>
                            <path d="M40 165H690" className="history-axis" />
                            <path d={path} />
                            {points.map((p, i) =>
                              p.value === null ? null : (
                                <circle
                                  key={i}
                                  cx={
                                    40 +
                                    ((Date.parse(p.time) - start) /
                                      (end - start || 1)) *
                                      640
                                  }
                                  cy={
                                    155 -
                                    ((p.value - lo) / (hi - lo || 1)) * 120
                                  }
                                  r="2"
                                >
                                  <title>
                                    {new Date(p.time).toLocaleString(
                                      en ? "en-GB" : "nb-NO",
                                    )}
                                    : {p.value} {data.unit}
                                  </title>
                                </circle>
                              ),
                            )}
                            {active && (
                              <g
                                className="history-inspection"
                                aria-hidden="true"
                              >
                                <line
                                  x1={activeX}
                                  x2={activeX}
                                  y1="20"
                                  y2="165"
                                />
                                {active.value !== null && (
                                  <circle
                                    cx={activeX}
                                    cy={
                                      155 -
                                      ((active.value - lo) / (hi - lo || 1)) *
                                        120
                                    }
                                    r="5"
                                  />
                                )}
                              </g>
                            )}
                            <text x="40" y="190">
                              {new Date(start).toLocaleDateString()}
                            </text>
                            <text x="610" y="190">
                              {new Date(end).toLocaleDateString()}
                            </text>
                          </svg>
                        </div>
                        <p>
                          {t(
                            "Registrerte målinger, ikke beregnet forbruk. Ukjente verdier gir hull i grafen.",
                            "Recorded readings, not calculated consumption. Unknown values leave gaps in the chart.",
                          )}
                        </p>
                      </>
                    ) : (
                      <p>
                        {points.length
                          ? t(
                              "Tilstandshistorikk vises nedenfor.",
                              "State history is shown below.",
                            )
                          : t(
                              "Ingen registrert historikk i perioden. Målepunktet må være med i systemets historikk.",
                              "No recorded history in this period. This sensor must be included in system history.",
                            )}
                      </p>
                    ))}
                  {!!points.length && d.connected && (
                    <details>
                      <summary>
                        {t("Se registrerte verdier", "View recorded values")} (
                        {data?.samples})
                      </summary>
                      <div className="history-table">
                        <table>
                          <thead>
                            <tr>
                              <th>{t("Tid", "Time")}</th>
                              <th>{t("Verdi", "Value")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {points
                              .slice()
                              .reverse()
                              .map((p, i) => (
                                <tr key={i}>
                                  <td>
                                    {new Date(p.time).toLocaleString(
                                      en ? "en-GB" : "nb-NO",
                                    )}
                                  </td>
                                  <td>
                                    {p.state} {data?.unit}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                      <small>
                        {t(
                          "Opptil 300 punkter vises.",
                          "Up to 300 points are shown.",
                        )}
                      </small>
                    </details>
                  )}
                </>
              ) : (
                <p>
                  {t(
                    "Denne enheten har ingen sensorer med tilgjengelig historikkvalg.",
                    "This device has no sensors to select for history.",
                  )}
                </p>
              )}
            </section>
          )}
        </>
      )}
    </dialog>
  );
}
