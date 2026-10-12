import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

type Status = {
  transport: string;
  online: boolean;
  info_received: boolean;
  devices_received: boolean;
  device_count: number;
  error: string;
};
export function ZigbeeStatus({ lang }: { lang: string }) {
  const no = lang !== "en";
  const status = useQuery({
    queryKey: ["zigbee-connection"],
    queryFn: () => api<Status>("setup/zigbee"),
    retry: false,
    refetchInterval: 10000,
  });
  const data = status.data;
  const ready =
    data?.online && data.info_received && data.devices_received && !data.error;
  return (
    <details className="protocol-note">
      <summary>
        {no ? "Zigbee-forbindelse" : "Zigbee connection"} ·{" "}
        {status.isError
          ? no
            ? "Ukjent"
            : "Unknown"
          : ready
            ? no
              ? "Tilkoblet"
              : "Connected"
            : no
              ? "Ikke bekreftet"
              : "Unconfirmed"}
      </summary>
      {data && (
        <>
          <p>
            {data.transport === "frontend"
              ? no
                ? "Direkte til Zigbee2MQTT-serveren"
                : "Direct to the Zigbee2MQTT server"
              : "Home Assistant / MQTT"}
          </p>
          <p>
            {no ? "Bridge på nett" : "Bridge online"}:{" "}
            {data.online ? (no ? "Ja" : "Yes") : no ? "Nei" : "No"} ·{" "}
            {no ? "Enhetsliste" : "Device list"}:{" "}
            {data.devices_received
              ? data.device_count
              : no
                ? "Ikke mottatt"
                : "Not received"}
          </p>
          {data.error === "frontend_auth_failed" && (
            <p role="alert">
              {no
                ? "Zigbee2MQTT avviste tilgangsnøkkelen. Kontroller zigbee2mqtt_auth_token i SMARTi-konfigurasjonen."
                : "Zigbee2MQTT rejected the token. Check zigbee2mqtt_auth_token in SMARTi configuration."}
            </p>
          )}
          {!ready && (
            <p>
              {data.transport === "frontend"
                ? no
                  ? "Bruk samme serveradresse som i Zigbee2MQTT Proxy, og kontroller at SMARTi-serveren kan nå den."
                  : "Use the same server address as Zigbee2MQTT Proxy and check that the SMARTi server can reach it."
                : no
                  ? "HA må bruke samme MQTT-broker som Zigbee2MQTT, og base topic må samsvare. Ved bruk av Zigbee2MQTT Proxy kan du velge frontend i SMARTi-konfigurasjonen."
                  : "HA must use the same MQTT broker and matching base topic. For Zigbee2MQTT Proxy, you can select frontend in SMARTi configuration."}
            </p>
          )}
        </>
      )}
      {status.isError && (
        <p role="alert">
          {no ? "Kunne ikke hente status." : "Could not read status."}
        </p>
      )}
      <button
        className="secondary"
        disabled={status.isFetching}
        onClick={() => void status.refetch()}
      >
        {status.isFetching
          ? no
            ? "Sjekker …"
            : "Checking …"
          : no
            ? "Sjekk forbindelse"
            : "Check connection"}
      </button>
      <p className="muted">
        {no
          ? "Sjekken åpner ikke paring. Styring av enheter krever fortsatt at enhetene er tilgjengelige i Home Assistant."
          : "This check does not start pairing. Device controls still require the devices to be available in Home Assistant."}
      </p>
    </details>
  );
}
