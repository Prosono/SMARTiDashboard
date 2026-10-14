import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Download, RotateCcw, Plus, ShieldCheck } from "lucide-react";
import { api } from "../api";
import { smartiName } from "../branding";
import { SettingsDialog } from "../home/SettingsDialog";
export type Backup = {
  slug: string;
  name: string;
  date: string;
  size: number;
  type: string;
  protected: boolean;
};
type Operation = {
  request_id: string;
  kind: string;
  status: string;
  created: number;
  job_id?: string;
  progress?: number;
};
type Detail = Backup & {
  homeassistant: unknown;
  addons: { slug: string; name?: string }[];
  folders: string[];
};
function Activity({ item, lang }: { item: Operation; lang: string }) {
  const qc = useQueryClient(),
    en = lang === "en";
  const q = useQuery({
    queryKey: ["backup-activity", item.request_id],
    queryFn: () =>
      api<Operation>(`manage/settings/operations/${item.request_id}`),
    enabled: item.status === "accepted",
    refetchInterval: (q) =>
      q.state.data?.status === "accepted" ? 3000 : false,
  });
  const state = q.data || item;
  useEffect(() => {
    if (state.status === "completed")
      void qc.invalidateQueries({ queryKey: ["settings", "system"] });
  }, [state.status, qc]);
  const labels: Record<string, string> = en
    ? {
        accepted: "In progress",
        completed: "Completed",
        failed: "Failed",
        unconfirmed:
          "Not confirmed — check the controller before starting again",
      }
    : {
        accepted: "Arbeider",
        completed: "Fullført",
        failed: "Mislyktes",
        unconfirmed:
          "Ikke bekreftet – kontroller sentralen før du starter på nytt",
      };
  return (
    <div className="backup-activity" role="status">
      <span>
        {item.kind.startsWith("restore:")
          ? en
            ? "Restore"
            : "Gjenoppretting"
          : en
            ? "New backup"
            : "Ny sikkerhetskopi"}{" "}
        · {new Date(item.created * 1000).toLocaleString(en ? "en-GB" : "nb-NO")}
      </span>
      <strong>
        {q.isError
          ? en
            ? "Connection lost. Completion is not confirmed."
            : "Forbindelsen er brutt. Fullføring er ikke bekreftet."
          : labels[state.status] || state.status}
        {state.status === "accepted" && state.progress != null
          ? ` · ${state.progress}%`
          : ""}
      </strong>
    </div>
  );
}
export function Backups({
  items,
  lang,
}: {
  items: Backup[] | null;
  lang: string;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb),
    qc = useQueryClient();
  const [mode, setMode] = useState<"create" | "restore" | null>(null),
    [selected, setSelected] = useState<Backup | null>(null),
    [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [repeat, setRepeat] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [id, setId] = useState(""),
    [sent, setSent] = useState(false);
  const activity = useQuery({
    queryKey: ["backup-operations"],
    queryFn: () => api<Operation[]>("manage/settings/operations"),
    refetchInterval: 10000,
    enabled: items !== null,
  });
  const detail = useQuery({
    queryKey: ["backup-detail", selected?.slug],
    queryFn: () =>
      api<Detail>(`manage/settings/backups/${selected!.slug}/info`),
    enabled: mode === "restore" && !!selected,
    retry: false,
  });
  function open(b?: Backup) {
    setSelected(b || null);
    setMode(b ? "restore" : "create");
    setName(`SMARTi ${new Date().toLocaleDateString()}`);
    setPassword("");
    setRepeat("");
    setConfirmed(false);
    setError("");
    setSent(false);
    setId(crypto.randomUUID());
  }
  async function submit() {
    setBusy(true);
    setError("");
    try {
      await api(
        mode === "create"
          ? "manage/settings/backups"
          : `manage/settings/backups/${selected!.slug}/restore`,
        "POST",
        mode === "create"
          ? { request_id: id, name, password }
          : { request_id: id, confirm_slug: selected!.slug, password },
      );
      setSent(true);
      setPassword("");
      setRepeat("");
      await qc.invalidateQueries({ queryKey: ["backup-operations"] });
    } catch {
      setError(
        t(
          "Kunne ikke bekrefte forespørselen. Kontroller aktiviteten før du prøver igjen.",
          "Could not confirm the request. Check activity before retrying.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  const sorted = [...(items || [])].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  return (
    <section className="settings-panel backup-manager">
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            {t("Ta vare på hjemmet", "Protect your home")}
          </span>
          <h2>
            <ShieldCheck size={22} />
            {t("Sikkerhetskopiering", "Backups")}
          </h2>
        </div>
        <button disabled={items === null} onClick={() => open()}>
          <Plus size={18} />
          {t("Ny sikkerhetskopi", "New backup")}
        </button>
      </div>
      <p className="muted">
        {t(
          "Lag en kopi på sentralen. Last den ned og oppbevar den et annet sted, sammen med passordet.",
          "Create a copy on the controller. Download it and keep it elsewhere, together with its password.",
        )}
      </p>
      {items === null ? (
        <p>
          {t(
            "Sikkerhetskopier er utilgjengelige. Kontroller forbindelsen til sentralen.",
            "Backups unavailable. Check the controller connection.",
          )}
        </p>
      ) : sorted.length === 0 ? (
        <div className="backup-empty">
          <Archive />
          <h3>{t("Start med en trygg kopi", "Start with a safe copy")}</h3>
          <p>
            {t(
              "En full kopi tar med innstillinger, apper og data.",
              "A full backup includes settings, apps and data.",
            )}
          </p>
        </div>
      ) : (
        <>
          <p className="backup-summary">
            {t("Siste sikkerhetskopi", "Latest backup")}{" "}
            <strong>
              {new Date(sorted[0].date).toLocaleString(
                lang === "en" ? "en-GB" : "nb-NO",
              )}
            </strong>
          </p>
          <div className="system-backups">
            {sorted.map((b) => (
              <article className="system-list-row" key={b.slug}>
                <Archive size={20} />
                <div className="backup-description">
                  <strong>{smartiName(b.name)}</strong>
                  <small>
                    {new Date(b.date).toLocaleString(
                      lang === "en" ? "en-GB" : "nb-NO",
                    )}{" "}
                    ·{" "}
                    {b.size.toLocaleString(undefined, {
                      maximumFractionDigits: 1,
                    })}{" "}
                    MB
                  </small>
                  <small>
                    {b.type === "full"
                      ? t("Full kopi", "Full backup")
                      : t("Delvis kopi", "Partial backup")}{" "}
                    ·{" "}
                    {b.protected
                      ? t("Passordbeskyttet", "Password protected")
                      : t("Uten passord", "No password")}
                  </small>
                </div>
                <div className="row-actions">
                  <a
                    className="backup-download"
                    href={`api/manage/settings/backups/${encodeURIComponent(b.slug)}/download`}
                    download
                  >
                    <Download size={16} />
                    {t("Last ned", "Download")}
                  </a>
                  <button onClick={() => open(b)}>
                    <RotateCcw size={16} />
                    {t("Gjenopprett", "Restore")}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      {!!activity.data?.length && (
        <details className="backup-history" open>
          <summary>{t("Siste aktivitet", "Recent activity")}</summary>
          {activity.data.map((item) => (
            <Activity key={item.request_id} item={item} lang={lang} />
          ))}
        </details>
      )}
      {activity.isError && (
        <p role="alert">
          {t("Kunne ikke hente aktivitet.", "Could not load activity.")}
        </p>
      )}
      {mode && (
        <SettingsDialog
          lang={lang}
          busy={busy}
          title={
            mode === "create"
              ? t("Ny sikkerhetskopi", "New backup")
              : t("Gjenopprett hjemmet", "Restore your home")
          }
          onClose={() => {
            setMode(null);
            setPassword("");
            setRepeat("");
          }}
        >
          {sent ? (
            <div>
              <h3>{t("Forespørselen er registrert", "Request recorded")}</h3>
              <p>
                {t(
                  "Følg status under Siste aktivitet. Du kan lukke dette vinduet. Gjenoppretting kan bryte forbindelsen og kreve ny innlogging.",
                  "Follow progress in Recent activity. You can close this window. Restoring can disconnect the app and require signing in again.",
                )}
              </p>
              <button onClick={() => setMode(null)}>
                {t("Vis aktivitet", "View activity")}
              </button>
            </div>
          ) : (
            <form
              className="system-settings-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (mode === "create" && password !== repeat) {
                  setError(
                    t("Passordene må være like.", "Passwords must match."),
                  );
                  return;
                }
                void submit();
              }}
            >
              {error && <p role="alert">{error}</p>}
              {mode === "create" ? (
                <>
                  <p>
                    {t(
                      "1. Gi kopien et navn. 2. Velg og ta vare på passordet. 3. Start kopieringen.",
                      "1. Name your backup. 2. Choose and save its password. 3. Start the backup.",
                    )}
                  </p>
                  <label>
                    {t("Navn på kopien", "Backup name")}
                    <input
                      required
                      maxLength={80}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <p>
                    {t(
                      "Full kopi lagres på sentralen. Last den ned etter fullføring for å beskytte deg også mot diskfeil.",
                      "A full copy is stored on the controller. Download it afterwards to protect against disk failure too.",
                    )}
                  </p>
                </>
              ) : (
                <>
                  <h3>{smartiName(selected!.name)}</h3>
                  <p>{new Date(selected!.date).toLocaleString()}</p>
                  {detail.isPending ? (
                    <p>{t("Henter innhold …", "Loading contents …")}</p>
                  ) : detail.isError ? (
                    <p role="alert">
                      {t(
                        "Kunne ikke kontrollere innholdet. Lukk og prøv igjen.",
                        "Could not verify contents. Close and retry.",
                      )}
                    </p>
                  ) : (
                    <>
                      <p>
                        {t(
                          "Dette gjenopprettes fra kopien:",
                          "Restored from this backup:",
                        )}
                      </p>
                      <ul>
                        {!!detail.data?.homeassistant && (
                          <li>
                            SMARTi{" "}
                            {t("kjerne og innstillinger", "core and settings")}
                          </li>
                        )}
                        {detail.data?.addons?.map((a) => (
                          <li key={a.slug}>{smartiName(a.name || a.slug)}</li>
                        ))}
                        {detail.data?.folders?.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                      <p className="notice">
                        {t(
                          "Dagens innstillinger og data for innholdet over erstattes. Sentralen kan starte på nytt. Ta en ny sikkerhetskopi først hvis du vil beholde dagens oppsett.",
                          "Current settings and data for the contents above will be replaced. The controller may restart. Create a new backup first to keep your current setup.",
                        )}
                      </p>
                    </>
                  )}
                </>
              )}
              {(mode === "create" || selected?.protected) && (
                <label>
                  {t("Passord for sikkerhetskopien", "Backup password")}
                  <input
                    type="password"
                    required
                    minLength={mode === "create" ? 12 : 1}
                    maxLength={mode === "create" ? 128 : 256}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
              )}
              {mode === "create" && (
                <label>
                  {t("Gjenta passord", "Repeat password")}
                  <input
                    type="password"
                    required
                    value={repeat}
                    onChange={(e) => setRepeat(e.target.value)}
                  />
                </label>
              )}
              <label className="check-label">
                <input
                  type="checkbox"
                  required
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                {mode === "create"
                  ? t(
                      "Jeg har tatt vare på passordet. Det trengs ved gjenoppretting.",
                      "I have saved the password. It is required for restoration.",
                    )
                  : t(
                      "Jeg vil erstatte innholdet med denne sikkerhetskopien.",
                      "I want to replace the contents with this backup.",
                    )}
              </label>
              <button
                className="primary compact"
                disabled={
                  busy || !confirmed || (mode === "restore" && !detail.data)
                }
              >
                {busy
                  ? t("Sender …", "Sending …")
                  : mode === "create"
                    ? t("Start sikkerhetskopiering", "Start backup")
                    : t("Bekreft gjenoppretting", "Confirm restore")}
              </button>
            </form>
          )}
        </SettingsDialog>
      )}
    </section>
  );
}
