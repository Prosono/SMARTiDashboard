import { useEffect, useState } from "react";
import { Check, CircleAlert } from "lucide-react";
import { api } from "../api";
import { SettingsDialog } from "../home/SettingsDialog";
import "./updateProgress.css";

export function UpdateProgress({
  lang,
  slug,
  target,
  started,
  sending,
  onClose,
}: {
  lang: string;
  slug: string;
  target: string;
  started: number;
  sending: boolean;
  onClose: () => void;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const [phase, setPhase] = useState<
    "waiting" | "restarting" | "done" | "unconfirmed"
  >("waiting");
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function check() {
      let finished = false;
      try {
        const info = await api<{
          slug: string;
          version: string;
          state: string;
        }>(
          "manage/apps/self-update",
          "GET",
          undefined,
          AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
        );
        if (disposed) return;
        if (
          info.slug === slug &&
          info.version === target &&
          info.state === "started"
        ) {
          setPhase("done");
          finished = true;
        }
      } catch {
        if (disposed) return;
        setPhase("restarting");
      }
      if (disposed || finished) return;
      if (Date.now() - started > 10 * 60 * 1000) setPhase("unconfirmed");
      else timer = setTimeout(check, 4000);
    }
    timer = setTimeout(check, 2000);
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [slug, target, started]);
  const done = phase === "done",
    uncertain = phase === "unconfirmed";
  return (
    <SettingsDialog
      lang={lang}
      compact
      title={t("Oppdaterer SMARTi", "Updating SMARTi")}
      onClose={onClose}
    >
      <div className="smarti-update-progress" data-active={!done && !uncertain}>
        <div className="smarti-update-emblem" aria-hidden="true">
          <span className="smarti-update-orbit" />
          {done ? (
            <Check size={56} />
          ) : uncertain ? (
            <CircleAlert size={56} />
          ) : (
            <img src="./brand/smarti-logo.png" alt="" />
          )}
        </div>
        <div role="status" aria-live="polite">
          <h3>
            {done
              ? t("SMARTi er oppdatert", "SMARTi is updated")
              : uncertain
                ? t(
                    "Venter fortsatt på bekreftelse",
                    "Still awaiting confirmation",
                  )
                : sending
                  ? t("Starter oppdateringen …", "Starting the update …")
                  : phase === "restarting"
                    ? t(
                        "Venter på at SMARTi starter igjen …",
                        "Waiting for SMARTi to restart …",
                      )
                    : t("Oppdateringen er underveis …", "Update in progress …")}
          </h3>
          <p>
            {t("Versjon", "Version")} {target}
          </p>
        </div>
        <p>
          {done
            ? t(
                "Den nye versjonen er klar. Last inn appen på nytt for å ta den i bruk.",
                "The new version is ready. Reload the app to start using it.",
              )
            : uncertain
              ? t(
                  "Vi kan ikke bekrefte resultatet ennå. Kontroller status i Home Assistant før du starter en ny oppdatering.",
                  "We cannot confirm the result yet. Check the status in Home Assistant before starting another update.",
                )
              : t(
                  "La huben være koblet til strøm. Forbindelsen kan forsvinne en stund mens appen oppdateres. Vi sjekker automatisk når den er tilbake.",
                  "Keep the hub powered on. The connection may drop while the app updates. We automatically check when it returns.",
                )}
        </p>
        {done ? (
          <button className="primary" onClick={() => window.location.reload()}>
            {t("Åpne oppdatert SMARTi", "Open updated SMARTi")}
          </button>
        ) : (
          <button onClick={onClose}>{t("Lukk visningen", "Close view")}</button>
        )}
        {!done && (
          <small>
            {t(
              "Å lukke visningen avbryter ikke oppdateringen.",
              "Closing this view does not cancel the update.",
            )}
          </small>
        )}
      </div>
    </SettingsDialog>
  );
}
