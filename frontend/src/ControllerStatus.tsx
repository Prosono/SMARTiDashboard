import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

type Controller = {
  id: string;
  name: string;
  state: string;
  ready: boolean;
  connected: boolean;
  raw_state: string | number | null;
  client_state: string;
  driver_version?: string;
  server_version?: string;
};
export function ControllerStatus({
  lang,
  changed,
}: {
  lang: string;
  changed: () => void;
}) {
  const no = lang !== "en";
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const status = useQuery({
    queryKey: ["controllers"],
    queryFn: () => api<Controller[]>("setup/controllers"),
    refetchInterval: 3000,
    retry: false,
  });
  const names: Record<string, string> = no
    ? {
        idle: "Ledig",
        smart_start: "SmartStart · klar",
        including: "Inkludering pågår",
        excluding: "Ekskludering pågår",
        busy: "Opptatt med en operasjon",
        unknown: "Ukjent status",
      }
    : {
        idle: "Idle",
        smart_start: "SmartStart · ready",
        including: "Including",
        excluding: "Excluding",
        busy: "Operation in progress",
        unknown: "Unknown status",
      };
  async function stop(id: string) {
    setBusy(true);
    setMessage("");
    try {
      const next = await api<Controller>(
        `setup/controllers/${encodeURIComponent(id)}/stop`,
        "POST",
      );
      setMessage(
        next.ready
          ? no
            ? "Kontrolleren er ledig. Du kan starte ny paring."
            : "Controller is ready for a new pairing."
          : no
            ? "Kontrolleren bekrefter ikke stopp. Se faktisk status og diagnostikk nedenfor."
            : "Controller has not confirmed stopping. See status and diagnostics below.",
      );
    } catch {
      setMessage(
        no
          ? "Kunne ikke bekrefte stopp. Kontroller forbindelsen og diagnostikken nedenfor."
          : "Could not confirm stop. Check the connection and diagnostics below.",
      );
    } finally {
      setBusy(false);
      setConfirm(null);
      await status.refetch();
      changed();
    }
  }
  return (
    <section className="controller-status">
      <h2>{no ? "Z-Wave-kontroller" : "Z-Wave controller"}</h2>
      {status.isPending && (
        <p>{no ? "Henter faktisk status …" : "Reading controller status …"}</p>
      )}
      {status.isError && (
        <p role="alert">
          {no
            ? "Status kunne ikke leses. Kontroller forbindelsen til Home Assistant."
            : "Status could not be read. Check the Home Assistant connection."}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {status.data?.map((c) => (
        <div className="controller-row" key={c.id}>
          <p>
            <strong>{c.name}</strong> ·{" "}
            {c.connected ? names[c.state] : no ? "Frakoblet" : "Disconnected"}
          </p>
          {!c.ready && c.connected && c.state !== "unknown" && (
            <button
              disabled={busy || status.isError}
              onClick={() => setConfirm(c.id)}
            >
              {no
                ? "Stopp aktiv nettverksoperasjon"
                : "Stop active network operation"}
            </button>
          )}
          {confirm === c.id && (
            <div className="protocol-notice">
              <p>
                {no
                  ? "Stoppe inkludering/ekskludering på denne kontrolleren? Dette kan også avbryte paring startet i Home Assistant eller Z-Wave JS UI. Nettverket slettes ikke."
                  : "Stop inclusion/exclusion on this controller? This may interrupt pairing started in Home Assistant or Z-Wave JS UI. The network will not be erased."}
              </p>
              <button disabled={busy} onClick={() => setConfirm(null)}>
                {no ? "Avbryt" : "Cancel"}
              </button>
              <button disabled={busy} onClick={() => void stop(c.id)}>
                {busy
                  ? no
                    ? "Stopper …"
                    : "Stopping …"
                  : no
                    ? "Bekreft stopp"
                    : "Confirm stop"}
              </button>
            </div>
          )}
          <details>
            <summary>
              {no ? "Diagnostikk for support" : "Support diagnostics"}
            </summary>
            <pre>
              {JSON.stringify(
                {
                  controller: c.name,
                  connection: c.client_state,
                  inclusion_state: c.raw_state,
                  driver: c.driver_version,
                  server: c.server_version,
                },
                null,
                2,
              )}
            </pre>
          </details>
        </div>
      ))}
      <button
        disabled={busy || status.isFetching}
        onClick={() => void status.refetch()}
      >
        {no ? "Sjekk kontrollerstatus" : "Check controller status"}
      </button>
    </section>
  );
}
