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
  Grid2X2,
  Cable,
  Trash2,
  X,
  Link2,
  Palette,
} from "lucide-react";
import type { Home } from "../types";
import { planConnection, type ConnectionMode } from "./flowConnections";
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
  onRemove,
  onConnect,
}: {
  config: Record<string, any>;
  home: Home;
  lang: string;
  onSelect: (p: FlowPath) => void;
  onAdd: (k: FlowKey) => void;
  onRemove: (p: FlowPath) => void;
  onConnect: (patch: Record<string, any>) => void;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const graph = useMemo(() => canvasModel(config, lang), [config, lang]);
  const [zoom, setZoom] = useState(0.8),
    [positions, setPositions] = useState<
      Record<string, { x: number; y: number }>
    >({});
  const [showGrid, setShowGrid] = useState(true);
  const [showLines, setShowLines] = useState(true);
  const [palette, setPalette] = useState("vivid");
  const [connectionMode, setConnectionMode] =
    useState<ConnectionMode>("sequence");
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [linkTarget, setLinkTarget] = useState<string | null>(null);
  const [linkPoint, setLinkPoint] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [connectionMessage, setConnectionMessage] = useState("");
  const wireDrag = useRef<{ x: number; y: number; moved: boolean } | null>(
    null,
  );
  const ignorePortClick = useRef(false);
  const plane = useRef<HTMLDivElement>(null);
  const pending =
    linkFrom && linkTarget
      ? planConnection(config, linkFrom, linkTarget, connectionMode, lang)
      : null;
  function selectTarget(id: string) {
    if (!linkFrom) {
      setConnectionMessage(
        t(
          "Velg først utgangen på kortet du vil koble fra.",
          "First choose the output of the source card.",
        ),
      );
      return;
    }
    setLinkTarget(id);
    setLinkPoint(null);
    setConnectionMessage("");
  }
  function cancelConnection() {
    setLinkFrom(null);
    setLinkTarget(null);
    setLinkPoint(null);
    wireDrag.current = null;
    setConnectionMessage("");
  }
  function nodeName(id: string) {
    const n = graph.nodes.find((n) => n.id === id);
    if (!n?.path) return n?.label || t("Start", "Start");
    const row = readFlowPath(config, n.path);
    return (
      row?.alias ||
      (
        structureSummary(row, lang) ||
        flowSummary(row, n.kind as FlowKey, home, lang)
      ).title
    );
  }
  const suppressClick = useRef(false);
  const pan = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    startX: number;
    startY: number;
  } | null>(null);
  const nodes = graph.nodes.map((n) => ({ ...n, ...positions[n.id] }));
  const width = Math.max(1800, ...nodes.map((n) => n.x + 340)),
    height = Math.max(900, ...nodes.map((n) => n.y + 200));
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
      className={"flow-workspace palette-" + palette}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          cancelConnection();
          e.stopPropagation();
        }
      }}
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
        <div className="canvas-tools">
          <label className="canvas-palette">
            <Palette size={17} />
            <select
              aria-label={t("Farger", "Colors")}
              value={palette}
              onChange={(e) => setPalette(e.target.value)}
            >
              <option value="vivid">
                {t("Livlige farger", "Vivid colors")}
              </option>
              <option value="calm">{t("Rolige farger", "Calm colors")}</option>
            </select>
          </label>
          <button
            type="button"
            aria-pressed={showGrid}
            onClick={() => setShowGrid((v) => !v)}
          >
            <Grid2X2 size={17} />
            {t("Rutenett", "Grid")}
          </button>
          <button
            type="button"
            aria-pressed={showLines}
            onClick={() => {
              setShowLines((v) => !v);
              cancelConnection();
            }}
          >
            <Cable size={17} />
            {t("Linjer", "Lines")}
          </button>
          <button
            type="button"
            aria-label={t("Zoom ut", "Zoom out")}
            disabled={zoom <= 0.4}
            onClick={() =>
              setZoom((v) => Math.max(0.4, Math.round((v - 0.1) * 10) / 10))
            }
          >
            <Minus size={17} />
          </button>
          <output>{Math.round(zoom * 100)}%</output>
          <button
            type="button"
            aria-label={t("Zoom inn", "Zoom in")}
            disabled={zoom >= 1.4}
            onClick={() =>
              setZoom((v) => Math.min(1.4, Math.round((v + 0.1) * 10) / 10))
            }
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
      <div className="canvas-connection-tools">
        <Link2 size={18} />
        <span>{t("Koble kort", "Connect cards")}</span>
        <div role="group" aria-label={t("Koblingstype", "Connection type")}>
          <button
            type="button"
            aria-pressed={connectionMode === "sequence"}
            onClick={() => {
              setShowLines(true);
              setConnectionMode("sequence");
              setLinkTarget(null);
            }}
          >
            {t("Etter hverandre", "In sequence")}
          </button>
          <button
            type="button"
            aria-pressed={connectionMode === "parallel"}
            onClick={() => {
              setShowLines(true);
              setConnectionMode("parallel");
              setLinkTarget(null);
            }}
          >
            {t("Samtidig", "In parallel")}
          </button>
        </div>
      </div>
      <div
        className="canvas-connection-status"
        role="status"
        aria-live="polite"
      >
        {pending ? (
          <>
            <strong>
              {nodeName(linkFrom!)} → {nodeName(linkTarget!)}
            </strong>
            <span>{pending.message}</span>
            {pending.ok && (
              <button
                type="button"
                className="primary"
                onClick={() => {
                  // Preserve each row's visual location when sequence indices change.
                  const next = { ...config, ...pending.patch };
                  const nextPositions: Record<
                    string,
                    { x: number; y: number }
                  > = {};
                  for (const n of canvasModel(next, lang).nodes) {
                    const row = n.path ? readFlowPath(next, n.path) : null;
                    const old = nodes.find((old) =>
                      n.path
                        ? old.path && readFlowPath(config, old.path) === row
                        : !old.path,
                    );
                    if (old) nextPositions[n.id] = { x: old.x, y: old.y };
                  }
                  setPositions(nextPositions);
                  onConnect(pending.patch);
                  cancelConnection();
                  setConnectionMessage(
                    t(
                      "Koblingen er endret. Lagre automasjonen for å ta den i bruk.",
                      "Connection updated. Save the automation to apply it.",
                    ),
                  );
                }}
              >
                {t("Bekreft kobling", "Confirm connection")}
              </button>
            )}
          </>
        ) : (
          <span>
            {connectionMessage ||
              t(
                "Dra fra prikken til høyre til + på et annet kort. Du kan også trykke på de to punktene. Esc avbryter.",
                "Drag from the dot on the right to + on another card, or select the two ports. Esc cancels.",
              )}
          </span>
        )}
        {
          <button type="button" disabled={!linkFrom} onClick={cancelConnection}>
            <X size={16} />
            {t("Avbryt kobling", "Cancel connection")}
          </button>
        }
      </div>
      <div
        className={"canvas-viewport" + (showGrid ? "" : " no-grid")}
        ref={viewport}
        onPointerDown={(e) => {
          if (
            e.button !== 0 ||
            (e.target as HTMLElement).closest(".canvas-node")
          )
            return;
          e.currentTarget.setPointerCapture(e.pointerId);
          pan.current = {
            x: e.clientX,
            y: e.clientY,
            left: e.currentTarget.scrollLeft,
            top: e.currentTarget.scrollTop,
          };
        }}
        onPointerMove={(e) => {
          if (!pan.current) return;
          e.currentTarget.scrollLeft =
            pan.current.left - (e.clientX - pan.current.x);
          e.currentTarget.scrollTop =
            pan.current.top - (e.clientY - pan.current.y);
        }}
        onPointerUp={() => {
          pan.current = null;
        }}
        onPointerCancel={() => {
          pan.current = null;
        }}
        onLostPointerCapture={() => {
          pan.current = null;
        }}
        tabIndex={0}
        aria-label={t("Rullbar flyt", "Scrollable flow")}
      >
        <div style={{ width: width * zoom, height: height * zoom }}>
          <div
            ref={plane}
            className="canvas-plane"
            style={{ width, height, transform: `scale(${zoom})` }}
          >
            {showLines && (
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
                    <path d="M0,0 L7,3.5 L0,7" fill="context-stroke" />
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
                    <g key={i} className={"canvas-wire-" + a.kind}>
                      <path
                        d={`M${ax} ${ay} C${ax + 60} ${ay},${bx - 60} ${by},${bx} ${by}`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
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
            )}
            {linkFrom &&
              linkPoint &&
              (() => {
                const source = nodes.find((n) => n.id === linkFrom);
                if (!source) return null;
                return (
                  <svg
                    className="canvas-wire-preview"
                    width={width}
                    height={height}
                    aria-hidden="true"
                  >
                    <path
                      d={`M${source.x + 260} ${source.y + 65} C${source.x + 340} ${source.y + 65},${linkPoint.x - 80} ${linkPoint.y},${linkPoint.x} ${linkPoint.y}`}
                    />
                  </svg>
                );
              })()}
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
                  className={
                    "canvas-node canvas-" +
                    n.kind +
                    (n.id === linkFrom ? " is-connecting" : "") +
                    (linkFrom &&
                    planConnection(config, linkFrom, n.id, connectionMode, lang)
                      .ok
                      ? " is-connectable"
                      : "")
                  }
                  data-node-id={n.id}
                  key={n.id}
                  style={{ left: n.x, top: n.y }}
                  onPointerDown={(e) => {
                    if (
                      e.button !== 0 ||
                      (e.target as HTMLElement).closest(
                        ".canvas-delete, .canvas-port",
                      )
                    )
                      return;
                    suppressClick.current = false;
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
                    if (d?.id !== n.id) return;
                    if (
                      Math.hypot(e.clientX - d.startX, e.clientY - d.startY) <
                        5 &&
                      !suppressClick.current
                    )
                      return;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    suppressClick.current = true;
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
                    suppressClick.current = false;
                  }}
                  onLostPointerCapture={() => {
                    drag.current = null;
                  }}
                  onClickCapture={(e) => {
                    if (suppressClick.current) {
                      e.preventDefault();
                      e.stopPropagation();
                      suppressClick.current = false;
                    }
                  }}
                >
                  <button
                    type="button"
                    className="canvas-drag"
                    aria-label={
                      t("Flytt kort: ", "Move card: ") +
                      (row?.alias || summary.title)
                    }
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
                  {n.path && (
                    <button
                      type="button"
                      className="canvas-delete"
                      aria-label={
                        t("Fjern kort: ", "Remove card: ") +
                        (row?.alias || summary.title)
                      }
                      onClick={() => {
                        if (
                          window.confirm(
                            t(
                              "Fjerne dette kortet fra automasjonen? Endringen tas i bruk når du lagrer.",
                              "Remove this card from the automation? The change takes effect when you save.",
                            ),
                          )
                        ) {
                          setPositions({});
                          onRemove(n.path!);
                        }
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                  {showLines && (
                    <>
                      {n.kind !== "triggers" && (
                        <button
                          type="button"
                          className="canvas-port in"
                          data-input-node={n.id}
                          aria-label={
                            t("Koble til: ", "Connect to: ") +
                            (row?.alias || summary.title)
                          }
                          onClick={() => selectTarget(n.id)}
                        >
                          <Plus size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        className="canvas-port out"
                        aria-label={
                          t("Koble fra: ", "Connect from: ") +
                          (row?.alias || summary.title)
                        }
                        aria-pressed={linkFrom === n.id}
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          e.stopPropagation();
                          suppressClick.current = false;
                          ignorePortClick.current = false;
                          e.currentTarget.setPointerCapture(e.pointerId);
                          wireDrag.current = {
                            x: e.clientX,
                            y: e.clientY,
                            moved: false,
                          };
                          setLinkFrom(n.id);
                          setLinkTarget(null);
                          setConnectionMessage("");
                        }}
                        onPointerMove={(e) => {
                          const d = wireDrag.current;
                          if (!d) return;
                          if (
                            Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5 &&
                            !d.moved
                          )
                            return;
                          d.moved = true;
                          const rect = plane.current!.getBoundingClientRect();
                          setLinkPoint({
                            x: (e.clientX - rect.left) / zoom,
                            y: (e.clientY - rect.top) / zoom,
                          });
                        }}
                        onPointerUp={(e) => {
                          const d = wireDrag.current;
                          if (!d) return;
                          if (d.moved) {
                            ignorePortClick.current = true;
                            const target = document
                              .elementFromPoint(e.clientX, e.clientY)
                              ?.closest("[data-input-node]")
                              ?.getAttribute("data-input-node");
                            if (target) selectTarget(target);
                            else
                              setConnectionMessage(
                                t(
                                  "Slipp på + på kortet du vil koble til, eller trykk på inngangen.",
                                  "Drop on the target card's +, or select its input.",
                                ),
                              );
                          }
                          setLinkPoint(null);
                          wireDrag.current = null;
                        }}
                        onPointerCancel={cancelConnection}
                        onLostPointerCapture={() => {
                          wireDrag.current = null;
                          setLinkPoint(null);
                        }}
                        onClick={() => {
                          if (ignorePortClick.current) {
                            ignorePortClick.current = false;
                            return;
                          }
                          setLinkFrom(n.id);
                          setLinkTarget(null);
                          setConnectionMessage("");
                        }}
                      >
                        <span />
                      </button>
                    </>
                  )}
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
          "Kortplasseringer lagres ikke. Flytting er visuelt; bekreftede koblinger endrer kjøringen når du lagrer. Forgreninger med egne krav redigeres i delflyten.",
          "Card positions are not saved. Moving is visual; confirmed connections change execution when saved. Edit conditional branches inside the subflow.",
        )}
      </small>
    </section>
  );
}
