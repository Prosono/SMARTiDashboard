import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Plug, Search } from "lucide-react";
import { api } from "../api";
import { smartiName } from "../branding";
import { SettingsDialog } from "../home/SettingsDialog";
import { IntegrationLogo } from "./IntegrationLogo";
import { words } from "./shared";
import "./integrationSetup.css";

type Option = string | { value: string; label?: string };
type Field = {
  name: string;
  type?: string;
  required?: boolean;
  default?: unknown;
  description?: { suggested_value?: unknown };
  value_min?: number;
  value_max?: number;
  options?: Option[] | Record<string, string>;
  selector?: Record<
    string,
    {
      type?: string;
      min?: number;
      max?: number;
      step?: number;
      multiple?: boolean;
      options?: Option[];
    } | null
  >;
};
type Flow = {
  type: string;
  flow_id?: string;
  domain: string;
  step_id?: string;
  title?: string;
  reason?: string;
  url?: string;
  menu_options?: string[] | Record<string, string>;
  data_schema?: Field[];
  errors?: Record<string, string>;
  translations: Record<string, string>;
  description_placeholders?: Record<string, string>;
};
function kind(f: Field) {
  return f.selector ? Object.keys(f.selector)[0] : f.type || "string";
}
function supported(f: Field) {
  return [
    "string",
    "integer",
    "float",
    "boolean",
    "select",
    "multi_select",
    "text",
    "number",
  ].includes(kind(f));
}
function choices(f: Field): Option[] {
  const opts = f.selector?.select?.options || f.options || [];
  return Array.isArray(opts)
    ? opts
    : Object.entries(opts).map(([value, label]) => ({ value, label }));
}

export function IntegrationSetup({
  lang,
  close,
  initialSearch = "",
  discovery,
}: {
  lang: string;
  close: () => void;
  initialSearch?: string;
  discovery?: { id: string; domain: string };
}) {
  const t = (nb: string, en: string) => words(lang, nb, en);
  const qc = useQueryClient();
  const [search, setSearch] = useState(initialSearch);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const alive = useRef(true);
  const flowId = useRef<string | undefined>(undefined);
  const catalog = useQuery({
    queryKey: ["integration-catalog", lang],
    queryFn: () =>
      api<{ domain: string; name: string }[]>(
        `manage/integration-setup/catalog?language=${lang === "en" ? "en" : "nb"}`,
      ),
    retry: false,
  });
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (flowId.current)
        void api(
          `manage/integration-setup/flows/${encodeURIComponent(flowId.current)}`,
          "DELETE",
        ).catch(() => {});
    };
  }, []);
  function accept(next: Flow) {
    flowId.current = next.flow_id;
    setFlow(next);
    setValues((old) => ({
      ...(flow?.step_id === next.step_id && next.type === "form" ? old : {}),
      ...Object.fromEntries(
        (next.data_schema || []).flatMap((f) => {
          const value = f.default ?? f.description?.suggested_value;
          return value !== undefined
            ? [[f.name, value]]
            : kind(f) === "boolean"
              ? [[f.name, false]]
              : [];
        }),
      ),
    }));
    if (next.type === "create_entry")
      void qc.invalidateQueries({ queryKey: ["manage"] });
  }
  async function run(action: () => Promise<Flow>) {
    setBusy(true);
    setError("");
    try {
      const next = await action();
      if (alive.current) accept(next);
      else if (next.flow_id)
        void api(
          `manage/integration-setup/flows/${encodeURIComponent(next.flow_id)}`,
          "DELETE",
        ).catch(() => {});
    } catch {
      if (alive.current)
        setError(
          t(
            "Oppsettet kunne ikke bekreftes. Kontroller forbindelsen og hent status før du prøver igjen.",
            "Setup could not be confirmed. Check the connection and refresh status before retrying.",
          ),
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const claimed = useRef(false);
  useEffect(() => {
    if (discovery && !claimed.current) {
      claimed.current = true;
      void run(() =>
        api<Flow>(
          `manage/integration-setup/bluetooth/${encodeURIComponent(discovery.id)}/claim`,
          "POST",
          { domain: discovery.domain, language: lang === "en" ? "en" : "nb" },
        ),
      );
    }
  }, [discovery]);
  async function dismiss() {
    if (!flowId.current) {
      close();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(
        `manage/integration-setup/flows/${encodeURIComponent(flowId.current)}`,
        "DELETE",
      );
      flowId.current = undefined;
      close();
    } catch {
      setError(
        t(
          "Kunne ikke avslutte oppsettet. Prøv igjen.",
          "Could not close setup. Please retry.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  const path = `manage/integration-setup/flows/${encodeURIComponent(flow?.flow_id || "")}`;
  const text = (key: string, fallback = "") => {
    let value =
      flow?.translations[`component.${flow.domain}.config.${key}`] || fallback;
    for (const [k, v] of Object.entries(flow?.description_placeholders || {}))
      value = value.split(`{${k}}`).join(String(v));
    return smartiName(value);
  };
  const terminal = flow?.type === "create_entry" || flow?.type === "abort";
  const external =
    flow?.url && /^https?:\/\//i.test(flow.url) ? flow.url : undefined;
  const refresh = () => void run(() => api<Flow>(path));
  useEffect(() => {
    if (
      !flow?.flow_id ||
      !["show_progress", "show_progress_done", "external_step_done"].includes(
        flow.type,
      ) ||
      busy ||
      error
    )
      return;
    const timer = setTimeout(() => {
      if (flow.type.endsWith("_done"))
        void run(() => api<Flow>(path, "POST", {}));
      else refresh();
    }, 2500);
    return () => clearTimeout(timer);
  }, [flow, busy, error]);
  const fields = flow?.data_schema || [];
  const unsupported = fields.some((f) => !supported(f));
  return (
    <SettingsDialog
      title={t("Legg til integrasjon", "Add integration")}
      lang={lang}
      busy={busy}
      onClose={() => void dismiss()}
    >
      <div className="integration-setup">
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
        {!flow && discovery ? (
          <p role="status">
            {busy
              ? t("Åpner enhetsoppsettet …", "Opening device setup …")
              : t(
                  "Lukk og velg enheten på nytt dersom oppsettet ikke kunne hentes.",
                  "Close and select the device again if setup could not be loaded.",
                )}
          </p>
        ) : !flow ? (
          <>
            <p>
              {t(
                "Finn merket eller tjenesten du vil koble til hjemmet ditt.",
                "Find the brand or service you want to connect to your home.",
              )}
            </p>
            <label className="integration-setup-search">
              <Search size={20} />
              <input
                autoFocus
                aria-label={t("Finn integrasjon", "Find integration")}
                placeholder={t(
                  "Søk etter merke eller tjeneste …",
                  "Search brands or services …",
                )}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            {catalog.isPending && (
              <p role="status">
                {t(
                  "Henter tilgjengelige integrasjoner …",
                  "Loading available integrations …",
                )}
              </p>
            )}
            {catalog.isError && (
              <div role="alert">
                <p>
                  {t(
                    "Kunne ikke hente integrasjoner. Krever en tilkoblet hjemmesentral og administratorrettigheter. Oppsett er ikke tilgjengelig i demo.",
                    "Could not load integrations. A connected home controller and admin access are required. Setup is unavailable in demo.",
                  )}
                </p>
                <button onClick={() => void catalog.refetch()}>
                  {t("Prøv igjen", "Retry")}
                </button>
              </div>
            )}
            <div className="integration-catalog">
              {catalog.data
                ?.filter((i) =>
                  `${i.name} ${i.domain}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((i) => (
                  <button
                    key={i.domain}
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        api<Flow>("manage/integration-setup/flows", "POST", {
                          domain: i.domain,
                          language: lang === "en" ? "en" : "nb",
                        }),
                      )
                    }
                  >
                    <span className="integration-logo" aria-hidden="true">
                      <IntegrationLogo domain={i.domain} />
                    </span>
                    <span>{smartiName(i.name)}</span>
                    <ArrowRight size={18} />
                  </button>
                ))}
            </div>
            {catalog.data &&
              !catalog.data.some((i) =>
                `${i.name} ${i.domain}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              ) && (
                <p>
                  {t(
                    "Ingen treff. Prøv et annet navn.",
                    "No matches. Try another name.",
                  )}
                </p>
              )}
          </>
        ) : (
          <>
            <div className="integration-setup-title">
              <span className="integration-logo">
                <IntegrationLogo domain={flow.domain} />
              </span>
              <div>
                <small>
                  {smartiName(
                    catalog.data?.find((i) => i.domain === flow.domain)?.name ||
                      flow.domain,
                  )}
                </small>
                <h3>
                  {text(
                    `step.${flow.step_id}.title`,
                    flow.title ||
                      t("Koble til hjemmet", "Connect to your home"),
                  )}
                </h3>
              </div>
            </div>
            {text(`step.${flow.step_id}.description`) && (
              <p className="integration-instructions">
                {text(`step.${flow.step_id}.description`)}
              </p>
            )}
            {flow.errors?.base && (
              <p role="alert" className="notice">
                {text(
                  `error.${flow.errors.base}`,
                  flow.errors.base.replaceAll("_", " "),
                )}
              </p>
            )}
            {flow.type === "form" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(() => api<Flow>(path, "POST", values));
                }}
              >
                {fields.map((f) => {
                  const k = kind(f),
                    label = text(
                      `step.${flow.step_id}.data.${f.name}`,
                      f.name.replaceAll("_", " "),
                    );
                  const opts = choices(f),
                    multiple =
                      k === "multi_select" || !!f.selector?.select?.multiple;
                  const update = (v: unknown) =>
                    setValues((old) => ({ ...old, [f.name]: v }));
                  if (!supported(f))
                    return (
                      <p key={f.name} role="alert">
                        {label}:{" "}
                        {t(
                          "Dette feltet krever et oppsett som ennå ikke støttes i SMARTi.",
                          "This field requires setup not yet supported in SMARTi.",
                        )}
                      </p>
                    );
                  return (
                    <label key={f.name}>
                      {label}
                      {f.required ? " *" : ""}
                      {k === "boolean" ? (
                        <input
                          type="checkbox"
                          checked={!!values[f.name]}
                          disabled={busy}
                          onChange={(e) => update(e.target.checked)}
                        />
                      ) : opts.length ||
                        ["select", "multi_select"].includes(k) ? (
                        <select
                          disabled={busy}
                          required={f.required}
                          multiple={multiple}
                          value={
                            multiple
                              ? (values[f.name] as string[]) || []
                              : String(values[f.name] ?? "")
                          }
                          onChange={(e) =>
                            update(
                              multiple
                                ? Array.from(
                                    e.target.selectedOptions,
                                    (o) => o.value,
                                  )
                                : e.target.value,
                            )
                          }
                        >
                          {!multiple && (
                            <option value="">{t("Velg …", "Choose …")}</option>
                          )}
                          {opts.map((o) => {
                            const value = typeof o === "string" ? o : o.value;
                            return (
                              <option key={value} value={value}>
                                {typeof o === "string" ? o : o.label || value}
                              </option>
                            );
                          })}
                        </select>
                      ) : (
                        <input
                          disabled={busy}
                          required={f.required}
                          autoComplete="off"
                          type={
                            /password|secret|token|api_key/i.test(f.name) ||
                            f.selector?.text?.type === "password"
                              ? "password"
                              : ["integer", "float", "number"].includes(k)
                                ? "number"
                                : "text"
                          }
                          min={f.selector?.number?.min ?? f.value_min}
                          max={f.selector?.number?.max ?? f.value_max}
                          step={
                            k === "integer"
                              ? 1
                              : f.selector?.number?.step || "any"
                          }
                          value={String(values[f.name] ?? "")}
                          onChange={(e) => {
                            if (!e.target.value && !f.required)
                              setValues((old) => {
                                const next = { ...old };
                                delete next[f.name];
                                return next;
                              });
                            else
                              update(
                                ["integer", "float", "number"].includes(k)
                                  ? Number(e.target.value)
                                  : e.target.value,
                              );
                          }}
                        />
                      )}
                      <small>
                        {text(
                          `step.${flow.step_id}.data_description.${f.name}`,
                        )}
                      </small>
                      {flow.errors?.[f.name] && (
                        <small role="alert">
                          {text(
                            `error.${flow.errors[f.name]}`,
                            flow.errors[f.name].replaceAll("_", " "),
                          )}
                        </small>
                      )}
                    </label>
                  );
                })}
                {unsupported && (
                  <p className="notice">
                    {t(
                      "Avbryt og fullfør denne integrasjonen i sentralens eget oppsett. Ingen verdier sendes fra dette skjemaet.",
                      "Cancel and complete this integration in the controller’s setup. This form will not submit unsupported fields.",
                    )}
                  </p>
                )}
                <button
                  className="primary compact"
                  disabled={busy || unsupported}
                >
                  {busy
                    ? t("Kobler til …", "Connecting …")
                    : t("Fortsett", "Continue")}
                  <ArrowRight size={18} />
                </button>
              </form>
            )}
            {flow.type === "menu" && (
              <div className="integration-catalog">
                {(Array.isArray(flow.menu_options)
                  ? flow.menu_options
                  : Object.keys(flow.menu_options || {})
                ).map((step) => (
                  <button
                    disabled={busy}
                    key={step}
                    onClick={() =>
                      void run(() =>
                        api<Flow>(path, "POST", { next_step_id: step }),
                      )
                    }
                  >
                    {text(
                      `step.${flow.step_id}.menu_options.${step}`,
                      step.replaceAll("_", " "),
                    )}
                    <ArrowRight size={18} />
                  </button>
                ))}
              </div>
            )}
            {flow.type === "external" && (
              <>
                <p>
                  {t(
                    "Fullfør innloggingen i et nytt vindu, gå tilbake hit og hent status. Tjenesten må ha en gyldig returadresse til hjemmesentralen.",
                    "Complete sign-in in a new window, return here and refresh status. The service needs a valid callback address to your controller.",
                  )}
                </p>
                {external && (
                  <a
                    className="primary compact"
                    href={external}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("Åpne innlogging", "Open sign-in")}
                  </a>
                )}
              </>
            )}
            {[
              "show_progress",
              "show_progress_done",
              "external_step_done",
            ].includes(flow.type) && (
              <p role="status">
                {t(
                  "Venter på at integrasjonen fullfører neste trinn …",
                  "Waiting for the integration to complete the next step …",
                )}
              </p>
            )}
            {flow.type === "create_entry" && (
              <p className="integration-success">
                <CheckCircle2 />
                {t(
                  "Integrasjonen er lagt til. Enheter vises når integrasjonen har startet.",
                  "Integration added. Devices appear once it has started.",
                )}
              </p>
            )}
            {flow.type === "abort" && (
              <p role="status">
                {text(
                  `abort.${flow.reason}`,
                  flow.reason?.replaceAll("_", " ") ||
                    t("Oppsettet ble avsluttet.", "Setup ended."),
                )}
              </p>
            )}
            {![
              "form",
              "menu",
              "external",
              "create_entry",
              "abort",
              "show_progress",
              "show_progress_done",
              "external_step_done",
            ].includes(flow.type) && (
              <p>
                {t(
                  "Dette oppsettstrinnet må fullføres i sentralens eget grensesnitt.",
                  "This setup step must be completed in the controller’s interface.",
                )}
              </p>
            )}
            <div className="row-actions">
              {!terminal && flow.flow_id && (
                <button disabled={busy} onClick={refresh}>
                  {t("Hent status", "Refresh status")}
                </button>
              )}
              <button disabled={busy} onClick={() => void dismiss()}>
                {terminal
                  ? t("Ferdig", "Done")
                  : t("Avbryt oppsett", "Cancel setup")}
              </button>
            </div>
          </>
        )}
        {busy && (
          <span role="status" className="muted">
            <Plug size={16} />{" "}
            {t(
              "Kommuniserer med hjemmesentralen …",
              "Contacting your home controller …",
            )}
          </span>
        )}
      </div>
    </SettingsDialog>
  );
}
