import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, AppWindow, RefreshCw } from "lucide-react";
import { api } from "../api";
import { SettingsDialog } from "../home/SettingsDialog";
import { consoleAddress, remoteHome } from "../remoteConsole";
import { words } from "./shared";

type InterfaceInfo = {
  kind: "ingress" | "direct" | null;
  state: string | null;
  address: string | null;
};

function localAddress(address: string | null) {
  if (!address) return null;
  try {
    const url = new URL(address.replace("[HOST]", window.location.hostname));
    if (
      ["http:", "https:"].includes(url.protocol) &&
      url.hostname === window.location.hostname &&
      !url.username &&
      !url.password
    )
      return url.href;
  } catch {
    // Supervisor's web UI URL can be invalid when a port is disabled.
  }
  return null;
}

export function AppInterface({
  slug,
  name,
  lang,
}: {
  slug: string;
  name: string;
  lang: string;
}) {
  const t = (nb: string, en: string) => words(lang, nb, en);
  const remote = remoteHome();
  const local = window.location.pathname.startsWith("/api/hassio_ingress/");
  const endpoint = `manage/apps/${encodeURIComponent(slug)}/interface`;
  const info = useQuery({
    queryKey: ["apps", slug, "interface"],
    queryFn: ({ signal }) =>
      api<InterfaceInfo>(endpoint, "GET", undefined, signal),
    retry: false,
  });
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const [generation, setGeneration] = useState(0);

  async function launch() {
    setOpen(true);
    setFailed(false);
    setGeneration((value) => value + 1);
    if (local) {
      setSource(`/app/${encodeURIComponent(slug)}`);
      return;
    }
    setSource(null);
    setPending(true);
    try {
      const result = await api<{ url: string }>(
        endpoint,
        "POST",
        {},
        AbortSignal.timeout(15_000),
      );
      setSource(consoleAddress(result.url));
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  if (info.isError)
    return (
      <div className="app-interface-access">
        <span role="status">
          {t(
            "Kunne ikke sjekke appgrensesnittet.",
            "Could not check the app interface.",
          )}
        </span>
        <button onClick={() => void info.refetch()}>
          {t("Prøv igjen", "Retry")}
        </button>
      </div>
    );
  if (!info.data?.kind) return null;
  if (info.data.state !== "started")
    return (
      <p className="muted">
        {t(
          "Start appen for å åpne grensesnittet.",
          "Start the app to open its interface.",
        )}
      </p>
    );

  const label = t("Åpne appgrensesnitt", "Open app interface");
  const address =
    info.data.kind === "direct" && local
      ? localAddress(info.data.address)
      : null;
  const canEmbed = info.data.kind === "ingress" && (local || remote);
  if (!address && !canEmbed)
    return (
      <p className="muted">
        {t(
          "Åpne SMARTi fra hjemmesentralen for å bruke dette appgrensesnittet.",
          "Open SMARTi from your controller to use this app interface.",
        )}
      </p>
    );

  return (
    <div className="app-interface-access">
      {address ? (
        <a href={address} target="_blank" rel="noopener noreferrer">
          <ArrowUpRight size={18} aria-hidden="true" />
          {label}
        </a>
      ) : (
        <button className="primary" onClick={() => void launch()}>
          <AppWindow size={18} aria-hidden="true" />
          {label}
        </button>
      )}
      {open && (
        <SettingsDialog
          lang={lang}
          title={t(`Appgrensesnitt · ${name}`, `App interface · ${name}`)}
          busy={pending}
          onClose={() => setOpen(false)}
        >
          <div className="app-interface-viewer">
            {pending && (
              <p role="status">
                {t("Åpner grensesnittet …", "Opening the interface …")}
              </p>
            )}
            {failed && (
              <p role="alert">
                {t(
                  "Kunne ikke åpne grensesnittet. Sjekk at appen kjører.",
                  "Could not open the interface. Check that the app is running.",
                )}
              </p>
            )}
            {!pending && (
              <div className="app-interface-tools">
                <button onClick={() => void launch()}>
                  <RefreshCw size={16} aria-hidden="true" />
                  {failed
                    ? t("Prøv igjen", "Retry")
                    : t("Last inn på nytt", "Reload")}
                </button>
                {source && (
                  <p className="muted">
                    {t(
                      "Logg inn med Home Assistant-kontoen din hvis du blir bedt om det.",
                      "Sign in with your Home Assistant account if prompted.",
                    )}
                  </p>
                )}
              </div>
            )}
            {source && (
              <iframe
                key={generation}
                src={source}
                title={name}
                referrerPolicy="same-origin"
              />
            )}
          </div>
        </SettingsDialog>
      )}
    </div>
  );
}
