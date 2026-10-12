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
            : t("Deretter", "Next"),
      });
    previous =
      Object.hasOwn(config.actions[i] || {}, "stop") &&
      config.actions[i].enabled !== false
        ? ""
        : previous
          ? id
          : "";
  }
  return { nodes, edges };
}
