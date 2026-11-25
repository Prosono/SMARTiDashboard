import { UpdateProgress } from "./UpdateProgress";
import { useEffect, useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CloudDownload, Power, ShieldCheck } from "lucide-react";
import { api, ApiError } from "../api";
import { words } from "./shared";
import { SettingsDialog } from "../home/SettingsDialog";
import { operationId } from "./operationId";
import { matchesUpdateSearch } from "./updateModel";
import "./selfUpdate.css";

type Version = {
  slug: string;
  version: string;
  version_latest: string;
  update_available: boolean;
  checked_at?: number | null;
  check_error?: boolean;
};
export function SelfUpdate({
  lang,
  active = true,
  search = "",
}: {
  lang: string;
  active?: boolean;
  search?: string;
}) {
  const t = (nb: string, en: string) => words(lang, nb, en);
  const qc = useQueryClient();
  const backupLabel = useId();
  const backupDescription = useId();
  const q = useQuery({
    queryKey: ["manage", "self-update"],
    queryFn: () => api<Version>("manage/apps/self-update/check", "POST", {}),
    enabled: active,
    refetchInterval: active ? 60000 : false,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
  });
  useEffect(() => {
    if (q.data)
      void qc.invalidateQueries({ queryKey: ["manage", "self-update-status"] });
  }, [q.data, qc]);
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
    if (!q.data || busy || requestId) return;
    setBusy(true);
    setMessage("");
    let dispatched = false;
    try {
      const id = operationId();
      setRequestId(id);
      setConfirm(false);
      setProgress({
        slug: q.data.slug,
        target: q.data.version_latest,
        started: Date.now(),
      });
      dispatched = true;
      const result = await api<{ status: string }>(
        "manage/apps/self-update",
        "POST",
        { request_id: id, action: "update", confirm_slug: q.data.slug, backup },
      );
      if (result.status === "failed") {
        setProgress(null);
        setRequestId(null);
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
              "Resultatet er ikke bekreftet. Kontroller status i Home Assistant før du prøver igjen.",
              "Result not confirmed. Check the status in Home Assistant before retrying.",
            )
          : t(
              "Oppdateringen er sendt til Home Assistant. SMARTi blir midlertidig utilgjengelig. Åpne hjemmet igjen når oppdateringen er ferdig.",
              "Update sent to Home Assistant. SMARTi will temporarily be unavailable. Reopen your home when the update finishes.",
            ),
      );
      setConfirm(false);
    } catch (error) {
      if (!dispatched) {
        setConfirm(false);
        setProgress(null);
        setRequestId(null);
        setMessage(
          t(
            "Nettleseren kunne ikke klargjøre oppdateringen. Ingen oppdatering ble sendt. Last inn siden på nytt og prøv igjen.",
            "The browser could not prepare the update. No update was sent. Reload the page and try again.",
          ),
        );
        return;
      }
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
  const title = t("SMARTi-appen", "SMARTi app");
  if (
    !busy &&
    !confirm &&
    !progress &&
    !matchesUpdateSearch(search, title, q.data?.version, q.data?.version_latest)
  )
    return null;
  return (
    <article className="panel">
      <h2>{title}</h2>
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
          compact
          title={t("Oppdater SMARTi?", "Update SMARTi?")}
          busy={busy}
          onClose={() => setConfirm(false)}
        >
          <div className="smarti-update-confirmation">
            <dl className="smarti-update-versions">
              <div>
                <dt>{t("Installert", "Installed")}</dt>
                <dd>{q.data?.version || "—"}</dd>
              </div>
              <div>
                <dt>{t("Ny versjon", "New version")}</dt>
                <dd>
                  <ArrowRight size={16} aria-hidden="true" />
                  {q.data?.version_latest || "—"}
                </dd>
              </div>
            </dl>
            <div className="smarti-update-restart">
              <Power size={20} aria-hidden="true" />
              <div>
                <strong>{t("Kort avbrudd", "Brief interruption")}</strong>
                <p>
                  {t(
                    "SMARTi starter på nytt. La huben stå tilkoblet strøm under oppdateringen.",
                    "SMARTi will restart. Keep the hub connected to power during the update.",
                  )}
                </p>
              </div>
            </div>
            <label className="smarti-update-backup">
              <ShieldCheck size={22} aria-hidden="true" />
              <span>
                <strong id={backupLabel}>
                  {t("Ta sikkerhetskopi først", "Back up first")}
                </strong>
                <small id={backupDescription}>
                  {t(
                    "Gir deg et gjenopprettingspunkt.",
                    "Gives you a restore point.",
                  )}
                </small>
              </span>
              <input
                type="checkbox"
                aria-labelledby={backupLabel}
                aria-describedby={backupDescription}
                checked={backup}
                disabled={busy}
                onChange={(event) => setBackup(event.target.checked)}
              />
            </label>
            <div className="smarti-update-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirm(false)}
              >
                {t("Avbryt", "Cancel")}
              </button>
              <button
                type="button"
                className="primary compact"
                disabled={busy || !q.data?.update_available}
                onClick={() => void install()}
              >
                <CloudDownload size={18} aria-hidden="true" />
                {t("Bekreft oppdatering", "Confirm update")}
              </button>
            </div>
          </div>
        </SettingsDialog>
      )}
    </article>
  );
}
