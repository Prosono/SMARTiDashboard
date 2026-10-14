import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Maximize2, RefreshCw } from "lucide-react";
import { api } from "./api";
import { SettingsDialog } from "./home/SettingsDialog";
import "./radioAdvanced.css";

type Target = {
  slug: string;
  name: string;
  available: boolean;
  url: string | null;
  state: string;
};
export function RadioAdvanced({
  provider,
  lang,
}: {
  provider: string;
  lang: "nb" | "en";
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const no = lang === "nb";
  const ingress = window.location.pathname.startsWith("/api/hassio_ingress/");
  const query = useQuery({
    queryKey: ["radio-ui", provider],
    queryFn: () => api<Target[]>(`manage/apps/radio-ui/${provider}`),
    enabled: open && ingress,
    retry: false,
    staleTime: 0,
  });
  const target =
    query.data?.find((t) => t.slug === selected) ??
    (query.data?.length === 1 ? query.data[0] : undefined);
  const url =
    target?.available &&
    target.url &&
    /^\/api\/hassio_ingress\/[A-Za-z0-9_-]+\/?$/.test(target.url)
      ? target.url
      : null;
  return (
    <>
      <button onClick={() => setOpen(true)}>
        <Maximize2 size={17} />
        {no ? "Avansert modus" : "Advanced mode"}
      </button>
      {open && (
        <SettingsDialog
          lang={lang}
          title={no ? "Avansert modus" : "Advanced mode"}
          onClose={() => {
            setOpen(false);
            setSelected(null);
          }}
        >
          <div className="radio-advanced">
            <p>
              {no
                ? "Originalgrensesnittet for nettverket ditt. Endringer her gjelder direkte på kontrolleren."
                : "Your network's original interface. Changes here apply directly to the controller."}
            </p>
            {!ingress ? (
              <p role="status">
                {no
                  ? "Denne visningen krever at SMARTi åpnes gjennom hjemmesentralens app-tilgang. Eksterne Docker-grensesnitt uten Ingress er foreløpig ikke støttet."
                  : "Open SMARTi through the controller's app access to use this view. External Docker interfaces without Ingress are not supported yet."}
              </p>
            ) : (
              <>
                {query.isPending && (
                  <p role="status">
                    {no
                      ? "Finner kontrollpanelet …"
                      : "Finding control panel …"}
                  </p>
                )}
                {query.isError && (
                  <p role="alert">
                    {no
                      ? "Kunne ikke hente kontrollpanelet. Kontroller forbindelsen og prøv igjen."
                      : "Could not load control panel. Check the connection and try again."}
                  </p>
                )}
                {query.data?.length === 0 && (
                  <p>
                    {no
                      ? "Fant ingen tilhørende app. Zigbee2MQTT (eventuelt Proxy) eller Z-Wave med webgrensesnitt må være installert på hjemmesentralen."
                      : "No matching app found. Install Zigbee2MQTT (or Proxy) or Z-Wave with a web interface on the controller."}
                  </p>
                )}
                {query.data && query.data.length > 1 && (
                  <label>
                    {no ? "Velg kontrollpanel" : "Choose control panel"}
                    <select
                      value={selected ?? ""}
                      onChange={(e) => setSelected(e.target.value)}
                    >
                      <option value="">—</option>
                      {query.data.map((t) => (
                        <option key={t.slug} value={t.slug}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {target && !url && (
                  <p role="status">
                    {no
                      ? "Appen må være startet og ha Ingress-webgrensesnitt aktivert. Dette kan administreres under Apper."
                      : "The app must be running with an Ingress web interface. Manage it under Apps."}
                  </p>
                )}
                <button
                  onClick={() => {
                    void query.refetch();
                    setGeneration((g) => g + 1);
                  }}
                >
                  <RefreshCw size={17} />
                  {no ? "Last inn på nytt" : "Reload"}
                </button>
                {url && (
                  <>
                    <p className="muted">
                      {no
                        ? "Hvis panelet viser en innloggingsfeil, last SMARTi inn på nytt for å fornye tilgangen."
                        : "If the panel shows a login error, reload SMARTi to renew access."}
                    </p>
                    <iframe
                      key={`${url}:${generation}`}
                      src={url.endsWith("/") ? url : url + "/"}
                      title={target?.name ?? "Control panel"}
                      referrerPolicy="same-origin"
                    />
                  </>
                )}
              </>
            )}
          </div>
        </SettingsDialog>
      )}
    </>
  );
}
