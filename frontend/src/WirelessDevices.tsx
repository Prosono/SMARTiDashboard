import { useRef, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bluetooth, Network, ArrowUpRight, RefreshCw } from "lucide-react";
import { api } from "./api";
import { smartiName } from "./branding";
import { SettingsDialog } from "./home/SettingsDialog";
import { IntegrationSetup } from "./manage/IntegrationSetup";

type Discovery = { id: string; domain: string; name: string };
type MatterStatus = {
  ready: boolean;
  session: { status: string; id: string } | null;
};
export function WirelessDevices({ lang }: { lang: string }) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const qc = useQueryClient();
  const [panel, setPanel] = useState<"bluetooth" | "matter" | null>(null);
  const [integration, setIntegration] = useState<{
    search: string;
    discovery?: Discovery;
    back: "bluetooth" | "matter";
  } | null>(null);
  const [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [newDevice, setNewDevice] = useState(false);
  const attempt = useRef<string | null>(null);
  const bluetooth = useQuery({
    queryKey: ["bluetooth-discovery"],
    queryFn: () =>
      api<{ loaded: boolean; discoveries: Discovery[] }>(
        "manage/integration-setup/bluetooth",
      ),
    enabled: panel === "bluetooth",
    refetchInterval: panel === "bluetooth" ? 5000 : false,
    retry: false,
  });
  const matter = useQuery({
    queryKey: ["matter-setup"],
    queryFn: () => api<MatterStatus>("setup/matter"),
    enabled: panel === "matter",
    refetchInterval: panel === "matter" ? 2000 : false,
    retry: false,
  });
  const phase = matter.data?.session?.status;
  useEffect(() => {
    if (phase === "paired") {
      void qc.invalidateQueries({ queryKey: ["home"] });
    }
  }, [phase, qc]);
  function setup(
    search: string,
    back: "bluetooth" | "matter",
    discovery?: Discovery,
  ) {
    setIntegration({ search, back, discovery });
    setPanel(null);
  }
  return (
    <>
      <div className="pairing-providers">
        <article className="pairing-provider" data-protocol="bluetooth">
          <Bluetooth size={24} />
          <div>
            <h2>Bluetooth</h2>
            <p className="muted">
              {t(
                "Finn enheter via hjemmesentralen eller en Bluetooth-proxy, og fullfør produsentens oppsett.",
                "Discover devices through the controller or a Bluetooth proxy and complete their setup.",
              )}
            </p>
          </div>
          <button
            className="primary compact"
            onClick={() => setPanel("bluetooth")}
          >
            {t("Finn Bluetooth-enheter", "Find Bluetooth devices")}
            <ArrowUpRight size={17} />
          </button>
        </article>
        <article className="pairing-provider" data-protocol="matter">
          <Network size={24} />
          <div>
            <h2>Matter</h2>
            <p className="muted">
              {t(
                "Koble til med Matter-kode, eller få veiledning for en helt ny enhet.",
                "Connect using a Matter code, or get help setting up a brand-new device.",
              )}
            </p>
          </div>
          <button
            className="primary compact"
            onClick={() => {
              setError("");
              setPanel("matter");
            }}
          >
            {t("Legg til Matter-enhet", "Add Matter device")}
            <ArrowUpRight size={17} />
          </button>
        </article>
      </div>
      {panel === "bluetooth" && (
        <SettingsDialog
          lang={lang}
          title={t("Bluetooth-enheter", "Bluetooth devices")}
          onClose={() => setPanel(null)}
        >
          <p>
            {t(
              "Sett enheten i oppsettmodus og hold den nær hjemmesentralen eller en Bluetooth-proxy. Vi viser enheter med et tilgjengelig oppsett, ikke alle Bluetooth-signaler i nærheten.",
              "Put the device into setup mode near your controller or Bluetooth proxy. Devices with an available setup are shown, rather than every nearby Bluetooth signal.",
            )}
          </p>
          {bluetooth.isPending && (
            <p role="status">
              {t("Henter oppdagede enheter …", "Loading discovered devices …")}
            </p>
          )}
          {bluetooth.isError && (
            <p role="alert">
              {t(
                "Kunne ikke hente Bluetooth-status. Dette krever forbindelse til hjemmesentralen og er ikke tilgjengelig i demo.",
                "Could not load Bluetooth status. Requires a connected controller and is unavailable in demo.",
              )}
            </p>
          )}
          {bluetooth.data && !bluetooth.data.loaded && (
            <p>
              {t(
                "Bluetooth er ikke aktivert på hjemmesentralen. Sett opp en støttet adapter eller Bluetooth-proxy først.",
                "Bluetooth is not enabled on the controller. Set up a supported adapter or Bluetooth proxy first.",
              )}
            </p>
          )}
          <div className="integration-catalog">
            {bluetooth.data?.discoveries.map((d) => (
              <button key={d.id} onClick={() => setup("", "bluetooth", d)}>
                <Bluetooth size={20} />
                <span>
                  {smartiName(d.name)}
                  <small>{d.domain.replaceAll("_", " ")}</small>
                </span>
                <ArrowUpRight size={18} />
              </button>
            ))}
          </div>
          {bluetooth.data?.discoveries.length === 0 && (
            <p>
              {t(
                "Ingen nye enheter med tilgjengelig oppsett akkurat nå. Enheten kan allerede være lagt til, være utenfor rekkevidde eller trenge produsentens integrasjon.",
                "No new devices with available setup right now. The device may already be configured, be out of range or require its manufacturer's integration.",
              )}
            </p>
          )}
          <div className="app-actions">
            <button onClick={() => void bluetooth.refetch()}>
              <RefreshCw size={17} />
              {t("Sjekk igjen", "Check again")}
            </button>
            <button onClick={() => setup("", "bluetooth")}>
              {t(
                "Velg produsent eller integrasjon",
                "Choose manufacturer or integration",
              )}
            </button>
            {!bluetooth.data?.loaded && (
              <button onClick={() => setup("bluetooth", "bluetooth")}>
                {t("Sett opp Bluetooth", "Set up Bluetooth")}
              </button>
            )}
          </div>
        </SettingsDialog>
      )}
      {panel === "matter" && (
        <SettingsDialog
          lang={lang}
          busy={busy}
          title={t("Legg til Matter-enhet", "Add Matter device")}
          onClose={() => setPanel(null)}
        >
          <nav
            className="management-tabs"
            aria-label={t("Matter-oppsett", "Matter setup")}
          >
            <button
              className={!newDevice ? "selected" : ""}
              onClick={() => setNewDevice(false)}
            >
              {t("Allerede på nettverket", "Already on the network")}
            </button>
            <button
              className={newDevice ? "selected" : ""}
              onClick={() => setNewDevice(true)}
            >
              {t("Helt ny enhet", "Brand-new device")}
            </button>
          </nav>
          {matter.isPending && (
            <p role="status">{t("Sjekker Matter …", "Checking Matter …")}</p>
          )}
          {matter.isError && (
            <p role="alert">
              {t(
                "Kunne ikke sjekke Matter. Kontroller forbindelsen. Oppsett er ikke tilgjengelig i demo.",
                "Could not check Matter. Check the connection. Setup is unavailable in demo.",
              )}
            </p>
          )}
          {matter.data && !matter.data.ready && (
            <>
              <p>
                {t(
                  "Matter-integrasjonen må være koblet til en kjørende Matter Server først.",
                  "Connect the Matter integration to a running Matter Server first.",
                )}
              </p>
              <button onClick={() => setup("matter", "matter")}>
                {t("Sett opp Matter", "Set up Matter")}
              </button>
            </>
          )}
          {newDevice ? (
            <>
              <p>
                {t(
                  "Førstegangsoppsett bruker telefonens Bluetooth til å gi enheten tilgang til Wi-Fi eller Thread. Denne nettvisningen har ikke tilgang til telefonens Matter-oppsett.",
                  "Initial setup uses the phone's Bluetooth to connect the device to Wi-Fi or Thread. This web view cannot access the phone's Matter commissioning.",
                )}
              </p>
              <ol>
                <li>
                  {t(
                    "Åpne Companion-appen til hjemmesentralen på telefonen.",
                    "Open your controller's Companion app on your phone.",
                  )}
                </li>
                <li>
                  {t(
                    "Velg å legge til en Matter-enhet, og skann QR-koden på enheten.",
                    "Choose to add a Matter device and scan its QR code.",
                  )}
                </li>
                <li>
                  {t(
                    "Gå tilbake til SMARTi. Enheten og støttede kontroller vises under Enheter.",
                    "Return to SMARTi. The device and supported controls appear under Devices.",
                  )}
                </li>
              </ol>
              <p className="muted">
                {t(
                  "Matter over Thread krever en Thread-grenseruter. En Zigbee-kontroller er ikke automatisk en Thread-grenseruter.",
                  "Matter over Thread requires a Thread border router. A Zigbee controller is not automatically a Thread border router.",
                )}
              </p>
            </>
          ) : (
            <form
              className="system-settings-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                attempt.current ??= crypto.randomUUID();
                try {
                  await api("setup/matter", "POST", {
                    request_id: attempt.current,
                    code,
                  });
                  setCode("");
                  await matter.refetch();
                } catch {
                  setError(
                    t(
                      "Forespørselen kunne ikke bekreftes. Sjekk status før du prøver igjen. Kontroller at delingskoden fortsatt er gyldig.",
                      "The request could not be confirmed. Check status before retrying. Check that the sharing code is still valid.",
                    ),
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <p>
                {t(
                  "Har enheten allerede Wi-Fi eller Thread? Åpne deling/paringsmodus i appen som eier enheten, og skriv inn den nye Matter-koden. Hjemmesentralen må kunne nå enheten på lokalnettet.",
                  "Is the device already on Wi-Fi or Thread? Enable sharing/pairing in its current app and enter the new Matter code. The controller must reach it on the local network.",
                )}
              </p>
              <label>
                {t("Matter-kode", "Matter code")}
                <input
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={128}
                  required
                  value={code}
                  disabled={busy || phase === "starting"}
                  placeholder="1234-567-8901"
                  onChange={(e) => {
                    setCode(e.target.value);
                    attempt.current = null;
                  }}
                />
              </label>
              <button
                className="primary compact"
                disabled={
                  busy ||
                  phase === "starting" ||
                  matter.isError ||
                  !matter.data?.ready
                }
              >
                {t("Koble til enheten", "Connect device")}
              </button>
            </form>
          )}
          {error && <p role="alert">{error}</p>}
          {phase && (
            <p role="status">
              {phase === "starting"
                ? t(
                    "Kobler til … Dette kan ta noen minutter. Du kan lukke veiviseren og sjekke status her igjen.",
                    "Connecting … This can take a few minutes. You can close this wizard and check status here again.",
                  )
                : phase === "paired"
                  ? t(
                      "Matter-enheten er koblet til. Støttede funksjoner vises under Enheter.",
                      "Matter device connected. Supported controls appear under Devices.",
                    )
                  : t(
                      "Resultatet er ikke bekreftet. Sjekk om enheten vises under Enheter før du prøver igjen; paring kan fortsatt pågå.",
                      "The result is unconfirmed. Check Devices before trying again; pairing may still be running.",
                    )}
            </p>
          )}
          <button onClick={() => void matter.refetch()}>
            <RefreshCw size={17} />
            {t("Sjekk status", "Check status")}
          </button>
        </SettingsDialog>
      )}
      {integration && (
        <IntegrationSetup
          lang={lang}
          initialSearch={integration.search}
          discovery={integration.discovery}
          close={() => {
            const back = integration.back;
            setIntegration(null);
            setPanel(back);
            void bluetooth.refetch();
            void matter.refetch();
          }}
        />
      )}
    </>
  );
}
