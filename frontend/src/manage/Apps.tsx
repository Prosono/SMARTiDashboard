import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AppWindow,
  Plus,
  RefreshCw,
  Search,
  Play,
  Square,
  RotateCw,
  Download,
  Settings,
  Trash2,
  Library,
  ArrowUpRight,
} from "lucide-react";
import { api, ApiError } from "../api";
import { smartiName } from "../branding";
import { SettingsDialog } from "../home/SettingsDialog";
import "./apps.css";
type AppItem = {
  slug: string;
  name: string;
  description: string;
  installed: boolean;
  version: string | null;
  version_latest: string | null;
  state: string | null;
  repository: string;
  available: boolean | null;
  update_available: boolean;
  system_managed: boolean;
  stage: string;
};
type Action = "install" | "start" | "stop" | "restart" | "update" | "uninstall";
type Operation = {
  request_id: string;
  slug: string;
  name: string;
  action: Action;
  status: string;
  progress?: number;
  created: number;
};
type Config = {
  options: Record<string, unknown>;
  revision: string;
  boot: "auto" | "manual";
  watchdog: boolean;
  auto_update: boolean;
  boot_config: string;
  schema: unknown;
};
const actionNames: Record<Action, [string, string]> = {
  install: ["Installer", "Install"],
  start: ["Start", "Start"],
  stop: ["Stopp", "Stop"],
  restart: ["Start på nytt", "Restart"],
  update: ["Oppdater", "Update"],
  uninstall: ["Avinstaller", "Uninstall"],
};
export function Apps({ lang }: { lang: string }) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const qc = useQueryClient();
  const apps = useQuery({
    queryKey: ["apps"],
    queryFn: () => api<AppItem[]>("manage/apps"),
    retry: false,
    refetchInterval: 15000,
  });
  const activity = useQuery({
    queryKey: ["app-operations"],
    queryFn: () => api<Operation[]>("manage/apps/operations"),
    refetchInterval: 5000,
    retry: false,
  });
  const [tab, setTab] = useState("installed"),
    [search, setSearch] = useState("");
  const [selected, select] = useState<AppItem | null>(null),
    [config, setConfig] = useState(false),
    [repositories, setRepositories] = useState(false);
  const [confirm, setConfirm] = useState<{
    app: AppItem;
    action: Action;
    id: string;
  } | null>(null);
  const [backup, setBackup] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const label = (a: Action) => actionNames[a][lang === "en" ? 1 : 0];
  const status = (v: string) =>
    ({
      accepted: t("Pågår", "In progress"),
      completed: t("Fullført", "Completed"),
      failed: t("Mislyktes", "Failed"),
      unconfirmed: t(
        "Resultat ikke bekreftet – sjekk appens status før du prøver igjen.",
        "Result not confirmed — check the app before trying again.",
      ),
    })[v] || v;
  const pending = (slug: string) =>
    activity.data?.some((o) => o.slug === slug && o.status === "accepted") ??
    false;
  function ask(app: AppItem, action: Action) {
    setError("");
    setBackup(true);
    setConfirm({ app, action, id: crypto.randomUUID() });
  }
  async function perform() {
    if (!confirm) return;
    setBusy(true);
    setError("");
    try {
      await api(
        `manage/apps/${encodeURIComponent(confirm.app.slug)}/actions`,
        "POST",
        {
          request_id: confirm.id,
          action: confirm.action,
          confirm_slug: confirm.app.slug,
          backup,
        },
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["apps"] }),
        qc.invalidateQueries({ queryKey: ["app-operations"] }),
      ]);
      setConfirm(null);
      select(null);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? t(
              "Appen er endret eller en handling pågår. Oppdater oversikten før du prøver igjen.",
              "The app changed or an operation is running. Refresh before retrying.",
            )
          : t(
              "Handlingen kunne ikke bekreftes. Hent ny status før du prøver igjen.",
              "The action could not be confirmed. Refresh status before retrying.",
            ),
      );
    } finally {
      setBusy(false);
    }
  }
  const visible = (apps.data || []).filter(
    (a) =>
      (tab === "installed" ? a.installed : !a.installed) &&
      `${a.name} ${a.description}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section className="apps-page management-page">
      <div className="page-heading">
        <span className="eyebrow">SMARTi</span>
        <div className="heading-row">
          <h1>{t("Apper", "Apps")}</h1>
          <button onClick={() => setRepositories(true)} disabled={apps.isError}>
            <Plus size={18} />
            {t("Appkilder", "Repositories")}
          </button>
        </div>
        <p>
          {t(
            "Utvid hjemmet ditt. Samle og administrer appene på hjemmesentralen.",
            "Expand your home. Manage the apps running on your controller.",
          )}
        </p>
      </div>
      <div className="apps-toolbar">
        <nav
          className="management-tabs"
          aria-label={t("Appvisning", "App view")}
        >
          {[
            ["installed", t("Installerte", "Installed")],
            ["store", t("Appbibliotek", "App library")],
          ].map(([key, name]) => (
            <button
              key={key}
              aria-current={tab === key ? "page" : undefined}
              className={tab === key ? "selected" : ""}
              onClick={() => setTab(key)}
            >
              {key === "installed" ? (
                <AppWindow size={18} />
              ) : (
                <Library size={18} />
              )}{" "}
              {name}
            </button>
          ))}
        </nav>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await api("manage/apps/reload", "POST");
              await apps.refetch();
            } catch {
              setError(
                t(
                  "Kunne ikke oppdatere appbiblioteket.",
                  "Could not refresh the app library.",
                ),
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <RefreshCw size={17} />
          {t("Oppdater oversikt", "Refresh library")}
        </button>
      </div>
      <label className="apps-search">
        <Search size={19} />
        <input
          aria-label={t("Søk etter apper", "Search apps")}
          placeholder={t("Søk etter apper …", "Search apps …")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {error && !confirm && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {apps.isPending && (
        <p role="status">{t("Henter apper …", "Loading apps …")}</p>
      )}
      {apps.isError && (
        <div className="empty">
          <AppWindow size={36} />
          <h2>
            {t(
              "Appadministrasjon er utilgjengelig",
              "App management unavailable",
            )}
          </h2>
          <p>
            {t(
              "Krever SMARTi installert som app på hjemmesentralen og forbindelse til appadministrasjonen. Demo viser ikke oppdiktede apper.",
              "Requires SMARTi installed as an app on a controller with Supervisor access. Demo does not invent apps.",
            )}
          </p>
          <button onClick={() => void apps.refetch()}>
            {t("Prøv igjen", "Retry")}
          </button>
        </div>
      )}
      {!apps.isError && !apps.isPending && visible.length === 0 && (
        <p className="empty">
          {search
            ? t("Ingen apper passer søket.", "No matching apps.")
            : tab === "installed"
              ? t(
                  "Ingen andre apper er installert. Finn din første i Appbibliotek.",
                  "No other apps installed. Find your first in the App library.",
                )
              : t(
                  "Ingen flere apper fra appkildene dine.",
                  "No more apps in your repositories.",
                )}
        </p>
      )}
      <div className="apps-grid">
        {visible.map((a) => (
          <button
            className="app-card"
            key={a.slug}
            onClick={() => {
              setError("");
              setConfig(false);
              select(a);
            }}
          >
            <div className="app-card-top">
              <span className="app-symbol">
                <AppWindow size={24} />
              </span>
              <small data-running={a.state === "started"}>
                {pending(a.slug)
                  ? t("Pågår …", "In progress …")
                  : a.installed
                    ? a.state === "started"
                      ? t("Kjører", "Running")
                      : a.state === "stopped"
                        ? t("Stoppet", "Stopped")
                        : t("Ukjent status", "Unknown state")
                    : t("Tilgjengelig", "Available")}
              </small>
            </div>
            <h2>{smartiName(a.name)}</h2>
            <p>{smartiName(a.description || "")}</p>
            <footer>
              <span>
                {a.installed ? a.version : a.version_latest || a.version}
                {a.update_available
                  ? ` · ${t("Oppdatering klar", "Update available")}`
                  : ""}
              </span>
              <ArrowUpRight size={19} />
            </footer>
          </button>
        ))}
      </div>
      {!!activity.data?.length && (
        <section className="app-activity">
          <h2>{t("Aktivitet", "Activity")}</h2>
          {activity.data.slice(0, 8).map((o) => (
            <div key={o.request_id}>
              <span>
                <strong>{smartiName(o.name)}</strong>
                <small>
                  {label(o.action)} ·{" "}
                  {new Date(o.created * 1000).toLocaleString(
                    lang === "en" ? "en-GB" : "nb-NO",
                  )}
                </small>
              </span>
              <span role="status">
                {status(o.status)}
                {o.status === "accepted" && typeof o.progress === "number"
                  ? ` · ${Math.round(o.progress)} %`
                  : ""}
              </span>
            </div>
          ))}
        </section>
      )}
      {activity.isError && (
        <p role="status">
          {t(
            "Aktivitetsstatus kunne ikke hentes. Kontroller appens status før du gjentar en handling.",
            "Activity status unavailable. Check the app before repeating an action.",
          )}
        </p>
      )}
      {selected && !confirm && (
        <SettingsDialog
          lang={lang}
          title={smartiName(selected.name)}
          onClose={() => {
            select(null);
            setConfig(false);
          }}
        >
          <p>{smartiName(selected.description || "")}</p>
          <p className="muted">
            {selected.installed
              ? `${t("Installert versjon", "Installed version")}: ${selected.version || "—"}`
              : `${t("Versjon", "Version")}: ${selected.version_latest || selected.version || "—"}`}
          </p>
          <p className="muted">{t("Appkilde", "Repository")}: {selected.repository || "—"}</p>
          {selected.system_managed && (
            <p>
              {t(
                "Denne appen administreres av en integrasjon og kan ikke avinstalleres her.",
                "This app is managed by an integration and cannot be uninstalled here.",
              )}
            </p>
          )}
          <div className="app-actions">
            {(selected.installed
              ? [
                  [
                    selected.state === "started" ? "stop" : "start",
                    selected.state === "started" ? Square : Play,
                  ],
                  ["restart", RotateCw],
                  ...(selected.update_available ? [["update", Download]] : []),
                  ["uninstall", Trash2],
                ]
              : [["install", Download]]
            ).map(([action, Icon]) => {
              const a = action as Action,
                C = Icon as typeof Play;
              return (
                <button
                  key={a}
                  disabled={
                    pending(selected.slug) ||
                    (a === "uninstall" && selected.system_managed) ||
                    (a === "install" && selected.available === false)
                  }
                  onClick={() => ask(selected, a)}
                >
                  <C size={18} />
                  {label(a)}
                </button>
              );
            })}
            {selected.installed && (
              <button
                disabled={pending(selected.slug)}
                onClick={() => setConfig(!config)}
              >
                <Settings size={18} />
                {t("Konfigurasjon", "Configuration")}
              </button>
            )}
          </div>
          {selected.available === false && !selected.installed && (
            <p>
              {t(
                "Appen støttes ikke av denne hjemmesentralen.",
                "This app is unavailable for this controller.",
              )}
            </p>
          )}
          {config && (
            <AppConfiguration
              slug={selected.slug}
              lang={lang}
              onSaved={() => void apps.refetch()}
            />
          )}
        </SettingsDialog>
      )}
      {confirm && (
        <SettingsDialog
          lang={lang}
          busy={busy}
          title={`${label(confirm.action)} ${smartiName(confirm.app.name)}?`}
          onClose={() => setConfirm(null)}
        >
          <p>
            {confirm.action === "uninstall"
              ? t(
                  "Appen fjernes fra hjemmesentralen. Appdata kan gå tapt. Ta en sikkerhetskopi først dersom du vil kunne gjenopprette den.",
                  "The app is removed from the controller. App data may be lost. Make a backup first if you want to restore it later.",
                )
              : confirm.action === "install"
                ? t(
                    "Appen installeres fra den valgte appkilden. Installasjonen kan ta noen minutter. Deretter kan du konfigurere og starte den.",
                    "The app will be installed from its repository. Installation can take a few minutes. You can then configure and start it.",
                  )
                : t(
                    "Appens tjenester kan bli midlertidig utilgjengelige. Du kan følge resultatet under Aktivitet.",
                    "App services may become temporarily unavailable. Follow the result under Activity.",
                  )}
          </p>
          {confirm.action === "update" && (
            <label>
              <input
                type="checkbox"
                checked={backup}
                onChange={(e) => setBackup(e.target.checked)}
                disabled={busy}
              />
              {t(
                "Ta sikkerhetskopi før oppdatering",
                "Back up before updating",
              )}
            </label>
          )}
          {error && <p role="alert">{error}</p>}
          <button
            className="primary compact"
            disabled={busy}
            onClick={() => void perform()}
          >
            {busy
              ? t("Sender …", "Sending …")
              : `${t("Bekreft", "Confirm")} ${label(confirm.action).toLowerCase()}`}
          </button>
        </SettingsDialog>
      )}
      {repositories && (
        <Repositories
          lang={lang}
          close={() => setRepositories(false)}
          refresh={() => void apps.refetch()}
        />
      )}
    </section>
  );
}
function AppConfiguration({
  slug,
  lang,
  onSaved,
}: {
  slug: string;
  lang: string;
  onSaved: () => void;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const [value, setValue] = useState<Config | null>(null),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api<Config>(`manage/apps/${encodeURIComponent(slug)}/configuration`)
      .then((v) => {
        if (!cancelled) {
          setValue(v);
          setText(JSON.stringify(v.options, null, 2));
        }
      })
      .catch(() => {
        if (!cancelled)
          setError(
            t(
              "Kunne ikke hente konfigurasjonen.",
              "Could not load configuration.",
            ),
          );
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);
  return (
    <form
      className="app-config system-settings-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!value) return;
        setBusy(true);
        setError("");
        setSaved(false);
        try {
          const options = JSON.parse(text);
          if (!options || Array.isArray(options) || typeof options !== "object")
            throw Error();
          await api(
            `manage/apps/${encodeURIComponent(slug)}/configuration`,
            "PUT",
            {
              options,
              revision: value.revision,
              boot: value.boot,
              watchdog: !!value.watchdog,
              auto_update: !!value.auto_update,
            },
          );
          setSaved(true);
          const next = await api<Config>(
            `manage/apps/${encodeURIComponent(slug)}/configuration`,
          );
          setValue(next);
          onSaved();
        } catch (e) {
          setError(
            e instanceof ApiError && e.status === 409
              ? t(
                  "Konfigurasjonen er endret et annet sted. Lukk og åpne konfigurasjonen igjen før du lagrer.",
                  "Configuration changed elsewhere. Close and reopen before saving.",
                )
              : t(
                  "Kunne ikke bekrefte lagring. Kontroller JSON og appens felter. Hent konfigurasjonen på nytt før du prøver igjen.",
                  "Could not confirm saving. Check JSON and the app fields. Reload configuration before retrying.",
                ),
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>{t("Konfigurasjon", "Configuration")}</h3>
      {error && <p role="alert">{error}</p>}
      {!value && !error && <p>{t("Henter …", "Loading …")}</p>}
      {value && (
        <fieldset disabled={busy}>
          <label>
            {t("Appinnstillinger (JSON)", "App settings (JSON)")}
            <textarea
              spellCheck={false}
              rows={12}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setSaved(false);
              }}
            />
          </label>
          <small>
            {t(
              "Avansert oppsett fra appen. Kan inneholde passord og nøkler. Feltene valideres av hjemmesentralen før lagring.",
              "Advanced app configuration. May contain passwords and keys. The controller validates fields before saving.",
            )}
          </small>
          <label>
            <input
              type="checkbox"
              checked={value.boot === "auto"}
              disabled={value.boot_config === "manual_only"}
              onChange={(e) =>
                setValue({
                  ...value,
                  boot: e.target.checked ? "auto" : "manual",
                })
              }
            />
            {t("Start automatisk", "Start automatically")}
          </label>
          <label>
            <input
              type="checkbox"
              checked={!!value.watchdog}
              onChange={(e) =>
                setValue({ ...value, watchdog: e.target.checked })
              }
            />
            {t("Start på nytt ved feil", "Restart on failure")}
          </label>
          <label>
            <input
              type="checkbox"
              checked={!!value.auto_update}
              onChange={(e) =>
                setValue({ ...value, auto_update: e.target.checked })
              }
            />
            {t("Automatiske oppdateringer", "Automatic updates")}
          </label>
          <button className="primary compact" disabled={busy}>
            {t("Lagre konfigurasjon", "Save configuration")}
          </button>
        </fieldset>
      )}
      {saved && (
        <p role="status">
          {t(
            "Lagret. Start appen på nytt for å ta i bruk endringene.",
            "Saved. Restart the app to apply changes.",
          )}
        </p>
      )}
    </form>
  );
}
function Repositories({
  lang,
  close,
  refresh,
}: {
  lang: string;
  close: () => void;
  refresh: () => void;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const q = useQuery({
    queryKey: ["app-repositories"],
    queryFn: () =>
      api<{ slug: string; name: string; source: string }[]>(
        "manage/apps/repositories",
      ),
    retry: false,
  });
  const [url, setUrl] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <SettingsDialog
      lang={lang}
      title={t("Appkilder", "App repositories")}
      busy={busy}
      onClose={close}
    >
      <p>
        {t(
          "Appbiblioteket samler apper fra disse kildene.",
          "The app library collects apps from these repositories.",
        )}
      </p>
      {q.isError && (
        <p role="alert">
          {t("Kunne ikke hente appkildene.", "Could not load repositories.")}
        </p>
      )}
      {q.data?.map((r) => (
        <div className="app-repository" key={r.slug}>
          <strong>{smartiName(r.name || r.slug)}</strong>
          <small>{r.source}</small>
        </div>
      ))}
      <form
        className="system-settings-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api("manage/apps/repositories", "POST", { repository: url });
            setUrl("");
            await q.refetch();
            refresh();
          } catch {
            setError(
              t(
                "Kunne ikke bekrefte appkilden. Bruk en HTTPS-adresse til et gyldig applager, og sjekk oversikten før du prøver igjen.",
                "Could not confirm repository. Use an HTTPS URL for a valid app repository and check the list before retrying.",
              ),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          {t("Legg til appkilde", "Add repository")}
          <input
            type="url"
            required
            placeholder="https://github.com/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button className="primary compact" disabled={busy}>
          {t("Legg til kilde", "Add repository")}
        </button>
      </form>
    </SettingsDialog>
  );
}
