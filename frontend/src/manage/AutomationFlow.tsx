import { entityState } from "./entityWords";
import { useState, useRef, useEffect, type ReactNode } from "react";
import { Zap, Filter, Play, Plus, Pencil, ArrowRight, X } from "lucide-react";
import type { Home } from "../types";
import { words } from "./shared";
type Config = Record<string, any>;
export type FlowKey = "triggers" | "conditions" | "actions";
export function flowSummary(
  row: any,
  key: FlowKey,
  home: Home,
  lang: string,
): { title: string; detail: string } {
  const t = (nb: string, en: string) => words(lang, nb, en),
    name = (id: any) =>
      typeof id === "string"
        ? home.controls.find((c) => c.entity_id === id)?.name || id
        : t("Flere mål", "Multiple targets");
  if (!row || typeof row !== "object")
    return {
      title: t("Avansert blokk", "Advanced block"),
      detail: t("Beholdes i sin helhet", "Preserved in full"),
    };
  const kind =
    row.trigger || row.platform || row.condition || row.action || row.service;
  if (kind === "time")
    return {
      title: t("Klokken er ", "The time is ") + String(row.at || "…"),
      detail: t("Tidsstyrt hendelse", "Scheduled event"),
    };
  if (kind === "sun")
    return {
      title:
        row.event === "sunset"
          ? t("Solen går ned", "The sun sets")
          : t("Solen står opp", "The sun rises"),
      detail: row.offset
        ? t("Forskyvning: ", "Offset: ") + row.offset
        : t("Følger årstidene", "Follows the seasons"),
    };
  if (kind === "state") {
    const state = key === "conditions" ? row.state : row.to;
    return {
      title: name(row.entity_id),
      detail:
        (key === "conditions"
          ? t("Er ", "Is ")
          : t("Endres til ", "Changes to ")) +
        (state == null
          ? t("en ny tilstand", "a new state")
          : entityState(row.entity_id, state, home, lang).toLocaleLowerCase()),
    };
  }
  if (kind === "numeric_state")
    return {
      title: name(row.entity_id),
      detail: [
        row.above !== undefined ? t("Over ", "Above ") + row.above : "",
        row.below !== undefined ? t("Under ", "Below ") + row.below : "",
      ]
        .filter(Boolean)
        .join(" · "),
    };
  if (typeof kind === "string" && kind.includes("."))
    return {
      title: kind.endsWith(".turn_on")
        ? t("Slå på", "Turn on")
        : kind.endsWith(".turn_off")
          ? t("Slå av", "Turn off")
          : kind === "climate.set_temperature"
            ? t("Still temperatur", "Set temperature")
            : kind,
      detail: name(row.target?.entity_id || row.entity_id || ""),
    };
  return {
    title:
      row.alias ||
      (row.choose
        ? t("Velg mellom handlinger", "Choose actions")
        : row.delay
          ? t("Vent", "Wait")
          : t("Avansert blokk", "Advanced block")),
    detail: t(
      "Alle innstillinger beholdes · åpne for detaljer",
      "All settings retained · open for details",
    ),
  };
}
export function AutomationFlow({
  config: c,
  home,
  lang,
  patch,
  editor,
  onAdvanced,
}: {
  config: Config;
  home: Home;
  lang: string;
  patch: (c: Config) => void;
  editor: (key: FlowKey, index: number) => ReactNode;
  onAdvanced: () => void;
}) {
  const t = (nb: string, en: string) => words(lang, nb, en);
  const [selected, setSelected] = useState<{
      key: FlowKey;
      index: number;
    } | null>(null),
    [adding, setAdding] = useState<FlowKey | null>(null);
  const detail = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selected || adding) {
      detail.current?.scrollIntoView({ block: "nearest" });
      detail.current?.focus();
    }
  }, [selected, adding]);
  const groups: {
    key: FlowKey;
    title: string;
    hint: string;
    Icon: typeof Zap;
  }[] = [
    {
      key: "triggers",
      title: t("Når", "When"),
      hint: t("Én av disse starter rutinen", "Any of these starts the routine"),
      Icon: Zap,
    },
    {
      key: "conditions",
      title: t("Og hvis", "And if"),
      hint: t("Alle må stemme", "All must be true"),
      Icon: Filter,
    },
    {
      key: "actions",
      title: t("Så gjør", "Then"),
      hint: t("Kjøres fra toppen og ned", "Runs from top to bottom"),
      Icon: Play,
    },
  ];
  function add(kind: string) {
    if (!adding) return;
    const row =
      adding === "triggers"
        ? kind === "time"
          ? { trigger: "time", at: "20:00:00" }
          : kind === "sun"
            ? { trigger: "sun", event: "sunset" }
            : { trigger: "state", entity_id: "", from: "off", to: "on" }
        : adding === "conditions"
          ? {
              condition: kind,
              entity_id: "",
              ...(kind === "state" ? { state: "on" } : { above: 0 }),
            }
          : { action: kind, target: { entity_id: "" } };
    const index = c[adding].length;
    patch({ [adding]: [...c[adding], row] });
    setSelected({ key: adding, index });
    setAdding(null);
  }
  return (
    <div className="automation-flow">
      <div className="flow-intro">
        <label>
          {t("Navn", "Name")}
          <input
            required
            aria-label={t("Navn", "Name")}
            maxLength={200}
            value={c.alias || ""}
            placeholder={t("Gi rutinen et navn", "Name your routine")}
            onChange={(e) => patch({ alias: e.target.value })}
          />
        </label>
        <p>
          {t(
            "Følg linjen. Trykk på et kort for å endre det.",
            "Follow the line. Select a card to edit it.",
          )}
        </p>
      </div>
      <div
        className="flow-board"
        aria-label={t("Automasjonsflyt", "Automation flow")}
      >
        {groups.map(({ key, title, hint, Icon }, g) => (
          <section key={key} className={"flow-lane flow-" + key}>
            <header>
              <span>
                <Icon size={20} />
              </span>
              <h2>{title}</h2>
              {g < 2 && <ArrowRight className="flow-arrow" size={20} />}
            </header>
            <p>{hint}</p>
            <div className="flow-cards">
              {c[key].map((row: any, index: number) => {
                const summary = flowSummary(row, key, home, lang);
                return (
                  <button
                    className="flow-card"
                    type="button"
                    key={index}
                    aria-label={`${t("Rediger", "Edit")} ${title} ${index + 1}: ${summary.title}`}
                    aria-pressed={
                      selected?.key === key && selected.index === index
                    }
                    onClick={() => {
                      setSelected({ key, index });
                      setAdding(null);
                    }}
                  >
                    <small>
                      {String(index + 1).padStart(2, "0")}
                      {row?.enabled === false
                        ? " · " + t("Deaktivert", "Disabled")
                        : ""}
                    </small>
                    <strong>{summary.title}</strong>
                    <span>{summary.detail}</span>
                    <Pencil size={16} />
                  </button>
                );
              })}
              {!c[key].length && (
                <div className="flow-empty">
                  {key === "conditions"
                    ? t(
                        "Ingen ekstra krav. Rutinen kan kjøre hver gang.",
                        "No extra requirements. The routine can run each time.",
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
              onClick={() => {
                setAdding(key);
                setSelected(null);
              }}
            >
              <Plus size={17} />
              {t("Legg til", "Add")} {title.toLowerCase()}
            </button>
          </section>
        ))}
      </div>
      {adding && (
        <section
          ref={detail}
          tabIndex={-1}
          className="flow-detail"
          aria-label={t("Ny flytblokk", "New flow block")}
        >
          <h2>{t("Velg hva du vil legge til", "Choose what to add")}</h2>
          <div className="block-add">
            {(adding === "triggers"
              ? [
                  ["time", t("Klokkeslett", "Time")],
                  [
                    "sun",
                    t("Soloppgang eller solnedgang", "Sunrise or sunset"),
                  ],
                  ["state", t("Sensor eller enhet", "Sensor or device")],
                ]
              : adding === "conditions"
                ? [
                    ["state", t("En tilstand", "A state")],
                    ["numeric_state", t("En måleverdi", "A measurement")],
                  ]
                : [
                    ["light.turn_on", t("Slå på lys", "Turn on lights")],
                    ["light.turn_off", t("Slå av lys", "Turn off lights")],
                    [
                      "switch.turn_on",
                      t("Slå på stikkontakt", "Turn on socket"),
                    ],
                    [
                      "switch.turn_off",
                      t("Slå av stikkontakt", "Turn off socket"),
                    ],
                    [
                      "climate.set_temperature",
                      t("Still temperatur", "Set temperature"),
                    ],
                    ["scene.turn_on", t("Aktiver scene", "Activate scene")],
                  ]
            ).map(([kind, label]) => (
              <button type="button" key={kind} onClick={() => add(kind)}>
                {label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setAdding(null)}>
            {t("Avbryt", "Cancel")}
          </button>
        </section>
      )}
      {selected && c[selected.key][selected.index] !== undefined && (
        <section
          ref={detail}
          tabIndex={-1}
          className="flow-detail"
          aria-label={t("Rediger flytblokk", "Edit flow block")}
        >
          <div className="heading-row">
            <h2>{t("Tilpass dette kortet", "Customize this card")}</h2>
            <button
              type="button"
              aria-label={t("Lukk kort", "Close card")}
              onClick={() => setSelected(null)}
            >
              <X size={18} />
            </button>
          </div>
          {editor(selected.key, selected.index)}
          <button type="button" onClick={() => setSelected(null)}>
            {t("Ferdig med kortet", "Done with card")}
          </button>
        </section>
      )}
      {Object.keys(c).some(
        (k) =>
          ![
            "id",
            "alias",
            "description",
            "mode",
            "triggers",
            "conditions",
            "actions",
          ].includes(k),
      ) && (
        <p className="quiet-notice">
          {t(
            "Denne automasjonen har flere innstillinger som beholdes. Åpne hele konfigurasjonen for å se eller endre dem.",
            "This automation has additional settings which are retained. Open the full configuration to inspect or edit them.",
          )}
        </p>
      )}
      <details className="flow-settings">
        <summary>
          {t(
            "Beskrivelse og kjøreinnstillinger",
            "Description and run settings",
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
            "Når rutinen allerede kjører",
            "When the routine is already running",
          )}
          <select
            value={c.mode || "single"}
            onChange={(e) => patch({ mode: e.target.value })}
          >
            {[
              ["single", t("Ikke start på nytt", "Do not restart")],
              ["restart", t("Start på nytt", "Restart")],
              ["queued", t("Legg i kø", "Queue")],
              ["parallel", t("Kjør parallelt", "Run in parallel")],
            ].map(([v, s]) => (
              <option key={v} value={v}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={onAdvanced}>
          {t("Hele konfigurasjonen (JSON)", "Full configuration (JSON)")}
        </button>
      </details>
    </div>
  );
}
