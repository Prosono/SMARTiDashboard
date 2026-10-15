import { useEffect, useState } from "react";
import { Bug, ShieldAlert, ArrowRight, RefreshCw, X } from "lucide-react";
import { api } from "../api";
import { SettingsDialog } from "../home/SettingsDialog";
import "./debugging.css";

type Target = { available: boolean; path: string | null };
const frameName = "smarti-underlying-system";
function insideDebugging() {
  let current: Window = window;
  try {
    for (let i = 0; i < 12; i++) {
      if (current.name === frameName) return true;
      if (current === current.parent) break;
      current = current.parent;
    }
  } catch {
    /* A different origin does not expose its frame names. */
  }
  return false;
}
export function Debugging({ lang }: { lang: string }) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const [stage, setStage] = useState<
    "closed" | "warning" | "loading" | "open" | "error"
  >("closed");
  const [target, setTarget] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const [frameError, setFrameError] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const nested = insideDebugging();

  useEffect(() => {
    if (stage !== "loading") return;
    let cancelled = false;
    void api<Target>("manage/debugging/target")
      .then((result) => {
        if (cancelled) return;
        if (!result.available || result.path !== "/config/dashboard") {
          setUnavailable(true);
          setStage("error");
          return;
        }
        setTarget(result.path);
        setFrameError(false);
        setStage("open");
      })
      .catch(() => {
        if (!cancelled) setStage("error");
      });
    return () => {
      cancelled = true;
    };
  }, [stage]);

  function close() {
    setStage("closed");
    setTarget(null);
    setFrameError(false);
    setUnavailable(false);
  }
  return (
    <section className="debugging-panel">
      <span className="eyebrow">
        <Bug size={16} /> Debugging
      </span>
      <h2>{t("Under panseret på SMARTi", "Under the hood of SMARTi")}</h2>
      <p>
        {t(
          "Åpne Home Assistant for avansert feilsøking og administrasjon. Dette er systemets originalgrensesnitt, med innstillinger som påvirker hele hjemmet.",
          "Open Home Assistant for advanced troubleshooting and administration. This is the original system interface, with settings affecting the entire home.",
        )}
      </p>
      <div className="debugging-note">
        <ShieldAlert size={24} />
        <div>
          <strong>
            {t("For erfarne administratorer", "For experienced administrators")}
          </strong>
          <p>
            {t(
              "Endringer utføres direkte i hjemmesentralen. Ta gjerne en sikkerhetskopi før du begynner.",
              "Changes apply directly to your home controller. Consider taking a backup before you begin.",
            )}
          </p>
        </div>
      </div>
      {nested ? (
        <p role="status">
          {t(
            "Du er allerede inne i den underliggende visningen. Gå tilbake til den opprinnelige SMARTi-fanen for å åpne debugging på nytt.",
            "You are already in the underlying interface. Return to the original SMARTi view to reopen debugging.",
          )}
        </p>
      ) : (
        <button className="primary" onClick={() => setStage("warning")}>
          {t(
            "Åpne underliggende operativsystem",
            "Open underlying operating system",
          )}
          <ArrowRight size={18} />
        </button>
      )}
      {stage !== "closed" && (
        <SettingsDialog
          lang={lang}
          title={
            stage === "warning"
              ? t(
                  "Stopp! Les før du fortsetter",
                  "Stop! Read before continuing",
                )
              : t(
                  "Underliggende system · Home Assistant",
                  "Underlying system · Home Assistant",
                )
          }
          compact={stage !== "open"}
          onClose={close}
        >
          {stage === "warning" ? (
            <div className="debugging-warning">
              <ShieldAlert size={40} aria-hidden="true" />
              <h3>
                {t(
                  "Endringer her kan påvirke SMARTi",
                  "Changes here can affect SMARTi",
                )}
              </h3>
              <p>
                {t(
                  "Stopp! Endringer her kan medføre at SMARTi ikke lenger virker som normalt. Hvis du er kjent med Home Assistant og oppsettet rundt SMARTi, kan du fortsette.",
                  "Stop! Changes here may cause SMARTi to stop working normally. If you are familiar with Home Assistant and the SMARTi setup, you may continue.",
                )}
              </p>
              <p>
                {t(
                  "Du åpner Home Assistant inne i SMARTi. Logg inn med Home Assistant-kontoen din hvis du blir bedt om det. En eksisterende innlogging kan brukes automatisk.",
                  "Home Assistant opens inside SMARTi. Sign in with your Home Assistant account if prompted. An existing login may be reused automatically.",
                )}
              </p>
              <div className="debugging-actions">
                <button onClick={close}>{t("Avbryt", "Cancel")}</button>
                <button className="primary" onClick={() => setStage("loading")}>
                  {t(
                    "Jeg forstår – koble meg til",
                    "I understand – connect me",
                  )}
                  <ArrowRight size={17} />
                </button>
              </div>
            </div>
          ) : stage === "loading" ? (
            <p role="status">
              {t("Forbereder tilkoblingen …", "Preparing connection …")}
            </p>
          ) : stage === "error" ? (
            <div className="debugging-warning">
              <p role="alert">
                {unavailable
                  ? t(
                      "Åpne SMARTi gjennom Home Assistant sin appvisning for å bruke denne funksjonen. Demo og separat Docker-visning har ikke tilgang til det innebygde grensesnittet.",
                      "Open SMARTi through Home Assistant's app view to use this feature. Demo and standalone Docker views do not have access to the embedded interface.",
                    )
                  : t(
                      "Kunne ikke klargjøre visningen. Kontroller tilgangen og prøv igjen.",
                      "Could not prepare the view. Check your access and try again.",
                    )}
              </p>
              {!unavailable && (
                <button onClick={() => setStage("loading")}>
                  {t("Prøv igjen", "Retry")}
                </button>
              )}
            </div>
          ) : (
            <div className="debugging-console">
              <div className="debugging-toolbar">
                <p>
                  {t(
                    "Endringer her gjelder direkte i Home Assistant.",
                    "Changes here apply directly in Home Assistant.",
                  )}
                </p>
                <button
                  onClick={() => {
                    setFrameError(false);
                    setGeneration((g) => g + 1);
                  }}
                >
                  <RefreshCw size={16} />
                  {t("Last inn på nytt", "Reload")}
                </button>
                <button onClick={close}>
                  <X size={16} />
                  {t("Tilbake til SMARTi", "Back to SMARTi")}
                </button>
              </div>
              {frameError && (
                <p role="alert">
                  {t(
                    "Nettleseren kunne ikke vise Home Assistant. Last inn på nytt eller lukk visningen og åpne SMARTi igjen gjennom hjemmesentralen.",
                    "The browser could not display Home Assistant. Reload, or close this view and reopen SMARTi through the home controller.",
                  )}
                </p>
              )}
              <iframe
                key={generation}
                name={frameName}
                title="Home Assistant"
                src={target!}
                referrerPolicy="same-origin"
                sandbox="allow-scripts allow-same-origin allow-forms allow-downloads"
                onError={() => setFrameError(true)}
                onLoad={(event) => {
                  try {
                    const url =
                      event.currentTarget.contentWindow?.location.href;
                    if (!url || !url.startsWith(window.location.origin + "/"))
                      setFrameError(true);
                  } catch {
                    setFrameError(true);
                  }
                }}
              />
              <small>
                {t(
                  "Tom visning? Prøv «Last inn på nytt». Lukk-knappen tar deg alltid tilbake til SMARTi.",
                  "Blank view? Try Reload. The close button returns you to SMARTi.",
                )}
              </small>
            </div>
          )}
        </SettingsDialog>
      )}
    </section>
  );
}
