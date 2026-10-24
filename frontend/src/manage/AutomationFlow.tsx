import { flowCategories } from "./flowPresets";
import { useEffect, useState } from "react";
import {
  Sun,
  PersonStanding,
  Thermometer,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronRight,
  GitBranch,
  LayoutGrid,
  ListTree,
  Plus,
  Trash2,
  X,
  Zap,
  Filter,
  Play,
} from "lucide-react";
import { FlowCanvas } from "./FlowCanvas";
import { FlowTree } from "./FlowTree";
import { FlowInspector } from "./FlowInspector";
import { flowNarrative } from "./flowNarrative";
import {
  flowGroups,
  readFlowPath,
  replaceFlowPath,
  type FlowPath,
} from "./flowStructure";
import { flowIcon, kindAtPath, type FlowKind } from "./flowPresentation";
import { flowLibrary, newFlowStep } from "./flowLibrary";
import { SettingsDialog } from "../home/SettingsDialog";
import type { Home } from "../types";
import "./flowDesign.css";
export type FlowKey = FlowKind;
export const flowSummary = flowNarrative;
type Config = Record<string, any>;
export function AutomationFlow({
  config: c,
  home,
  lang,
  patch,
  onAdvanced,
}: {
  config: Config;
  home: Home;
  lang: string;
  patch: (c: Config) => void;
  onAdvanced: () => void;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const [view, setView] = useState<"canvas" | "structure">("structure");
  const [selected, setSelected] = useState<FlowPath | null>(null);
  const [trail, setTrail] = useState<FlowPath[]>([]);
  const [adding, setAdding] = useState<{
    path: FlowPath;
    kind: FlowKey;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [valid, setValid] = useState(true);
  const [removing, setRemoving] = useState(false);
  const [stepOriginal, setStepOriginal] = useState<any>(null);
  const [stepNew, setStepNew] = useState(false);
  useEffect(() => {
    setSearch("");
    setCategory("all");
  }, [adding]);
  const groups = [
    {
      key: "triggers" as const,
      title: t("Når dette skjer", "When this happens"),
      hint: t(
        "Én av hendelsene starter rutinen",
        "Any one event starts the routine",
      ),
      Icon: Zap,
    },
    {
      key: "conditions" as const,
      title: t("Og dette stemmer", "And this is true"),
      hint: t(
        "Alle krav må stemme akkurat da",
        "All requirements must be true at that moment",
      ),
      Icon: Filter,
    },
    {
      key: "actions" as const,
      title: t("Så gjør hjemmet dette", "Then your home does this"),
      hint: t("Stegene kjøres i denne rekkefølgen", "Steps run in this order"),
      Icon: Play,
    },
  ];
  function select(path: FlowPath, parents: FlowPath[] = []) {
    setTrail(parents);
    setStepNew(false);
    setStepOriginal(structuredClone(readFlowPath(c, path)));
    setSelected(path);
    setValid(true);
    setRemoving(false);
    setAdding(null);
  }
  function replace(path: FlowPath, value: any) {
    const next = replaceFlowPath(c, path, value);
    patch({ [path[0]]: next[path[0]] });
  }
  function startAdd(path: FlowPath, kind: FlowKey, parents: FlowPath[] = []) {
    setTrail(parents);
    setSelected(null);
    setAdding({ path, kind });
  }
  function close() {
    if (valid) {
      if (trail.length) select(trail[trail.length - 1], trail.slice(0, -1));
      else setSelected(null);
      setRemoving(false);
    }
  }
  function add(type: string) {
    if (!adding) return;
    const list = readFlowPath(c, adding.path);
    if (!Array.isArray(list)) return;
    const row = newFlowStep(adding.kind, type);
    replace(adding.path, [...list, row]);
    setStepNew(true);
    setStepOriginal(structuredClone(row));
    setSelected([...adding.path, list.length]);
    setValid(true);
    setAdding(null);
  }
  const row = selected ? readFlowPath(c, selected) : null;
  const kind = selected ? kindAtPath(selected) : "actions";
  const info = selected ? flowNarrative(row, kind, home, lang) : null;
  const Icon = selected ? flowIcon(row, kind, home) : GitBranch;
  const parent = selected ? readFlowPath(c, selected.slice(0, -1)) : null;
  const index = selected?.at(-1);
  function move(direction: number) {
    if (!selected || !Array.isArray(parent) || typeof index !== "number")
      return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= parent.length) return;
    const copy = [...parent];
    [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
    replace(selected.slice(0, -1), copy);
    setSelected([...selected.slice(0, -1), nextIndex]);
  }
  return (
    <div className="automation-flow flow-designer">
      <div className="flow-intro">
        <label>
          {t("Navn på rutinen", "Routine name")}
          <input
            required
            aria-label={t("Navn", "Name")}
            value={c.alias || ""}
            maxLength={200}
            placeholder={t(
              "For eksempel: Kveldslys i stuen",
              "For example: Evening lights in the living room",
            )}
            onChange={(e) => patch({ alias: e.target.value })}
          />
        </label>
        <p>
          {t(
            "Les fra når til så. Trykk på et kort for å tilpasse det. Endringene tas i bruk når du lagrer automasjonen.",
            "Read from when to then. Select a card to customize it. Changes take effect when you save the automation.",
          )}
        </p>
      </div>
      <div
        className="flow-story"
        aria-label={t("Slik fungerer rutinen", "How the routine works")}
      >
        {groups.map(({ key, title, Icon }, i) => {
          const count = c[key].filter((r: any) => r?.enabled !== false).length;
          return (
            <div key={key} className={`flow-story-part flow-${key}`}>
              <span className="flow-story-number">{i + 1}</span>
              <div>
                <span>
                  <Icon size={16} />
                  {title}
                </span>
                <strong>
                  {key === "triggers"
                    ? t(
                        `${count} hendelser kan starte`,
                        `${count} events can start`,
                      )
                    : key === "conditions"
                      ? count
                        ? t(
                            `${count} krav sjekkes`,
                            `${count} requirements checked`,
                          )
                        : t("Ingen ekstra krav", "No extra requirements")
                      : t(
                          `${count} steg i planen`,
                          `${count} steps in the plan`,
                        )}
                </strong>
              </div>
              {i < 2 && <ChevronRight size={20} />}
            </div>
          );
        })}
      </div>
      <div className="flow-view-bar">
        <div
          className="flow-view-tabs"
          role="group"
          aria-label={t("Flytoppsett", "Flow layout")}
        >
          <button
            type="button"
            aria-pressed={view === "structure"}
            onClick={() => setView("structure")}
          >
            <ListTree size={18} />
            {t("Steg for steg", "Step by step")}
          </button>
          <button
            type="button"
            aria-pressed={view === "canvas"}
            onClick={() => setView("canvas")}
          >
            <LayoutGrid size={18} />
            {t("Fri arbeidsflate", "Free canvas")}
          </button>
        </div>
        <span>
          {view === "structure"
            ? t(
                "Hendelser → krav → handlinger",
                "Events → requirements → actions",
              )
            : t(
                "Flytt kort og utforsk forbindelser",
                "Move cards and explore connections",
              )}
        </span>
      </div>
      {view === "canvas" && (
        <FlowCanvas
          config={c}
          home={home}
          lang={lang}
          onSelect={select}
          onAdd={(key) => startAdd([key], key)}
          onRemove={(path) => {
            const list = readFlowPath(c, path.slice(0, -1));
            if (Array.isArray(list))
              replace(
                path.slice(0, -1),
                list.filter((_: any, i: number) => i !== path.at(-1)),
              );
          }}
          onConnect={patch}
        />
      )}
      <div
        className="flow-board"
        hidden={view !== "structure"}
        aria-label={t("Automasjonsflyt", "Automation flow")}
      >
        {groups.map(({ key, title, hint, Icon }, g) => (
          <section key={key} className={`flow-lane flow-${key}`}>
            <header>
              <span>
                <Icon size={22} />
              </span>
              <div>
                <small>
                  {t("DEL", "PART")} {g + 1}
                </small>
                <h2>{title}</h2>
                <p>{hint}</p>
              </div>
              <span className="flow-lane-count">{c[key].length}</span>
            </header>
            <div className="flow-cards">
              {c[key].map((item: any, i: number) => (
                <div key={i} className="flow-step-wrap">
                  {i > 0 && (
                    <span className="flow-step-join">
                      {key === "triggers"
                        ? t("ELLER", "OR")
                        : key === "conditions"
                          ? t("OG", "AND")
                          : t("DERETTER", "THEN")}
                    </span>
                  )}
                  <FlowTree
                    row={item}
                    path={[key, i]}
                    kind={key}
                    home={home}
                    lang={lang}
                    onSelect={select}
                    onAppend={(path, kind) => startAdd(path, kind)}
                  />
                </div>
              ))}
              {!c[key].length && (
                <div className="flow-empty">
                  {key === "conditions"
                    ? t(
                        "Ingen ekstra krav. Rutinen går videre når en hendelse inntreffer.",
                        "No extra requirements. The routine continues when an event occurs.",
                      )
                    : key === "triggers"
                      ? t(
                          "Hva skal sette rutinen i gang?",
                          "What should start the routine?",
                        )
                      : t(
                          "Hva skal hjemmet gjøre for deg?",
                          "What should your home do for you?",
                        )}
                </div>
              )}
            </div>
            <button
              type="button"
              className="flow-add"
              onClick={() => startAdd([key], key)}
            >
              <Plus size={18} />
              {key === "triggers"
                ? t("Legg til hendelse", "Add event")
                : key === "conditions"
                  ? t("Legg til krav", "Add requirement")
                  : t("Legg til handling", "Add action")}
            </button>
          </section>
        ))}
      </div>
      {adding && (
        <SettingsDialog
          title={t("Hva vil du legge til?", "What would you like to add?")}
          lang={lang}
          onClose={() => {
            setAdding(null);
            if (trail.length)
              select(trail[trail.length - 1], trail.slice(0, -1));
          }}
        >
          <div className="flow-library-intro">
            <p>
              {adding.kind === "triggers"
                ? t(
                    "Velg hva som skal sette rutinen i gang.",
                    "Choose what starts the routine.",
                  )
                : adding.kind === "conditions"
                  ? t(
                      "Velg et krav som må stemme før rutinen går videre.",
                      "Choose a requirement for the routine to continue.",
                    )
                  : t(
                      "Velg hva hjemmet skal gjøre, eller hvordan stegene skal kjøres.",
                      "Choose what your home does, or how the steps should run.",
                    )}
            </p>
            <input
              className="wide-input"
              aria-label={t("Søk etter kort", "Search cards")}
              placeholder={t(
                "Søk etter lys, tid, temperatur …",
                "Search lights, time, temperature …",
              )}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCategory("all");
              }}
            />
          </div>
          <div
            className="flow-library-categories"
            role="group"
            aria-label={t("Kortkategorier", "Card categories")}
          >
            {flowCategories
              .filter(
                ([id]) =>
                  id === "all" ||
                  flowLibrary(adding.kind, lang).some(
                    (item) => item.category === id,
                  ),
              )
              .map(([id, nb, en]) => (
                <button
                  type="button"
                  key={id}
                  aria-pressed={category === id}
                  onClick={() => setCategory(id)}
                >
                  {t(nb, en)}
                </button>
              ))}
          </div>
          <p className="flow-library-note">
            {t(
              "Velg et forslag, og tilpass enhet og verdier i neste steg.",
              "Choose a suggestion, then customize devices and values in the next step.",
            )}
          </p>
          <div className="flow-card-library">
            {flowLibrary(adding.kind, lang)
              .filter((x) => category === "all" || x.category === category)
              .filter((x) =>
                `${x.title} ${x.hint}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((item) => {
                const Symbol = item.id.startsWith("preset:")
                  ? {
                      time: Sun,
                      presence: PersonStanding,
                      climate: Thermometer,
                      energy: Zap,
                    }[item.category] || Zap
                  : flowIcon(
                      newFlowStep(adding.kind, item.id),
                      adding.kind,
                      home,
                    );
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => add(item.id)}
                  >
                    <span>
                      <Symbol size={23} />
                    </span>
                    <div>
                      <strong>{item.title}</strong>
                      <small>{item.hint}</small>
                    </div>
                    <Plus size={17} />
                  </button>
                );
              })}
          </div>
          {!flowLibrary(adding.kind, lang).some((x) =>
            `${x.title} ${x.hint}`.toLowerCase().includes(search.toLowerCase()),
          ) && (
            <p className="quiet-notice">
              {t(
                "Ingen kort passer søket. Prøv et annet ord.",
                "No cards match. Try another word.",
              )}
            </p>
          )}
        </SettingsDialog>
      )}
      {selected && row !== undefined && (
        <SettingsDialog
          title={t("Tilpass steget", "Customize step")}
          lang={lang}
          onClose={close}
        >
          {trail.length > 0 && (
            <button
              type="button"
              className="text-button"
              disabled={!valid}
              onClick={close}
            >
              <ArrowLeft size={17} />
              {t("Tilbake til forrige steg", "Back to parent step")}
            </button>
          )}
          <div className={`flow-edit-summary flow-${kind}`}>
            <Icon size={28} />
            <div>
              <strong>{info?.title}</strong>
              <p>{info?.detail}</p>
            </div>
          </div>
          <FlowInspector
            key={JSON.stringify(selected)}
            row={row}
            kind={kind}
            home={home}
            lang={lang}
            onValidityChange={setValid}
            onChange={(value) => replace(selected, value)}
            onAdvanced={() => {
              if (!valid) return;
              setSelected(null);
              onAdvanced();
            }}
          />
          {flowGroups(row, selected, lang).length > 0 && (
            <section className="flow-subflow-editor">
              <h3>{t("Stegene inni", "Steps inside")}</h3>
              <p>
                {t(
                  "Trykk på et kort for å redigere det. Grenene beholder samme rekkefølge.",
                  "Select a card to edit it. Branches keep their original order.",
                )}
              </p>
              <fieldset disabled={!valid}>
                {flowGroups(row, selected, lang).map((group) => (
                  <section
                    className={`flow-subflow-group flow-${group.kind}`}
                    key={JSON.stringify(group.path)}
                  >
                    <h4>{group.label}</h4>
                    {(Array.isArray(group.value)
                      ? group.value
                      : [group.value]
                    ).map((item, i) => (
                      <FlowTree
                        key={i}
                        row={item}
                        path={
                          Array.isArray(group.value)
                            ? [...group.path, i]
                            : group.path
                        }
                        kind={group.kind}
                        home={home}
                        lang={lang}
                        onSelect={(path) => {
                          if (valid) select(path, [...trail, selected]);
                        }}
                        onAppend={(path, kind) => {
                          if (valid) {
                            startAdd(path, kind, [...trail, selected]);
                          }
                        }}
                      />
                    ))}
                    {Array.isArray(group.value) && (
                      <button
                        type="button"
                        className="flow-add"
                        onClick={() => {
                          startAdd(group.path, group.kind, [
                            ...trail,
                            selected,
                          ]);
                        }}
                      >
                        <Plus size={16} />
                        {t("Legg til steg her", "Add a step here")}
                      </button>
                    )}
                  </section>
                ))}
              </fieldset>
            </section>
          )}
          {!valid && (
            <p role="alert" className="quiet-notice">
              {t(
                "Rett feltet som er markert, eller forkast endringene i dette steget.",
                "Correct the highlighted field, or discard this step’s changes.",
              )}
            </p>
          )}
          <div className="flow-edit-footer">
            <button
              type="button"
              className="primary compact"
              disabled={!valid}
              onClick={close}
            >
              <Check size={17} />
              {t("Ferdig med steget", "Done with step")}
            </button>
            <button
              type="button"
              onClick={() => {
                if (stepNew && Array.isArray(parent))
                  replace(
                    selected.slice(0, -1),
                    parent.filter((_: any, i: number) => i !== index),
                  );
                else replace(selected, stepOriginal);
                setSelected(null);
                setValid(true);
              }}
            >
              {t("Forkast endringer i steget", "Discard step changes")}
            </button>
          </div>
          {Array.isArray(parent) && typeof index === "number" && (
            <div className="flow-edit-arrange">
              <span>
                {t(
                  `Steg ${index + 1} av ${parent.length}`,
                  `Step ${index + 1} of ${parent.length}`,
                )}
              </span>
              <button
                type="button"
                disabled={!valid || index === 0}
                onClick={() => move(-1)}
              >
                <ArrowUp size={16} />
                {t("Flytt opp", "Move up")}
              </button>
              <button
                type="button"
                disabled={!valid || index === parent.length - 1}
                onClick={() => move(1)}
              >
                <ArrowDown size={16} />
                {t("Flytt ned", "Move down")}
              </button>
              <button type="button" onClick={() => setRemoving(true)}>
                <Trash2 size={16} />
                {t("Fjern steget", "Remove step")}
              </button>
            </div>
          )}
          {removing && (
            <div className="inline-confirm">
              <p>
                {t(
                  "Fjerne dette steget og eventuelle steg inni det? Endringen tas i bruk når du lagrer automasjonen.",
                  "Remove this step and any steps inside it? The change takes effect when you save the automation.",
                )}
              </p>
              <button
                type="button"
                onClick={() => {
                  replace(
                    selected.slice(0, -1),
                    parent.filter((_: any, i: number) => i !== index),
                  );
                  setSelected(null);
                  setRemoving(false);
                }}
              >
                {t("Ja, fjern steget", "Yes, remove step")}
              </button>
              <button type="button" onClick={() => setRemoving(false)}>
                {t("Behold steget", "Keep step")}
              </button>
            </div>
          )}
        </SettingsDialog>
      )}
      <details className="flow-settings">
        <summary>
          {t(
            "Beskrivelse og hvordan rutinen kjører",
            "Description and how the routine runs",
          )}
        </summary>
        <label>
          {t("Beskrivelse", "Description")}
          <textarea
            value={c.description || ""}
            onChange={(e) => patch({ description: e.target.value })}
          />
        </label>
        <label>
          {t(
            "Hvis en ny hendelse skjer mens rutinen kjører",
            "If another event occurs while the routine is running",
          )}
          <select
            value={c.mode || "single"}
            onChange={(e) => patch({ mode: e.target.value })}
          >
            <option value="single">
              {t(
                "La det pågående løpet bli ferdig",
                "Let the current run finish",
              )}
            </option>
            <option value="restart">
              {t("Stopp og start på nytt", "Stop and start again")}
            </option>
            <option value="queued">
              {t("Legg neste kjøring i kø", "Queue the next run")}
            </option>
            <option value="parallel">
              {t(
                "Start et nytt løp samtidig",
                "Start another run at the same time",
              )}
            </option>
          </select>
        </label>
        <p className="muted">
          {
            (
              {
                single: t(
                  "Nye hendelser starter ikke et nytt løp mens rutinen kjører.",
                  "New events do not start another run while the routine is running.",
                ),
                restart: t(
                  "Det pågående løpet stoppes og erstattes når kravene er oppfylt.",
                  "The current run is stopped and replaced when conditions are met.",
                ),
                queued: t(
                  "Hver godkjente kjøring venter på sin tur. Rekkefølgen beholdes.",
                  "Each qualifying run waits its turn. Order is preserved.",
                ),
                parallel: t(
                  "Flere kjøringer kan pågå samtidig og påvirke de samme enhetene.",
                  "Multiple runs can run simultaneously and affect the same devices.",
                ),
              } as Record<string, string>
            )[c.mode || "single"]
          }
        </p>
        <button type="button" onClick={onAdvanced}>
          {t("Vis hele konfigurasjonen", "Show full configuration")}
        </button>
      </details>
    </div>
  );
}
