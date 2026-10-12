import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent,
} from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  Grip,
  Monitor,
  Tablet,
  Smartphone,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Trash2,
  LayoutGrid,
  LockKeyhole,
  Users,
} from "lucide-react";
import { api } from "../api";
import type { Control, Home } from "../types";
import {
  addTile,
  moveTile,
  columns,
  type Board,
  type Tile,
  type Breakpoint,
} from "./grid";
import { Feedback, LoadError, useWork, words } from "./shared";
export function Dashboards({
  lang,
  admin,
  home,
  renderControl,
  onDirty,
}: {
  lang: string;
  admin: boolean;
  home: Home;
  renderControl: (c: Control) => ReactNode;
  onDirty: (v: boolean) => void;
}) {
  const t = (nb: string, en: string) => words(lang, nb, en);
  const q = useQuery({
    queryKey: ["manage", "dashboards"],
    queryFn: () => api<Board[]>("dashboards"),
  });
  const [selected, select] = useState<string | null>(null);
  const [draft, setDraft] = useState<Board | null>(null);
  const [bp, setBp] = useState<Breakpoint>("desktop");
  const [width, setWidth] = useState(() => window.innerWidth);
  const [focused, focus] = useState<string | null>(null);
  const [control, setControl] = useState("");
  const [kind, setKind] = useState<Tile["kind"]>("control");
  const [confirm, setConfirm] = useState<"delete" | "discard" | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragDelta, setDragDelta] = useState({ x: 0, y: 0 });
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: string;
    px: number;
    py: number;
    x: number;
    y: number;
    columnWidth: number;
  } | null>(null);
  const w = useWork(lang);
  const saved =
    q.data?.find((b) => b.id === selected) || (!selected ? q.data?.[0] : null);
  const board = draft || saved;
  const editing = !!draft;
  useEffect(() => {
    onDirty(editing);
    return () => onDirty(false);
  }, [editing, onDirty]);
  const currentBp = editing
    ? bp
    : width < 600
      ? "phone"
      : width < 950
        ? "tablet"
        : "desktop";
  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, [board?.id]);
  useEffect(() => {
    if (!draft) return;
    const before = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [draft]);
  function edit(b: Board) {
    setDraft(structuredClone(b));
    setBp(width < 600 ? "phone" : width < 950 ? "tablet" : "desktop");
    focus(null);
  }
  function update(value: Partial<Board>) {
    setDraft((d) => (d ? { ...d, ...value } : d));
  }
  function updateTile(id: string, value: Partial<Tile>) {
    setDraft((d) =>
      d
        ? {
            ...d,
            tiles: d.tiles.map((t) => (t.id === id ? { ...t, ...value } : t)),
          }
        : d,
    );
  }
  function move(id: string, change: Parameters<typeof moveTile>[3]) {
    setDraft((d) =>
      d ? { ...d, tiles: moveTile(d.tiles, id, currentBp, change) } : d,
    );
  }
  function start(e: PointerEvent<HTMLButtonElement>, tile: Tile) {
    if (e.button !== 0 || !stage.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const c = tile.layouts[currentBp];
    drag.current = {
      id: tile.id,
      px: e.clientX,
      py: e.clientY,
      x: c.x,
      y: c.y,
      columnWidth: (stage.current.clientWidth + 16) / columns[currentBp],
    };
    setDragging(tile.id);
    setDragDelta({ x: 0, y: 0 });
    focus(tile.id);
  }
  function finish(e: PointerEvent<HTMLButtonElement>, cancel = false) {
    const d = drag.current;
    if (!d) return;
    if (!cancel)
      move(d.id, {
        x: d.x + Math.round((e.clientX - d.px) / d.columnWidth),
        y: d.y + Math.round((e.clientY - d.py) / 112),
      });
    drag.current = null;
    setDragging(null);
    setDragDelta({ x: 0, y: 0 });
  }
  async function save() {
    if (!draft) return;
    await w.run(
      async () => {
        const { name, scope, revision, tiles } = draft;
        const result = await api<Board>(
          draft.id ? `dashboards/${draft.id}` : "dashboards",
          draft.id ? "PUT" : "POST",
          { name, scope, revision, tiles },
        );
        select(result.id);
      },
      () => setDraft(null),
    );
  }
  const active = draft?.tiles.find((tile) => tile.id === focused);
  return (
    <section className="dashboard-builder">
      <div className="page-heading">
        <span className="eyebrow">{t("På din måte", "Make it yours")}</span>
        <div className="heading-row">
          <h1>{t("Mine dashbord", "My dashboards")}</h1>
          {!editing && (
            <button
              className="primary compact"
              onClick={() => {
                setDraft({
                  id: "",
                  name: t("Mitt dashbord", "My dashboard"),
                  scope: "private",
                  revision: 0,
                  tiles: [],
                  editable: true,
                });
                focus(null);
                setBp(width < 600 ? "phone" : "desktop");
              }}
            >
              <Plus size={18} />
              {t("Nytt dashbord", "New dashboard")}
            </button>
          )}
        </div>
        <p>
          {t(
            "Samle det du bruker mest. Ett oppsett for hver skjermstørrelse.",
            "Keep your everyday controls together. A layout for every screen size.",
          )}
        </p>
      </div>
      <Feedback message={w.message} />
      {q.isError && <LoadError lang={lang} retry={() => void q.refetch()} />}
      {q.isPending && <p>{t("Henter dashbord …", "Loading dashboards …")}</p>}
      {!editing && !!q.data?.length && (
        <div className="dashboard-switcher">
          {q.data.map((b) => (
            <button
              className={board?.id === b.id ? "selected" : ""}
              key={b.id}
              onClick={() => select(b.id)}
            >
              {b.scope === "private" ? (
                <LockKeyhole size={16} />
              ) : (
                <Users size={16} />
              )}
              <span>{b.name}</span>
            </button>
          ))}
        </div>
      )}
      {board && (
        <>
          {editing ? (
            <div className="builder-settings">
              <div className="form-grid">
                <label>
                  {t("Dashbordnavn", "Dashboard name")}
                  <input
                    maxLength={80}
                    required
                    value={draft.name}
                    onChange={(e) => update({ name: e.target.value })}
                  />
                </label>
                <label>
                  {t("Synlighet", "Visibility")}
                  <select
                    value={draft.scope}
                    onChange={(e) =>
                      update({ scope: e.target.value as Board["scope"] })
                    }
                  >
                    <option value="private">{t("Bare meg", "Only me")}</option>
                    {admin && (
                      <option value="shared">
                        {t("Hele hjemmet", "Whole home")}
                      </option>
                    )}
                  </select>
                </label>
              </div>
              <div className="builder-toolbar">
                <div
                  className="viewport-tabs"
                  aria-label={t("Rediger skjermstørrelse", "Edit screen size")}
                >
                  {(
                    [
                      ["phone", Smartphone, t("Telefon", "Phone")],
                      ["tablet", Tablet, t("Nettbrett", "Tablet")],
                      ["desktop", Monitor, t("Stor skjerm", "Desktop")],
                    ] as const
                  ).map(([value, Icon, label]) => (
                    <button
                      key={value}
                      className={bp === value ? "selected" : ""}
                      aria-pressed={bp === value}
                      onClick={() => setBp(value)}
                    >
                      <Icon size={18} />
                      {label}
                    </button>
                  ))}
                </div>
                <div className="row-actions">
                  <button
                    disabled={w.busy}
                    onClick={() => setConfirm("discard")}
                  >
                    {t("Avbryt", "Cancel")}
                  </button>
                  <button
                    className="primary compact"
                    disabled={w.busy || !draft.name.trim()}
                    onClick={() => void save()}
                  >
                    {w.busy
                      ? t("Lagrer …", "Saving …")
                      : t("Lagre dashbord", "Save dashboard")}
                  </button>
                </div>
              </div>
              <p className="muted">
                {t(
                  "Dra i håndtaket for å flytte. Velg en rute for størrelse og tastaturstyring. Hver skjermstørrelse lagres separat.",
                  "Drag the handle to move. Select a tile for sizing and keyboard controls. Each screen size is saved separately.",
                )}
              </p>
              <div className="tile-palette">
                <label>
                  {t("Rutetype", "Tile type")}
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value as Tile["kind"])}
                  >
                    <option value="control">
                      {t("Enhet eller sensor", "Device or sensor")}
                    </option>
                    <option value="heading">
                      {t("Overskrift", "Heading")}
                    </option>
                    <option value="text">{t("Tekst", "Text")}</option>
                  </select>
                </label>
                {kind === "control" && (
                  <label>
                    {t("Velg kontroll", "Choose control")}
                    <select
                      value={control}
                      onChange={(e) => setControl(e.target.value)}
                    >
                      <option value="">{t("Velg …", "Choose …")}</option>
                      {home.controls.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} · {c.entity_id}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button
                  disabled={
                    board.tiles.length >= 60 || (kind === "control" && !control)
                  }
                  onClick={() => {
                    const tile = addTile(
                      board.tiles,
                      kind,
                      kind === "control" ? control : null,
                    );
                    update({ tiles: [...board.tiles, tile] });
                    focus(tile.id);
                  }}
                >
                  <Plus size={18} />
                  {t("Legg til rute", "Add tile")}
                </button>
              </div>
            </div>
          ) : (
            <div className="section-heading">
              <div>
                <h2>{board.name}</h2>
                <p className="muted">
                  {board.scope === "private"
                    ? t("Bare synlig for deg", "Only visible to you")
                    : t("Delt med hele hjemmet", "Shared with the home")}
                </p>
              </div>
              {board.editable && (
                <button className="text-button" onClick={() => edit(board)}>
                  {t("Rediger dashbord", "Edit dashboard")}
                </button>
              )}
            </div>
          )}
          {active && (
            <div className="tile-inspector">
              <div className="form-grid">
                <label>
                  {t("Tittel", "Title")}
                  <input
                    maxLength={100}
                    value={active.title}
                    onChange={(e) =>
                      updateTile(active.id, { title: e.target.value })
                    }
                  />
                </label>
                <label>
                  {t("Bredde", "Width")}
                  <select
                    value={active.layouts[currentBp].w}
                    onChange={(e) =>
                      move(active.id, { w: Number(e.target.value) })
                    }
                  >
                    {Array.from(
                      { length: columns[currentBp] },
                      (_, i) => i + 1,
                    ).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("Høyde", "Height")}
                  <select
                    value={active.layouts[currentBp].h}
                    onChange={(e) =>
                      move(active.id, { h: Number(e.target.value) })
                    }
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {active.kind === "text" && (
                <label className="wide-label">
                  {t("Tekst", "Text")}
                  <textarea
                    maxLength={2000}
                    value={active.text}
                    onChange={(e) =>
                      updateTile(active.id, { text: e.target.value })
                    }
                  />
                </label>
              )}
              <div className="row-actions">
                {(
                  [
                    [ArrowLeft, -1, 0, t("Flytt venstre", "Move left")],
                    [ArrowRight, 1, 0, t("Flytt høyre", "Move right")],
                    [ArrowUp, 0, -1, t("Flytt opp", "Move up")],
                    [ArrowDown, 0, 1, t("Flytt ned", "Move down")],
                  ] as const
                ).map(([Icon, x, y, label]) => (
                  <button
                    key={label}
                    aria-label={label}
                    onClick={() =>
                      move(active.id, {
                        x: active.layouts[currentBp].x + x,
                        y: active.layouts[currentBp].y + y,
                      })
                    }
                  >
                    <Icon size={18} />
                  </button>
                ))}
                <button
                  onClick={() => {
                    update({
                      tiles: board.tiles.filter((t) => t.id !== active.id),
                    });
                    focus(null);
                  }}
                >
                  <Trash2 size={16} />
                  {t("Fjern rute", "Remove tile")}
                </button>
              </div>
            </div>
          )}
          <div
            className={`dashboard-stage ${editing ? "is-editing" : ""} preview-${editing ? bp : "auto"}`}
            ref={stage}
            style={{
              gridTemplateColumns: `repeat(${columns[currentBp]}, minmax(0,1fr))`,
            }}
          >
            {board.tiles.map((tile) => {
              const c = tile.layouts[currentBp];
              const entity = home.controls.find(
                (v) =>
                  v.id === tile.control_id || v.entity_id === tile.control_id,
              );
              return (
                <article
                  key={tile.id}
                  className={`dashboard-tile tile-${tile.kind} ${focused === tile.id && editing ? "is-focused" : ""} ${dragging === tile.id ? "is-dragging" : ""}`}
                  style={{
                    gridColumn: `${c.x + 1} / span ${c.w}`,
                    gridRow: `${c.y + 1} / span ${c.h}`,
                    transform:
                      dragging === tile.id
                        ? `translate(${dragDelta.x}px,${dragDelta.y}px)`
                        : undefined,
                  }}
                >
                  {editing && (
                    <div className="tile-edit-bar">
                      <button
                        className="drag-handle"
                        aria-label={t("Dra rute", "Drag tile")}
                        onPointerDown={(e) => start(e, tile)}
                        onPointerMove={(e) => {
                          if (drag.current?.id === tile.id)
                            setDragDelta({
                              x: e.clientX - drag.current.px,
                              y: e.clientY - drag.current.py,
                            });
                        }}
                        onPointerUp={(e) => finish(e)}
                        onPointerCancel={(e) => finish(e, true)}
                        onKeyDown={(e) => {
                          const offsets: Record<string, [number, number]> = {
                            ArrowLeft: [-1, 0],
                            ArrowRight: [1, 0],
                            ArrowUp: [0, -1],
                            ArrowDown: [0, 1],
                          };
                          if (offsets[e.key]) {
                            e.preventDefault();
                            focus(tile.id);
                            move(tile.id, {
                              x: c.x + offsets[e.key][0],
                              y: c.y + offsets[e.key][1],
                            });
                          }
                        }}
                      >
                        <Grip size={18} />
                      </button>
                      <button onClick={() => focus(tile.id)}>
                        {t("Tilpass", "Customize")}
                      </button>
                    </div>
                  )}
                  <div className="tile-content">
                    {tile.title && <h3>{tile.title}</h3>}
                    {tile.kind === "control" ? (
                      entity ? (
                        editing ? (
                          <div className="control-preview">
                            <strong>{entity.name}</strong>
                            <span>{entity.state}</span>
                            <small>
                              {t(
                                "Kontrollene aktiveres når du er ferdig med redigering.",
                                "Controls are active after editing.",
                              )}
                            </small>
                          </div>
                        ) : (
                          renderControl(entity)
                        )
                      ) : (
                        <p className="muted">
                          {t(
                            "Kontrollen er ikke tilgjengelig. Ruten beholdes.",
                            "This control is unavailable. The tile is preserved.",
                          )}
                        </p>
                      )
                    ) : tile.kind === "text" ? (
                      <p className="preserve-text">
                        {tile.text ||
                          (editing
                            ? t(
                                "Skriv teksten under «Tilpass».",
                                "Add text under ‘Customize’.",
                              )
                            : "")}
                      </p>
                    ) : !tile.title ? (
                      <h3>{t("Ny overskrift", "New heading")}</h3>
                    ) : null}
                  </div>
                </article>
              );
            })}
            {!board.tiles.length && (
              <div className="dashboard-empty">
                <LayoutGrid size={34} />
                <h2>
                  {t("Begynn med det viktigste.", "Start with what matters.")}
                </h2>
                <p>
                  {t(
                    "Legg til et lys, en sensor eller en overskrift.",
                    "Add a light, a sensor or a heading.",
                  )}
                </p>
              </div>
            )}
          </div>
          {editing && draft.id && (
            <div className="danger-zone">
              <button
                className="text-button"
                onClick={() => setConfirm("delete")}
              >
                <Trash2 size={16} />
                {t("Slett dashbord", "Delete dashboard")}
              </button>
            </div>
          )}
        </>
      )}
      {!board && !q.isPending && !q.isError && (
        <div className="dashboard-empty">
          <LayoutGrid size={36} />
          <h2>
            {t("Din egen oversikt over hjemmet.", "Your own view of home.")}
          </h2>
          <p>
            {t(
              "Lag et privat dashbord eller del ett med alle hjemme.",
              "Create a private dashboard or share one with the home.",
            )}
          </p>
        </div>
      )}
      {confirm && (
        <div className="inline-confirm" role="alert">
          <p>
            {confirm === "discard"
              ? t("Forkaste ulagrede endringer?", "Discard unsaved changes?")
              : t(
                  "Slette dashbordet? Enheter og rom påvirkes ikke.",
                  "Delete the dashboard? Devices and rooms are unaffected.",
                )}
          </p>
          <button
            disabled={w.busy}
            onClick={() => {
              if (confirm === "discard") {
                setDraft(null);
                setConfirm(null);
              } else if (draft)
                void w.run(
                  () =>
                    api(
                      `dashboards/${draft.id}?revision=${draft.revision}`,
                      "DELETE",
                    ),
                  () => {
                    setDraft(null);
                    select(null);
                    setConfirm(null);
                  },
                );
            }}
          >
            {t("Bekreft", "Confirm")}
          </button>
          <button onClick={() => setConfirm(null)}>
            {t("Avbryt", "Cancel")}
          </button>
        </div>
      )}
    </section>
  );
}
