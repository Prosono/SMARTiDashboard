import type { FlowPath } from "./flowStructure";
export type CanvasNode = {
  id: string;
  path: FlowPath | null;
  kind: "triggers" | "conditions" | "actions" | "gate";
  label?: string;
  x: number;
  y: number;
};
export type CanvasEdge = { from: string; to: string; label: string };
const record = (row: any) =>
  row !== null && typeof row === "object" && !Array.isArray(row);
export function isUnconditionalStop(row: any): boolean {
  return (
    record(row) &&
    Object.hasOwn(row, "stop") &&
    (row.enabled === undefined || row.enabled === true)
  );
}
export function canvasModel(config: Record<string, any>, lang: string) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const nodes: CanvasNode[] = [],
    edges: CanvasEdge[] = [];
  const add = (
    kind: CanvasNode["kind"],
    path: FlowPath | null,
    x: number,
    y: number,
    label?: string,
  ) => {
    const id = path ? JSON.stringify(path) : "start";
    nodes.push({ id, path, kind, x, y, label });
    return id;
  };
  const gate = add(
    "gate",
    null,
    370,
    60,
    t("Når én hendelse skjer", "When any event occurs"),
  );
  for (const [i] of (config.triggers || []).entries()) {
    const id = add("triggers", ["triggers", i], 30, 60 + i * 170);
    edges.push({ from: id, to: gate, label: t("Starter", "Starts") });
  }
  let previous = gate;
  for (const [i] of (config.conditions || []).entries()) {
    const id = add("conditions", ["conditions", i], 710 + i * 340, 60);
    edges.push({
      from: previous,
      to: id,
      label: i === 0 ? t("Sjekk", "Check") : t("Ja", "Yes"),
    });
    previous = id;
  }
  const x = 710 + (config.conditions?.length || 0) * 340;
  const nextLabel = (row: any) => {
    if (!record(row)) return t("Deretter", "Next");
    if (row.enabled === false) return t("Hoppes over", "Skipped");
    if (Object.hasOwn(row, "stop"))
      return t("Hvis steget hoppes over", "If the step is skipped");
    if (
      ["condition", "and", "or", "not"].some((key) => Object.hasOwn(row, key))
    )
      return row.enabled !== undefined && row.enabled !== true
        ? t("Hvis oppfylt eller hoppet over", "If satisfied or skipped")
        : t("Hvis oppfylt", "If satisfied");
    return t("Deretter", "Next");
  };
  for (const [i] of (config.actions || []).entries()) {
    const id = add("actions", ["actions", i], x + i * 340, 60);
    if (previous)
      edges.push({
        from: previous,
        to: id,
        label:
          i === 0
            ? config.conditions?.length
              ? t("Ja", "Yes")
              : t("Gjør", "Then")
            : nextLabel(config.actions[i - 1]),
      });
    previous = isUnconditionalStop(config.actions[i]) ? "" : previous ? id : "";
  }
  // The synthetic start is execution bookkeeping, not an editable card.
  const outgoing = edges.filter((e) => e.from === gate);
  const incoming = edges.filter((e) => e.to === gate);
  return {
    nodes: nodes
      .filter((n) => n.id !== gate)
      .map((n) => ({ ...n, x: n.x > 370 ? n.x - 340 : n.x })),
    edges: [
      ...edges.filter((e) => e.from !== gate && e.to !== gate),
      ...incoming.flatMap((a) =>
        outgoing.map((b) => ({ from: a.from, to: b.to, label: b.label })),
      ),
    ],
  };
}
