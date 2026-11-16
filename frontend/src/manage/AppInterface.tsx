import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowUpRight,
  AppWindow,
  House,
  RefreshCw,
} from "lucide-react";
import { api } from "../api";
import { consoleAddress, remoteHome } from "../remoteConsole";
import { words } from "./shared";

type InterfaceInfo = {
  kind: "ingress" | "direct" | null;
  state: string | null;
  address: string | null;
  ingress_path?: string;
};

const interfaceEndpoint = (slug: string) =>
  `manage/apps/${encodeURIComponent(slug)}/interface`;
const assistantPanel = (slug: string) => `/app/${encodeURIComponent(slug)}`;

export function useRemoteAppInterface() {
  return useMutation({
    mutationFn: async (slug: string) => {
      const result = await api<{ url: string }>(
        interfaceEndpoint(slug),
        "POST",
        {},
        AbortSignal.timeout(15_000),
      );
      return consoleAddress(result.url);
    },
  });
}

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
  lang,
  onOpen,
}: {
  slug: string;
  lang: string;
  onOpen: (localPath: string | null) => void;
}) {
  const t = (nb: string, en: string) => words(lang, nb, en);
  const remote = remoteHome();
  const local = window.location.pathname.startsWith("/api/hassio_ingress/");
  const info = useQuery({
    queryKey: ["apps", slug, "interface"],
    queryFn: ({ signal }) =>
      api<InterfaceInfo>(interfaceEndpoint(slug), "GET", undefined, signal),
    retry: false,
  });

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
  const ingressPath = info.data.ingress_path;
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
        <button
          className="primary"
          onClick={() => {
            const path = ingressPath;
            const safePath =
              path &&
              /^\/api\/hassio_ingress\/[A-Za-z0-9_-]+\/[A-Za-z0-9._~/-]*$/.test(
                path,
              ) &&
              !path.split("/").some((part) => part === "." || part === "..");
            onOpen(remote ? null : safePath ? path : assistantPanel(slug));
          }}
        >
          <AppWindow size={18} aria-hidden="true" />
          {label}
        </button>
      )}
    </div>
  );
}

export function AppInterfacePage({
  slug,
  name,
  lang,
  localPath,
  remoteSource,
  pending,
  onReload,
  onBack,
}: {
  slug: string;
  name: string;
  lang: string;
  localPath: string | null;
  remoteSource?: string;
  pending: boolean;
  onReload: () => void;
  onBack: () => void;
}) {
  const t = (nb: string, en: string) => words(lang, nb, en);
  const title = useRef<HTMLHeadingElement>(null);
  const [generation, setGeneration] = useState(0);
  const [useAssistantPanel, setUseAssistantPanel] = useState(false);
  const source = useAssistantPanel
    ? assistantPanel(slug)
    : (localPath ?? remoteSource);
  useEffect(() => {
    title.current?.focus();
  }, []);

  function reload() {
    if (localPath) setGeneration((value) => value + 1);
    else onReload();
  }

  const backLabel = t("Tilbake til apper", "Back to apps");
  const reloadLabel = t("Last inn på nytt", "Reload");
  const assistantLabel = t(
    "Vis via Home Assistant",
    "View through Home Assistant",
  );
  return (
    <section
      className="app-interface-page"
      aria-labelledby="app-interface-title"
    >
      <header className="app-interface-header">
        <button
          type="button"
          className="app-interface-back"
          onClick={onBack}
          aria-label={backLabel}
          title={backLabel}
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <h1 ref={title} tabIndex={-1} id="app-interface-title">
          {name}
        </h1>
        <div className="app-interface-tools">
          {localPath &&
            localPath !== assistantPanel(slug) &&
            !useAssistantPanel && (
              <button
                type="button"
                onClick={() => setUseAssistantPanel(true)}
                aria-label={assistantLabel}
                title={assistantLabel}
              >
                <House size={18} aria-hidden="true" />
              </button>
            )}
          <button
            type="button"
            onClick={reload}
            disabled={pending}
            aria-label={reloadLabel}
            title={reloadLabel}
          >
            <RefreshCw size={18} aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className="app-interface-content">
        {source ? (
          <iframe
            key={generation}
            src={source}
            title={name}
            referrerPolicy="same-origin"
          />
        ) : pending ? (
          <p role="status" className="muted">
            {t("Åpner appen …", "Opening the app …")}
          </p>
        ) : (
          <div className="app-interface-error">
            <p role="alert">
              {t(
                "Kunne ikke åpne appen. Sjekk at den kjører og prøv igjen.",
                "Could not open the app. Check that it’s running and try again.",
              )}
            </p>
            <button type="button" onClick={reload}>
              {t("Prøv igjen", "Retry")}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
