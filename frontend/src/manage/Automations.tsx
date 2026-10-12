import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Plus,
  Play,
  Trash2,
  Zap,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { AutomationGuide, canGuide } from "./AutomationGuide";
import { api } from "../api";
import type { Home } from "../types";
import { Feedback, LoadError, useWork, words } from "./shared";
type Config = Record<string, any>;
type Automation = {
  entity_id: string;
  id: string | null;
  name: string;
  state: string;
  last_triggered: string | null;
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
  home,
  onDirty,
}: {
  lang: string;
  home: Home;
  onDirty: (v: boolean) => void;
}) {
  const t = (nb: string, en: string) => words(lang, nb, en);
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
  const [guided, setGuided] = useState(false);
  const [guideReady, setGuideReady] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [raw, setRaw] = useState("");
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState<"delete" | "leave" | null>(null);
  const [runConfirm, setRunConfirm] = useState<string | null>(null);
  const w = useWork(lang);
  const c = editing?.config;
  useEffect(() => {
    onDirty(!!editing);
    return () => onDirty(false);
  }, [!!editing, onDirty]);
  useEffect(() => {
    if (!editing) return;
    const before = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [!!editing]);
  function patch(value: Config) {
    if (editing)
      setEditing({ ...editing, config: { ...editing.config, ...value } });
  }
  function rawMode() {
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
  const labels: Record<string, string> = {
    time: t("Klokkeslett", "Time"),
    state: t("Tilstand", "State"),
    sun: t("Sol", "Sun"),
    numeric_state: t("Tallverdi", "Numeric value"),
    "light.turn_on": t("Slå på lys", "Turn on lights"),
    "light.turn_off": t("Slå av lys", "Turn off lights"),
    "switch.turn_on": t("Slå på bryter", "Turn on switch"),
    "switch.turn_off": t("Slå av bryter", "Turn off switch"),
    "climate.set_temperature": t("Still temperatur", "Set temperature"),
    "scene.turn_on": t("Aktiver scene", "Activate scene"),
  };
  const catalog = useQuery({
    queryKey: ["manage", "entities"],
    queryFn: () =>
      api<{ entity_id: string; name: string }[]>("manage/entities"),
  });
  const options = catalog.data || home.controls;
  function entitySelect(
    value: string,
    onChange: (v: string) => void,
    label = t("Enhet eller sensor", "Device or sensor"),
  ) {
    return (
      <select
        aria-label={label}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{t("Velg …", "Choose …")}</option>
        {value && !options.some((o) => o.entity_id === value) && (
          <option value={value}>{value}</option>
        )}
        {options.map((o) => (
          <option key={o.entity_id} value={o.entity_id}>
            {o.name} · {o.entity_id}
          </option>
        ))}
      </select>
    );
  }
  function updateRow(key: string, i: number, value: Config) {
    patch({
      [key]: c![key].map((v: Config, j: number) => (j === i ? value : v)),
    });
  }
  function section(
    key: "triggers" | "conditions" | "actions",
    index: string,
    title: string,
    intro: string,
  ) {
    const rows: Config[] = c![key];
    return (
      <section className="automation-section">
        <div className="automation-step">
          <span>{index}</span>
          <div>
            <h2>{title}</h2>
            <p>{intro}</p>
          </div>
        </div>
        {rows.map((row, i) => {
          const kind =
            row?.trigger ||
            row?.platform ||
            row?.condition ||
            row?.action ||
            row?.service;
          const update = (v: Config) => updateRow(key, i, { ...row, ...v });
          const supported =
            row &&
            typeof row === "object" &&
            (key === "triggers"
              ? ["time", "state", "sun"].includes(kind)
              : key === "conditions"
                ? ["state", "numeric_state"].includes(kind)
                : typeof kind === "string" && kind.includes("."));
          return (
            <div className="automation-block" key={i}>
              <div className="block-top">
                <strong>
                  {i + 1}.{" "}
                  {labels[kind] ||
                    kind ||
                    t("Avansert blokk", "Advanced block")}
                </strong>
                <div className="row-actions">
                  <button
                    type="button"
                    aria-label={t("Flytt opp", "Move up")}
                    disabled={i === 0}
                    onClick={() => {
                      const next = [...rows];
                      [next[i - 1], next[i]] = [next[i], next[i - 1]];
                      patch({ [key]: next });
                    }}
                  >
                    <ChevronUp size={18} />
                  </button>
                  <button
                    type="button"
                    aria-label={t("Flytt ned", "Move down")}
                    disabled={i === rows.length - 1}
                    onClick={() => {
                      const next = [...rows];
                      [next[i + 1], next[i]] = [next[i], next[i + 1]];
                      patch({ [key]: next });
                    }}
                  >
                    <ChevronDown size={18} />
                  </button>
                  <button
                    type="button"
                    aria-label={t("Fjern blokk", "Remove block")}
                    onClick={() =>
                      patch({ [key]: rows.filter((_, j) => j !== i) })
                    }
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>
              {!supported ? (
                <>
                  <p>
                    {t(
                      "Denne blokken beholdes uendret. Åpne avansert redigering for å endre den.",
                      "This block is preserved. Open advanced editing to change it.",
                    )}
                  </p>
                  <pre>{JSON.stringify(row, null, 2)}</pre>
                  <button type="button" onClick={rawMode}>
                    {t("Avansert redigering", "Advanced editing")}
                  </button>
                </>
              ) : (
                <div className="form-grid">
                  {key === "triggers" && kind === "time" && (
                    <label>
                      {t("Klokkeslett", "Time")}
                      <input
                        type={
                          typeof row.at === "string" &&
                          /^\d\d:\d\d/.test(row.at)
                            ? "time"
                            : "text"
                        }
                        step="1"
                        value={
                          typeof row.at === "string"
                            ? row.at
                            : JSON.stringify(row.at)
                        }
                        onChange={(e) => update({ at: e.target.value })}
                      />
                    </label>
                  )}
                  {key === "triggers" && kind === "sun" && (
                    <label>
                      {t("Solhendelse", "Sun event")}
                      <select
                        value={row.event}
                        onChange={(e) => update({ event: e.target.value })}
                      >
                        <option value="sunset">
                          {t("Solnedgang", "Sunset")}
                        </option>
                        <option value="sunrise">
                          {t("Soloppgang", "Sunrise")}
                        </option>
                      </select>
                    </label>
                  )}
                  {(kind === "state" || kind === "numeric_state") && (
                    <>
                      <label>
                        {t("Enhet eller sensor", "Device or sensor")}
                        {typeof row.entity_id === "string" ||
                        row.entity_id == null ? (
                          entitySelect(row.entity_id, (v) =>
                            update({ entity_id: v }),
                          )
                        ) : (
                          <button type="button" onClick={rawMode}>
                            {t(
                              "Flere entiteter – rediger avansert",
                              "Multiple entities – edit advanced",
                            )}
                          </button>
                        )}
                      </label>
                      {kind === "state" ? (
                        <label>
                          {key === "triggers"
                            ? t("Blir", "Becomes")
                            : t("Er", "Is")}
                          <input
                            value={
                              (key === "triggers" ? row.to : row.state) ?? ""
                            }
                            placeholder="on / off"
                            onChange={(e) =>
                              update({
                                [key === "triggers" ? "to" : "state"]:
                                  e.target.value,
                              })
                            }
                          />
                        </label>
                      ) : (
                        <>
                          <label>
                            {t("Over", "Above")}
                            <input
                              value={row.above ?? ""}
                              onChange={(e) => {
                                const next = { ...row };
                                if (e.target.value === "") delete next.above;
                                else
                                  next.above = Number.isFinite(
                                    Number(e.target.value),
                                  )
                                    ? Number(e.target.value)
                                    : e.target.value;
                                updateRow(key, i, next);
                              }}
                            />
                          </label>
                          <label>
                            {t("Under", "Below")}
                            <input
                              value={row.below ?? ""}
                              onChange={(e) => {
                                const next = { ...row };
                                if (e.target.value === "") delete next.below;
                                else
                                  next.below = Number.isFinite(
                                    Number(e.target.value),
                                  )
                                    ? Number(e.target.value)
                                    : e.target.value;
                                updateRow(key, i, next);
                              }}
                            />
                          </label>
                        </>
                      )}
                    </>
                  )}
                  {key === "actions" && (
                    <>
                      <label>
                        {t("Handling", "Action")}
                        <select
                          value={kind}
                          onChange={(e) => {
                            const next: Config = {
                              ...row,
                              action: e.target.value,
                            };
                            delete next.service;
                            updateRow(key, i, next);
                          }}
                        >
                          {![
                            "light.turn_on",
                            "light.turn_off",
                            "switch.turn_on",
                            "switch.turn_off",
                            "climate.set_temperature",
                            "scene.turn_on",
                          ].includes(kind) && (
                            <option value={kind}>{kind}</option>
                          )}
                          {[
                            "light.turn_on",
                            "light.turn_off",
                            "switch.turn_on",
                            "switch.turn_off",
                            "climate.set_temperature",
                            "scene.turn_on",
                          ].map((v) => (
                            <option key={v} value={v}>
                              {labels[v] || v}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {t("Mål", "Target")}
                        {!row.target ||
                        typeof row.target.entity_id === "string" ? (
                          entitySelect(
                            row.target?.entity_id,
                            (v) =>
                              update({
                                target: { ...row.target, entity_id: v },
                              }),
                            t("Mål", "Target"),
                          )
                        ) : (
                          <button type="button" onClick={rawMode}>
                            {t(
                              "Rediger mål i avansert visning",
                              "Edit target in advanced view",
                            )}
                          </button>
                        )}
                      </label>
                      {kind === "climate.set_temperature" && (
                        <label>
                          {t("Temperatur", "Temperature")}
                          <input
                            type="number"
                            step="0.5"
                            value={row.data?.temperature ?? 22}
                            onChange={(e) =>
                              update({
                                data: {
                                  ...row.data,
                                  temperature: Number(e.target.value),
                                },
                              })
                            }
                          />
                        </label>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div className="block-add">
          {(key === "triggers"
            ? [
                ["time", t("Klokkeslett", "Time")],
                ["state", t("Tilstand", "State")],
                ["sun", t("Sol", "Sun")],
              ]
            : key === "conditions"
              ? [
                  ["state", t("Tilstand", "State")],
                  ["numeric_state", t("Tallverdi", "Numeric value")],
                ]
              : [["light.turn_on", t("Handling", "Action")]]
          ).map(([kind, label]) => (
            <button
              type="button"
              key={kind}
              onClick={() =>
                patch({
                  [key]: [
                    ...rows,
                    key === "triggers"
                      ? {
                          trigger: kind,
                          ...(kind === "time"
                            ? { at: "20:00:00" }
                            : kind === "sun"
                              ? { event: "sunset" }
                              : { entity_id: "", to: "on" }),
                        }
                      : key === "conditions"
                        ? {
                            condition: kind,
                            entity_id: "",
                            ...(kind === "state"
                              ? { state: "on" }
                              : { above: 0 }),
                          }
                        : { action: kind, target: { entity_id: "" } },
                  ],
                })
              }
            >
              <Plus size={16} />
              {label}
            </button>
          ))}
        </div>
      </section>
    );
  }
  async function edit(a: Automation) {
    if (!a.id) return;
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
      setGuided(canGuide(normalizedConfig(v.config)));
      setGuideReady(false);
      setConfirm(null);
    });
  }
  if (editing && c)
    return (
      <section className="management-page">
        <button className="text-button" onClick={() => setConfirm("leave")}>
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
          className={guided ? "guided-form" : undefined}
          onSubmit={(e) => {
            e.preventDefault();
            if (!usable || (guided && !guideReady)) return;
            void w.run(
              () =>
                api(
                  editing.id
                    ? `manage/automations/${encodeURIComponent(editing.id)}`
                    : "manage/automations",
                  editing.id ? "PUT" : "POST",
                  { config: usable, revision: editing.revision },
                ),
              () => setEditing(null),
            );
          }}
        >
          {guided && (
            <AutomationGuide
              config={c}
              home={home}
              lang={lang}
              patch={patch}
              onReady={setGuideReady}
              onAdvanced={() => setGuided(false)}
            />
          )}
          {!advanced && !guided && (
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
              <button type="button" className="text-button" onClick={rawMode}>
                {t("Avansert redigering (JSON)", "Advanced editing (JSON)")}
              </button>
            </>
          )}
          {advanced && (
            <div className="advanced-editor">
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
                  onChange={(e) => setRaw(e.target.value)}
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
                  }
                }}
              >
                {t("Vis byggeklosser", "Show blocks")}
              </button>
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
    <section>
      <div className="page-heading">
        <span className="eyebrow">
          {t("Små rutiner, enklere dager", "Small routines, easier days")}
        </span>
        <div className="heading-row">
          <h1>{t("Automasjoner", "Automations")}</h1>
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
      <input
        className="wide-input"
        placeholder={t("Søk i automasjoner …", "Search automations …")}
        aria-label={t("Søk i automasjoner", "Search automations")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {q.isError && <LoadError lang={lang} retry={() => void q.refetch()} />}
      {q.isPending && (
        <p>{t("Henter automasjoner …", "Loading automations …")}</p>
      )}
      <div className="management-rows">
        {q.data
          ?.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()))
          .map((a) => (
            <article className="system-row" key={a.entity_id}>
              <Zap size={24} />
              <div>
                <h2>{a.name}</h2>
                <p>
                  {a.state === "on"
                    ? t("Aktiv", "Enabled")
                    : a.state === "off"
                      ? t("Avslått", "Disabled")
                      : t("Utilgjengelig", "Unavailable")}
                </p>
                {a.last_triggered && (
                  <small>
                    {t("Sist kjørt: ", "Last run: ")}
                    {new Date(a.last_triggered).toLocaleString(
                      lang === "en" ? "en-GB" : "nb-NO",
                    )}
                  </small>
                )}
              </div>
              <div className="row-actions">
                <button disabled={w.busy || !a.id} onClick={() => void edit(a)}>
                  {t("Rediger", "Edit")}
                </button>
                <button
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
                  {a.state === "on"
                    ? t("Slå av", "Disable")
                    : t("Slå på", "Enable")}
                </button>
                <button
                  disabled={w.busy}
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
