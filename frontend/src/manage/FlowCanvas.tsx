import { useMemo, useRef, useState } from "react";
import {
  GripHorizontal,
  Minus,
  Plus,
  LocateFixed,
  GitBranch,
  Zap,
  Filter,
  Play,
} from "lucide-react";
import type { Home } from "../types";
import { canvasModel } from "./flowCanvasModel";
import {
  readFlowPath,
  structureSummary,
  flowGroups,
  type FlowPath,
} from "./flowStructure";
import { flowSummary, type FlowKey } from "./AutomationFlow";
export function FlowCanvas({
  config,
  home,
  lang,
  onSelect,
  onAdd,
}: {
  config: Record<string, any>;
  home: Home;
  lang: string;
  onSelect: (p: FlowPath) => void;
  onAdd: (k: FlowKey) => void;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const graph = useMemo(() => canvasModel(config, lang), [config, lang]);
  const [zoom, setZoom] = useState(0.8),
    [positions, setPositions] = useState<
      Record<string, { x: number; y: number }>
    >({});
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    startX: number;
    startY: number;
  } | null>(null);
  const nodes = graph.nodes.map((n) => ({ ...n, ...positions[n.id] }));
  const width = Math.max(1100, ...nodes.map((n) => n.x + 340)),
    height = Math.max(480, ...nodes.map((n) => n.y + 200));
  function move(id: string, x: number, y: number) {
    setPositions((old) => ({
      ...old,
      [id]: {
        x: Math.max(10, Math.round(x / 10) * 10),
        y: Math.max(20, Math.round(y / 10) * 10),
      },
    }));
  }
  return (
    <section
      className="flow-workspace"
      aria-label={t("Arbeidsflate for automasjon", "Automation canvas")}
    >
      <div className="canvas-toolbar">
        <div className="canvas-legend">
          <span>
            <Zap size={15} />
            {t("Når", "When")}
          </span>
          <span>
            <Filter size={15} />
            {t("Og", "And")}
          </span>
          <span>
            <Play size={15} />
            {t("Så", "Then")}
          </span>
        </div>
        <div>
          <button
            type="button"
            aria-label={t("Zoom ut", "Zoom out")}
            disabled={zoom <= 0.4}
            onClick={() => setZoom((v) => Math.max(0.4, v - 0.1))}
          >
            <Minus size={17} />
          </button>
          <output>{Math.round(zoom * 100)}%</output>
          <button
            type="button"
            aria-label={t("Zoom inn", "Zoom in")}
            disabled={zoom >= 1.4}
            onClick={() => setZoom((v) => Math.min(1.4, v + 0.1))}
          >
            <Plus size={17} />
          </button>
          <button
            type="button"
            onClick={() => {
              setPositions({});
              setZoom(0.8);
              viewport.current?.scrollTo({ top: 0, left: 0 });
            }}
          >
            <LocateFixed size={17} />
            {t("Rydd opp", "Arrange")}
          </button>
        </div>
      </div>
      <p className="canvas-help">
        {t(
          "Trykk på et kort for å redigere. Dra i håndtaket for å flytte det, eller bruk piltastene. Rull for å utforske.",
          "Select a card to edit. Drag its handle to move it, or use arrow keys. Scroll to explore.",
        )}
      </p>
      <div
        className="canvas-viewport"
        ref={viewport}
        tabIndex={0}
        aria-label={t("Rullbar flyt", "Scrollable flow")}
      >
        <div style={{ width: width * zoom, height: height * zoom }}>
          <div
            className="canvas-plane"
            style={{ width, height, transform: `scale(${zoom})` }}
          >
            <svg
              className="canvas-wires"
              width={width}
              height={height}
              aria-hidden="true"
            >
              <defs>
                <marker
                  id="flow-tip"
                  markerWidth="7"
                  markerHeight="7"
                  refX="6"
                  refY="3.5"
                  orient="auto"
                >
                  <path d="M0,0 L7,3.5 L0,7" fill="currentColor" />
                </marker>
              </defs>
              {graph.edges.map((e, i) => {
                const a = nodes.find((n) => n.id === e.from)!,
                  b = nodes.find((n) => n.id === e.to)!;
                const ax = a.x + 260,
                  ay = a.y + 65,
                  bx = b.x,
                  by = b.y + 65;
                return (
                  <g key={i}>
                    <path
                      d={`M${ax} ${ay} C${ax + 60} ${ay},${bx - 60} ${by},${bx} ${by}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      markerEnd="url(#flow-tip)"
                    />
                    <text
                      x={(ax + bx) / 2}
                      y={(ay + by) / 2 - 10}
                      textAnchor="middle"
                    >
                      {e.label}
                    </text>
                  </g>
                );
              })}
            </svg>
            {nodes.map((n) => {
              const row = n.path ? readFlowPath(config, n.path) : null;
              const summary =
                n.kind === "gate"
                  ? {
                      title: n.label!,
                      detail: t(
                        "Hendelsene er alternative startpunkter.",
                        "Events are alternative starting points.",
                      ),
                    }
                  : structureSummary(row, lang) ||
                    flowSummary(row, n.kind as FlowKey, home, lang);
              const branches = n.path ? flowGroups(row, n.path, lang) : [];
              return (
                <article
                  className={"canvas-node canvas-" + n.kind}
                  key={n.id}
                  style={{ left: n.x, top: n.y }}
                >
                  <button
                    type="button"
                    className="canvas-drag"
                    aria-label={
                      t("Flytt kort: ", "Move card: ") +
                      (row?.alias || summary.title)
                    }
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      e.preventDefault();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      drag.current = {
                        id: n.id,
                        x: n.x,
                        y: n.y,
                        startX: e.clientX,
                        startY: e.clientY,
                      };
                    }}
                    onPointerMove={(e) => {
                      const d = drag.current;
                      if (d?.id === n.id)
                        move(
                          n.id,
                          d.x + (e.clientX - d.startX) / zoom,
                          d.y + (e.clientY - d.startY) / zoom,
                        );
                    }}
                    onPointerUp={() => {
                      drag.current = null;
                    }}
                    onPointerCancel={() => {
                      drag.current = null;
                    }}
                    onKeyDown={(e) => {
                      const delta: { [k: string]: [number, number] } = {
                        ArrowLeft: [-20, 0],
                        ArrowRight: [20, 0],
                        ArrowUp: [0, -20],
                        ArrowDown: [0, 20],
                      };
                      if (delta[e.key]) {
                        e.preventDefault();
                        move(
                          n.id,
                          n.x + delta[e.key][0],
                          n.y + delta[e.key][1],
                        );
                      }
                    }}
                  >
                    <GripHorizontal size={18} />
                    <span>
                      {n.kind === "triggers"
                        ? t("NÅR", "WHEN")
                        : n.kind === "conditions"
                          ? t("OG", "AND")
                          : n.kind === "actions"
                            ? t("SÅ", "THEN")
                            : t("START", "START")}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="canvas-node-content"
                    disabled={!n.path}
                    onClick={() => n.path && onSelect(n.path)}
                  >
                    <strong>{row?.alias || summary.title}</strong>
                    <span>{summary.detail}</span>
                    {branches.length > 0 && (
                      <small>
                        <GitBranch size={14} />
                        {t("Åpne delflyt", "Open subflow")} · {branches.length}{" "}
                        {t("deler", "parts")}
                      </small>
                    )}
                    {row?.enabled === false && (
                      <small>
                        {t("Deaktivert · hoppes over", "Disabled · skipped")}
                      </small>
                    )}
                    {n.kind === "conditions" && (
                      <small>
                        {t("Nei → stopp dette løpet", "No → stop this run")}
                      </small>
                    )}
                  </button>
                  <i className="canvas-port in" />
                  <i className="canvas-port out" />
                </article>
              );
            })}
          </div>
        </div>
      </div>
      <div className="canvas-add">
        {(["triggers", "conditions", "actions"] as FlowKey[]).map((k) => (
          <button type="button" key={k} onClick={() => onAdd(k)}>
            <Plus size={16} />
            {k === "triggers"
              ? t("Legg til hendelse", "Add event")
              : k === "conditions"
                ? t("Legg til krav", "Add requirement")
                : t("Legg til handling", "Add action")}
          </button>
        ))}
      </div>
      <small className="canvas-help">
        {t(
          "Kortplasseringer lagres ikke. Koblingene følger automasjonen; flytting endrer ikke rekkefølgen.",
          "Card positions are not saved. Connections follow the automation; moving cards does not change execution order.",
        )}
      </small>
    </section>
  );
}
