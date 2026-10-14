import { useState } from "react";
import { Plug } from "lucide-react";
import { isSmartiIntegration, integrationName } from "../branding";
export function IntegrationLogo({ domain }: { domain: string }) {
  const [source, setSource] = useState(0);
  if (isSmartiIntegration(domain))
    return <img alt="SMARTi" src="./brand/smarti-logo.png" />;
  if (source > 1 || !/^[a-z0-9_]+$/.test(domain))
    return <Plug size={28} aria-label={integrationName(domain)} />;
  return (
    <img
      alt={integrationName(domain)}
      loading="lazy"
      referrerPolicy="no-referrer"
      src={
        source === 0
          ? `api/manage/integration-brands/${domain}`
          : `https://brands.home-assistant.io/${domain}/icon.png`
      }
      onError={() => setSource((v) => v + 1)}
    />
  );
}
