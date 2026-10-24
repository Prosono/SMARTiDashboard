import { flowLibraryIcon } from "./flowLibraryIcon";
import { flowLibrary } from "./flowLibrary";
import { routeWire, wirePath, smoothWirePath } from "./flowRouting";
import { useEffect, useMemo, useRef, useState } from "react";
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
  Scan,
} from "lucide-react";
import type { Home } from "../types";
import { planConnection, type ConnectionMode } from "./flowConnections";
import { canvasModel } from "./flowCanvasModel";
import { readFlowPath, flowGroups, type FlowPath } from "./flowStructure";
import { flowNarrative as flowSummary } from "./flowNarrative";
import { flowIcon, type FlowKind as FlowKey } from "./flowPresentation";
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
  onAdd: (k: FlowKey, preset?: string) => void;
  onRemove: (p: FlowPath) => void;
  onConnect: (patch: Record<string, any>) => void;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const graphDefinition = useMemo(
    () => canvasModel(config, lang),
    [config, lang],
  );
  // Editing a temperature or name changes card content, not routing geometry.
  const graphKey = JSON.stringify(graphDefinition);
  const graph = useMemo(() => graphDefinition, [graphKey]);
  const paletteDrag = useRef<{
    kind: FlowKey;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    kind: FlowKey;
    x: number;
    y: number;
  } | null>(null);
  const skipPaletteClick = useRef(false);
  function paletteLabel(k: FlowKey) {
    return k === "triggers"
      ? t("Når dette skjer", "When this happens")
      : k === "conditions"
        ? t("Og dette stemmer", "And this is true")
        : t("Så gjør dette", "Then do this");
  }
  const [zoom, setZoom] = useState(1),
    [positions, setPositions] = useState<
      Record<string, { x: number; y: number }>
    >({});
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryKind, setLibraryKind] = useState<FlowKey | "all">("all");
  const libraryItems = useMemo(
    () =>
      (["triggers", "conditions", "actions"] as FlowKey[])
        .filter((k) => libraryKind === "all" || libraryKind === k)
        .flatMap((k) => [
          {
            k,
            preset: undefined as string | undefined,
            label: paletteLabel(k),
            hint: "",
            Icon: flowLibraryIcon(k),
          },
          ...flowLibrary(k, lang).map((item) => ({
            k,
            preset: item.id,
            label: item.title,
            hint: item.hint,
            Icon: flowLibraryIcon(k, item.id),
          })),
        ])
        .filter(
          (item) =>
            !item.preset ||
            `${item.label} ${item.hint}`
              .toLowerCase()
              .includes(librarySearch.toLowerCase()),
        ),
    [lang, librarySearch, libraryKind],
  );
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
  const pending = useMemo(
    () =>
      linkFrom && linkTarget
        ? planConnection(config, linkFrom, linkTarget, connectionMode, lang)
        : null,
    [config, linkFrom, linkTarget, connectionMode, lang],
  );
  const connectableIds = useMemo(
    () =>
      new Set(
        linkFrom
          ? graph.nodes
              .filter(
                (n) =>
                  planConnection(config, linkFrom, n.id, connectionMode, lang)
                    .ok,
              )
              .map((n) => n.id)
          : [],
      ),
    [graph, config, linkFrom, connectionMode, lang],
  );
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
    return row?.alias || flowSummary(row, n.kind as FlowKey, home, lang).title;
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
  const [heights, setHeights] = useState<Record<string, number>>({});
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      setHeights((old) => {
        const next = { ...old };
        let changed = false;
        for (const entry of entries) {
          const el = entry.target as HTMLElement,
            id = el.dataset.nodeId!;
          if (next[id] !== el.offsetHeight) {
            next[id] = el.offsetHeight;
            changed = true;
          }
        }
        return changed ? next : old;
      });
    });
    plane.current
      ?.querySelectorAll<HTMLElement>(".canvas-node")
      .forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [graph]);
  const nodes = useMemo(
    () => graph.nodes.map((n) => ({ ...n, ...positions[n.id] })),
    [graph, positions],
  );
  const boxes = useMemo(
    () =>
      nodes.map((n) => ({ ...n, width: 260, height: heights[n.id] || 150 })),
    [nodes, heights],
  );
  const routes = useMemo(() => {
    const byId = new Map(boxes.map((n) => [n.id, n]));
    const branches = new Map<string, number>();
    const earlier: ReturnType<typeof routeWire>[] = [];
    return graph.edges.map((e) => {
      const branch = branches.get(e.from) || 0;
      branches.set(e.from, branch + 1);
      const source = byId.get(e.from)!,
        target = byId.get(e.to)!;
      const points = routeWire(source, target, boxes, branch);
      const smooth = smoothWirePath(points, boxes, earlier);
      const path = smooth || wirePath(points, earlier);
      const segment = points
        .slice(1)
        .map((p, j) => ({
          a: points[j],
          b: p,
          length: Math.hypot(p.x - points[j].x, p.y - points[j].y),
        }))
        .sort((a, b) => b.length - a.length)[0];
      const midpoint = smooth
        ? {
            x: (points[0].x + points.at(-1)!.x) / 2,
            y: (points[0].y + points.at(-1)!.y) / 2,
          }
        : segment
          ? {
              x: (segment.a.x + segment.b.x) / 2,
              y: (segment.a.y + segment.b.y) / 2,
            }
          : { x: 0, y: 0 };
      earlier.push(points);
      return { edge: e, branch, points, path, midpoint, kind: source.kind };
    });
  }, [graph, boxes]);
  const presentations = useMemo(
    () =>
      new Map(
        graph.nodes.map((n) => {
          const row = n.path ? readFlowPath(config, n.path) : null;
          return [
            n.id,
            {
              row,
              summary:
                n.kind === "gate"
                  ? { title: n.label!, detail: "" }
                  : flowSummary(row, n.kind as FlowKey, home, lang),
              branches: n.path ? flowGroups(row, n.path, lang) : [],
              CardIcon: flowIcon(
                row,
                n.kind === "gate" ? "triggers" : n.kind,
                home,
              ),
            },
          ];
        }),
      ),
    [graph, config, home, lang],
  );
  const width = Math.max(1800, ...nodes.map((n) => n.x + 340)),
    height = Math.max(900, ...nodes.map((n) => n.y + 200));
  function move(id: string, x: number, y: number) {
    const next = {
      x: Math.max(10, Math.round(x / 10) * 10),
      y: Math.max(20, Math.round(y / 10) * 10),
    };
    setPositions((old) =>
      old[id]?.x === next.x && old[id]?.y === next.y
        ? old
        : { ...old, [id]: next },
    );
  }
  const moveFrame = useRef<number | null>(null);
  const pendingMove = useRef<{ id: string; x: number; y: number } | null>(null);
  function flushMove() {
    if (moveFrame.current !== null) cancelAnimationFrame(moveFrame.current);
    moveFrame.current = null;
    const next = pendingMove.current;
    pendingMove.current = null;
    if (next) move(next.id, next.x, next.y);
  }
  function scheduleMove(id: string, x: number, y: number) {
    pendingMove.current = { id, x, y };
    if (moveFrame.current === null)
      moveFrame.current = requestAnimationFrame(flushMove);
  }
  useEffect(
    () => () => {
      if (moveFrame.current !== null) cancelAnimationFrame(moveFrame.current);
    },
    [],
  );
  useEffect(() => {
    const release = () => {
      flushMove();
      drag.current = null;
      pan.current = null;
      paletteDrag.current = null;
      setDragPreview(null);
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
    };
  }, []);
  function fitFlow() {
    const el = viewport.current;
    if (!el) return;
    const right = Math.max(...nodes.map((n) => n.x + 300));
    const bottom = Math.max(...nodes.map((n) => n.y + 240));
    setZoom(
      Math.max(
        0.2,
        Math.min(1, el.clientWidth / right, el.clientHeight / bottom),
      ),
    );
    el.scrollTo({ top: 0, left: 0 });
  }
  return (
    <section
      className={"flow-workspace palette-" + palette}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          paletteDrag.current = null;
          setDragPreview(null);
          skipPaletteClick.current = true;
          cancelConnection();
          e.stopPropagation();
        }
      }}
      aria-label={t("Arbeidsflate for automasjon", "Automation canvas")}
    >
      {dragPreview && (
        <div
          className="canvas-new-card-preview"
          style={{ left: dragPreview.x + 16, top: dragPreview.y + 16 }}
          aria-hidden="true"
        >
          <Plus size={18} />
          {paletteLabel(dragPreview.kind)}
        </div>
      )}
      <p className="canvas-palette-hint">
        {t(
          "Dra et kort til lerretet, eller trykk for å velge.",
          "Drag a card onto the canvas, or click to choose.",
        )}
      </p>
      <div className="canvas-add">
        <strong className="canvas-library-heading">
          {t("Byggesteiner", "Building blocks")}
        </strong>
        <input
          className="canvas-library-search"
          aria-label={t("Søk i byggesteiner", "Search building blocks")}
          placeholder={t(
            "Søk etter lys, bevegelse …",
            "Search lights, motion …",
          )}
          value={librarySearch}
          onChange={(e) => setLibrarySearch(e.target.value)}
        />
        <div
          className="canvas-library-filter"
          role="group"
          aria-label={t("Type byggestein", "Building block type")}
        >
          {(["all", "triggers", "conditions", "actions"] as const).map((k) => (
            <button
              type="button"
              key={k}
              aria-pressed={libraryKind === k}
              onClick={() => setLibraryKind(k)}
            >
              {k === "all"
                ? t("Alle", "All")
                : k === "triggers"
                  ? t("Når", "When")
                  : k === "conditions"
                    ? t("Hvis", "If")
                    : t("Gjør", "Do")}
            </button>
          ))}
        </div>
        <div className="canvas-library-list">
          {libraryItems.map(({ k, preset, label, hint, Icon }) => (
            <button
              type="button"
              key={k + (preset || "")}
              className={`canvas-palette-card library-${k} ${preset ? "is-preset" : "is-category"}`}
              draggable={false}
              aria-label={
                preset
                  ? label
                  : k === "triggers"
                    ? t("Legg til hendelse", "Add event")
                    : k === "conditions"
                      ? t("Legg til krav", "Add requirement")
                      : t("Legg til handling", "Add action")
              }
              title={
                hint ||
                t(
                  "Dra til lerretet, eller trykk for å velge kort",
                  "Drag onto the canvas, or click to choose a card",
                )
              }
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                skipPaletteClick.current = false;
                paletteDrag.current = {
                  kind: k,
                  x: e.clientX,
                  y: e.clientY,
                  moved: false,
                };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const d = paletteDrag.current;
                if (!d) return;
                if (!(e.buttons & 1)) {
                  paletteDrag.current = null;
                  setDragPreview(null);
                  return;
                }
                if (
                  !d.moved &&
                  Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8
                )
                  return;
                d.moved = true;
                skipPaletteClick.current = true;
                setDragPreview({ kind: k, x: e.clientX, y: e.clientY });
              }}
              onPointerUp={(e) => {
                const d = paletteDrag.current;
                paletteDrag.current = null;
                setDragPreview(null);
                if (!d?.moved) return;
                const bounds = viewport.current?.getBoundingClientRect(),
                  canvas = plane.current?.getBoundingClientRect();
                if (
                  bounds &&
                  canvas &&
                  e.clientX >= bounds.left &&
                  e.clientX <= bounds.right &&
                  e.clientY >= bounds.top &&
                  e.clientY <= bounds.bottom
                ) {
                  move(
                    JSON.stringify([k, (config[k] || []).length]),
                    (e.clientX - canvas.left) / zoom,
                    (e.clientY - canvas.top) / zoom,
                  );
                  onAdd(k, preset);
                }
              }}
              onPointerCancel={() => {
                paletteDrag.current = null;
                setDragPreview(null);
                skipPaletteClick.current = true;
              }}
              onLostPointerCapture={() => {
                paletteDrag.current = null;
                setDragPreview(null);
              }}
              onClick={() => {
                if (skipPaletteClick.current) {
                  skipPaletteClick.current = false;
                  return;
                }
                onAdd(k, preset);
              }}
            >
              <Icon size={20} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
          {!libraryItems.some((item) => item.preset) && (
            <p className="muted">
              {t(
                "Ingen forslag passer søket.",
                "No suggestions match your search.",
              )}
            </p>
          )}
        </div>
      </div>

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
          <button type="button" onClick={fitFlow}>
            <Scan size={17} />
            {t("Vis hele flyten", "Fit flow")}
          </button>
          <label className="canvas-palette">
            <Palette size={17} />
            <select
              aria-label={t("Farger", "Colors")}
              value={palette}
              onChange={(e) => setPalette(e.target.value)}
            >
              <option value="vivid">{t("RGB-farger", "RGB colors")}</option>
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
            disabled={zoom <= 0.2}
            onClick={() =>
              setZoom((v) => Math.max(0.2, Math.round((v - 0.1) * 10) / 10))
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
              setZoom(1);
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
        className={
          "canvas-connection-status" +
          (!linkFrom && !connectionMessage ? " is-idle" : "")
        }
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
        className={
          "canvas-viewport" +
          (showGrid ? "" : " no-grid") +
          (dragPreview ? " is-drop-target" : "")
        }
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
                {routes.map(
                  ({ edge: e, branch, points, path, midpoint, kind }) => {
                    if (!points.length) return null;
                    return (
                      <g
                        key={`${e.from}-${e.to}`}
                        className={`canvas-route branch-${branch % 4} from-${kind}`}
                      >
                        <path
                          d={path}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          markerEnd="url(#flow-tip)"
                        />
                        <text x={midpoint.x + 8} y={midpoint.y - 10}>
                          {e.label}
                        </text>
                      </g>
                    );
                  },
                )}
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
              const { row, summary, branches, CardIcon } = presentations.get(
                n.id,
              )!;
              return (
                <article
                  className={
                    "canvas-node canvas-" +
                    n.kind +
                    (n.id === linkFrom ? " is-connecting" : "") +
                    (connectableIds.has(n.id) ? " is-connectable" : "")
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
                    const target =
                      (e.target as HTMLElement).closest("button") ||
                      e.currentTarget;
                    target.setPointerCapture(e.pointerId);
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
                    if (!(e.buttons & 1)) {
                      flushMove();
                      drag.current = null;
                      return;
                    }
                    if (
                      Math.hypot(e.clientX - d.startX, e.clientY - d.startY) <
                        5 &&
                      !suppressClick.current
                    )
                      return;
                    suppressClick.current = true;
                    scheduleMove(
                      n.id,
                      d.x + (e.clientX - d.startX) / zoom,
                      d.y + (e.clientY - d.startY) / zoom,
                    );
                  }}
                  onPointerUp={() => {
                    flushMove();
                    drag.current = null;
                  }}
                  onPointerCancel={() => {
                    drag.current = null;
                    suppressClick.current = false;
                  }}
                  onLostPointerCapture={() => {
                    flushMove();
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
                    <span className="canvas-card-icon">
                      <CardIcon size={22} />
                    </span>
                    <strong>{summary.title}</strong>
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
      {routes.some((r) => !r.points.length) && (
        <p role="status" className="canvas-help">
          {t(
            "Flytt kortene litt fra hverandre for å vise alle forbindelsene.",
            "Move overlapping cards apart to show all connections.",
          )}
        </p>
      )}
      <small className="canvas-help">
        {t(
          "Kortplasseringer lagres ikke. Flytting er visuelt; bekreftede koblinger endrer kjøringen når du lagrer. Forgreninger med egne krav redigeres i delflyten.",
          "Card positions are not saved. Moving is visual; confirmed connections change execution when saved. Edit conditional branches inside the subflow.",
        )}
      </small>
    </section>
  );
}
