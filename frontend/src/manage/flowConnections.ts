import { canvasModel, isUnconditionalStop } from "./flowCanvasModel";

export type ConnectionMode = "sequence" | "parallel";
export type ConnectionPlan =
  | { ok: false; message: string }
  | { ok: true; message: string; patch: Record<string, any> };

// Only move literal, independent actions into a new parallel scope. A template
// may read `wait`, `repeat` or a response variable from a previous step; without
// evaluating HA's runtime we cannot prove that moving it preserves that scope.
const literal = (value: any): boolean => {
  if (typeof value === "string") return !/\{[{%#]/.test(value);
  if (Array.isArray(value)) return value.every(literal);
  if (value && typeof value === "object")
    return Object.values(value).every(literal);
  return true;
};
function parallelSafe(row: any): boolean {
  if (!row || typeof row !== "object" || Array.isArray(row)) return false;
  if (row.enabled !== undefined && typeof row.enabled !== "boolean")
    return false;
  if (
    row.continue_on_error !== undefined &&
    typeof row.continue_on_error !== "boolean"
  )
    return false;
  const common = ["alias", "note", "metadata", "enabled", "continue_on_error"];
  if (Object.hasOwn(row, "delay"))
    return (
      Object.keys(row).every((key) => [...common, "delay"].includes(key)) &&
      literal(row.delay)
    );
  const action = row.action ?? row.service;
  if (
    typeof action !== "string" ||
    !/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/.test(action) ||
    (Object.hasOwn(row, "action") && Object.hasOwn(row, "service"))
  )
    return false;
  return (
    Object.keys(row).every((key) =>
      [...common, "action", "service", "target", "entity_id", "data"].includes(
        key,
      ),
    ) &&
    literal(row.target) &&
    literal(row.entity_id) &&
    literal(row.data)
  );
}

// Translate gestures to HA's native lists/parallel block. Never store decorative
// edges that imply a different execution graph than the saved automation.
export function planConnection(
  config: Record<string, any>,
  from: string,
  to: string,
  mode: ConnectionMode,
  lang: string,
): ConnectionPlan {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const fail = (nb: string, en: string): ConnectionPlan => ({
    ok: false,
    message: t(nb, en),
  });
  const graph = canvasModel(config, lang);
  const source = graph.nodes.find((n) => n.id === from);
  const target = graph.nodes.find((n) => n.id === to);
  if (!source || !target)
    return fail(
      "Kortet finnes ikke lenger. Velg på nytt.",
      "The card no longer exists. Select again.",
    );
  if (from === to)
    return fail(
      "Et kort kan ikke kobles til seg selv.",
      "A card cannot connect to itself.",
    );
  if (mode === "parallel") {
    if (source.kind !== "actions" || target.kind !== "actions")
      return fail(
        "Samtidig krever to handlingskort.",
        "Parallel requires two action cards.",
      );
    const a = source.path![1] as number,
      b = target.path![1] as number;
    // Also check intervening steps: moving a later action before an existing
    // condition, wait or variable assignment could bypass its requirement.
    if (
      !config.actions
        .slice(Math.min(a, b), Math.max(a, b) + 1)
        .every(parallelSafe)
    )
      return fail(
        "Disse stegene bruker krav, venting, beregninger eller verdier fra andre steg. Behold rekkefølgen, eller lag en egen Samtidig-gren og velg innholdet der.",
        "These steps use requirements, waits, calculations or values from other steps. Keep their order, or create a separate parallel block and choose its contents there.",
      );
    const actions = config.actions.flatMap((row: any, index: number) =>
      index === a
        ? [
            {
              parallel: [
                { sequence: [row] },
                { sequence: [config.actions[b]] },
              ],
            },
          ]
        : index === b
          ? []
          : [row],
    );
    return {
      ok: true,
      patch: { actions },
      message: t(
        "De to kortene samles i én Samtidig-gren på det første kortets plass. Begge starter sammen; neste steg venter til begge er ferdige. Andre kort beholder sin innbyrdes rekkefølge.",
        "The two cards become a parallel block at the source card's position. Both start together; the next step waits for both. Other cards keep their relative order.",
      ),
    };
  }
  if (graph.edges.some((e) => e.from === from && e.to === to))
    return fail(
      "Disse kortene er allerede koblet sammen.",
      "These cards are already connected.",
    );
  if (target.kind === "triggers" || target.kind === "gate")
    return fail(
      "Hendelser er alternative startpunkter. Koble fra en hendelse til første krav eller handling.",
      "Events are alternative starting points. Connect an event to the first requirement or action.",
    );
  if (target.kind !== "conditions" && target.kind !== "actions")
    return fail(
      "Velg et krav eller en handling.",
      "Choose a requirement or an action.",
    );
  const key = target.kind;
  const rows = config[key] as any[];
  const targetIndex = target.path![1] as number;
  const sourceIndex = source.path?.[1] as number | undefined;
  let insertAfter: number;
  if (source.kind === key) {
    if (key === "actions" && isUnconditionalStop(rows[sourceIndex!]))
      return fail(
        "Et aktivt Stopp-kort avslutter løpet. Koble fra et annet kort.",
        "An active Stop ends the run. Connect from a different card.",
      );
    insertAfter = sourceIndex!;
  } else if (
    source.kind === "triggers" &&
    (key === "conditions" || !(config.conditions || []).length)
  ) {
    insertAfter = -1;
  } else if (
    source.kind === "conditions" &&
    key === "actions" &&
    sourceIndex === config.conditions.length - 1
  ) {
    insertAfter = -1;
  } else {
    return fail(
      "Alle krav må sjekkes før handlingene. Koble fra siste krav, eller koble kort av samme type.",
      "All requirements must be checked before actions. Connect from the last requirement, or between cards of the same type.",
    );
  }
  const result = rows.filter((_, index) => index !== targetIndex);
  const newIndex =
    insertAfter < 0 ? 0 : insertAfter - (targetIndex < insertAfter ? 1 : 0) + 1;
  result.splice(newIndex, 0, rows[targetIndex]);
  return {
    ok: true,
    patch: { [key]: result },
    message: t(
      "Alle hendelser starter samme løp. Målkortet flyttes rett etter kortet du kobler fra. De øvrige kortene beholder sin innbyrdes rekkefølge, og linjene kobles om. Ingen kort slettes.",
      "All events start the same sequence. The target moves directly after the source. Other cards keep their relative order and their connections are updated. No cards are deleted.",
    ),
  };
}
