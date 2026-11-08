/** Local-only virtual execution. No API, network, timers or real-device commands. */
import type { Home, Control } from "../types";
import type { FlowPath } from "./flowStructure";
import type { FlowKind } from "./flowPresentation";
export type VirtualState = {
  state: string;
  attributes: Record<string, unknown>;
  heldFor: number;
  changedAt?: number;
};
export type VirtualStates = Record<string, VirtualState>;
export type SimulationInput = {
  id: string;
  control?: Control;
  attributes: string[];
};
export type SimulationScenario = {
  before: VirtualStates;
  after: VirtualStates;
  now: string;
  sunrise: string;
  sunset: string;
  triggerIndex: number;
  decisions: Record<string, boolean | "continue">;
};
export type SimStatus =
  | "running"
  | "passed"
  | "failed"
  | "done"
  | "skipped"
  | "blocked"
  | "stopped"
  | "assumed";
export type SimulationEvent = {
  path: FlowPath;
  kind: FlowKind;
  status: SimStatus;
  at: number;
  detail: string;
  changes: Record<string, VirtualState>;
  decision?: "condition" | "action";
};
export type SimulationResult = {
  events: SimulationEvent[];
  states: VirtualStates;
  status: "completed" | "stopped" | "not-triggered" | "blocked" | "limited";
  detail: string;
  parallel: boolean;
};
export type SimulationFrame = {
  nodes: Record<string, SimStatus>;
  activeNode: string | null;
  visited: Set<string>;
};
const record = (v: any): v is Record<string, any> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v: any): any[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];
const strings = (v: any): string[] =>
  list(v).filter((x) => typeof x === "string");
const entityId = (s: string) => /^[a-z_][a-z0-9_]*\.[a-z0-9_]+$/.test(s);
const safeKey = (s: string) =>
  !["__proto__", "prototype", "constructor"].includes(s);
const own = (o: any, k: string) =>
  record(o) && Object.hasOwn(o, k) ? o[k] : undefined;
const dynamic = (v: any): boolean =>
  typeof v === "string"
    ? /\{[{%#]/.test(v)
    : Array.isArray(v)
      ? v.some(dynamic)
      : record(v)
        ? Object.values(v).some(dynamic)
        : false;
export const simulationPath = (path: FlowPath) => JSON.stringify(path);
function targets(row: any, home: Home, domain?: string): string[] {
  const target = record(row.target) ? row.target : {};
  const direct = [...strings(row.entity_id), ...strings(target.entity_id)];
  const devices = strings(target.device_id),
    areas = strings(target.area_id);
  return [
    ...new Set([
      ...direct,
      ...(devices.length || areas.length ? home.controls : [])
        .filter(
          (c) =>
            (!domain || domain === "homeassistant" || c.domain === domain) &&
            ((c.device_id && devices.includes(c.device_id)) ||
              (c.area_id && areas.includes(c.area_id)) ||
              (c.device_id &&
                areas.includes(
                  home.devices?.find((d) => d.id === c.device_id)?.area_id ||
                    "",
                ))),
        )
        .map((c) => c.entity_id),
    ]),
  ].filter(entityId);
}
export function simulationInputs(
  config: Record<string, any>,
  home: Home,
): SimulationInput[] {
  const found = new Map<string, Set<string>>();
  let budget = 6000;
  function walk(row: any, depth = 0) {
    if (--budget < 0 || depth > 32 || !row || typeof row !== "object") return;
    if (Array.isArray(row)) {
      row.forEach((v) => walk(v, depth + 1));
      return;
    }
    const service = String(row.action || row.service || "").split(".")[0];
    const ids = targets(row, home, service || undefined);
    for (const id of ids) {
      const attrs = found.get(id) || new Set<string>();
      if (typeof row.attribute === "string" && safeKey(row.attribute))
        attrs.add(row.attribute);
      found.set(id, attrs);
    }
    for (const key of ["above", "below"])
      if (typeof row[key] === "string" && entityId(row[key]))
        found.set(row[key], found.get(row[key]) || new Set());
    for (const value of Object.values(row))
      if (value && typeof value === "object") walk(value, depth + 1);
  }
  walk(config);
  const controls = new Map(home.controls.map((c) => [c.entity_id, c]));
  return [...found].map(([id, attributes]) => ({
    id,
    attributes: [...attributes],
    control: controls.get(id),
  }));
}
export function createSimulationScenario(
  config: Record<string, any>,
  home: Home,
  date = new Date(),
): SimulationScenario {
  const states: VirtualStates = Object.fromEntries(
    simulationInputs(config, home).map(({ id, control }) => [
      id,
      {
        state: control?.state ?? "unknown",
        attributes: structuredClone(control?.attributes || {}),
        heldFor: 0,
      },
    ]),
  );
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
  return {
    before: structuredClone(states),
    after: states,
    now: local,
    sunrise: "06:00",
    sunset: "18:00",
    triggerIndex: 0,
    decisions: {},
  };
}
function duration(v: any): number | null {
  const bounded = (ms: number) =>
    Number.isFinite(ms) && ms >= 0 && ms <= 366 * 86400000 ? ms : null;
  if (typeof v === "number") return bounded(v * 1000);
  if (typeof v === "string" && /^\d{1,3}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(v)) {
    const p = v.split(":").map(Number);
    return bounded((p[0] * 3600 + p[1] * 60 + (p[2] || 0)) * 1000);
  }
  if (
    record(v) &&
    Object.keys(v).every((k) =>
      ["hours", "minutes", "seconds", "milliseconds"].includes(k),
    )
  ) {
    const factors: Record<string, number> = {
      hours: 3600000,
      minutes: 60000,
      seconds: 1000,
      milliseconds: 1,
    };
    let result = 0;
    for (const [k, n] of Object.entries(v)) {
      if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
      result += n * factors[k];
    }
    return bounded(result);
  }
  return null;
}
function seconds(v: any): number | null {
  if (typeof v !== "string" || !/^\d{2}:\d{2}(?::\d{2})?$/.test(v)) return null;
  const [h, m, s = 0] = v.split(":").map(Number);
  return h < 24 && m < 60 && s < 60 ? h * 3600 + m * 60 + s : null;
}
class NeedsInput extends Error {
  constructor(
    public path: FlowPath,
    public kind: FlowKind,
    message: string,
    public decision?: "condition" | "action",
  ) {
    super(message);
  }
}
class StopRun extends Error {}
class TestLimit extends Error {}
type Yield =
  { wait: number } | { fork: Generator<Yield, boolean | void, void>[] };
type Sequence = Generator<Yield, boolean | void, void>;

export function simulateFlow(
  config: Record<string, any>,
  home: Home,
  scenario: SimulationScenario,
  lang = "nb",
): SimulationResult {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const states = structuredClone(scenario.after),
    before = structuredClone(scenario.before);
  const events: SimulationEvent[] = [];
  let now = 0,
    parallel = false,
    steps = 0,
    stopped = false,
    stopReason = "";
  let resultStatus: SimulationResult["status"] = "completed";
  const base = new Date(scenario.now).getTime();
  const emit = (
    path: FlowPath,
    kind: FlowKind,
    status: SimStatus,
    detail: string,
    changes: VirtualStates = {},
  ) => {
    if (events.length >= 1800 || ++steps > 2000 || path.length > 80)
      throw new TestLimit(
        t(
          "Testgrensen er nådd. Forkort løkken eller flyten.",
          "Test limit reached. Shorten the loop or flow.",
        ),
      );
    events.push({
      path,
      kind,
      status,
      at: now,
      detail,
      changes: structuredClone(changes),
    });
  };
  const unsupported = (
    path: FlowPath,
    kind: FlowKind,
    detail: string,
    decision: "condition" | "action",
  ): boolean | "continue" => {
    const value = own(scenario.decisions, simulationPath(path));
    if (decision === "condition" && typeof value === "boolean") return value;
    if (decision === "action" && value === "continue") return value;
    throw new NeedsInput(path, kind, detail, decision);
  };
  const number = (v: unknown): number | null =>
    v !== null &&
    v !== undefined &&
    String(v).trim() !== "" &&
    Number.isFinite(Number(v))
      ? Number(v)
      : null;
  const numericMatch = (
    row: any,
    values: VirtualStates,
    id: string,
  ): boolean | null => {
    const value = row.attribute
      ? own(values[id]?.attributes, row.attribute)
      : values[id]?.state;
    const n = number(value);
    if (n === null) return false;
    if (row.above === undefined && row.below === undefined) return null;
    for (const [key, sign] of [
      ["above", 1],
      ["below", -1],
    ] as const) {
      if (row[key] === undefined) continue;
      const bound = number(
        entityId(String(row[key])) ? values[row[key]]?.state : row[key],
      );
      if (bound === null) return null;
      if (!(sign === 1 ? n > bound : n < bound)) return false;
    }
    return true;
  };
  function check(
    row: any,
    path: FlowPath,
    kind: FlowKind = "conditions",
  ): boolean {
    emit(
      path,
      kind,
      "running",
      t("Sjekker virtuelle verdier", "Checking virtual values"),
    );
    let value: boolean | null = null;
    let detail = "";
    let assumed = false;
    if (record(row) && row.enabled === false) {
      emit(path, kind, "skipped", t("Deaktivert vilkår", "Disabled condition"));
      return true;
    }
    const type =
      row?.condition ||
      ["and", "or", "not"].find((k) => Object.hasOwn(row || {}, k));
    const common = ["alias", "note", "metadata", "enabled", "condition"];
    const fields: Record<string, string[]> = {
      state: ["entity_id", "attribute", "state", "for", "match"],
      numeric_state: ["entity_id", "attribute", "above", "below"],
      time: ["after", "before", "weekday"],
      sun: ["after", "before", "after_offset", "before_offset"],
      trigger: ["id"],
    };
    const literalGroup =
      ["and", "or", "not"].includes(type) ||
      Array.isArray(type) ||
      Array.isArray(row);
    if (literalGroup && !dynamic(row?.enabled)) {
      const children = Array.isArray(row)
        ? row
        : Array.isArray(type)
          ? type
          : list(row[type] ?? row.conditions);
      const key = Array.isArray(row)
        ? []
        : Array.isArray(type)
          ? ["condition"]
          : [Object.hasOwn(row, type) ? type : "conditions"];
      value = type === "or" ? false : true;
      for (let i = 0; i < children.length; i++) {
        const yes = check(children[i], [...path, ...key, i]);
        if (type === "or" && yes) {
          value = true;
          break;
        }
        if (type === "not" && yes) {
          value = false;
          break;
        }
        if (type !== "or" && type !== "not" && !yes) {
          value = false;
          break;
        }
      }
    } else if (
      record(row) &&
      fields[type] &&
      !dynamic(row) &&
      Object.keys(row).every((k) => [...common, ...fields[type]].includes(k))
    ) {
      const ids = strings(row.entity_id);
      if (type === "state" && ids.length) {
        const held = row.for === undefined ? 0 : duration(row.for);
        if (
          held !== null &&
          !(held && row.attribute) &&
          !list(row.state).some((v) => typeof v === "string" && entityId(v)) &&
          [undefined, "any", "all"].includes(row.match)
        ) {
          const checks = ids.map((id) => {
            const current = row.attribute
              ? own(states[id]?.attributes, row.attribute)
              : states[id]?.state;
            const expected = row.state;
            return (
              current !== undefined &&
              list(expected).some((s) => String(s) === String(current)) &&
              (states[id]?.heldFor || 0) * 1000 +
                now -
                (states[id]?.changedAt || 0) >=
                held
            );
          });
          value =
            row.match === "any" ? checks.some(Boolean) : checks.every(Boolean);
        }
      } else if (type === "numeric_state" && ids.length) {
        const checks = ids.map((id) => numericMatch(row, states, id));
        value = checks.some((v) => v === null) ? null : checks.every(Boolean);
      } else if (type === "trigger")
        value = strings(row.id).includes(
          String(
            config.triggers?.[scenario.triggerIndex]?.id ??
              scenario.triggerIndex,
          ),
        );
      else if (type === "time" || type === "sun") {
        const date = new Date(base + now),
          clock =
            date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
        let after: number | null = null,
          until: number | null = null;
        let supported = true;
        for (const k of ["after", "before"] as const)
          if (row[k] !== undefined) {
            let boundary = seconds(
              type === "sun"
                ? scenario[row[k] === "sunrise" ? "sunrise" : "sunset"]
                : row[k],
            );
            if (type === "sun" && !["sunrise", "sunset"].includes(row[k]))
              boundary = null;
            const offset =
              type === "sun" && row[`${k}_offset`] !== undefined
                ? signedOffset(row[`${k}_offset`])
                : 0;
            if (boundary === null || offset === null) supported = false;
            else if (k === "after")
              after = (((boundary + offset) % 86400) + 86400) % 86400;
            else until = (((boundary + offset) % 86400) + 86400) % 86400;
          }
        if (supported) {
          value =
            after !== null && until !== null && after > until
              ? clock >= after || clock < until
              : (after === null || clock >= after) &&
                (until === null || clock < until);
          if (row.weekday !== undefined)
            value =
              value &&
              strings(row.weekday).includes(
                ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][
                  date.getDay()
                ],
              );
        }
      }
    }
    if (value === null) {
      value = unsupported(
        path,
        kind,
        t(
          "Vilkåret krever et manuelt testresultat. Maler og integrasjonsspesifikk logikk kjøres ikke lokalt.",
          "This condition needs a manual test result. Templates and integration-specific logic do not run locally.",
        ),
        "condition",
      ) as boolean;
      assumed = true;
    }
    detail = assumed
      ? t("Manuelt testresultat: ", "Manual test result: ")
      : t("Virtuelt resultat: ", "Virtual result: ");
    emit(
      path,
      kind,
      !value ? "failed" : assumed ? "assumed" : "passed",
      detail + (value ? t("oppfylt", "met") : t("ikke oppfylt", "not met")),
    );
    return value;
  }
  function checks(rows: any, path: FlowPath): boolean {
    if (Array.isArray(rows)) {
      for (let i = 0; i < rows.length; i++)
        if (!check(rows[i], [...path, i])) return false;
      return true;
    }
    return rows === undefined ? true : check(rows, path);
  }
  function* sequence(rows: any, path: FlowPath): Sequence {
    const values = list(rows);
    for (let i = 0; i < values.length; i++)
      if (
        !(yield* action(values[i], Array.isArray(rows) ? [...path, i] : path))
      )
        return false;
    return true;
  }
  function* action(row: any, path: FlowPath): Generator<Yield, boolean, void> {
    emit(path, "actions", "running", t("Simulerer steg", "Simulating step"));
    if (row?.enabled === false) {
      emit(
        path,
        "actions",
        "skipped",
        t("Deaktivert steg hoppes over", "Disabled step skipped"),
      );
      return true;
    }
    if (!record(row) || (row.enabled !== undefined && row.enabled !== true)) {
      unsupported(
        path,
        "actions",
        t(
          "Steget må vurderes manuelt i testen.",
          "This step needs a manual test result.",
        ),
        "action",
      );
      emit(
        path,
        "actions",
        "assumed",
        t(
          "Antatt utført uten virtuelle endringer",
          "Assumed complete without virtual changes",
        ),
      );
      return true;
    }
    if (
      row.condition !== undefined ||
      ["and", "or", "not"].some((k) => Object.hasOwn(row, k))
    ) {
      const ok = check(row, path, "actions");
      return ok;
    }
    const common = [
      "alias",
      "note",
      "metadata",
      "enabled",
      "continue_on_error",
    ];
    const known = (keys: string[]) =>
      Object.keys(row).every((k) => [...common, ...keys].includes(k));
    let description = t("Steget er simulert", "Step simulated");
    if (
      Object.hasOwn(row, "stop") &&
      known(["stop", "error"]) &&
      !dynamic(row)
    ) {
      emit(
        path,
        "actions",
        "stopped",
        String(
          row.stop ||
            t("Stopp-kort avslutter kjøringen", "Stop card ends the run"),
        ),
      );
      throw new StopRun(String(row.stop || ""));
    } else if (
      Object.hasOwn(row, "delay") &&
      known(["delay"]) &&
      duration(row.delay) !== null
    ) {
      const wait = duration(row.delay)!;
      description = t(
        `Ventet ${wait / 1000} sekunder virtuelt`,
        `Waited ${wait / 1000} virtual seconds`,
      );
      yield { wait };
    } else if (Object.hasOwn(row, "sequence") && known(["sequence"])) {
      yield* sequence(row.sequence, [...path, "sequence"]);
    } else if (Object.hasOwn(row, "if") && known(["if", "then", "else"])) {
      const ok = checks(row.if, [...path, "if"]);
      description = ok
        ? t("Ja-grenen ble valgt", "Then branch chosen")
        : t("Ellers-grenen ble valgt", "Else branch chosen");
      yield* sequence(ok ? row.then : row.else, [
        ...path,
        ok ? "then" : "else",
      ]);
    } else if (Array.isArray(row.choose) && known(["choose", "default"])) {
      let chosen = -1;
      for (let i = 0; i < row.choose.length; i++)
        if (
          checks(row.choose[i].conditions, [...path, "choose", i, "conditions"])
        ) {
          chosen = i;
          break;
        }
      description =
        chosen < 0
          ? t("Standardgrenen ble valgt", "Default branch chosen")
          : t(
              `Alternativ ${chosen + 1} ble valgt`,
              `Option ${chosen + 1} chosen`,
            );
      yield* sequence(
        chosen < 0 ? row.default : row.choose[chosen].sequence,
        chosen < 0
          ? [...path, "default"]
          : [...path, "choose", chosen, "sequence"],
      );
    } else if (
      record(row.repeat) &&
      known(["repeat"]) &&
      Object.keys(row.repeat).every((k) =>
        ["sequence", "count", "while", "until", "for_each"].includes(k),
      ) &&
      ["count", "while", "until", "for_each"].filter((k) =>
        Object.hasOwn(row.repeat, k),
      ).length === 1 &&
      !dynamic(row.repeat.count) &&
      !dynamic(row.repeat.for_each)
    ) {
      const r = row.repeat;
      const count =
        r.count !== undefined
          ? Number(r.count)
          : Array.isArray(r.for_each)
            ? r.for_each.length
            : null;
      if (
        count !== null &&
        (!Number.isInteger(count) || count < 0 || count > 50)
      )
        throw new TestLimit(
          t(
            "Testen støtter inntil 50 repetisjoner.",
            "The test supports up to 50 iterations.",
          ),
        );
      let iterations = 0;
      while (count === null || iterations < count) {
        if (
          r.while !== undefined &&
          !checks(r.while, [...path, "repeat", "while"])
        )
          break;
        if (++iterations > 50)
          throw new TestLimit(
            t(
              "Løkken nådde testgrensen på 50 repetisjoner.",
              "Loop reached the 50-iteration test limit.",
            ),
          );
        yield* sequence(r.sequence, [...path, "repeat", "sequence"]);
        if (
          r.until !== undefined &&
          checks(r.until, [...path, "repeat", "until"])
        )
          break;
      }
      description = t(
        `${iterations} repetisjoner simulert`,
        `${iterations} iterations simulated`,
      );
    } else if (Array.isArray(row.parallel) && known(["parallel"])) {
      parallel = true;
      yield {
        fork: row.parallel.map((branch: any, i: number) =>
          sequence(branch, [...path, "parallel", i]),
        ),
      };
      description = t(
        "Parallelle grener er ferdige. Rekkefølgen er ett mulig testforløp.",
        "Parallel branches finished. This is one possible execution order.",
      );
    } else {
      const effects = serviceEffects(row, home, states, now);
      if (!effects) {
        unsupported(
          path,
          "actions",
          t(
            "Denne handlingen kan ikke beregnes lokalt. Velg et manuelt testresultat for å fortsette.",
            "This action cannot be computed locally. Choose a manual test result to continue.",
          ),
          "action",
        );
        emit(
          path,
          "actions",
          "assumed",
          t(
            "Manuelt antatt utført. Ingen virtuelle verdier ble endret.",
            "Manually assumed complete. No virtual values changed.",
          ),
        );
        return true;
      }
      for (const [id, value] of Object.entries(effects)) states[id] = value;
      emit(
        path,
        "actions",
        "done",
        t("Endret kun virtuelle enheter", "Changed virtual devices only"),
        effects,
      );
      return true;
    }
    emit(path, "actions", "done", description);
    return true;
  }
  function* run(): Sequence {
    if (!Number.isFinite(base))
      throw new NeedsInput(
        ["triggers", scenario.triggerIndex],
        "triggers",
        t(
          "Velg en gyldig dato og tid i scenarioet.",
          "Choose a valid scenario date and time.",
        ),
        undefined,
      );
    const trigger = config.triggers?.[scenario.triggerIndex];
    const path: FlowPath = ["triggers", scenario.triggerIndex];
    emit(
      path,
      "triggers",
      "running",
      t("Prøver virtuell hendelse", "Trying virtual event"),
    );
    if (!trigger || trigger.enabled === false) {
      emit(
        path,
        "triggers",
        "failed",
        t("Velg en aktiv hendelse", "Choose an enabled event"),
      );
      resultStatus = "not-triggered";
      return;
    }
    let matched: boolean | null = null;
    const type = trigger.trigger || trigger.platform;
    const common = [
      "trigger",
      "platform",
      "alias",
      "note",
      "metadata",
      "id",
      "enabled",
      "variables",
    ];
    const fields: Record<string, string[]> = {
      state: [
        "entity_id",
        "attribute",
        "from",
        "to",
        "not_from",
        "not_to",
        "for",
      ],
      numeric_state: ["entity_id", "attribute", "above", "below", "for"],
      sun: ["event", "offset"],
      time: ["at", "weekday"],
      event: ["event_type", "event_data", "context"],
      homeassistant: ["event"],
    };
    if (
      fields[type] &&
      !dynamic(trigger) &&
      trigger.enabled !== false &&
      [undefined, true].includes(trigger.enabled) &&
      Object.keys(trigger).every((k) =>
        [...common, ...fields[type]].includes(k),
      ) &&
      !Object.hasOwn(trigger, "variables")
    ) {
      if (type === "state") {
        matched = strings(trigger.entity_id).some((id) => {
          const a = trigger.attribute
            ? own(before[id]?.attributes, trigger.attribute)
            : before[id]?.state;
          const b = trigger.attribute
            ? own(states[id]?.attributes, trigger.attribute)
            : states[id]?.state;
          if (a === undefined || b === undefined) return false;
          const stateChanged = String(a) !== String(b);
          const attrsChanged =
            JSON.stringify(before[id]?.attributes) !==
            JSON.stringify(states[id]?.attributes);
          const constrained = ["from", "to", "not_from", "not_to"].some((k) =>
            Object.hasOwn(trigger, k),
          );
          return (
            (stateChanged ||
              (!constrained && !trigger.attribute && attrsChanged)) &&
            (trigger.from == null ||
              strings(trigger.from).includes(String(a))) &&
            (trigger.to == null || strings(trigger.to).includes(String(b))) &&
            (trigger.not_from == null ||
              !strings(trigger.not_from).includes(String(a))) &&
            (trigger.not_to == null ||
              !strings(trigger.not_to).includes(String(b)))
          );
        });
      } else if (type === "numeric_state") {
        const values = strings(trigger.entity_id).map((id) => [
          numericMatch(trigger, before, id),
          numericMatch(trigger, states, id),
          trigger.attribute
            ? own(before[id]?.attributes, trigger.attribute) !==
              own(states[id]?.attributes, trigger.attribute)
            : before[id]?.state !== states[id]?.state,
        ]);
        matched = values.some((v) => v.includes(null))
          ? null
          : values.some(([a, b, changed]) => !a && b && changed);
      } else if (type === "sun")
        matched =
          ["sunrise", "sunset"].includes(trigger.event) &&
          (trigger.offset === undefined ||
            signedOffset(trigger.offset) !== null);
      else if (type === "time") {
        const date = new Date(base),
          clock =
            date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
        const times = list(trigger.at).map(seconds);
        matched = times.some((v) => v === null)
          ? null
          : times.includes(clock) &&
            (trigger.weekday === undefined ||
              strings(trigger.weekday).includes(
                ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][
                  date.getDay()
                ],
              ));
      } else if (type === "event" && typeof trigger.event_type === "string")
        matched = true;
      else if (
        type === "homeassistant" &&
        ["start", "shutdown"].includes(trigger.event)
      )
        matched = true;
    }
    if (
      matched === true &&
      trigger.for !== undefined &&
      duration(trigger.for) === null
    )
      matched = null;
    let assumed = false;
    if (matched === null) {
      matched = unsupported(
        path,
        "triggers",
        t(
          "Hendelsen trenger et manuelt testresultat.",
          "This trigger needs a manual test result.",
        ),
        "condition",
      ) as boolean;
      assumed = true;
    }
    if (!matched) {
      emit(
        path,
        "triggers",
        "failed",
        t(
          "Hendelsen ble ikke utløst av endringen eller tidspunktet.",
          "The change or time did not trigger this event.",
        ),
      );
      resultStatus = "not-triggered";
      return;
    }
    if (trigger.for !== undefined) {
      const hold = duration(trigger.for);
      if (hold !== null) yield { wait: hold };
    }
    emit(
      path,
      "triggers",
      assumed ? "assumed" : "passed",
      assumed
        ? t(
            "Hendelse antatt utløst manuelt",
            "Event manually assumed triggered",
          )
        : t("Hendelsen ble utløst virtuelt", "Event triggered virtually"),
    );
    if (!checks(config.conditions, ["conditions"])) {
      resultStatus = "stopped";
      return;
    }
    if ((yield* sequence(config.actions, ["actions"])) === false)
      resultStatus = "stopped";
  }
  // Discrete virtual clock: parallel branches resume in chronological order and
  // join at the latest completion. No wall-clock waits, services or HA calls.
  type Task = {
    gen: Sequence;
    at: number;
    order: number;
    parent?: Task;
    children: number;
    stop?: StopRun;
  };
  let order = 0;
  const queue: Task[] = [{ gen: run(), at: 0, order: order++, children: 0 }];
  function finish(task: Task, stop?: StopRun) {
    if (stop) {
      stopped = true;
      stopReason = stop.message;
    }
    if (task.parent) {
      task.parent.at = Math.max(task.parent.at, task.at);
      if (stop) task.parent.stop = stop;
      if (--task.parent.children === 0) queue.push(task.parent);
    }
  }
  try {
    if (
      Object.hasOwn(config, "use_blueprint") ||
      (config.variables && dynamic(config.variables)) ||
      config.trigger_variables
    )
      throw new NeedsInput(
        ["triggers", scenario.triggerIndex],
        "triggers",
        t(
          "Flyten har oppstartsvariabler eller en blueprint som krever kjøring i SMARTi-huben. Den kan ikke simuleres sikkert lokalt.",
          "Startup templates or a blueprint require the hub runtime and cannot be safely simulated locally.",
        ),
        undefined,
      );
    while (queue.length) {
      queue.sort((a, b) => a.at - b.at || a.order - b.order);
      const task = queue.shift()!;
      now = task.at;
      let next: IteratorResult<Yield, boolean | void>;
      try {
        next = task.stop ? task.gen.throw(task.stop) : task.gen.next();
      } catch (e) {
        if (e instanceof StopRun) {
          finish(task, e);
          continue;
        }
        throw e;
      }
      if (next.done) {
        finish(task);
        continue;
      }
      if ("wait" in next.value) {
        task.at += next.value.wait;
        task.order = order++;
        queue.push(task);
      } else if (!next.value.fork.length) queue.push(task);
      else {
        if (
          next.value.fork.length > 64 ||
          queue.length + next.value.fork.length > 256
        )
          throw new TestLimit(
            t(
              "Testgrensen for parallelle grener er nådd.",
              "Parallel-branch test limit reached.",
            ),
          );
        task.children = next.value.fork.length;
        next.value.fork.forEach((gen) =>
          queue.push({
            gen,
            at: now,
            order: order++,
            parent: task,
            children: 0,
          }),
        );
      }
    }
    if (stopped) resultStatus = "stopped";
  } catch (e) {
    if (e instanceof NeedsInput) {
      events.push({
        path: e.path,
        kind: e.kind,
        status: "blocked",
        at: now,
        detail: e.message,
        changes: {},
        decision: e.decision,
      });
      resultStatus = "blocked";
    } else if (e instanceof TestLimit) {
      events.push({
        path: events.at(-1)?.path || [],
        kind: "actions",
        status: "blocked",
        at: now,
        detail: e.message,
        changes: {},
      });
      resultStatus = "limited";
    } else {
      events.push({
        path: events.at(-1)?.path || [],
        kind: "actions",
        status: "blocked",
        at: now,
        detail: t(
          "Ugyldig eller ustøttet konfigurasjon i testscenarioet.",
          "Invalid or unsupported test configuration.",
        ),
        changes: {},
      });
      resultStatus = "blocked";
    }
  }
  // The generator updates status when its selected trigger does not fire.
  const finalStatus = resultStatus as SimulationResult["status"];
  return {
    events,
    states,
    status: finalStatus,
    parallel,
    detail:
      finalStatus === "completed"
        ? t("Virtuell kjøring fullført", "Virtual run complete")
        : finalStatus === "not-triggered"
          ? t("Hendelsen ble ikke utløst", "Event did not trigger")
          : finalStatus === "stopped"
            ? stopReason ||
              t(
                "Flyten stoppet ved et vilkår eller Stopp-kort",
                "Flow stopped at a condition or Stop card",
              )
            : events.at(-1)?.detail || "",
  };
}
function signedOffset(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return null;
  const sign = v.startsWith("-") ? -1 : 1,
    raw = v.replace(/^[+-]/, "");
  const d = duration(raw);
  return d === null ? null : (d / 1000) * sign;
}
function serviceEffects(
  row: any,
  home: Home,
  states: VirtualStates,
  now: number,
): VirtualStates | null {
  if (
    !record(row) ||
    dynamic(row) ||
    Object.keys(row).some(
      (k) =>
        ![
          "action",
          "service",
          "target",
          "entity_id",
          "data",
          "alias",
          "note",
          "metadata",
          "enabled",
          "continue_on_error",
        ].includes(k),
    )
  )
    return null;
  const service = row.action ?? row.service;
  if (typeof service !== "string" || (row.action && row.service)) return null;
  const [domain, name] = service.split(".");
  if (
    record(row.target) &&
    Object.keys(row.target).some(
      (k) => !["entity_id", "device_id", "area_id"].includes(k),
    )
  )
    return null;
  const ids = targets(row, home, domain),
    data = row.data || {};
  if (!ids.length || !record(data)) return null;
  const result: VirtualStates = {};
  const finite = (v: any) => typeof v === "number" && Number.isFinite(v);
  const allowed: Record<string, string[]> = {
    turn_on: [
      "brightness_pct",
      "brightness",
      "rgb_color",
      "hs_color",
      "color_temp_kelvin",
      "color_temp",
      "transition",
    ],
    turn_off: ["transition"],
    toggle: [],
    set_temperature: [
      "temperature",
      "target_temp_high",
      "target_temp_low",
      "hvac_mode",
    ],
    set_hvac_mode: ["hvac_mode"],
    set_percentage: ["percentage"],
    set_value: ["value"],
    select_option: ["option"],
    volume_set: ["volume_level"],
    volume_mute: ["is_volume_muted"],
    open_cover: [],
    close_cover: [],
    set_cover_position: ["position"],
    lock: [],
    unlock: [],
    media_play: [],
    media_pause: [],
    media_stop: [],
  };
  if (
    !allowed[name] ||
    Object.keys(data).some((k) => !allowed[name].includes(k))
  )
    return null;
  if (
    data.transition !== undefined &&
    (!finite(data.transition) || data.transition < 0)
  )
    return null;
  for (const key of ["rgb_color", "hs_color"])
    if (data[key] !== undefined) {
      const values = data[key];
      if (
        domain !== "light" ||
        !Array.isArray(values) ||
        values.length !== (key === "rgb_color" ? 3 : 2) ||
        values.some(
          (v: any, i: number) =>
            !finite(v) ||
            v < 0 ||
            v > (key === "rgb_color" ? 255 : i === 0 ? 360 : 100),
        )
      )
        return null;
    }
  for (const key of ["color_temp_kelvin", "color_temp"])
    if (
      data[key] !== undefined &&
      (domain !== "light" || !finite(data[key]) || data[key] <= 0)
    )
      return null;
  for (const id of ids) {
    if (
      !states[id] ||
      ![domain, "homeassistant"].includes(
        domain === "homeassistant" ? "homeassistant" : id.split(".")[0],
      )
    )
      return null;
    if (
      domain === "homeassistant" &&
      !["light", "switch", "fan", "input_boolean"].includes(id.split(".")[0])
    )
      return null;
    const current = states[id],
      attrs = { ...current.attributes };
    let state = current.state;
    if (
      ["turn_on", "turn_off", "toggle"].includes(name) &&
      ["light", "switch", "fan", "input_boolean", "homeassistant"].includes(
        domain,
      )
    ) {
      state =
        name === "toggle"
          ? current.state === "on"
            ? "off"
            : "on"
          : name === "turn_on"
            ? "on"
            : "off";
      if (data.brightness_pct !== undefined) {
        if (
          domain !== "light" ||
          !finite(data.brightness_pct) ||
          data.brightness_pct < 0 ||
          data.brightness_pct > 100
        )
          return null;
        attrs.brightness = Math.round((data.brightness_pct * 255) / 100);
      }
      if (data.brightness !== undefined) {
        if (
          domain !== "light" ||
          !finite(data.brightness) ||
          data.brightness < 0 ||
          data.brightness > 255
        )
          return null;
        attrs.brightness = data.brightness;
      }
      if (domain === "light" && attrs.brightness === 0 && name === "turn_on")
        state = "off";
      for (const k of [
        "rgb_color",
        "hs_color",
        "color_temp_kelvin",
        "color_temp",
      ])
        if (data[k] !== undefined) {
          attrs[k] = structuredClone(data[k]);
          attrs.color_mode =
            k === "rgb_color" ? "rgb" : k === "hs_color" ? "hs" : "color_temp";
        }
    } else if (
      domain === "climate" &&
      name === "set_temperature" &&
      ["temperature", "target_temp_high", "target_temp_low"].some((k) =>
        finite(data[k]),
      )
    ) {
      for (const k of ["temperature", "target_temp_high", "target_temp_low"])
        if (data[k] !== undefined) {
          if (!finite(data[k])) return null;
          attrs[k] = data[k];
        }
      if (data.hvac_mode !== undefined) state = String(data.hvac_mode);
    } else if (
      domain === "climate" &&
      name === "set_hvac_mode" &&
      typeof data.hvac_mode === "string"
    )
      state = data.hvac_mode;
    else if (
      domain === "fan" &&
      name === "set_percentage" &&
      finite(data.percentage) &&
      data.percentage >= 0 &&
      data.percentage <= 100
    ) {
      attrs.percentage = data.percentage;
      state = data.percentage ? "on" : "off";
    } else if (
      domain === "input_number" &&
      name === "set_value" &&
      finite(data.value)
    )
      state = String(data.value);
    else if (
      domain === "input_select" &&
      name === "select_option" &&
      typeof data.option === "string"
    )
      state = data.option;
    else if (
      domain === "cover" &&
      ["open_cover", "close_cover", "set_cover_position"].includes(name)
    ) {
      const position =
        name === "open_cover"
          ? 100
          : name === "close_cover"
            ? 0
            : data.position;
      if (!finite(position) || position < 0 || position > 100) return null;
      attrs.current_position = position;
      state = position ? "open" : "closed";
    } else if (domain === "lock" && ["lock", "unlock"].includes(name))
      state = name === "lock" ? "locked" : "unlocked";
    else if (
      domain === "media_player" &&
      ["media_play", "media_pause", "media_stop"].includes(name)
    )
      state =
        name === "media_play"
          ? "playing"
          : name === "media_pause"
            ? "paused"
            : "idle";
    else if (
      domain === "media_player" &&
      name === "volume_set" &&
      finite(data.volume_level) &&
      data.volume_level >= 0 &&
      data.volume_level <= 1
    )
      attrs.volume_level = data.volume_level;
    else if (
      domain === "media_player" &&
      name === "volume_mute" &&
      typeof data.is_volume_muted === "boolean"
    )
      attrs.is_volume_muted = data.is_volume_muted;
    else return null;
    result[id] = {
      state,
      attributes: attrs,
      heldFor: state === current.state ? current.heldFor : 0,
      changedAt: state === current.state ? current.changedAt : now,
    };
  }
  return result;
}
export function simulationFrame(
  events: SimulationEvent[],
  cursor: number,
): SimulationFrame {
  const nodes: Record<string, SimStatus> = {},
    visited = new Set<string>();
  let activeNode: string | null = null;
  for (const event of events.slice(0, cursor)) {
    if (event.path.length < 2) continue;
    const root = simulationPath(event.path.slice(0, 2));
    visited.add(root);
    if (
      event.path.length === 2 ||
      ["blocked", "stopped"].includes(event.status)
    )
      nodes[root] = event.status;
    if (event.status === "running") activeNode = root;
    else if (
      activeNode === root &&
      (event.path.length === 2 || ["blocked", "stopped"].includes(event.status))
    )
      activeNode = null;
  }
  return { nodes, activeNode, visited };
}
