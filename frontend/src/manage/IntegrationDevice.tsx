import { controlState } from "../controlState";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Box, ChartNoAxesCombined } from "lucide-react";
import { api } from "../api";
import { smartiName } from "../branding";
import { DeviceControl } from "../DeviceDetails";
import {
  HistoryPeriodSelect,
  HistoryResult,
  type HistoryData,
  type HistoryPeriodHours,
} from "../ControlHistory";
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
    [hours, setHours] = useState<HistoryPeriodHours>("24"),
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
      api<HistoryData>(
        `manage/device/${encodeURIComponent(id)}/history?${new URLSearchParams({ entity_id: sensor!.entity_id, hours })}`,
      ),
    enabled: tab === "history" && !!sensor && !!d?.connected,
    staleTime: 60000,
    retry: false,
  });
  const data = history.data;
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
            <section className="control-history integration-history">
              {sensor ? (
                <>
                  <div className="control-history-filters">
                    <label>
                      {t("Målepunkt", "Sensor")}
                      <select
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
                    <HistoryPeriodSelect
                      value={hours}
                      onChange={setHours}
                      lang={lang}
                      label={t("Periode", "Period")}
                    />
                  </div>
                  {history.isFetching && (
                    <p role="status">
                      {t("Henter historikk…", "Loading history…")}
                    </p>
                  )}
                  {history.isError && (
                    <p role="alert">
                      {t(
                        "Historikk kunne ikke hentes.",
                        "History could not be loaded.",
                      )}{" "}
                      <button onClick={() => void history.refetch()}>
                        {t("Prøv igjen", "Retry")}
                      </button>
                    </p>
                  )}
                  {d.connected &&
                    !history.isFetching &&
                    !history.isError &&
                    data && (
                      <>
                        {data.minimum !== null && data.maximum !== null && (
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
                        )}
                        <HistoryResult
                          key={`${sensor.entity_id}:${hours}`}
                          data={data}
                          control={sensor}
                          lang={lang}
                        />
                        {!!data.points.length && (
                          <details className="integration-history-values">
                            <summary>
                              {t(
                                "Se registrerte verdier",
                                "View recorded values",
                              )}{" "}
                              ({data.points.length})
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
                                  {data.points
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
                                          {p.value === null
                                            ? controlState(
                                                sensor,
                                                p.state,
                                                lang,
                                              )
                                            : `${number(p.value)}${data.unit ? ` ${data.unit}` : ""}`}
                                        </td>
                                      </tr>
                                    ))}
                                </tbody>
                              </table>
                            </div>
                          </details>
                        )}
                      </>
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
