import { NotificationRecipient } from "./NotificationRecipient";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Braces,
  Check,
  Clock3,
  GitBranch,
  Info,
  Plus,
  Radio,
  Settings2,
  Trash2,
} from "lucide-react";
import { EntityPicker } from "./EntityPicker";
import { entityState } from "./entityWords";
import { has, readFlowPath, structureSummary } from "./flowStructure";
import {
  changeConditionOperator,
  flowRecord,
  flowClockValue,
  flowDurationValue,
  flowInspectorProblem,
  flowFieldDraft,
  flowSelectionValid,
  flowTemplate,
  replaceFlowSelection,
  serviceTargetPath,
  updateFlowValue,
} from "./flowInspectorModel";
import type { Home } from "../types";
import "./flowInspector.css";

type Path = (string | number)[];
type Report = (id: string, valid: boolean) => void;
type Translate = (nb: string, en: string) => string;

function Section({
  title,
  icon: Icon = Settings2,
  children,
}: {
  title: string;
  icon?: typeof Settings2;
  children: ReactNode;
}) {
  return (
    <section className="flow-form-section">
      <h3>
        <Icon size={18} />
        {title}
      </h3>
      {children}
    </section>
  );
}

/** A temporary invalid number never replaces the last valid HA value. */
function Field({
  value,
  label,
  onChange,
  report,
  t,
  number = false,
  minimum,
  maximum,
  integer,
  hint,
  multiline = false,
  required = false,
  validate,
  validationHint,
}: {
  value: unknown;
  label: string;
  onChange: (value: any) => void;
  report: Report;
  t: Translate;
  number?: boolean;
  minimum?: number;
  maximum?: number;
  integer?: boolean;
  hint?: string;
  multiline?: boolean;
  required?: boolean;
  validate?: (value: string) => boolean;
  validationHint?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState(String(value ?? ""));
  const [error, setError] = useState(false);
  useEffect(() => {
    const text = String(value ?? "");
    setDraft(text);
    const editable =
      value == null || ["string", "number"].includes(typeof value);
    const valid =
      !editable ||
      flowFieldDraft(value, text, {
        number,
        minimum,
        maximum,
        integer,
        required,
        validate,
      }).valid;
    setError(!valid);
    report(id, valid);
  }, [
    value,
    id,
    report,
    number,
    minimum,
    maximum,
    integer,
    required,
    validate,
  ]);
  useEffect(() => () => report(id, true), [id, report]);
  const expression = flowTemplate(value);
  if (value != null && !["string", "number"].includes(typeof value))
    return (
      <p className="flow-preserved-value">
        <Braces size={16} />
        {label}:{" "}
        {t(
          "Flere verdier · beholdes i oppsettet",
          "Multiple values · retained in the configuration",
        )}
      </p>
    );
  const change = (text: string) => {
    setDraft(text);
    const result = flowFieldDraft(value, text, {
      number,
      minimum,
      maximum,
      integer,
      required,
      validate,
    });
    setError(!result.valid);
    report(id, result.valid);
    if (result.valid) onChange(result.value);
  };
  return (
    <label className="flow-form-field" htmlFor={id}>
      <span>
        {label}
        {expression && (
          <small className="flow-expression-label">
            <Braces size={13} />
            {t("Beregnes når det kjøres", "Calculated when run")}
          </small>
        )}
      </span>
      {multiline || expression ? (
        <textarea
          id={id}
          rows={expression ? 3 : 2}
          value={draft}
          onChange={(e) => change(e.target.value)}
          aria-invalid={error}
        />
      ) : (
        <input
          id={id}
          value={draft}
          inputMode={number ? "decimal" : undefined}
          onChange={(e) => change(e.target.value)}
          aria-invalid={error}
        />
      )}
      {error ? (
        <small role="alert">
          {validationHint ||
            (number
              ? t("Skriv et gyldig tall", "Enter a valid number") +
                (minimum !== undefined
                  ? ` · ${t("minst", "at least")} ${minimum}`
                  : "") +
                (maximum !== undefined
                  ? ` · ${t("høyst", "at most")} ${maximum}`
                  : "")
              : t(
                  "Fyll ut feltet før du fortsetter.",
                  "Fill in this field before continuing.",
                ))}
        </small>
      ) : hint ? (
        <small>{hint}</small>
      ) : null}
    </label>
  );
}

function Entities({
  value,
  onChange,
  home,
  lang,
  label,
  domain,
  t,
  multiple = true,
  required = true,
  report,
}: {
  value: unknown;
  onChange: (value: string | string[]) => void;
  home: Home;
  lang: string;
  label: string;
  domain?: string;
  t: Translate;
  multiple?: boolean;
  required?: boolean;
  report: Report;
}) {
  const [adding, setAdding] = useState(false);
  const id = useId(),
    valid = flowSelectionValid(value, required);
  useEffect(() => {
    report(id, valid);
    return () => report(id, true);
  }, [id, valid, report]);
  const choices = home.controls.filter(
    (c) => !domain || domain === "homeassistant" || c.domain === domain,
  );
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? [value]
      : [];
  if (
    value !== undefined &&
    ((!Array.isArray(value) && typeof value !== "string") ||
      values.some((v) => typeof v !== "string" || flowTemplate(v)))
  )
    return (
      <p className="flow-preserved-value">
        <Braces size={17} />
        {t(
          "Målet velges dynamisk av oppsettet. Uttrykket beholdes.",
          "The target is chosen dynamically by the configuration. Its expression is retained.",
        )}
      </p>
    );
  return (
    <div className="flow-form-entities">
      <span className="flow-field-caption">{label}</span>
      {!valid && (
        <small className="flow-form-problem" role="alert">
          {t(
            "Velg minst én enhet for dette steget.",
            "Choose at least one device for this step.",
          )}
        </small>
      )}
      {values.map((id, index) => (
        <div className="flow-entity-choice" key={index}>
          <EntityPicker
            value={id}
            onChange={(next) =>
              onChange(replaceFlowSelection(value, index, next))
            }
            choices={choices}
            home={home}
            lang={lang}
            label={values.length > 1 ? `${label} ${index + 1}` : label}
          />
          {Array.isArray(value) && value.length > 1 && (
            <button
              type="button"
              className="flow-icon-button"
              aria-label={t("Fjern mål", "Remove target") + ` ${index + 1}`}
              onClick={() => onChange(value.filter((_, i) => i !== index))}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      ))}
      {!values.length || adding ? (
        <EntityPicker
          value=""
          onChange={(next) => {
            onChange(
              values.length
                ? [...values, next]
                : Array.isArray(value)
                  ? [next]
                  : next,
            );
            setAdding(false);
          }}
          choices={choices.filter((c) => !values.includes(c.entity_id))}
          home={home}
          lang={lang}
          label={t("Velg enhet", "Choose device")}
        />
      ) : multiple && values.every(Boolean) ? (
        <button
          type="button"
          className="flow-add-inline"
          onClick={() => setAdding(true)}
        >
          <Plus size={16} />
          {t("Legg til en enhet til", "Add another device")}
        </button>
      ) : null}
    </div>
  );
}

function Duration({
  value,
  onChange,
  label,
  report,
  t,
}: {
  value: unknown;
  onChange: (value: any) => void;
  label: string;
  report: Report;
  t: Translate;
}) {
  if (!flowRecord(value))
    return (
      <Field
        value={value}
        onChange={onChange}
        label={label}
        report={report}
        t={t}
        number={typeof value === "number"}
        minimum={0}
        validate={flowDurationValue}
        validationHint={t(
          "Skriv sekunder eller en varighet som 00:05:00.",
          "Enter seconds or a duration such as 00:05:00.",
        )}
        hint={
          typeof value === "number"
            ? t("Tid i sekunder", "Time in seconds")
            : t(
                "Sekunder, tt:mm:ss eller et beregnet uttrykk. Formatet beholdes.",
                "Seconds, hh:mm:ss or a calculated expression. The existing format is retained.",
              )
        }
      />
    );
  const units = [
    ["hours", t("Timer", "Hours")],
    ["minutes", t("Minutter", "Minutes")],
    ["seconds", t("Sekunder", "Seconds")],
    ["milliseconds", t("Millisekunder", "Milliseconds")],
  ];
  return (
    <div className="flow-duration">
      <span className="flow-field-caption">{label}</span>
      <div className="flow-form-grid">
        {units
          .filter(([key]) => has(value, key))
          .map(([key, text]) => (
            <Field
              key={key}
              value={value[key]}
              onChange={(next) => onChange({ ...value, [key]: next })}
              label={text}
              number
              minimum={0}
              report={report}
              t={t}
            />
          ))}
      </div>
      <div className="flow-form-additions">
        {units
          .filter(([key]) => !has(value, key))
          .map(([key, text]) => (
            <button
              type="button"
              key={key}
              className="flow-add-inline"
              onClick={() => onChange({ ...value, [key]: 0 })}
            >
              <Plus size={14} />
              {text}
            </button>
          ))}
      </div>
    </div>
  );
}

export function FlowInspector({
  row,
  home,
  lang,
  onChange,
  onAdvanced,
  kind,
  onValidityChange,
}: {
  row: any;
  home: Home;
  lang: string;
  onChange: (v: any) => void;
  onAdvanced: () => void;
  kind?: "triggers" | "conditions" | "actions";
  onValidityChange?: (valid: boolean) => void;
}) {
  const t: Translate = (nb, en) => (lang === "en" ? en : nb);
  const invalid = useRef(new Set<string>());
  const validityCallback = useRef(onValidityChange);
  validityCallback.current = onValidityChange;
  const report = useCallback<Report>((id, valid) => {
    if (valid) invalid.current.delete(id);
    else invalid.current.add(id);
    validityCallback.current?.(invalid.current.size === 0);
  }, []);
  const [removeChoice, setRemoveChoice] = useState<number | null>(null);
  const problem = flowInspectorProblem(row);
  useEffect(() => {
    report("structure", !problem);
    return () => report("structure", true);
  }, [problem, report]);
  const patch = (value: any) => onChange({ ...row, ...value });
  const set = (path: Path, value: any) =>
    onChange(updateFlowValue(row, path, value));
  const remove = (path: Path) =>
    onChange(updateFlowValue(row, path, undefined, true));
  const field = (
    path: Path,
    label: string,
    options: Partial<
      Pick<
        Parameters<typeof Field>[0],
        | "number"
        | "minimum"
        | "maximum"
        | "integer"
        | "hint"
        | "multiline"
        | "required"
        | "validate"
        | "validationHint"
      >
    > = {},
  ) => (
    <Field
      key={path.join(".")}
      value={readFlowPath(row, path)}
      label={label}
      onChange={(v) => set(path, v)}
      report={report}
      t={t}
      {...options}
    />
  );
  const optional = (
    path: Path,
    label: string,
    initial: any,
    children: ReactNode,
  ) => (
    <div className="flow-optional-field" key={path.join(".")}>
      {readFlowPath(row, path) === undefined ? (
        <button
          type="button"
          className="flow-add-inline"
          onClick={() => set(path, initial)}
        >
          <Plus size={16} />
          {label}
        </button>
      ) : (
        <>
          <div className="flow-optional-heading">
            <span>{label}</span>
            <button
              type="button"
              className="flow-icon-button"
              aria-label={
                t("Fjern", "Remove") + " " + label.toLocaleLowerCase()
              }
              onClick={() => remove(path)}
            >
              <Trash2 size={15} />
            </button>
          </div>
          {children}
        </>
      )}
    </div>
  );
  const duration = (path: Path, label: string) => (
    <Duration
      value={readFlowPath(row, path)}
      label={label}
      onChange={(v) => set(path, v)}
      report={report}
      t={t}
    />
  );

  if (typeof row === "string")
    return (
      <div className="flow-inspector">
        <div className="flow-form-explanation">
          <Braces size={20} />
          <p>
            {t(
              "Dette kravet beregnes når automasjonen kjører. Uttrykket beholdes akkurat som det er skrevet.",
              "This requirement is calculated when the automation runs. Its expression is retained exactly as written.",
            )}
          </p>
        </div>
        <Field
          value={row}
          onChange={onChange}
          label={t("Beregnet krav", "Calculated requirement")}
          multiline
          required
          report={report}
          t={t}
        />
      </div>
    );
  if (!flowRecord(row))
    return (
      <div className="flow-inspector">
        <p>
          {t(
            "Dette steget bruker et spesielt oppsett. Åpne konfigurasjonen for å redigere det uten å miste innstillinger.",
            "This step uses a custom configuration. Open the configuration to edit it without losing settings.",
          )}
        </p>
        <pre>{JSON.stringify(row, null, 2)}</pre>
        <button type="button" onClick={onAdvanced}>
          {t("Åpne konfigurasjon", "Open configuration")}
        </button>
      </div>
    );

  const trigger = row.trigger || row.platform;
  const condition = row.condition;
  const type = trigger || condition;
  const isTrigger = kind === "triggers" || !!trigger;
  const action = typeof row.action === "string" ? row.action : row.service;
  const targetPath = serviceTargetPath(row);
  const dataKey = has(row, "data")
    ? "data"
    : has(row, "data_template")
      ? "data_template"
      : "data";
  const data = row[dataKey];
  const canEditData = data === undefined || flowRecord(data);
  const actionLabels: Record<string, string> = {
    turn_on: t("Slå på", "Turn on"),
    turn_off: t("Slå av", "Turn off"),
    toggle: t("Bytt mellom på og av", "Toggle on and off"),
    set_temperature: t("Still temperatur", "Set temperature"),
    set_hvac_mode: t("Velg driftsmodus", "Set operating mode"),
    volume_set: t("Still lydnivå", "Set volume"),
    set_cover_position: t("Still åpningen", "Set open position"),
    media_play: t("Spill av", "Play"),
    media_pause: t("Sett på pause", "Pause"),
    media_stop: t("Stopp avspilling", "Stop playback"),
    lock: t("Lås", "Lock"),
    unlock: t("Lås opp", "Unlock"),
  };
  const actionName =
    typeof action === "string"
      ? action === "scene.turn_on"
        ? t("Aktiver scene", "Activate scene")
        : actionLabels[action.split(".")[1]] || action
      : "";
  const canSwitchPowerAction =
    typeof action === "string" &&
    /^(?:light|switch|input_boolean)\.(?:turn_on|turn_off|toggle)$/.test(
      action,
    ) &&
    canEditData &&
    Object.keys(data || {}).every(
      (k) =>
        k === "entity_id" ||
        (k === "transition" && action.startsWith("light.")),
    );
  const operator = ["and", "or", "not"].includes(condition)
    ? condition
    : ["and", "or", "not"].filter((k) => has(row, k)).length === 1
      ? ["and", "or", "not"].find((k) => has(row, k))
      : null;
  const entity = Array.isArray(row.entity_id)
    ? row.entity_id[0]
    : row.entity_id;
  const selectedControl = home.controls.find((c) => c.entity_id === entity);
  const stateChoices =
    selectedControl && !row.attribute
      ? selectedControl.domain === "lock"
        ? ["locked", "unlocked"]
        : selectedControl.domain === "person" ||
            selectedControl.domain === "device_tracker"
          ? ["home", "not_home"]
          : [
                "binary_sensor",
                "light",
                "switch",
                "input_boolean",
                "automation",
              ].includes(selectedControl.domain)
            ? ["on", "off"]
            : []
      : [];
  const stateInput = (key: string, label: string) => {
    const value = row[key];
    if (
      typeof value === "string" &&
      !flowTemplate(value) &&
      stateChoices.length &&
      stateChoices.includes(value)
    )
      return (
        <label className="flow-form-field">
          <span>{label}</span>
          <select value={value} onChange={(e) => set([key], e.target.value)}>
            {stateChoices.map((v) => (
              <option key={v} value={v}>
                {entityState(entity, v, home, lang)}
              </option>
            ))}
          </select>
        </label>
      );
    if (Array.isArray(value) && value.every((v) => typeof v === "string"))
      return (
        <div className="flow-state-list">
          <span className="flow-field-caption">{label}</span>
          {value.map((v, i) => (
            <Field
              key={i}
              value={v}
              label={`${t("Tillatt tilstand", "Allowed state")} ${i + 1}`}
              onChange={(next) => set([key, i], next)}
              report={report}
              t={t}
            />
          ))}
        </div>
      );
    if (value === null)
      return (
        <div className="flow-form-explanation">
          <Info size={17} />
          <p>
            {t(
              "Alle tilstander godtas. Endringer bare i egenskaper starter ikke automasjonen.",
              "Any state is accepted. Changes only to attributes do not start the automation.",
            )}
          </p>
          <button
            type="button"
            onClick={() => set([key], stateChoices[0] || "on")}
          >
            {t("Velg en bestemt tilstand", "Choose a specific state")}
          </button>
        </div>
      );
    return field([key], label, { required: true });
  };
  const initBranch = (path: Path, label: string) =>
    readFlowPath(row, path) === undefined && (
      <button
        type="button"
        className="flow-add-inline"
        onClick={() => set(path, [])}
      >
        <Plus size={16} />
        {label}
      </button>
    );

  return (
    <div className="flow-inspector">
      {problem && (
        <p className="flow-form-problem" role="alert">
          {problem === "boundary"
            ? t(
                "Velg minst én grense: over eller under.",
                "Choose at least one boundary: above or below.",
              )
            : problem === "range"
              ? t(
                  "Den nedre grensen må være lavere enn den øvre.",
                  "The lower boundary must be below the upper boundary.",
                )
              : t(
                  "Velg minst én ukedag, eller velg alle dager.",
                  "Select at least one weekday, or choose every day.",
                )}
        </p>
      )}
      {structureSummary(row, lang)?.detail && (
        <div className="flow-form-explanation">
          <Info size={19} />
          <p>{structureSummary(row, lang)?.detail}</p>
        </div>
      )}
      <Section title={t("Om dette steget", "About this step")}>
        {field(["alias"], t("Navn på steget", "Step name"), {
          hint: t(
            "Gi det gjerne et navn som forklarer hensikten.",
            "Give it a name that explains what it does.",
          ),
        })}
        {row.enabled === undefined || typeof row.enabled === "boolean" ? (
          <label className="flow-enabled">
            <input
              type="checkbox"
              checked={row.enabled !== false}
              onChange={(e) => patch({ enabled: e.target.checked })}
            />
            <span>{t("Steget er aktivt", "Step is enabled")}</span>
          </label>
        ) : (
          field(
            ["enabled"],
            t("Når steget skal være aktivt", "When this step is enabled"),
            {
              multiline: true,
              hint: t(
                "Aktivering styres av dette uttrykket.",
                "This expression controls whether the step is enabled.",
              ),
            },
          )
        )}
      </Section>

      {["state", "numeric_state"].includes(type) && (
        <Section
          title={t("Hva skal vi følge med på?", "What should we watch?")}
          icon={Radio}
        >
          <Entities
            value={row.entity_id}
            onChange={(v) => patch({ entity_id: v })}
            home={home}
            lang={lang}
            label={t("Enheter og sensorer", "Devices and sensors")}
            t={t}
            report={report}
          />
          {type === "state" ? (
            isTrigger ? (
              <>
                {optional(
                  ["from"],
                  t(
                    "Bare fra en bestemt tilstand",
                    "Only from a particular state",
                  ),
                  stateChoices[1] || "off",
                  stateInput("from", t("Fra", "From")),
                )}
                {optional(
                  ["to"],
                  t("Når tilstanden blir", "When the state becomes"),
                  stateChoices[0] || "on",
                  stateInput("to", t("Til", "To")),
                )}
                {row.from === undefined && row.to === undefined && (
                  <p className="flow-form-hint">
                    {t(
                      "Reagerer på alle endringer i tilstand og egenskaper.",
                      "Responds to all state and attribute changes.",
                    )}
                  </p>
                )}
              </>
            ) : (
              stateInput(
                "state",
                t("Tilstanden skal være", "The state must be"),
              )
            )
          ) : (
            <>
              <p className="flow-form-hint">
                {isTrigger
                  ? t(
                      "Starter når målingen krysser grensen. Verdien må være strengt over eller under.",
                      "Starts when the reading crosses the boundary. Values must be strictly above or below.",
                    )
                  : t(
                      "Verdien må være strengt over eller under grensen.",
                      "The value must be strictly above or below the boundary.",
                    )}
              </p>
              <div className="flow-form-grid">
                {["above", "below"].map((key) =>
                  optional(
                    [key],
                    key === "above" ? t("Over", "Above") : t("Under", "Below"),
                    0,
                    field(
                      [key],
                      key === "above"
                        ? t("Nedre grense", "Lower boundary")
                        : t("Øvre grense", "Upper boundary"),
                      {
                        number:
                          typeof row[key] !== "string" ||
                          /^[+-]?[\d.]+$/.test(row[key]),
                        hint:
                          typeof row[key] === "string" &&
                          !/^[+-]?[\d.]+$/.test(row[key])
                            ? t(
                                "Grensen hentes fra en annen sensor eller et uttrykk.",
                                "The boundary comes from another sensor or an expression.",
                              )
                            : undefined,
                      },
                    ),
                  ),
                )}
              </div>
            </>
          )}
          {optional(
            ["for"],
            t("Må vare en stund", "Must remain for a while"),
            { seconds: 30 },
            duration(["for"], t("Varighet", "Duration")),
          )}
          {optional(
            ["attribute"],
            t("Følg en bestemt egenskap", "Watch a particular attribute"),
            "",
            field(["attribute"], t("Egenskap", "Attribute"), {
              required: true,
              hint: t(
                "For eksempel temperature, battery_level eller brightness.",
                "For example temperature, battery_level or brightness.",
              ),
            }),
          )}
        </Section>
      )}

      {type === "time" && (
        <Section
          title={
            isTrigger
              ? t("Når på dagen?", "What time of day?")
              : t("Hvilket tidsrom?", "Which time window?")
          }
          icon={Clock3}
        >
          {isTrigger ? (
            Array.isArray(row.at) ? (
              row.at.map((_: any, index: number) =>
                field(["at", index], `${t("Tidspunkt", "Time")} ${index + 1}`, {
                  required: true,
                  validate: flowClockValue,
                  validationHint: t(
                    "Skriv et klokkeslett som 08:30:00 eller en tidsensor.",
                    "Enter a time such as 08:30:00 or a time sensor.",
                  ),
                  hint: t(
                    "Klokkeslett eller tidsensor. Beholder hvert tidspunkt.",
                    "Time of day or a time sensor. Each time is preserved.",
                  ),
                }),
              )
            ) : (
              field(["at"], t("Klokkeslett", "Time of day"), {
                required: true,
                validate: flowClockValue,
                validationHint: t(
                  "Skriv et klokkeslett som 08:30:00 eller en tidsensor.",
                  "Enter a time such as 08:30:00 or a time sensor.",
                ),
                hint: t(
                  "Skriv tt:mm:ss, eller en tidsensor som input_datetime.vekking.",
                  "Enter hh:mm:ss or a time sensor such as input_datetime.wakeup.",
                ),
              })
            )
          ) : (
            <div className="flow-form-grid">
              {["after", "before"].map((k) =>
                optional(
                  [k],
                  k === "after"
                    ? t("Etter klokken", "After time")
                    : t("Før klokken", "Before time"),
                  k === "after" ? "08:00:00" : "22:00:00",
                  field(
                    [k],
                    k === "after"
                      ? t("Fra klokken", "From time")
                      : t("Til klokken", "Until time"),
                    {
                      required: true,
                      validate: flowClockValue,
                      validationHint: t(
                        "Skriv et klokkeslett som 08:30:00 eller en tidsensor.",
                        "Enter a time such as 08:30:00 or a time sensor.",
                      ),
                    },
                  ),
                ),
              )}
            </div>
          )}
          {!isTrigger &&
            !flowTemplate(row.weekday) &&
            (row.weekday === undefined ||
              typeof row.weekday === "string" ||
              Array.isArray(row.weekday)) && (
              <div className="flow-weekdays">
                <span className="flow-field-caption">
                  {t("Ukedager", "Weekdays")}
                </span>
                {row.weekday === undefined ? (
                  <button
                    type="button"
                    className="flow-add-inline"
                    onClick={() =>
                      patch({ weekday: ["mon", "tue", "wed", "thu", "fri"] })
                    }
                  >
                    <Plus size={16} />
                    {t("Begrens til valgte dager", "Limit to selected days")}
                  </button>
                ) : (
                  <>
                    {[
                      ["mon", "Man", "Mon"],
                      ["tue", "Tir", "Tue"],
                      ["wed", "Ons", "Wed"],
                      ["thu", "Tor", "Thu"],
                      ["fri", "Fre", "Fri"],
                      ["sat", "Lør", "Sat"],
                      ["sun", "Søn", "Sun"],
                    ].map(([value, nb, en]) => (
                      <button
                        type="button"
                        key={value}
                        aria-pressed={(Array.isArray(row.weekday)
                          ? row.weekday
                          : [row.weekday]
                        ).includes(value)}
                        onClick={() => {
                          const days = Array.isArray(row.weekday)
                            ? row.weekday
                            : [row.weekday];
                          patch({
                            weekday: days.includes(value)
                              ? days.filter((v: string) => v !== value)
                              : [...days, value],
                          });
                        }}
                      >
                        {t(nb, en)}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="flow-add-inline"
                      onClick={() => remove(["weekday"])}
                    >
                      {t("Alle dager", "Every day")}
                    </button>
                  </>
                )}
              </div>
            )}
        </Section>
      )}
      {type === "time_pattern" && (
        <Section
          title={t("Gjenta etter klokken", "Repeat by the clock")}
          icon={Clock3}
        >
          <p className="flow-form-hint">
            {t(
              "Bruk for eksempel /5 for hvert femte minutt, eller * for alle verdier.",
              "Use /5 for every fifth minute, or * for every value.",
            )}
          </p>
          <div className="flow-form-grid">
            {["hours", "minutes", "seconds"].map((k, i) =>
              optional(
                [k],
                [
                  t("Timer", "Hours"),
                  t("Minutter", "Minutes"),
                  t("Sekunder", "Seconds"),
                ][i],
                "*",
                field(
                  [k],
                  [
                    t("Timer", "Hours"),
                    t("Minutter", "Minutes"),
                    t("Sekunder", "Seconds"),
                  ][i],
                ),
              ),
            )}
          </div>
        </Section>
      )}
      {type === "sun" && (
        <Section title={t("Følg solen", "Follow the sun")} icon={Clock3}>
          {(isTrigger ? ["event"] : ["after", "before"]).map((key) => {
            const label =
              key === "event"
                ? t("Hendelse", "Event")
                : key === "after"
                  ? t("Etter", "After")
                  : t("Før", "Before");
            const input = (
              <label className="flow-form-field">
                <span>{label}</span>
                <select
                  value={row[key] ?? "sunset"}
                  onChange={(e) => set([key], e.target.value)}
                >
                  {![undefined, "sunset", "sunrise"].includes(row[key]) && (
                    <option value={row[key]}>{row[key]}</option>
                  )}
                  <option value="sunrise">{t("Soloppgang", "Sunrise")}</option>
                  <option value="sunset">{t("Solnedgang", "Sunset")}</option>
                </select>
              </label>
            );
            return (
              <div key={key}>
                {isTrigger ? input : optional([key], label, "sunset", input)}
              </div>
            );
          })}
          {(isTrigger ? ["offset"] : ["after_offset", "before_offset"])
            .filter((key) => isTrigger || has(row, key.replace("_offset", "")))
            .map((key) =>
              optional(
                [key],
                key === "before_offset"
                  ? t("Forskyv sluttidspunkt", "Offset end time")
                  : t("Forskyv tidspunkt", "Offset time"),
                "00:00:00",
                field([key], t("Tidsforskyvning", "Time offset"), {
                  hint: t(
                    "For eksempel -00:30:00 for 30 minutter før.",
                    "For example -00:30:00 for 30 minutes earlier.",
                  ),
                }),
              ),
            )}
        </Section>
      )}

      {typeof action === "string" && (
        <Section title={t("Hva skal skje?", "What should happen?")}>
          <div className="flow-service-name">
            <Check size={17} />
            <span>{actionName}</span>
          </div>
          {canSwitchPowerAction && (
            <label className="flow-form-field">
              <span>{t("Handling", "Action")}</span>
              <select
                value={action}
                onChange={(e) =>
                  set(
                    [has(row, "action") ? "action" : "service"],
                    e.target.value,
                  )
                }
              >
                {["turn_on", "turn_off", "toggle"].map((v) => (
                  <option key={v} value={`${action.split(".")[0]}.${v}`}>
                    {actionLabels[v]}
                  </option>
                ))}
              </select>
            </label>
          )}
          {action.startsWith("notify.mobile_app_") && <NotificationRecipient value={action} lang={lang} report={report}
            onChange={(value) => set([has(row, "action") ? "action" : "service"], value)} />}
          {(() => {
            if (action.startsWith("notify.mobile_app_")) return null;
            const domain = action.split(".")[0],
              path = targetPath;
            const target = readFlowPath(row, path);
            const parent = readFlowPath(row, path.slice(0, -1));
            return (
              (parent === undefined ||
                flowRecord(parent) ||
                path.length === 1) &&
              !flowTemplate(action) &&
              !flowTemplate(row.target) &&
              !flowTemplate(row.data) &&
              !flowTemplate(row.data_template) && (
                <Entities
                  value={target}
                  onChange={(v) => set(path, v)}
                  home={home}
                  lang={lang}
                  label={t("Enhetene som skal styres", "Devices to control")}
                  domain={domain}
                  report={report}
                  required={
                    [
                      "light",
                      "switch",
                      "input_boolean",
                      "climate",
                      "cover",
                      "media_player",
                      "lock",
                      "scene",
                      "fan",
                      "vacuum",
                    ].includes(domain) &&
                    !(
                      flowRecord(row.target) &&
                      Object.entries(row.target).some(
                        ([key, value]) =>
                          key !== "entity_id" &&
                          (Array.isArray(value) ? value.length > 0 : !!value),
                      )
                    )
                  }
                  t={t}
                />
              )
            );
          })()}
          {flowRecord(row.target) &&
            Object.entries(row.target)
              .filter(([key]) => key !== "entity_id")
              .map(([key, value]) => (
                <div className="flow-target-note" key={key}>
                  <span>
                    {(
                      {
                        area_id: t("Rom", "Rooms"),
                        device_id: t("Fysiske enheter", "Devices"),
                        floor_id: t("Etasjer", "Floors"),
                        label_id: t("Etiketter", "Labels"),
                      } as Record<string, string>
                    )[key] || key}
                  </span>
                  <strong>
                    {(Array.isArray(value) ? value : [value])
                      .map(
                        (v) =>
                          home.areas.find(
                            (a) => key === "area_id" && a.area_id === v,
                          )?.name || String(v),
                      )
                      .join(", ")}
                  </strong>
                  <small>
                    {t(
                      "Disse målene beholdes i tillegg til valgte enheter.",
                      "These targets are kept in addition to the selected entities.",
                    )}
                  </small>
                </div>
              ))}
          {!canEditData && (
            <p className="flow-preserved-value">
              <Braces size={17} />
              {t(
                "Handlingen beregner innstillingene selv. Uttrykket beholdes.",
                "This action calculates its own options. The expression is retained.",
              )}
            </p>
          )}
          {canEditData && (
            <>
              {action === "light.turn_on" && (
                <>
                  {has(data, "brightness")
                    ? field(
                        [dataKey, "brightness"],
                        t("Lysstyrke (0–255)", "Brightness (0–255)"),
                        { number: true, minimum: 0, maximum: 255 },
                      )
                    : optional(
                        [dataKey, "brightness_pct"],
                        t("Velg lysstyrke", "Set brightness"),
                        80,
                        field(
                          [dataKey, "brightness_pct"],
                          t("Lysstyrke (%)", "Brightness (%)"),
                          { number: true, minimum: 0, maximum: 100 },
                        ),
                      )}
                  {has(data, "color_temp") ? (
                    field(
                      [dataKey, "color_temp"],
                      t(
                        "Fargetemperatur (mired)",
                        "Colour temperature (mired)",
                      ),
                      { number: true, minimum: 1 },
                    )
                  ) : [
                      "rgb_color",
                      "rgbw_color",
                      "rgbww_color",
                      "xy_color",
                      "hs_color",
                      "color_name",
                      "white",
                    ].some((k) => has(data, k)) &&
                    !has(data, "color_temp_kelvin") ? (
                    <p className="flow-form-hint">
                      {t(
                        "Valgt lysfarge beholdes. Fargen kan redigeres under tekniske detaljer.",
                        "The selected light colour is retained. Edit it under technical details.",
                      )}
                    </p>
                  ) : (
                    optional(
                      [dataKey, "color_temp_kelvin"],
                      t("Velg fargetemperatur", "Set colour temperature"),
                      2700,
                      field(
                        [dataKey, "color_temp_kelvin"],
                        t(
                          "Fargetemperatur (kelvin)",
                          "Colour temperature (kelvin)",
                        ),
                        { number: true, minimum: 1 },
                      ),
                    )
                  )}
                  {optional(
                    [dataKey, "transition"],
                    t("Myk overgang", "Smooth transition"),
                    1,
                    field(
                      [dataKey, "transition"],
                      t("Overgangstid i sekunder", "Transition in seconds"),
                      { number: true, minimum: 0 },
                    ),
                  )}
                </>
              )}
              {action === "climate.set_temperature" && (
                <>
                  {((!has(data, "target_temp_low") &&
                    !has(data, "target_temp_high")) ||
                    has(data, "temperature")) &&
                    field(
                      [dataKey, "temperature"],
                      t("Ønsket temperatur", "Target temperature"),
                      { number: true },
                    )}
                  {["target_temp_low", "target_temp_high"]
                    .filter((k) => has(data, k))
                    .map((k) =>
                      field(
                        [dataKey, k],
                        k === "target_temp_low"
                          ? t("Laveste temperatur", "Lowest temperature")
                          : t("Høyeste temperatur", "Highest temperature"),
                        { number: true },
                      ),
                    )}
                </>
              )}
              {["climate.set_hvac_mode", "climate.set_temperature"].includes(
                action,
              ) &&
                (has(data, "hvac_mode") ||
                  action === "climate.set_hvac_mode") &&
                field(
                  [dataKey, "hvac_mode"],
                  t("Driftsmodus", "Operating mode"),
                  {
                    hint: t(
                      "For eksempel heat, cool, auto eller off. Uttrykk beholdes.",
                      "For example heat, cool, auto or off. Expressions are retained.",
                    ),
                  },
                )}
              {action === "cover.set_cover_position" &&
                field(
                  [dataKey, "position"],
                  t("Åpning (%)", "Open position (%)"),
                  { number: true, minimum: 0, maximum: 100 },
                )}
              {action === "media_player.volume_set" &&
                field(
                  [dataKey, "volume_level"],
                  t("Lydnivå (0–1)", "Volume (0–1)"),
                  { number: true, minimum: 0, maximum: 1 },
                )}
              {(action.startsWith("notify.") ||
                action === "persistent_notification.create") && (
                <>
                  {field([dataKey, "message"], t("Beskjed", "Message"), {
                    multiline: true,
                    required: true,
                  })}
                  {optional(
                    [dataKey, "title"],
                    t("Legg til overskrift", "Add a title"),
                    "",
                    field([dataKey, "title"], t("Overskrift", "Title")),
                  )}
                </>
              )}
            </>
          )}
        </Section>
      )}
      {has(row, "scene") && (
        <Section title={t("Scenen som skal aktiveres", "Scene to activate")}>
          <Entities
            value={row.scene}
            onChange={(v) => patch({ scene: v })}
            home={home}
            lang={lang}
            label={t("Velg scene", "Choose scene")}
            domain="scene"
            multiple={false}
            report={report}
            t={t}
          />
        </Section>
      )}

      {has(row, "delay") && (
        <Section title={t("Ta en pause", "Take a pause")} icon={Clock3}>
          {duration(["delay"], t("Ventetid", "Wait duration"))}
        </Section>
      )}
      {(has(row, "wait_template") || has(row, "wait_for_trigger")) && (
        <Section
          title={t("Vent før neste steg", "Wait before the next step")}
          icon={Clock3}
        >
          {has(row, "wait_template") &&
            field(
              ["wait_template"],
              t(
                "Fortsett når dette uttrykket er sant",
                "Continue when this expression is true",
              ),
              { multiline: true },
            )}
          {has(row, "wait_for_trigger") && (
            <p className="flow-form-hint">
              {t(
                "Åpne hendelsene under dette steget i flyten for å velge hva vi venter på.",
                "Open the events below this step in the flow to choose what to wait for.",
              )}
            </p>
          )}
          {optional(
            ["timeout"],
            t("Sett en tidsgrense", "Set a timeout"),
            { minutes: 5 },
            <>
              {duration(["timeout"], t("Vent i høyst", "Wait at most"))}
              {row.continue_on_timeout === undefined ||
              typeof row.continue_on_timeout === "boolean" ? (
                <label className="flow-form-field">
                  <span>{t("Hvis tiden går ut", "If time runs out")}</span>
                  <select
                    value={
                      row.continue_on_timeout === false ? "stop" : "continue"
                    }
                    onChange={(e) =>
                      patch({
                        continue_on_timeout: e.target.value === "continue",
                      })
                    }
                  >
                    <option value="continue">
                      {t(
                        "Fortsett til neste steg",
                        "Continue to the next step",
                      )}
                    </option>
                    <option value="stop">
                      {t("Stopp denne kjøringen", "Stop this run")}
                    </option>
                  </select>
                </label>
              ) : (
                field(
                  ["continue_on_timeout"],
                  t("Fortsett ved tidsgrensen", "Continue on timeout"),
                )
              )}
            </>,
          )}
        </Section>
      )}
      {flowRecord(row.repeat) && (
        <Section title={t("Gjenta steg", "Repeat steps")} icon={GitBranch}>
          {has(row.repeat, "count") &&
            field(
              ["repeat", "count"],
              t("Hvor mange ganger?", "How many times?"),
              { number: true, integer: true, minimum: 1 },
            )}
          {has(row.repeat, "for_each") && (
            <p className="flow-form-hint">
              {t(
                "Stegene kjøres én gang for hvert element i listen. Elementlisten beholdes i konfigurasjonen.",
                "The steps run once for each item in the list. The item list is retained in the configuration.",
              )}
            </p>
          )}
          {initBranch(
            ["repeat", "sequence"],
            t("Legg til steg som skal gjentas", "Add steps to repeat"),
          )}
          <p className="flow-form-hint">
            {t(
              "Rediger stegene og eventuelle krav direkte under gjentakelsen i flyten.",
              "Edit the steps and any requirements directly below this repeat block in the flow.",
            )}
          </p>
        </Section>
      )}
      {operator && (
        <Section
          title={t(
            "Hvordan skal kravene kombineres?",
            "How should requirements be combined?",
          )}
          icon={GitBranch}
        >
          <label className="flow-form-field">
            <span>
              {t("Krav som må stemme", "Requirements that must match")}
            </span>
            <select
              value={operator}
              onChange={(e) =>
                onChange(
                  changeConditionOperator(
                    row,
                    e.target.value as "and" | "or" | "not",
                  ),
                )
              }
            >
              <option value="and">
                {t("Alle krav må stemme", "All requirements must match")}
              </option>
              <option value="or">
                {t(
                  "Minst ett krav må stemme",
                  "At least one requirement must match",
                )}
              </option>
              <option value="not">
                {t(
                  "Ingen av kravene skal stemme",
                  "None of the requirements may match",
                )}
              </option>
            </select>
          </label>
          {initBranch(
            condition ? ["conditions"] : [operator],
            t("Legg til krav", "Add requirements"),
          )}
          <p className="flow-form-hint">
            {t(
              "Trykk på hvert krav i flyten for å redigere det.",
              "Select each requirement in the flow to edit it.",
            )}
          </p>
        </Section>
      )}
      {Array.isArray(row.choose) && (
        <Section
          title={t(
            "Veier automasjonen kan ta",
            "Paths the automation can take",
          )}
          icon={GitBranch}
        >
          <p className="flow-form-hint">
            {t(
              "Det første valget som passer brukes. Legg det viktigste valget øverst.",
              "The first matching option is used. Put the most important option first.",
            )}
          </p>
          {row.choose.map((choice: any, index: number) => (
            <div className="flow-choice-editor" key={index}>
              <div className="flow-optional-heading">
                <strong>
                  {t("Valg", "Option")} {index + 1}
                </strong>
                {removeChoice === index ? (
                  <span className="flow-choice-confirm">
                    <button
                      type="button"
                      onClick={() => {
                        patch({
                          choose: row.choose.filter(
                            (_: any, i: number) => i !== index,
                          ),
                        });
                        setRemoveChoice(null);
                      }}
                    >
                      {t("Fjern hele valget", "Remove entire option")}
                    </button>
                    <button type="button" onClick={() => setRemoveChoice(null)}>
                      {t("Avbryt", "Cancel")}
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="flow-icon-button"
                    aria-label={
                      t("Fjern valg", "Remove option") + ` ${index + 1}`
                    }
                    onClick={() => setRemoveChoice(index)}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              {flowRecord(choice) && (
                <>
                  {field(
                    ["choose", index, "alias"],
                    t("Navn på valget", "Option name"),
                  )}
                  {initBranch(
                    ["choose", index, "conditions"],
                    t(
                      "Legg til krav for dette valget",
                      "Add requirements for this option",
                    ),
                  )}
                  {initBranch(
                    ["choose", index, "sequence"],
                    t(
                      "Legg til steg for dette valget",
                      "Add steps for this option",
                    ),
                  )}
                </>
              )}
            </div>
          ))}
          <button
            type="button"
            className="flow-add-inline"
            onClick={() =>
              patch({
                choose: [...row.choose, { conditions: [], sequence: [] }],
              })
            }
          >
            <Plus size={16} />
            {t("Legg til et valg", "Add an option")}
          </button>
          {initBranch(
            ["default"],
            t(
              "Legg til «ellers» når ingen valg passer",
              "Add an otherwise path when no option matches",
            ),
          )}
          <p className="flow-form-hint">
            {t(
              "Krav og handlinger redigeres på kortene under hvert valg i flyten.",
              "Edit the requirements and actions on the cards below each option in the flow.",
            )}
          </p>
        </Section>
      )}
      {has(row, "if") && (
        <Section title={t("Hvis / ellers", "If / otherwise")} icon={GitBranch}>
          {initBranch(["then"], t("Legg til «ja»-veien", "Add the yes path"))}
          {initBranch(["else"], t("Legg til «nei»-veien", "Add the no path"))}
          <p className="flow-form-hint">
            {t(
              "Kravene avgjør hvilken vei som kjøres. Rediger dem og handlingene direkte i flyten.",
              "The requirements determine which path runs. Edit them and the actions directly in the flow.",
            )}
          </p>
        </Section>
      )}
      {condition === "template" && (
        <Section
          title={t("Et beregnet krav", "A calculated requirement")}
          icon={Braces}
        >
          {field(
            ["value_template"],
            t("Uttrykket må gi sant", "The expression must return true"),
            { multiline: true },
          )}
        </Section>
      )}
      {has(row, "stop") && (
        <Section title={t("Avslutt denne kjøringen", "End this run")}>
          {field(
            ["stop"],
            t("Forklaring i historikken", "Explanation in history"),
          )}
          {typeof row.error === "boolean" && (
            <label className="flow-enabled">
              <input
                type="checkbox"
                checked={row.error}
                onChange={(e) => patch({ error: e.target.checked })}
              />
              {t(
                "Marker avslutningen som en feil",
                "Mark the ending as an error",
              )}
            </label>
          )}
        </Section>
      )}
      {has(row, "event") && !trigger && (
        <Section title={t("Send en hendelse", "Send an event")}>
          {field(["event"], t("Navn på hendelsen", "Event name"), {
            required: true,
          })}
        </Section>
      )}
      <details className="flow-technical-details">
        <summary>
          <Braces size={17} />
          {t(
            "Tekniske detaljer og øvrige innstillinger",
            "Technical details and other settings",
          )}
        </summary>
        <p className="flow-form-hint">
          {t(
            "Hele oppsettet beholdes, også innstillinger som ikke har egne felt her.",
            "The whole configuration is retained, including options without their own fields here.",
          )}
        </p>
        <pre>{JSON.stringify(row, null, 2)}</pre>
        <button type="button" onClick={onAdvanced}>
          {t("Rediger hele konfigurasjonen", "Edit full configuration")}
        </button>
      </details>
    </div>
  );
}
