import { ProtocolLogo } from "./ProtocolLogo";
import "./deviceSetup.css";
import { PairingFinish, type PairedDevice } from "./PairingFinish";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  LoaderCircle,
  Lightbulb,
  BookOpen,
} from "lucide-react";
import { api, ApiError } from "./api";
import { WirelessDevices } from "./WirelessDevices";

type Provider = {
  id: string;
  status: string;
  entries: { id: string; name: string }[];
  reason: string;
  transport?: string;
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
  device_id?: string;
  setup_completed?: boolean;
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
    frontend:
      "Kontroller Zigbee2MQTT-serverens adresse og eventuell tilgangsnøkkel i SMARTi-konfigurasjonen. Bruk samme server som Zigbee2MQTT Proxy.",
    mqtt: "Kontroller at Zigbee2MQTT og MQTT kjører. Base topic i SMARTi-konfigurasjonen må være lik Zigbee2MQTT sitt base topic.",
    zwave:
      "Kontroller at Z-Wave JS-integrasjonen og kontrolleren er tilkoblet SMARTi.",
    offline:
      "Mistet kontakten. Status kan være utdatert. Ikke start paringen på nytt før du har kontrollert nettverket.",
    error:
      "Handlingen kunne ikke bekreftes. Kontroller forbindelsen før du prøver igjen.",
    busy: "SMARTi har en uavklart paring. Bruk «Stopp paring» og vent på bekreftelsen.",
    controllerBusy:
      "Kontrolleren er fortsatt opptatt. Vent litt og prøv igjen. Se kontrollerstatus under Enheter → Z-Wave hvis dette vedvarer.",
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
    pairedHint:
      "SMARTi importerer enheten. Støttede funksjoner dukker opp under Enheter når importen er ferdig.",
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
    frontend:
      "Check the Zigbee2MQTT server address and optional access token in SMARTi configuration. Use the same server as Zigbee2MQTT Proxy.",
    mqtt: "Check that Zigbee2MQTT and MQTT are running. SMARTi's base topic must match the Zigbee2MQTT base topic.",
    zwave:
      "Check that the Z-Wave JS integration and controller are connected to SMARTi.",
    offline:
      "Connection lost. Status may be outdated. Check the network before starting pairing again.",
    error:
      "The action could not be confirmed. Check the connection before trying again.",
    busy: "SMARTi has an unresolved pairing session. Use Stop pairing and wait for confirmation.",
    controllerBusy:
      "The controller is still busy. Wait and try again. If this persists, check pairing status in SMARTi.",
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
    pairedHint:
      "SMARTi is importing the device. Supported controls appear under Devices when import finishes.",
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
  onPaired,
}: {
  lang: string;
  onBack: () => void;
  onPaired: (device: PairedDevice) => void;
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
      await api<Pairing>(path, "POST", body);
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === "controller_busy"
          ? t.controllerBusy
          : e instanceof ApiError && e.code === "controller_disconnected"
            ? t.offline
            : e instanceof ApiError && e.code === "controller_state_unknown"
              ? lang === "en"
                ? "Unknown controller state. See support diagnostics below."
                : "Ukjent kontrollerstatus. Se diagnostikken nedenfor."
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
      {s?.status === "paired" &&
        !s.setup_completed &&
        s.operation !== "remove" && (
          <PairingFinish
            key={s.id}
            session={s}
            lang={lang}
            done={onPaired}
            close={onBack}
          />
        )}

      <button className="text-button" onClick={onBack}>
        <ArrowLeft size={17} />
        {t.back}
      </button>
      <div className="page-heading setup-hero">
        <img
          className="setup-hero-art"
          src={new URL("brand/setup-devices.png", document.baseURI).href}
          alt=""
        />
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
      {(!s || s.setup_completed) && (
        <div className="setup-welcome">
          <span className="setup-welcome-icon">
            <Lightbulb />
          </span>
          <div>
            <span className="eyebrow">
              {lang === "en" ? "Get started" : "Kom i gang"}
            </span>
            <h2>
              {lang === "en"
                ? "A smarter home starts here."
                : "Et smartere hjem starter her."}
            </h2>
            <p>
              {lang === "en"
                ? "Choose a connection below. After pairing, give your device a name and choose its room."
                : "Velg tilkobling nedenfor. Etter paring gir du enheten et navn og velger hvilket rom den hører til."}
            </p>
          </div>
          <aside>
            <BookOpen size={20} />
            <strong>Tips</strong>
            <p>
              {lang === "en"
                ? "Keep the device nearby and follow the manufacturer's pairing instructions."
                : "Ha enheten i nærheten og følg produsentens veiledning for å sette den i paringsmodus."}
            </p>
          </aside>
        </div>
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
      {s && !s.setup_completed && s.operation !== "remove" && (
        <div
          className="pairing-progress"
          data-status={s.status}
          aria-live="polite"
        >
          <div className="pairing-status-icon" aria-hidden="true">
            {s.status === "paired" ? (
              <CheckCircle2 />
            ) : (
              <LoaderCircle className={s.radio_open ? "spin" : ""} />
            )}
          </div>
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
      <div className="setup-section-heading">
        <h2>{lang === "en" ? "Add devices" : "Legg til enheter"}</h2>
        <span>
          {lang === "en"
            ? "Look for the symbol on the device"
            : "Se etter symbolet på enheten"}
        </span>
      </div>
      <div className="pairing-providers">
        {providers.isPending && <LoaderCircle aria-label="Loading" />}
        {providers.data?.map((p) => (
          <article key={p.id} className="pairing-provider" data-protocol={p.id}>
            <div className="setup-protocol-brand">
              <ProtocolLogo provider={p.id} />
            </div>
            <div>
              <h2>{p.id === "zigbee2mqtt" ? "Zigbee2MQTT" : "Z-Wave JS"}</h2>
              <span
                className="setup-provider-state"
                data-ready={p.status === "ready"}
              >
                <i />
                {p.status === "ready"
                  ? t.ready
                  : p.status === "demo"
                    ? t.demo
                    : t.missing}
              </span>
              <p className="muted">
                {p.id === "zigbee2mqtt"
                  ? lang === "en"
                    ? "Connect lights, sensors and switches to your Zigbee network."
                    : "Koble lys, sensorer og brytere til Zigbee-nettverket ditt."
                  : lang === "en"
                    ? "Add devices securely through your Z-Wave controller."
                    : "Legg til enheter trygt gjennom Z-Wave-kontrolleren din."}
              </p>
              {p.status === "unavailable" && (
                <p>
                  {p.id === "zigbee2mqtt"
                    ? p.transport === "frontend"
                      ? t.frontend
                      : t.mqtt
                    : t.zwave}
                </p>
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
      <WirelessDevices lang={lang} />
    </section>
  );
}
