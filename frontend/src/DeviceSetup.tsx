import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowUpRight,
  Radio,
  Bluetooth,
  LoaderCircle,
} from "lucide-react";
import { api, ApiError } from "./api";

type Provider = {
  id: string;
  status: string;
  entries: { id: string; name: string }[];
  reason: string;
};
type Pairing = {
  operation?: string;
  id: string;
  provider: string;
  status: string;
  expires_at: number;
  radio_open: boolean;
  error?: string;
  dsk?: string;
  grant?: { securityClasses: number[] };
  device_name?: string;
  low_security?: boolean;
};
const copy = {
  nb: {
    back: "Tilbake",
    title: "Koble noe nytt til hjemmet.",
    intro:
      "Velg nettverket enheten skal bruke. Sett deretter enheten i paringsmodus etter produsentens veiledning.",
    start: "Start paring",
    stop: "Stopp paring",
    retry: "Prøv igjen",
    controller: "Z-Wave-kontroller",
    ready: "Klar til å legge til",
    missing: "Ikke tilgjengelig",
    demo: "Demohjem – ingen radio er koblet til.",
    mqtt: "Kontroller at Zigbee2MQTT og MQTT kjører. Base topic i SMARTi-konfigurasjonen må være lik Zigbee2MQTT sitt base topic.",
    zwave:
      "Kontroller at Z-Wave JS-integrasjonen og kontrolleren er tilkoblet Home Assistant.",
    offline:
      "Mistet kontakten. Status kan være utdatert. Ikke start paringen på nytt før du har kontrollert nettverket.",
    error:
      "Handlingen kunne ikke bekreftes. Kontroller forbindelsen før du prøver igjen.",
    busy: "SMARTi har en uavklart paring. Bruk «Stopp paring» og vent på bekreftelsen.",
    controllerBusy:
      "Kontrolleren er fortsatt opptatt. Vent litt og prøv igjen. Hvis dette vedvarer, kontroller paringsstatus i Home Assistant.",
    stopping: "Stopper paringen …",
    stopPending:
      "Stopp er ikke bekreftet ennå. Vi sjekker status automatisk. Du kan forsøke å stoppe igjen når forbindelsen er tilbake.",
    starting: "Starter paring …",
    searching: "Venter på enheten din",
    interviewing: "Leser inn enheten …",
    paired: "Enheten er paret",
    stopped: "Paringen er stoppet",
    failed: "Enheten kunne ikke pares",
    needs_stop: "Paringsstatus er ikke bekreftet",
    security: "Bekreft sikkerheten",
    pin: "Bekreft enhetens PIN",
    searchHint:
      "Hold enheten nær kontrolleren, og aktiver paringsmodus. Batterienheter må ofte holdes våkne mens de legges til.",
    countdown: "Søkevinduet lukkes om",
    seconds: "sekunder",
    closed: "Søkevinduet er lukket.",
    auto: "Søkevinduet er begrenset til to minutter. Ved brudd kan du stoppe paringen her når forbindelsen er tilbake.",
    pairedHint:
      "Home Assistant importerer enheten. Støttede funksjoner dukker opp under Enheter når importen er ferdig.",
    pinLabel: "De fem første sifrene i DSK-koden",
    pinHint:
      "Sammenlign resten av DSK-koden med etiketten på enheten før du bekrefter.",
    confirm: "Bekreft",
    grantHint:
      "Enheten ber om følgende sikkerhetsnivåer. Godkjenn bare dersom du kjenner igjen enheten du legger til.",
    grant: "Godkjenn sikkerhet",
    low: "Z-Wave rapporterer lavere sikkerhet enn forventet. Kontroller enheten i Z-Wave JS før du tar den i bruk.",
    bluetooth: "Bluetooth og andre enheter",
    bluetoothHint:
      "Bluetooth har ikke én felles paringsflyt. Oppsett avhenger av produsent og integrasjon. Denne versjonen har direkte paring for Zigbee2MQTT og Z-Wave JS.",
    levels: [
      "S2 uten autentisering",
      "S2 med autentisering",
      "S2 tilgangskontroll",
      "S0 (eldre sikkerhet)",
    ],
  },
  en: {
    back: "Back",
    title: "Make room for something new.",
    intro:
      "Choose the device's network. Then put the device in pairing mode following its manufacturer's instructions.",
    start: "Start pairing",
    stop: "Stop pairing",
    retry: "Try again",
    controller: "Z-Wave controller",
    ready: "Ready to add",
    missing: "Unavailable",
    demo: "Demo home — no radio is connected.",
    mqtt: "Check that Zigbee2MQTT and MQTT are running. SMARTi's base topic must match the Zigbee2MQTT base topic.",
    zwave:
      "Check that the Z-Wave JS integration and controller are connected to Home Assistant.",
    offline:
      "Connection lost. Status may be outdated. Check the network before starting pairing again.",
    error:
      "The action could not be confirmed. Check the connection before trying again.",
    busy: "SMARTi has an unresolved pairing session. Use Stop pairing and wait for confirmation.",
    controllerBusy:
      "The controller is still busy. Wait and try again. If this persists, check pairing status in Home Assistant.",
    stopping: "Stopping pairing …",
    stopPending:
      "Stop is not confirmed yet. Status is checked automatically. You can retry stopping when the connection returns.",
    starting: "Starting pairing …",
    searching: "Waiting for your device",
    interviewing: "Reading the device …",
    paired: "Device paired",
    stopped: "Pairing stopped",
    failed: "Device could not be paired",
    needs_stop: "Pairing status is unconfirmed",
    security: "Confirm security",
    pin: "Confirm the device PIN",
    searchHint:
      "Keep the device near the controller and activate pairing mode. Battery devices may need to be kept awake during setup.",
    countdown: "Search window closes in",
    seconds: "seconds",
    closed: "The search window is closed.",
    auto: "The search window is limited to two minutes. After a disconnection, stop pairing here once the connection returns.",
    pairedHint:
      "Home Assistant is importing the device. Supported controls appear under Devices when import finishes.",
    pinLabel: "First five digits of the DSK",
    pinHint:
      "Compare the remaining DSK with the label on your device before confirming.",
    confirm: "Confirm",
    grantHint:
      "The device requests these security levels. Only approve if you recognize the device you are adding.",
    grant: "Approve security",
    low: "Z-Wave reports lower security than expected. Check the device in Z-Wave JS before using it.",
    bluetooth: "Bluetooth and other devices",
    bluetoothHint:
      "Bluetooth has no universal pairing flow. Setup depends on the manufacturer and integration. This version supports direct pairing with Zigbee2MQTT and Z-Wave JS.",
    levels: [
      "S2 unauthenticated",
      "S2 authenticated",
      "S2 access control",
      "S0 (legacy security)",
    ],
  },
};

export function DeviceSetup({
  lang,
  onBack,
}: {
  lang: string;
  onBack: () => void;
}) {
  const t = lang === "en" ? copy.en : copy.nb;
  const providers = useQuery({
    queryKey: ["setup-providers"],
    queryFn: () => api<Provider[]>("setup/providers"),
    retry: false,
  });
  const session = useQuery({
    queryKey: ["setup-session"],
    queryFn: () => api<Pairing | null>("setup/session"),
    refetchInterval: 1000,
    retry: false,
  });
  const [entry, setEntry] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const s = session.data;
  useEffect(() => {
    if (s?.status === "stopped" && !s.radio_open) setError("");
  }, [s?.status, s?.radio_open]);
  async function act(path: string, body?: unknown) {
    setBusy(true);
    setStopping(path.endsWith("/stop"));
    setError("");
    try {
      await api(path, "POST", body);
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === "controller_busy"
          ? t.controllerBusy
          : e instanceof ApiError && e.code === "pairing_already_active"
            ? t.busy
            : t.error,
      );
    } finally {
      setPin("");
      await session.refetch();
      setBusy(false);
      setStopping(false);
    }
  }
  return (
    <section className="device-setup">
      <button className="text-button" onClick={onBack}>
        <ArrowLeft size={17} />
        {t.back}
      </button>
      <div className="page-heading">
        <span className="eyebrow">SMARTi</span>
        <h1>{t.title}</h1>
        <p>{t.intro}</p>
      </div>
      {(session.isError || providers.isError) && (
        <p className="form-error" role="alert">
          {t.offline}{" "}
          <button
            className="text-button"
            onClick={() => {
              providers.refetch();
              session.refetch();
            }}
          >
            {t.retry}
          </button>
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {s?.operation === "remove" && s.radio_open && (
        <div className="pairing-progress" role="status">
          <p>
            {lang === "nb"
              ? "En utmelding pågår. Stopp den før du legger til en ny enhet."
              : "Device exclusion is active. Stop it before adding a device."}
          </p>
          <button
            disabled={busy}
            onClick={() => act(`setup/sessions/${s.id}/stop`)}
          >
            {lang === "nb" ? "Stopp utmelding" : "Stop exclusion"}
          </button>
        </div>
      )}
      {s && s.operation !== "remove" && (
        <div className="pairing-progress" aria-live="polite">
          <span className="eyebrow">
            {s.provider === "zigbee2mqtt" ? "Zigbee2MQTT" : "Z-Wave JS"}
          </span>
          <h2>
            {stopping
              ? t.stopping
              : ((t as Record<string, unknown>)[s.status] as string) || t.error}
          </h2>
          {s.status === "searching" && <p>{t.searchHint}</p>}
          {s.status === "paired" && (
            <p>
              {s.device_name && <strong>{s.device_name}. </strong>}
              {t.pairedHint}
            </p>
          )}
          {s.status === "needs_stop" && (
            <p className="form-error">{t.stopPending}</p>
          )}
          {s.low_security && (
            <p className="form-error" role="alert">
              {t.low}
            </p>
          )}
          {s.status === "security" && (
            <>
              <p>{t.grantHint}</p>
              <ul>
                {s.grant?.securityClasses.map((level) => (
                  <li key={level}>{t.levels[level === 7 ? 3 : level]}</li>
                ))}
              </ul>
              <button
                className="primary compact"
                disabled={busy || session.isError}
                onClick={() =>
                  act(`setup/sessions/${s.id}/answer`, { action: "grant" })
                }
              >
                {t.grant}
              </button>
            </>
          )}
          {s.status === "pin" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                act(`setup/sessions/${s.id}/answer`, { action: "pin", pin });
              }}
            >
              <p>{t.pinHint}</p>
              <code className="pairing-dsk">{s.dsk}</code>
              <label>
                {t.pinLabel}
                <input
                  inputMode="numeric"
                  autoComplete="off"
                  type="password"
                  pattern="[0-9]{5}"
                  maxLength={5}
                  required
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                />
              </label>
              <button
                className="primary compact"
                disabled={
                  busy ||
                  session.isError ||
                  !/^\d{5}$/.test(pin) ||
                  Number(pin) > 65535
                }
              >
                {t.confirm}
              </button>
            </form>
          )}
          {s.radio_open ? (
            <>
              <p className="muted">
                {t.countdown}{" "}
                {Math.min(
                  120,
                  Math.max(0, Math.ceil(s.expires_at - now / 1000)),
                )}{" "}
                {t.seconds}.
              </p>
              <button
                className="text-button pairing-stop"
                disabled={busy}
                onClick={() => act(`setup/sessions/${s.id}/stop`)}
              >
                {t.stop}
              </button>
            </>
          ) : (
            <p className="muted">{t.closed}</p>
          )}
        </div>
      )}
      <div className="pairing-providers">
        {providers.isPending && <LoaderCircle aria-label="Loading" />}
        {providers.data?.map((p) => (
          <article key={p.id} className="pairing-provider">
            <Radio size={24} aria-hidden="true" />
            <div>
              <h2>{p.id === "zigbee2mqtt" ? "Zigbee2MQTT" : "Z-Wave JS"}</h2>
              <p className="muted">
                {p.status === "ready"
                  ? t.ready
                  : p.status === "demo"
                    ? t.demo
                    : t.missing}
              </p>
              {p.status === "unavailable" && (
                <p>{p.id === "zigbee2mqtt" ? t.mqtt : t.zwave}</p>
              )}
              {p.id === "zwave_js" && p.entries.length > 1 && (
                <label>
                  {t.controller}
                  <select
                    value={entry}
                    onChange={(e) => setEntry(e.target.value)}
                  >
                    <option value="">—</option>
                    {p.entries.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <button
              className="primary compact"
              disabled={
                busy ||
                session.isPending ||
                session.isError ||
                !!s?.radio_open ||
                p.status !== "ready" ||
                (p.entries.length > 1 && !entry)
              }
              onClick={() =>
                act("setup/sessions", {
                  provider: p.id,
                  entry_id:
                    p.id === "zwave_js"
                      ? p.entries.length === 1
                        ? p.entries[0].id
                        : entry
                      : null,
                })
              }
            >
              {t.start}
              <ArrowUpRight size={17} />
            </button>
          </article>
        ))}
      </div>
      <p className="muted">{t.auto}</p>
      <details className="pairing-other">
        <summary>
          <Bluetooth size={18} />
          {t.bluetooth}
        </summary>
        <p>{t.bluetoothHint}</p>
      </details>
    </section>
  );
}
