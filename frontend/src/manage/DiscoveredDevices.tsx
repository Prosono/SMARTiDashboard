import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Radar, RefreshCw, ArrowRight } from "lucide-react";
import { api } from "../api";
import { integrationName, smartiName } from "../branding";
import { IntegrationLogo } from "./IntegrationLogo";
import { IntegrationSetup } from "./IntegrationSetup";
import "./discoveries.css";
export type Discovery = {
  id: string;
  domain: string;
  name: string;
  source: string;
};
export function useDiscoveries(enabled = true, attention = false) {
  return useQuery({
    queryKey: [attention ? "integration-attention" : "integration-discoveries"],
    queryFn: () =>
      api<Discovery[]>(
        `manage/integration-setup/${attention ? "attention" : "discoveries"}`,
      ),
    enabled,
    refetchInterval: 15000,
    staleTime: 5000,
  });
}
export function DiscoveredDevices({
  lang,
  attention = false,
}: {
  lang: string;
  attention?: boolean;
}) {
  const en = lang === "en";
  const qc = useQueryClient();
  const [selected, select] = useState<Discovery | null>(null);
  const q = useDiscoveries(true, attention);
  const title = attention
    ? en
      ? "Needs attention"
      : "Trenger oppmerksomhet"
    : en
      ? "Discovered devices"
      : "Oppdagede enheter";
  return (
    <section className="discovery-panel" aria-label={title}>
      <header>
        {attention ? <RefreshCw size={24} /> : <Radar size={24} />}
        <div>
          <h2>
            {title}
            {!!q.data?.length && <span>{q.data.length}</span>}
          </h2>
          <p>
            {attention
              ? en
                ? "Reconnect integrations that need you to sign in again."
                : "Koble til integrasjoner som trenger ny innlogging. Oppsettet åpnes her i SMARTi."
              : en
                ? "Found automatically. Choose a device to finish setup."
                : "Funnet automatisk. Velg en enhet for å fullføre oppsettet."}
          </p>
        </div>
        <button
          className="compact"
          disabled={q.isFetching}
          onClick={() => void q.refetch()}
          aria-label={attention ? (en ? "Refresh requests" : "Oppdater forespørsler") : en ? "Refresh discoveries" : "Oppdater oppdagede enheter"}
        >
          <RefreshCw size={18} />
        </button>
      </header>
      {q.isPending && (
        <p role="status">
          {en ? "Looking for discovered devices …" : "Henter forespørsler …"}
        </p>
      )}
      {q.isError && (
        <p role="alert">
          {en
            ? "Could not retrieve discoveries. Try refreshing."
            : "Kunne ikke hente forespørslene. Prøv å oppdatere."}
        </p>
      )}
      {!q.isError && q.data?.length === 0 && (
        <p className="discovery-empty">
          {attention
            ? en
              ? "No integrations currently request a new sign-in."
              : "Ingen integrasjoner ber om ny innlogging nå."
            : en
              ? "No new devices found. You can still add an integration manually under Integrations."
              : "Ingen nye enheter funnet. Du kan fortsatt legge til en integrasjon manuelt under Integrasjoner."}
        </p>
      )}
      <div className="discovery-grid">
        {q.data?.map((d) => (
          <article key={d.id}>
            <div className="discovery-logo">
              <IntegrationLogo domain={d.domain} />
            </div>
            <div className="discovery-label">
              <h3>
                {smartiName(
                  d.name === d.domain ? integrationName(d.domain) : d.name,
                )}
              </h3>
              <p>
                {integrationName(d.domain)} ·{" "}
                {d.source === "reauth"
                  ? en
                    ? "Sign-in required"
                    : "Ny innlogging kreves"
                  : d.source === "bluetooth"
                    ? "Bluetooth"
                    : d.source === "usb"
                      ? "USB"
                      : en
                        ? "Automatic discovery"
                        : "Automatisk oppdaget"}
              </p>
            </div>
            <button className="primary compact" onClick={() => select(d)}>
              {attention
                ? en
                  ? "Reconnect"
                  : "Koble til på nytt"
                : en
                  ? "Set up"
                  : "Sett opp"}
              <ArrowRight size={16} />
            </button>
          </article>
        ))}
      </div>
      {selected && (
        <IntegrationSetup
          lang={lang}
          discovery={selected}
          close={() => {
            select(null);
            void q.refetch();
            void qc.invalidateQueries({ queryKey: ["manage", "integrations"] });
          }}
        />
      )}
    </section>
  );
}
