import { UpdateProgress } from "./UpdateProgress";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import { words } from "./shared";
import { SettingsDialog } from "../home/SettingsDialog";

type Version = {
  slug: string;
  version: string;
  version_latest: string;
  update_available: boolean;
  checked_at?: number | null;
  check_error?: boolean;
};
export function SelfUpdate({ lang }: { lang: string }) {
  const t = (nb: string, en: string) => words(lang, nb, en);
  const q = useQuery({
    queryKey: ["manage", "self-update"],
    queryFn: () => api<Version>("manage/apps/self-update/check", "POST", {}),
    refetchInterval: 60000,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
  });
  const [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [backup, setBackup] = useState(true),
    [message, setMessage] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    slug: string;
    target: string;
    started: number;
  } | null>(null);
  async function refresh() {
    setBusy(true);
    try {
      await api("manage/apps/reload", "POST", {});
      await q.refetch();
    } catch {
      setMessage(
        t(
          "Kunne ikke se etter oppdateringer. Prøv igjen.",
          "Could not check for updates. Try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  async function install() {
    if (!q.data) return;
    setBusy(true);
    const id = requestId || crypto.randomUUID();
    setRequestId(id);
    setConfirm(false);
    setProgress({
      slug: q.data.slug,
      target: q.data.version_latest,
      started: Date.now(),
    });
    try {
      const result = await api<{ status: string }>(
        "manage/apps/self-update",
        "POST",
        { request_id: id, action: "update", confirm_slug: q.data.slug, backup },
      );
      if (result.status === "failed") {
        setProgress(null);
        setMessage(
          t(
            "Home Assistant avviste oppdateringen. Kontroller oppdateringsstatus og loggen i HA.",
            "Home Assistant rejected the update. Check update status and logs in HA.",
          ),
        );
        return;
      }
      setMessage(
        result.status === "unconfirmed"
          ? t(
              "Resultatet er ikke bekreftet. Kontroller Aktivitet under Apper før du prøver igjen.",
              "Result not confirmed. Check Activity under Apps before retrying.",
            )
          : t(
              "Oppdateringen er sendt til Home Assistant. SMARTi blir midlertidig utilgjengelig. Åpne hjemmet igjen når oppdateringen er ferdig.",
              "Update sent to Home Assistant. SMARTi will temporarily be unavailable. Reopen your home when the update finishes.",
            ),
      );
      setConfirm(false);
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500
      ) {
        setProgress(null);
        setRequestId(null);
        setMessage(
          t(
            "Oppdateringen kunne ikke startes. Kontroller at SMARTis oppdateringsenhet er aktiv i HA, og se etter oppdateringer igjen.",
            "The update could not start. Check that SMARTi's update entity is enabled in HA, then check for updates again.",
          ),
        );
        return;
      }
      setMessage(
        t(
          "Forbindelsen ble brutt eller oppdateringen kunne ikke bekreftes. Den kan fortsatt pågå. Kontroller i Home Assistant før du forsøker igjen.",
          "Connection lost or update unconfirmed. It may still be running. Check Home Assistant before retrying.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="panel">
      <h2>{t("SMARTi-appen", "SMARTi app")}</h2>
      {q.data ? (
        <p>
          {t("Installert", "Installed")}: {q.data.version} ·{" "}
          {t("Nyeste", "Latest")}: {q.data.version_latest || "—"}
        </p>
      ) : (
        <p>
          {q.isError
            ? t(
                "Kunne ikke hente SMARTi-versjonen.",
                "Could not fetch SMARTi version.",
              )
            : t("Henter versjon …", "Loading version …")}
        </p>
      )}
      <p role="status">
        {q.isFetching
          ? t("Ser etter ny versjon …", "Checking for a new version …")
          : q.isError || q.data?.check_error
            ? t(
                "Sjekken kunne ikke fullføres. Versjonsinformasjonen kan være utdatert.",
                "The check could not complete. Version information may be outdated.",
              )
            : q.data?.checked_at
              ? t("Sist sjekket", "Last checked") +
                " " +
                new Date(q.data.checked_at * 1000).toLocaleTimeString(
                  lang === "en" ? "en-GB" : "nb-NO",
                  { hour: "2-digit", minute: "2-digit" },
                )
              : ""}
      </p>
      <small>
        {t(
          "Sjekker automatisk hvert minutt mens denne siden er åpen. Oppdateringer installeres først når du bekrefter.",
          "Checks every minute while this page is open. Updates install only after confirmation.",
        )}
      </small>
      <div className="app-actions">
        <button disabled={busy || q.isFetching} onClick={() => void refresh()}>
          {t("Se etter oppdateringer", "Check for updates")}
        </button>
        {q.data?.update_available && (
          <button
            className="primary compact"
            disabled={busy || !!requestId}
            onClick={() => setConfirm(true)}
          >
            {t("Oppdater SMARTi", "Update SMARTi")}
          </button>
        )}
      </div>
      {message && <p role="status">{message}</p>}
      {progress && (
        <UpdateProgress
          lang={lang}
          {...progress}
          sending={busy}
          onClose={() => setProgress(null)}
        />
      )}
      {confirm && (
        <SettingsDialog
          lang={lang}
          title={t("Oppdater SMARTi?", "Update SMARTi?")}
          busy={busy}
          onClose={() => setConfirm(false)}
        >
          <p>
            {t(
              "SMARTi starter på nytt under oppdateringen. Forbindelsen til appen blir midlertidig brutt. Ikke koble fra strømmen.",
              "SMARTi restarts during the update. The app connection is temporarily interrupted. Keep power connected.",
            )}
          </p>
          <label>
            <input
              type="checkbox"
              checked={backup}
              disabled={busy}
              onChange={(e) => setBackup(e.target.checked)}
            />
            {t("Ta sikkerhetskopi først", "Back up first")}
          </label>
          <button
            className="primary compact"
            disabled={busy}
            onClick={() => void install()}
          >
            {t("Bekreft oppdatering", "Confirm update")}
          </button>
        </SettingsDialog>
      )}
    </article>
  );
}
