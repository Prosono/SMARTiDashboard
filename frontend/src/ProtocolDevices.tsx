import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Radio,
  Signal,
  WifiOff,
  Moon,
  CircleHelp,
  Trash2,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { api } from "./api";
import { DeviceDetails, DevicePicture } from "./DeviceDetails";

type Device = {
  image_url?: string;
  id: string;
  name: string;
  model?: string;
  manufacturer?: string;
  status: string;
  controller?: boolean;
  controller_name?: string;
  removable: boolean;
  lqi?: number;
  sample_at?: number | null;
};
type Removal = {
  id?: string;
  operation?: string;
  status: string;
  radio_open?: boolean;
  device_name?: string;
  expires_at?: number;
  removed_node_id?: number;
};
export function ProtocolDevices({
  provider,
  lang,
  admin,
}: {
  provider: string;
  lang: "nb" | "en";
  admin: boolean;
}) {
  const no = lang === "nb";
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Device | null>(null);
  const [confirm, setConfirm] = useState<Device | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [result, setResult] = useState<Removal | null>(null);
  const inventory = useQuery({
    queryKey: ["protocol-devices", provider],
    queryFn: () =>
      api<{ status: string; devices: Device[] }>(`devices/${provider}`),
    refetchInterval: 5000,
  });
  const session = useQuery({
    queryKey: ["radio-removal-session"],
    queryFn: () => api<Removal | null>("setup/session"),
    enabled: admin,
    refetchInterval: 1000,
  });
  const active =
    result && !result.id
      ? result
      : session.data?.operation === "remove"
        ? session.data
        : result;
  const locked =
    busy || session.isPending || session.isError || !!session.data?.radio_open;
  const statuses: Record<string, string> = no
    ? {
        online: "Tilkoblet",
        awake: "Våken",
        asleep: "Sover · normalt for batterienheter",
        offline: "Utilgjengelig",
        unknown: "Ukjent status",
      }
    : {
        online: "Connected",
        awake: "Awake",
        asleep: "Sleeping · normal for battery devices",
        offline: "Unavailable",
        unknown: "Unknown status",
      };
  async function remove() {
    if (!confirm) return;
    setBusy(true);
    setError(false);
    setResult(null);
    try {
      setResult(
        await api<Removal>("devices/remove", "POST", {
          provider,
          device_id: confirm.id,
        }),
      );
      setConfirm(null);
      await session.refetch();
      await inventory.refetch();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  async function stop() {
    if (!active?.id) return;
    setBusy(true);
    setError(false);
    try {
      await api(`setup/sessions/${active.id}/stop`, "POST");
      await session.refetch();
      await inventory.refetch();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  const devices = (inventory.data?.devices ?? []).filter((d) =>
    `${d.name} ${d.model ?? ""} ${d.id}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const stale = inventory.isError || inventory.data?.status !== "ready";
  return (
    <section
      className="protocol-devices"
      aria-label={provider === "zigbee2mqtt" ? "Zigbee" : "Z-Wave"}
    >
      <div className="protocol-intro">
        <Radio size={24} />
        <div>
          <h2>{provider === "zigbee2mqtt" ? "Zigbee" : "Z-Wave"}</h2>
          <p>
            {no
              ? "Fysiske enheter på nettverket"
              : "Physical devices on the network"}{" "}
            · {inventory.data?.devices.length ?? "–"}
          </p>
        </div>
      </div>
      <details className="protocol-note">
        <summary>
          {no ? "Om tilkobling og signal" : "About connection and signal"}
        </summary>
        <p>
          {provider === "zigbee2mqtt"
            ? no
              ? "LQI viser sist rapporterte signalkvalitet (0–255, høyere er bedre). Det er ikke en prosent eller garanti for stabil forbindelse. Ukjent status kan bety at tilgjengelighetsrapportering ikke er aktivert i Zigbee2MQTT."
              : "LQI is the last reported link quality (0–255, higher is better), not a percentage or guarantee. Unknown status can mean availability reporting is disabled in Zigbee2MQTT."
            : no
              ? "Status hentes fra Z-Wave JS. En sovende batterienhet er normalt tilkoblet. Signalstyrke rapporteres ikke av denne statusoversikten."
              : "Status comes from Z-Wave JS. Sleeping is normal for battery devices. Signal strength is not reported by this status overview."}
        </p>
      </details>
      {inventory.isPending && (
        <p role="status">{no ? "Henter enheter …" : "Loading devices …"}</p>
      )}
      {!inventory.isPending && stale && (
        <p role="status" className="protocol-notice">
          {inventory.data?.status === "demo"
            ? no
              ? "Demohjemmet har ingen tilkoblede radioer."
              : "The demo home has no connected radios."
            : no
              ? "Kunne ikke hente hele nettverket. Status kan være utdatert. Kontroller integrasjonen og forbindelsen."
              : "Could not load the entire network. Status may be stale. Check the integration and connection."}
        </p>
      )}
      {active && (
        <div className="protocol-notice" role="status">
          <strong>{active.device_name}</strong>
          <p>
            {active.status === "removed"
              ? no
                ? "Enheten er fjernet fra nettverket."
                : "Device removed from the network."
              : active.status === "different_node"
                ? no
                  ? `En annen enhet ble meldt ut (node ${active.removed_node_id}). Den valgte enheten er ikke bekreftet fjernet.`
                  : `A different node was excluded (${active.removed_node_id}). Removal of the selected device is not confirmed.`
                : active.status === "stopped"
                  ? no
                    ? "Utmeldingen er stoppet."
                    : "Exclusion stopped."
                  : active.status === "failed"
                    ? no
                      ? "Enheten kunne ikke meldes ut."
                      : "Exclusion failed."
                    : active.status === "needs_stop"
                      ? no
                        ? "Utmeldingsstatus er ukjent. Stopp når forbindelsen er tilbake."
                        : "Exclusion status is unknown. Stop when the connection returns."
                      : no
                        ? "Aktiver utmeldingsmodus på enheten etter produsentens veiledning. Bare aktiver enheten du vil fjerne. Vinduet lukkes etter to minutter."
                        : "Activate exclusion on the device according to its manual. Only activate the device you want to remove. The window closes after two minutes."}
          </p>
          {active.radio_open && (
            <button disabled={busy} onClick={stop}>
              {no ? "Stopp utmelding" : "Stop exclusion"}
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert">
          {no
            ? "Handlingen kunne ikke bekreftes. Kontroller nettverket og oppdater listen før du prøver igjen."
            : "Action could not be confirmed. Check the network and refresh the list before retrying."}
        </p>
      )}
      <div className="device-toolbar">
        <input
          aria-label={no ? "Søk i nettverket" : "Search network"}
          placeholder={
            no ? "Søk etter navn eller modell" : "Search by name or model"
          }
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          onClick={() => void inventory.refetch()}
          disabled={inventory.isFetching}
        >
          {no ? "Oppdater" : "Refresh"}
        </button>
      </div>
      <div className="protocol-list">
        {devices.map((d) => {
          const status = stale ? "unknown" : d.status;
          const Icon =
            status === "offline"
              ? WifiOff
              : status === "asleep"
                ? Moon
                : ["online", "awake"].includes(status)
                  ? Signal
                  : CircleHelp;
          return (
            <article className="protocol-row" key={d.id}>
              <div className="protocol-device-icon">
                <DevicePicture url={d.image_url} name={d.name} />
              </div>
              <div className="protocol-identity">
                <h3>
                  <button
                    className="device-open"
                    onClick={() => setSelected(d)}
                  >
                    {d.name}
                    <span>{no ? "Se detaljer" : "View details"} →</span>
                  </button>
                </h3>
                <p>
                  {[d.manufacturer, d.model, d.controller_name]
                    .filter(Boolean)
                    .join(" · ") || d.id}
                </p>
                {d.controller && (
                  <span>
                    <ShieldCheck size={14} /> {no ? "Kontroller" : "Controller"}
                  </span>
                )}
              </div>
              <div className={`protocol-health health-${status}`}>
                <span>
                  <Icon size={18} />
                  {statuses[status] || statuses.unknown}
                </span>
                {d.lqi != null && (
                  <small>
                    LQI {d.lqi}/255 ·{" "}
                    {d.sample_at
                      ? `${no ? "mottatt" : "received"} ${new Date(d.sample_at * 1000).toLocaleTimeString(no ? "nb-NO" : "en-GB")}`
                      : no
                        ? "lagret måling, alder ukjent"
                        : "stored reading, age unknown"}
                  </small>
                )}
              </div>
              {admin && !d.controller && (
                <button
                  className="protocol-delete"
                  aria-label={`${no ? "Slett" : "Remove"} ${d.name}`}
                  disabled={locked || stale || !d.removable}
                  onClick={() => {
                    setConfirm(d);
                    setError(false);
                  }}
                >
                  <Trash2 size={18} />
                  <span>{no ? "Slett" : "Remove"}</span>
                </button>
              )}
            </article>
          );
        })}
      </div>
      {!inventory.isPending && !stale && !devices.length && (
        <p className="empty">
          {no
            ? "Ingen enheter å vise. Bruk «Legg til ny enhet» for å åpne veiviseren."
            : "No devices to show. Use “Add new device” to open the wizard."}
        </p>
      )}
      {selected && (
        <DeviceDetails
          provider={provider}
          id={selected.id}
          name={selected.name}
          lang={lang}
          admin={admin}
          close={() => setSelected(null)}
          remove={() => setConfirm(selected)}
        />
      )}
      {confirm && (
        <div
          className="protocol-confirm"
          role="alertdialog"
          aria-modal="false"
          aria-labelledby="remove-title"
        >
          <h3 id="remove-title">
            {no ? "Fjerne" : "Remove"} {confirm.name}?
          </h3>
          <p>
            {provider === "zwave_js"
              ? no
                ? "Dette åpner utmelding på Z-Wave-nettverket. Enheten du aktiverer fysisk blir meldt ut, også om det er en annen enn den valgte. Tilhørende styring og automasjoner kan slutte å virke."
                : "This opens exclusion on the Z-Wave network. The device you physically activate will be excluded, even if it differs from the selected one. Controls and automations may stop working."
              : no
                ? "Enheten fjernes fra Zigbee-nettverket. Tilhørende styring og automasjoner kan slutte å virke. Hold batterienheter våkne til fjerningen er bekreftet."
                : "The device will leave the Zigbee network. Controls and automations may stop working. Keep battery devices awake until removal is confirmed."}
          </p>
          <div>
            <button autoFocus disabled={busy} onClick={() => setConfirm(null)}>
              {no ? "Avbryt" : "Cancel"}
            </button>
            <button className="primary" disabled={locked} onClick={remove}>
              {busy && <LoaderCircle size={16} />}{" "}
              {provider === "zwave_js"
                ? no
                  ? "Start utmelding"
                  : "Start exclusion"
                : no
                  ? "Fjern enheten"
                  : "Remove device"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
