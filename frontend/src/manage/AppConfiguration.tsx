import { useEffect, useState } from "react";
import {
  SlidersHorizontal,
  Code2,
  Power,
  ShieldCheck,
  RefreshCw,
  Save,
  CheckCircle2,
} from "lucide-react";
import { api, ApiError } from "../api";
import { AppConfigFields } from "./AppConfigFields";
import "./appConfiguration.css";
type Config = {
  options: Record<string, unknown>;
  revision: string;
  boot: "auto" | "manual";
  watchdog: boolean;
  auto_update: boolean;
  boot_config: string;
  schema: unknown;
};
const payload = (v: Config) => ({
  options: v.options,
  boot: v.boot,
  watchdog: !!v.watchdog,
  auto_update: !!v.auto_update,
});
export function AppConfiguration({
  slug,
  lang,
  onSaved,
  onStateChange,
}: {
  slug: string;
  lang: string;
  onSaved: () => void;
  onStateChange: (v: { dirty: boolean; busy: boolean }) => void;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const [value, setValue] = useState<Config | null>(null);
  const [original, baseline] = useState<Config | null>(null);
  const [text, setText] = useState("");
  const [advanced, mode] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [retry, reload] = useState(0);
  const dirty =
    !!value &&
    !!original &&
    (JSON.stringify(payload(value)) !== JSON.stringify(payload(original)) ||
      (advanced && text !== JSON.stringify(value.options, null, 2)));
  useEffect(() => onStateChange({ dirty, busy }), [dirty, busy, onStateChange]);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  useEffect(() => {
    let cancelled = false;
    setError("");
    setBusy(true);
    api<Config>(`manage/apps/${encodeURIComponent(slug)}/configuration`)
      .then((v) => {
        if (!cancelled) {
          setValue(v);
          baseline(v);
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
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, retry]);
  function parse(): Record<string, unknown> {
    const options: unknown = JSON.parse(text);
    if (!options || Array.isArray(options) || typeof options !== "object")
      throw Error("json");
    return options as Record<string, unknown>;
  }
  function switchMode(next: boolean) {
    if (!value || next === advanced) return;
    try {
      if (!next) setValue({ ...value, options: parse() });
      else setText(JSON.stringify(value.options, null, 2));
      setError("");
      mode(next);
    } catch {
      setError(
        t(
          "JSON må være et gyldig objekt før du kan bytte visning.",
          "JSON must be a valid object before switching views.",
        ),
      );
    }
  }
  async function save() {
    if (!value) return;
    let options = value.options;
    try {
      if (advanced) options = parse();
    } catch {
      setError(
        t(
          "JSON inneholder en feil. Kontroller komma, anførselstegn og klammer.",
          "JSON is invalid. Check commas, quotation marks and brackets.",
        ),
      );
      return;
    }
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await api(
        `manage/apps/${encodeURIComponent(slug)}/configuration`,
        "PUT",
        { ...payload(value), options, revision: value.revision },
      );
      const next = await api<Config>(
        `manage/apps/${encodeURIComponent(slug)}/configuration`,
      );
      setValue(next);
      baseline(next);
      setText(JSON.stringify(next.options, null, 2));
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? t(
              "Appinnstillingene er endret et annet sted eller en handling pågår. Hent innstillingene på nytt før du lagrer.",
              "Settings changed elsewhere or an operation is running. Reload settings before saving.",
            )
          : e instanceof ApiError && e.status === 422
            ? t(
                "Appen godkjente ikke innstillingene. Kontroller feltene og prøv igjen. Endringene dine er beholdt.",
                "The app rejected these settings. Check the fields and retry. Your edits are preserved.",
              )
            : t(
                "Lagringen kunne ikke bekreftes. Hent innstillingene på nytt for å kontrollere resultatet.",
                "Saving could not be confirmed. Reload settings to check the result.",
              ),
      );
    } finally {
      setBusy(false);
    }
  }
  function refresh() {
    if (
      dirty &&
      !window.confirm(
        t(
          "Forkaste endringene og hente lagrede innstillinger?",
          "Discard changes and reload saved settings?",
        ),
      )
    )
      return;
    setSaved(false);
    reload((v) => v + 1);
  }
  return (
    <form
      className="app-configuration"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <header className="app-configuration-intro">
        <SlidersHorizontal size={22} />
        <div>
          <h3>{t("Tilpass appen", "Make it yours")}</h3>
          <p>
            {t(
              "Endre innstillingene nedenfor. Ingenting lagres før du velger Lagre.",
              "Adjust the settings below. Nothing is saved until you choose Save.",
            )}
          </p>
        </div>
      </header>
      {error && (
        <div className="notice" role="alert">
          <p>{error}</p>
          <button type="button" disabled={busy} onClick={refresh}>
            <RefreshCw size={16} />
            {t("Hent på nytt", "Reload")}
          </button>
        </div>
      )}
      {!value && !error && (
        <p role="status">
          {t("Henter appinnstillinger …", "Loading app settings …")}
        </p>
      )}
      {value && (
        <fieldset disabled={busy} className="app-configuration-body">
          <nav
            className="app-config-modes"
            aria-label={t("Konfigurasjonsvisning", "Configuration view")}
          >
            <button
              type="button"
              aria-pressed={!advanced}
              onClick={() => switchMode(false)}
            >
              <SlidersHorizontal size={17} />
              {t("Innstillinger", "Settings")}
            </button>
            <button
              type="button"
              aria-pressed={advanced}
              onClick={() => switchMode(true)}
            >
              <Code2 size={17} />
              {t("Avansert (JSON)", "Advanced (JSON)")}
            </button>
          </nav>
          {advanced ? (
            <section className="app-config-json">
              <label>
                {t("Appinnstillinger (JSON)", "App settings (JSON)")}
                <textarea
                  aria-label={t(
                    "Appinnstillinger (JSON)",
                    "App settings (JSON)",
                  )}
                  spellCheck={false}
                  rows={16}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setSaved(false);
                  }}
                />
              </label>
              <small>
                {t(
                  "Denne visningen viser alle verdier, også passord og nøkler.",
                  "This view shows all values, including passwords and keys.",
                )}
              </small>
            </section>
          ) : (
            <section>
              <AppConfigFields
                value={value.options}
                schema={value.schema}
                lang={lang}
                change={(options) => {
                  setValue({ ...value, options });
                  setSaved(false);
                }}
              />
              {!Object.keys(value.options).length && !value.schema && (
                <p>
                  {t(
                    "Appen har ingen egne innstillinger.",
                    "This app has no custom settings.",
                  )}
                </p>
              )}
            </section>
          )}
          <section className="app-config-runtime">
            <header>
              <Power size={19} />
              <h3>{t("Oppstart og vedlikehold", "Startup and maintenance")}</h3>
            </header>
            {(
              [
                [
                  "boot",
                  Power,
                  t("Start automatisk", "Start automatically"),
                  value.boot_config === "manual_only"
                    ? t(
                        "Denne appen må startes manuelt.",
                        "This app must be started manually.",
                      )
                    : t(
                        "Start appen når hjemmesentralen starter.",
                        "Start the app when the controller starts.",
                      ),
                ],
                [
                  "watchdog",
                  ShieldCheck,
                  t("Start på nytt ved feil", "Restart on failure"),
                  t(
                    "La sentralen forsøke å starte appen igjen hvis den stopper.",
                    "Let the controller try restarting the app if it stops.",
                  ),
                ],
                [
                  "auto_update",
                  RefreshCw,
                  t("Automatiske oppdateringer", "Automatic updates"),
                  t(
                    "Installer nye appversjoner automatisk.",
                    "Install new app versions automatically.",
                  ),
                ],
              ] as const
            ).map(([key, Icon, title, description]) => (
              <label className="app-runtime-option" key={key}>
                <Icon size={20} />
                <span>
                  <strong>{title}</strong>
                  <small>{description}</small>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={title}
                  checked={
                    key === "boot" ? value.boot === "auto" : !!value[key]
                  }
                  disabled={
                    key === "boot" && value.boot_config === "manual_only"
                  }
                  onChange={(e) => {
                    setValue({
                      ...value,
                      [key]:
                        key === "boot"
                          ? e.target.checked
                            ? "auto"
                            : "manual"
                          : e.target.checked,
                    });
                    setSaved(false);
                  }}
                />
              </label>
            ))}
          </section>
          <footer className="app-config-save">
            <span role="status">
              {busy
                ? t("Lagrer …", "Saving …")
                : dirty
                  ? t("Ulagrede endringer", "Unsaved changes")
                  : t("Ingen ulagrede endringer", "No unsaved changes")}
            </span>
            <button
              type="button"
              disabled={!dirty}
              onClick={() => {
                if (original) {
                  setValue(original);
                  setText(JSON.stringify(original.options, null, 2));
                  setError("");
                  setSaved(false);
                }
              }}
            >
              {t("Forkast", "Discard")}
            </button>
            <button className="primary compact" disabled={!dirty} type="submit">
              <Save size={17} />
              {t("Lagre konfigurasjon", "Save configuration")}
            </button>
          </footer>
        </fieldset>
      )}
      {saved && (
        <p className="app-config-success" role="status">
          <CheckCircle2 size={20} />
          {t(
            "Lagret. Start appen på nytt for å ta i bruk endringene.",
            "Saved. Restart the app to apply changes.",
          )}
        </p>
      )}
    </form>
  );
}
