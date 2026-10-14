import { useRef, useState } from "react";
import { RotateCw } from "lucide-react";
import { api } from "../api";
import { SettingsDialog } from "../home/SettingsDialog";

export function RestartCore({ lang, demo }: { lang: string; demo: boolean }) {
  const no = lang !== "en";
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [state, setState] = useState("");
  const id = useRef("");
  async function restart() {
    if (busy || state) return;
    setBusy(true);
    try {
      const result = await api<{ status: string }>(
        "manage/settings/restart",
        "POST",
        { request_id: id.current, confirm: true },
      );
      setState(result.status === "accepted" ? "accepted" : "unconfirmed");
    } catch {
      setState("unconfirmed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-panel">
      <h3>
        <RotateCw size={20} />
        {no ? "Omstart" : "Restart"}
      </h3>
      <p>
        {no
          ? "Start hjemmesentralens kjernetjeneste på nytt. Styring og automasjoner blir midlertidig utilgjengelige."
          : "Restart the controller's core service. Controls and automations will be temporarily unavailable."}
      </p>
      <button
        disabled={demo}
        onClick={() => {
          if (!state) id.current = crypto.randomUUID();
          setOpen(true);
        }}
      >
        <RotateCw size={17} />
        {no ? "Start hjemmesentralen på nytt" : "Restart controller"}
      </button>
      {demo && (
        <p className="muted">
          {no
            ? "Omstart er ikke tilgjengelig i demo."
            : "Restart is unavailable in demo."}
        </p>
      )}
      {open && (
        <SettingsDialog
          lang={lang}
          title={no ? "Starte hjemmesentralen på nytt?" : "Restart controller?"}
          busy={busy}
          onClose={() => setOpen(false)}
        >
          {!state ? (
            <>
              <p>
                {no
                  ? "Dette starter SMARTi-kjernen på nytt. Det kan ta noen minutter før enheter og automasjoner er tilgjengelige igjen. Selve maskinen og de andre appene fortsetter å kjøre."
                  : "This restarts the SMARTi core. Devices and automations may be unavailable for a few minutes. The host and other apps keep running."}
              </p>
              <div className="app-actions">
                <button disabled={busy} onClick={() => setOpen(false)}>
                  {no ? "Avbryt" : "Cancel"}
                </button>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void restart()}
                >
                  {busy
                    ? no
                      ? "Sender omstart …"
                      : "Sending restart …"
                    : no
                      ? "Bekreft omstart"
                      : "Confirm restart"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p role="status">
                {state === "accepted"
                  ? no
                    ? "Omstartforespørselen er mottatt. Vent til hjemmesentralen er tilgjengelig igjen."
                    : "Restart request accepted. Wait for the controller to become available again."
                  : no
                    ? "Omstart kunne ikke bekreftes. Forbindelsen kan ha blitt brutt under omstart. Vent noen minutter og kontroller systemstatus før du forsøker igjen."
                    : "Restart could not be confirmed. The connection may have dropped during restart. Wait a few minutes and check system status before retrying."}
              </p>
              <button onClick={() => window.location.reload()}>
                {no ? "Last SMARTi inn på nytt" : "Reload SMARTi"}
              </button>
            </>
          )}
        </SettingsDialog>
      )}
    </section>
  );
}
