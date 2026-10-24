import { BlueprintPreview } from "./BlueprintPreview";
import { FlowInspector } from "./FlowInspector";
import { flowLibrary, newFlowStep } from "./flowLibrary";
import { AutomationIcon, AutomationTrigger } from "./AutomationDetails";
import "./automations.css";
import { homeAsset } from "../home/HomeOverview";
import { AutomationFlow } from "./AutomationFlow";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Workflow,
  Search,
  Pause,
  Clock3,
  LayoutGrid,
  List,
  Pencil,
  CircleAlert,
  ArrowLeft,
  Plus,
  Play,
  Trash2,
  Zap,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { AutomationGuide } from "./AutomationGuide";
import { api } from "../api";
import type { Home, Control } from "../types";
import { Feedback, LoadError, useWork, words } from "./shared";
type Config = Record<string, any>;
type Automation = {
  entity_id: string;
  id: string | null;
  name: string;
  state: string;
  last_triggered: string | null;
  icon?: string;
};
export function normalizedConfig(value: Config): Config {
  const c = structuredClone(value);
  for (const [old, key] of [
    ["trigger", "triggers"],
    ["condition", "conditions"],
    ["action", "actions"],
  ]) {
    c[key] = c[key] ?? c[old] ?? [];
    if (!Array.isArray(c[key])) c[key] = [c[key]];
    delete c[old];
  }
  return c;
}
export function Automations({
  lang,
  home: sourceHome,
  onDirty,
}: {
  lang: string;
  home: Home;
  onDirty: (v: boolean) => void;
}) {
  const t = (nb: string, en: string) => words(lang, nb, en);
  const catalog = useQuery({
    queryKey: ["manage", "automation-entities"],
    queryFn: () =>
      api<
        Pick<
          Control,
          | "entity_id"
          | "name"
          | "domain"
          | "state"
          | "attributes"
          | "area_id"
          | "device_id"
        >[]
      >("manage/entities?details=true"),
    staleTime: 60_000,
  });
  const known = new Set(sourceHome.controls.map((c) => c.entity_id));
  const home: Home = {
    ...sourceHome,
    controls: [
      ...sourceHome.controls,
      ...(catalog.data || [])
        .filter((c) => !known.has(c.entity_id))
        .map((c) => ({
          ...c,
          id: c.entity_id,
          capabilities: [],
          availability: c.state === "unavailable" ? "unavailable" : "unknown",
          updated_at: null,
          integration: null,
          diagnostic: false,
        })),
    ],
  };

  const q = useQuery({
    queryKey: ["manage", "automations"],
    queryFn: () => api<Automation[]>("manage/automations"),
    refetchInterval: 10000,
  });
  const [editing, setEditing] = useState<{
    id: string | null;
    revision: string;
    config: Config;
  } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [flow, setFlow] = useState(true);
  const [guided, setGuided] = useState(false);
  const [guideReady, setGuideReady] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [raw, setRaw] = useState("");
  const [formValidity, setFormValidity] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("name");
  const [layout, setLayout] = useState("list");
  const [confirm, setConfirm] = useState<"delete" | "leave" | null>(null);
  const [runConfirm, setRunConfirm] = useState<string | null>(null);
  const w = useWork(lang);
  const c = editing?.config;
  const standardInvalid =
    !flow && !advanced && Object.values(formValidity).some((v) => !v);
  useEffect(() => {
    onDirty(!!editing && dirty);
    return () => onDirty(false);
  }, [!!editing, dirty, onDirty]);
  useEffect(() => {
    if (!editing || !dirty) return;
    const before = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [!!editing, dirty]);
  function patch(value: Config) {
    setDirty(true);
    w.setMessage("");
    if (editing)
      setEditing({ ...editing, config: { ...editing.config, ...value } });
  }
  function rawMode() {
    if (advanced || standardInvalid) return;
    setRaw(JSON.stringify(c, null, 2));
    setAdvanced(true);
  }
  let parsed: Config | null = null;
  if (advanced) {
    try {
      const v = JSON.parse(raw);
      if (v && typeof v === "object" && !Array.isArray(v)) parsed = v;
    } catch {
      /* Keep the draft intact. */
    }
  }
  const usable = advanced ? parsed : c;
  function section(
    key: "triggers" | "conditions" | "actions",
    index: string,
    title: string,
    intro: string,
  ) {
    const rows = c![key];
    return (
      <section className="automation-section">
        <div className="automation-step">
          <span>{index}</span>
          <div>
            <h2>{title}</h2>
            <p>{intro}</p>
          </div>
        </div>
        {rows.map((row: Config, i: number) => (
          <div className="automation-block" key={i}>
            <FlowInspector
              row={row}
              kind={key}
              home={home}
              lang={lang}
              onAdvanced={rawMode}
              onValidityChange={(valid) =>
                setFormValidity((old) =>
                  old[`${key}:${i}`] === valid
                    ? old
                    : { ...old, [`${key}:${i}`]: valid },
                )
              }
              onChange={(value) =>
                patch({
                  [key]: rows.map((current: Config, j: number) =>
                    i === j ? value : current,
                  ),
                })
              }
            />
            <div className="row-actions">
              <button
                type="button"
                aria-label={t("Flytt opp", "Move up")}
                disabled={i === 0 || standardInvalid}
                onClick={() => {
                  const next = [...rows];
                  [next[i - 1], next[i]] = [next[i], next[i - 1]];
                  patch({ [key]: next });
                }}
              >
                <ChevronUp size={17} />
              </button>
              <button
                type="button"
                aria-label={t("Flytt ned", "Move down")}
                disabled={i === rows.length - 1 || standardInvalid}
                onClick={() => {
                  const next = [...rows];
                  [next[i + 1], next[i]] = [next[i], next[i + 1]];
                  patch({ [key]: next });
                }}
              >
                <ChevronDown size={17} />
              </button>
              <button
                type="button"
                disabled={Object.entries(formValidity).some(
                  ([field, valid]) => field !== `${key}:${i}` && !valid,
                )}
                onClick={() => {
                  patch({
                    [key]: rows.filter((_: unknown, j: number) => j !== i),
                  });
                  setFormValidity({});
                }}
              >
                <Trash2 size={16} />
                {t("Fjern steg", "Remove step")}
              </button>
            </div>
          </div>
        ))}
        <details className="flow-settings">
          <summary>{t("Legg til steg", "Add step")}</summary>
          <div className="block-add">
            {flowLibrary(key, lang).map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() =>
                  patch({ [key]: [...rows, newFlowStep(key, item.id)] })
                }
              >
                <Plus size={16} />
                {item.title}
              </button>
            ))}
          </div>
        </details>
      </section>
    );
  }
  async function edit(a: Automation) {
    if (!a.id) return;
    setFormValidity({});
    await w.run(async () => {
      const v = await api<{ config: Config; revision: string }>(
        `manage/automations/${encodeURIComponent(a.id!)}`,
      );
      setEditing({
        id: a.id,
        revision: v.revision,
        config: v.config.use_blueprint ? v.config : normalizedConfig(v.config),
      });
      setRaw(JSON.stringify(v.config, null, 2));
      setAdvanced(!!v.config.use_blueprint);
      setGuided(false);
      setFlow(true);
      setGuideReady(false);
      setConfirm(null);
      setDirty(false);
    });
  }
  if (editing && c)
    return (
      <section className="management-page">
        <button
          className="text-button"
          onClick={() => (dirty ? setConfirm("leave") : setEditing(null))}
        >
          <ArrowLeft size={18} />
          {t("Alle automasjoner", "All automations")}
        </button>
        <div className="page-heading">
          <span className="eyebrow">
            {editing.id
              ? t("Rediger automasjon", "Edit automation")
              : t("Ny automasjon", "New automation")}
          </span>
          <h1>{t("La hjemmet hjelpe til.", "Let your home help.")}</h1>
        </div>
        <Feedback message={w.message} />
        <form
          className={guided || (flow && !advanced) ? "guided-form" : undefined}
          onSubmit={(e) => {
            e.preventDefault();
            if (
              !usable ||
              (guided && !guideReady) ||
              e.currentTarget.querySelector("dialog[open]") ||
              (!advanced &&
                !flow &&
                Object.values(formValidity).some((v) => !v))
            )
              return;
            void w.run(async () => {
              const saved = await api<{
                id: string;
                config: Config;
                revision: string;
              }>(
                editing.id
                  ? `manage/automations/${encodeURIComponent(editing.id)}`
                  : "manage/automations",
                editing.id ? "PUT" : "POST",
                { config: usable, revision: editing.revision },
              );
              if (guided || flow) {
                setEditing({
                  id: saved.id || editing.id,
                  revision: saved.revision,
                  config: saved.config.use_blueprint
                    ? saved.config
                    : normalizedConfig(saved.config),
                });
                setGuided(false);
                setAdvanced(!!saved.config.use_blueprint);
                setRaw(JSON.stringify(saved.config, null, 2));
                setFlow(true);
                setDirty(false);
                w.setMessage(t("Automasjonen er lagret.", "Automation saved."));
              } else setEditing(null);
            });
          }}
        >
          {guided && (
            <AutomationGuide
              config={c}
              home={home}
              lang={lang}
              patch={patch}
              onReady={setGuideReady}
              onAdvanced={() => {
                setGuided(false);
                setFlow(true);
              }}
            />
          )}
          {!guided && (
            <div
              className="automation-view-switch"
              role="group"
              aria-label={t("Redigeringsvisning", "Editor view")}
            >
              <button
                type="button"
                aria-pressed={flow && !advanced}
                disabled={
                  !!usable?.use_blueprint ||
                  (advanced && !parsed) ||
                  standardInvalid
                }
                onClick={() => {
                  if (advanced && parsed)
                    setEditing({
                      ...editing,
                      config: normalizedConfig(parsed),
                    });
                  setAdvanced(false);
                  setFlow(true);
                }}
              >
                {t("Flytvisning", "Flow view")}
              </button>
              <button
                type="button"
                aria-pressed={!flow && !advanced}
                disabled={!!usable?.use_blueprint || (advanced && !parsed)}
                onClick={() => {
                  if (advanced && parsed)
                    setEditing({
                      ...editing,
                      config: normalizedConfig(parsed),
                    });
                  setAdvanced(false);
                  setFlow(false);
                }}
              >
                {t("Vanlig editor", "Standard editor")}
              </button>
              <button
                type="button"
                aria-pressed={advanced}
                onClick={rawMode}
                disabled={standardInvalid}
              >
                {t("Avansert redigering (JSON)", "Advanced editing (JSON)")}
              </button>
            </div>
          )}
          {!advanced && !guided && flow && (
            <AutomationFlow
              config={c}
              home={home}
              lang={lang}
              patch={patch}
              onAdvanced={rawMode}
            />
          )}
          {!advanced && !guided && !flow && (
            <>
              <div className="form-grid">
                <label>
                  {t("Navn", "Name")}
                  <input
                    required
                    maxLength={200}
                    value={c.alias || ""}
                    onChange={(e) => patch({ alias: e.target.value })}
                  />
                </label>
                <label>
                  {t("Når den allerede kjører", "When already running")}
                  <select
                    value={c.mode || "single"}
                    onChange={(e) => patch({ mode: e.target.value })}
                  >
                    <option value="single">
                      {t("Ikke start på nytt", "Single run")}
                    </option>
                    <option value="restart">
                      {t("Start på nytt", "Restart")}
                    </option>
                    <option value="queued">{t("Legg i kø", "Queue")}</option>
                    <option value="parallel">
                      {t("Kjør parallelt", "Parallel")}
                    </option>
                  </select>
                </label>
              </div>
              <label className="wide-label">
                {t("Beskrivelse", "Description")}
                <textarea
                  rows={2}
                  value={c.description || ""}
                  onChange={(e) => patch({ description: e.target.value })}
                />
              </label>
              {section(
                "triggers",
                "01",
                t("Når", "When"),
                t(
                  "Én av disse hendelsene starter automasjonen.",
                  "Any of these events starts the automation.",
                ),
              )}
              {section(
                "conditions",
                "02",
                t("Hvis", "If"),
                t(
                  "Alle betingelsene må være oppfylt. Kan stå tomt.",
                  "All conditions must be met. Optional.",
                ),
              )}
              {section(
                "actions",
                "03",
                t("Gjør", "Then"),
                t(
                  "Handlingene utføres i denne rekkefølgen.",
                  "Actions run in this order.",
                ),
              )}
            </>
          )}
          {advanced && (
            <div className="advanced-editor">
              {parsed?.use_blueprint && (
                <BlueprintPreview
                  config={parsed}
                  entityId={q.data?.find((a) => a.id === editing.id)?.entity_id}
                  home={home}
                  lang={lang}
                  onChange={(value) => {
                    setRaw(JSON.stringify(value, null, 2));
                    setDirty(true);
                  }}
                />
              )}
              <details open={!parsed?.use_blueprint}>
                <summary>
                  {t("Hele konfigurasjonen", "Full configuration")}
                </summary>
                <p>
                  {t(
                    "Hele konfigurasjonen beholdes, inkludert maler, blueprints og avanserte handlinger.",
                    "The full configuration is preserved, including templates, blueprints and advanced actions.",
                  )}
                </p>
                <label>
                  {t("Konfigurasjon (JSON)", "Configuration (JSON)")}
                  <textarea
                    className="code-editor"
                    rows={22}
                    spellCheck={false}
                    value={raw}
                    onChange={(e) => {
                      setRaw(e.target.value);
                      setDirty(true);
                      w.setMessage("");
                    }}
                  />
                </label>
                {!parsed && (
                  <p role="alert">
                    {t("JSON er ikke gyldig ennå.", "JSON is not valid yet.")}
                  </p>
                )}
                <button
                  type="button"
                  disabled={!parsed || !!parsed.use_blueprint}
                  onClick={() => {
                    if (parsed) {
                      setEditing({
                        ...editing,
                        config: normalizedConfig(parsed),
                      });
                      setAdvanced(false);
                      setFlow(false);
                    }
                  }}
                >
                  {t("Vis byggeklosser", "Show blocks")}
                </button>
              </details>
            </div>
          )}
          <div className="editor-footer">
            {(!guided || guideReady) && (
              <button
                className="primary compact"
                disabled={
                  w.busy ||
                  !usable ||
                  (guided && !guideReady) ||
                  (!advanced &&
                    !flow &&
                    Object.values(formValidity).some((v) => !v)) ||
                  !String(usable.alias || "").trim()
                }
              >
                {w.busy
                  ? t("Lagrer …", "Saving …")
                  : t("Lagre automasjon", "Save automation")}
              </button>
            )}
            {editing.id && (
              <button
                type="button"
                className="text-button"
                onClick={() => setConfirm("delete")}
              >
                <Trash2 size={16} />
                {t("Slett", "Delete")}
              </button>
            )}
          </div>
        </form>
        {confirm && (
          <div className="inline-confirm">
            <p>
              {confirm === "delete"
                ? t(
                    "Slette denne automasjonen permanent?",
                    "Permanently delete this automation?",
                  )
                : t("Forkaste ulagrede endringer?", "Discard unsaved changes?")}
            </p>
            <button
              disabled={w.busy}
              onClick={() => {
                if (confirm === "leave") {
                  setEditing(null);
                  setConfirm(null);
                } else
                  void w.run(
                    () =>
                      api(
                        `manage/automations/${encodeURIComponent(editing.id!)}?expected_revision=${editing.revision}`,
                        "DELETE",
                      ),
                    () => {
                      setEditing(null);
                      setConfirm(null);
                    },
                  );
              }}
            >
              {t("Bekreft", "Confirm")}
            </button>
            <button onClick={() => setConfirm(null)}>
              {t("Avbryt", "Cancel")}
            </button>
          </div>
        )}
      </section>
    );
  return (
    <section className="automation-overview">
      <div className="page-heading">
        <span className="eyebrow">
          {t("Små rutiner, enklere dager", "Small routines, easier days")}
        </span>
        <div className="heading-row">
          <div className="automation-title">
            <Workflow size={36} />
            <div>
              <h1>{t("Automasjoner", "Automations")}</h1>
              <p>
                {t(
                  "Gjør hjemmet smartere med automatiske rutiner.",
                  "Make home smarter with automatic routines.",
                )}
              </p>
            </div>
          </div>
          <button
            className="primary compact"
            onClick={() => {
              setEditing({
                id: null,
                revision: "",
                config: {
                  alias: "",
                  description: "",
                  triggers: [],
                  conditions: [],
                  actions: [],
                  mode: "single",
                },
              });
              setAdvanced(false);
              setDirty(true);
              setGuided(true);
              setGuideReady(false);
              setConfirm(null);
            }}
          >
            <Plus size={18} />
            {t("Ny automasjon", "New automation")}
          </button>
        </div>
      </div>
      <Feedback message={w.message} />
      <div className="automation-banner">
        <img src={homeAsset("home-living")} alt="" />
        <div className="automation-banner-copy">
          <span className="eyebrow">
            {t("SMARTE RUTINER", "SMART ROUTINES")}
          </span>
          <h2>
            {t(
              "Automasjoner som jobber for deg",
              "Automations that work for you",
            )}
          </h2>
          <p>
            {t(
              "Små rutiner, store forskjeller. La hjemmet ta seg av hverdagen.",
              "Small routines, big differences. Let your home take care of the everyday.",
            )}
          </p>
        </div>
        <div className="automation-metrics">
          {[
            {
              icon: Play,
              label: t("Aktive", "Enabled"),
              value: q.data?.filter((a) => a.state === "on").length,
              tone: "active",
            },
            {
              icon: Pause,
              label: t("Deaktivert", "Disabled"),
              value: q.data?.filter((a) => a.state === "off").length,
              tone: "paused",
            },
            {
              icon: CircleAlert,
              label: t("Utilgjengelige", "Unavailable"),
              value: q.data?.filter((a) => !["on", "off"].includes(a.state))
                .length,
              tone: "unknown",
            },
            {
              icon: Workflow,
              label: t("Totalt", "Total"),
              value: q.data?.length,
              tone: "total",
            },
          ].map(({ icon: Icon, label, value, tone }) => (
            <div className={`automation-metric ${tone}`} key={tone}>
              <Icon size={24} />
              <div>
                <strong>{value ?? "—"}</strong>
                <span>{label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="automation-toolbar">
        <div
          className="automation-status-filters"
          aria-label={t("Filtrer automasjoner", "Filter automations")}
        >
          {(
            [
              ["all", t("Alle", "All"), LayoutGrid],
              ["on", t("Aktive", "Enabled"), Play],
              ["off", t("Deaktivert", "Disabled"), Pause],
              ["unavailable", t("Utilgjengelige", "Unavailable"), CircleAlert],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={String(value)}
              aria-pressed={statusFilter === value}
              onClick={() => setStatusFilter(String(value))}
            >
              <Icon size={17} />
              {String(label)}
            </button>
          ))}
        </div>
        <div className="automation-tools">
          <label className="automation-search">
            <Search size={19} />
            <input
              placeholder={t("Søk i automasjoner …", "Search automations …")}
              aria-label={t("Søk i automasjoner", "Search automations")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            aria-label={t("Sorter automasjoner", "Sort automations")}
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="name">{t("Navn (A–Å)", "Name (A–Z)")}</option>
            <option value="recent">{t("Sist kjørt", "Last run")}</option>
          </select>
          <div className="automation-view">
            <button
              aria-pressed={layout === "grid"}
              onClick={() => setLayout("grid")}
            >
              <LayoutGrid size={17} />
              {t("Kort", "Cards")}
            </button>
            <button
              aria-pressed={layout === "list"}
              onClick={() => setLayout("list")}
            >
              <List size={17} />
              {t("Liste", "List")}
            </button>
          </div>
        </div>
      </div>
      {q.isError && <LoadError lang={lang} retry={() => void q.refetch()} />}
      {q.isPending && (
        <p>{t("Henter automasjoner …", "Loading automations …")}</p>
      )}
      <div className={`automation-results ${layout}`}>
        {q.data
          ?.filter(
            (a) =>
              a.name.toLowerCase().includes(search.trim().toLowerCase()) &&
              (statusFilter === "all" ||
                (statusFilter === "unavailable"
                  ? !["on", "off"].includes(a.state)
                  : a.state === statusFilter)),
          )
          .sort((a, b) =>
            sort === "recent"
              ? (Date.parse(b.last_triggered || "") || 0) -
                  (Date.parse(a.last_triggered || "") || 0) ||
                a.name.localeCompare(b.name, lang)
              : a.name.localeCompare(b.name, lang),
          )
          .map((a) => (
            <article className="automation-item" key={a.entity_id}>
              <AutomationIcon
                entityId={a.entity_id}
                name={a.name}
                icon={a.icon}
                lang={lang}
              />
              <div className="automation-identity">
                <h2>
                  <button
                    className="automation-open-flow"
                    disabled={w.busy || !a.id}
                    onClick={() => void edit(a)}
                  >
                    {a.name}
                  </button>
                </h2>
                <p
                  className={`automation-state ${a.state === "on" ? "active" : ""}`}
                >
                  <i />
                  {a.state === "on"
                    ? t("Aktiv", "Enabled")
                    : a.state === "off"
                      ? t("Avslått", "Disabled")
                      : t("Utilgjengelig", "Unavailable")}
                </p>
              </div>
              <AutomationTrigger id={a.id} home={home} lang={lang} />
              <div className="automation-last-run">
                <span>
                  <Clock3 size={14} />
                  {t("Sist kjørt", "Last run")}
                </span>
                <strong>
                  {a.last_triggered
                    ? new Date(a.last_triggered).toLocaleString(
                        lang === "en" ? "en-GB" : "nb-NO",
                        {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )
                    : t("Ingen registrert kjøring", "No recorded run")}
                </strong>
              </div>
              <div className="row-actions">
                <button disabled={w.busy || !a.id} onClick={() => void edit(a)}>
                  <Pencil size={15} />
                  {t("Rediger", "Edit")}
                </button>
                <button
                  className="automation-switch"
                  role="switch"
                  aria-checked={a.state === "on"}
                  aria-label={`${t("Aktiver", "Enable")} ${a.name}`}
                  disabled={w.busy || !["on", "off"].includes(a.state)}
                  onClick={() =>
                    void w.run(() =>
                      api(
                        `manage/automation-actions/${encodeURIComponent(a.entity_id)}`,
                        "POST",
                        { action: a.state === "on" ? "turn_off" : "turn_on" },
                      ),
                    )
                  }
                >
                  <span />
                </button>
                <button
                  disabled={w.busy || !["on", "off"].includes(a.state)}
                  onClick={() => setRunConfirm(a.entity_id)}
                >
                  <Play size={15} />
                  {t("Kjør", "Run")}
                </button>
              </div>
              {runConfirm === a.entity_id && (
                <div className="inline-confirm full-row">
                  <p>
                    {t(
                      "Kjøre handlingene nå? Betingelsene kontrolleres først.",
                      "Run the actions now? Conditions will be checked first.",
                    )}
                  </p>
                  <button
                    disabled={w.busy}
                    onClick={() =>
                      void w.run(
                        () =>
                          api(
                            `manage/automation-actions/${encodeURIComponent(a.entity_id)}`,
                            "POST",
                            { action: "trigger" },
                          ),
                        () => setRunConfirm(null),
                      )
                    }
                  >
                    {t("Kjør nå", "Run now")}
                  </button>
                  <button onClick={() => setRunConfirm(null)}>
                    {t("Avbryt", "Cancel")}
                  </button>
                </div>
              )}
              {!a.id && (
                <p className="full-row muted">
                  {t(
                    "Mangler redigerbar ID. Konfigurasjonen må administreres der den ble opprettet.",
                    "No editable ID. Manage this configuration at its source.",
                  )}
                </p>
              )}
            </article>
          ))}
      </div>
      {q.data &&
        q.data.length > 0 &&
        !q.data.some(
          (a) =>
            a.name.toLowerCase().includes(search.trim().toLowerCase()) &&
            (statusFilter === "all" ||
              (statusFilter === "unavailable"
                ? !["on", "off"].includes(a.state)
                : a.state === statusFilter)),
        ) && (
          <p className="empty">
            {t(
              "Ingen automasjoner passer med søket og filteret.",
              "No automations match your search and filter.",
            )}{" "}
            <button
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
              }}
            >
              {t("Nullstill filtre", "Reset filters")}
            </button>
          </p>
        )}
      {q.data?.length === 0 && (
        <p className="empty">
          {t(
            "Lag din første rutine. For eksempel lys som slås på ved solnedgang.",
            "Create your first routine. Try lights that turn on at sunset.",
          )}
        </p>
      )}
    </section>
  );
}
