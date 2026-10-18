import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Radar, RefreshCw, ArrowRight } from "lucide-react";
import { api } from "../api";
import { integrationName, smartiName } from "../branding";
import { IntegrationLogo } from "./IntegrationLogo";
import { IntegrationSetup } from "./IntegrationSetup";
import "./discoveries.css";
type Discovery = { id: string; domain: string; name: string; source: string };
export function DiscoveredDevices({ lang }: { lang: string }) {
  const en = lang === "en";
  const qc = useQueryClient();
  const [selected, select] = useState<Discovery | null>(null);
  const q = useQuery({
    queryKey: ["integration-discoveries"],
    queryFn: () => api<Discovery[]>("manage/integration-setup/discoveries"),
    refetchInterval: selected ? false : 15000,
  });
  return (
    <section
      className="discovery-panel"
      aria-label={en ? "Discovered devices" : "Oppdagede enheter"}
    >
      <header>
        <Radar size={24} />
        <div>
          <h2>
            {en ? "Discovered devices" : "Oppdagede enheter"}
            {!!q.data?.length && <span>{q.data.length}</span>}
          </h2>
          <p>
            {en
              ? "Found automatically. Choose a device to finish setup."
              : "Funnet automatisk. Velg en enhet for å fullføre oppsettet."}
          </p>
        </div>
        <button
          className="compact"
          disabled={q.isFetching}
          onClick={() => void q.refetch()}
          aria-label={en ? "Refresh discoveries" : "Oppdater oppdagede enheter"}
        >
          <RefreshCw size={18} />
        </button>
      </header>
      {q.isPending && (
        <p role="status">
          {en
            ? "Looking for discovered devices …"
            : "Henter oppdagede enheter …"}
        </p>
      )}
      {q.isError && (
        <p role="alert">
          {en
            ? "Could not retrieve discoveries. Try refreshing."
            : "Kunne ikke hente oppdagede enheter. Prøv å oppdatere."}
        </p>
      )}
      {!q.isError && q.data?.length === 0 && (
        <p className="discovery-empty">
          {en
            ? "No new devices found. You can still add an integration manually below."
            : "Ingen nye enheter funnet. Du kan fortsatt legge til en integrasjon manuelt nedenfor."}
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
                {d.source === "bluetooth"
                  ? "Bluetooth"
                  : d.source === "usb"
                    ? "USB"
                    : en
                      ? "Automatic discovery"
                      : "Automatisk oppdaget"}
              </p>
            </div>
            <button className="primary compact" onClick={() => select(d)}>
              {en ? "Set up" : "Sett opp"}
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
