import {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Grip,
  House,
  LoaderCircle,
  Maximize2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../api";
import type { Home } from "../types";
import { CardBuilder, type CardSelection } from "./CardBuilder";
import { ConfiguredHomeCard } from "./ConfiguredHomeCard";
import { customCardId } from "./cardConfigModel";
import { ambientSize, ambientTitle, isAmbientType } from "./ambientModel";
import {
  addGridCard,
  changeGrid,
  defaultGrid,
  responsiveGrid,
  removeGridCard,
  reorderGrid,
  type GridItem,
  type HomeGridPage,
  type SavedGrid,
} from "./homeGridModel";
import {
  addRoomCard,
  createRoomResolver,
  changeRoomGrid,
  normalizeRoomGrid,
  removeRoomCard,
  reorderRoomGrid,
  roomGridView,
  supportsRoomGrouping,
} from "./roomGridModel";
import "./homeGrid.css";
import { HomeGridGuard } from "./HomeGridGuard";
import { HomeGridContent } from "./HomeGridContent";
import { useGridMotion } from "./useGridMotion";
import { useGridWiggle } from "./useGridWiggle";

export type HomeGridCard = {
  id: string;
  title: string;
  content: ReactNode;
  w?: number;
  h?: number;
  hidden?: boolean;
  defaultHidden?: boolean;
  entityId?: string;
};

export function HomeGrid({
  page,
  cards: availableCards,
  lang,
  title,
  home,
  offline,
}: {
  page: HomeGridPage;
  cards: HomeGridCard[];
  lang: string;
  title?: string;
  home: Home;
  offline: boolean;
}) {
  const en = lang === "en",
    t = (nb: string, english: string) => (en ? english : nb);
  const queryKey = ["home-grid", page];
  const cards = useMemo(() => availableCards.slice(0, 300), [availableCards]);
  const qc = useQueryClient();
  const guard = useContext(HomeGridGuard);
  const saved = useQuery({
    queryKey,
    queryFn: () => api<SavedGrid>(`home/layout/${page}`),
    staleTime: 60000,
    retry: false,
  });
  const [draft, setDraft] = useState<GridItem[] | null>(null);
  const [draftGrouped, setDraftGrouped] = useState(true);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [adding, setAdding] = useState(false),
    [active, setActive] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<string | null>(null);
  const [columns, setColumns] = useState(3);
  const surface = useRef<HTMLDivElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const scrollFrame = useRef<number | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const gesture = useRef<{
    id: string;
    resize: boolean;
    startX: number;
    startY: number;
    startScroll: number;
    item: GridItem;
    items: GridItem[];
    columnWidth: number;
    rowHeight: number;
    columns: number;
    shown: GridItem[];
  } | null>(null);
  const defaults = useMemo(
    () => defaultGrid(cards.filter((card) => !card.defaultHidden)),
    [cards],
  );
  const resolveRoom = useMemo(
    () => createRoomResolver(home),
    [home.controls, home.areas],
  );
  const canGroup = supportsRoomGrouping(page);
  const grouped =
    canGroup &&
    (draft !== null ? draftGrouped : (saved.data?.group_by_room ?? true));
  const rawLayout = draft ?? saved.data?.items ?? defaults;
  const catalog = new Map(cards.map((card) => [card.id, card]));
  for (const item of rawLayout) {
    if (!catalog.has(item.id) && item.config)
      catalog.set(item.id, {
        id: item.id,
        title:
          item.config.title ||
          ambientTitle(item.config, lang) ||
          home.controls.find((c) => c.entity_id === item.config?.sources[0])
            ?.name ||
          t("Personlig kort", "Personal card"),
        content: null,
        entityId: item.config.sources[0],
      });
  }
  const roomOf = (item: GridItem) =>
    isAmbientType(item.config?.type || "")
      ? "shared"
      : resolveRoom(
          item.config?.sources.length
            ? item.config.sources
            : catalog.get(item.id)?.entityId
              ? [catalog.get(item.id)!.entityId!]
              : [],
        );
  const layout = grouped
    ? normalizeRoomGrid(
        rawLayout,
        roomOf,
        draft === null && saved.data?.group_by_room === undefined,
      )
    : rawLayout;
  const editing = draft !== null;
  const visibleLayout = layout.filter(
    (item) =>
      catalog.has(item.id) && (editing || !catalog.get(item.id)!.hidden),
  );
  const roomView = grouped
    ? roomGridView(
        visibleLayout,
        roomOf,
        columns,
        !editing && cards.some((card) => card.hidden),
      )
    : null;
  const shown =
    roomView?.items ??
    (!editing && cards.some((card) => card.hidden)
      ? defaultGrid(
          [...visibleLayout].sort((a, b) => a.y - b.y || a.x - b.x),
          columns,
        )
      : responsiveGrid(visibleLayout, columns));
  const layoutKey =
    `${roomView?.template ?? "flat"}|` +
    shown.map(({ id, x, y, w, h }) => `${id}:${x},${y},${w},${h}`).join("|");
  useGridMotion(surface, layoutKey, editing, active);
  useGridWiggle(surface, editing);

  useEffect(() => {
    if (wasEditing.current && !editing) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);
  useEffect(
    () => () => {
      if (scrollFrame.current !== null)
        cancelAnimationFrame(scrollFrame.current);
      gesture.current = null;
    },
    [],
  );

  useEffect(() => {
    const node = surface.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) =>
      setColumns(
        entry.contentRect.width >= 960
          ? 3
          : entry.contentRect.width >= 520
            ? 2
            : 1,
      ),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!editing) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    const leave = () =>
      !busy &&
      window.confirm(
        t(
          "Du har et ulagret oppsett. Forkaste endringene og gå videre?",
          "You have an unsaved layout. Discard changes and continue?",
        ),
      );
    if (guard) guard.current = leave;
    const navigation = (event: MouseEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest(
          'nav[aria-label="Hovedmeny"] button, nav[aria-label="Main navigation"] button, [data-home-grid-leave]',
        ) &&
        !leave()
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", navigation, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", navigation, true);
      if (guard?.current === leave) guard.current = null;
    };
  }, [editing, busy, guard, lang]);

  function begin() {
    setDraftGrouped(grouped);
    setDraft(
      layout
        .filter((item) => catalog.has(item.id))
        .map((item) => ({ ...item })),
    );
    setRevision(saved.data?.revision || 0);
    setMessage("");
  }
  function cancel() {
    gesture.current = null;
    setActive(null);
    setDraft(null);
    setAdding(false);
    setEditingCard(null);
    setMessage("");
    editButton.current?.focus();
  }
  async function save() {
    if (!draft || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await api<SavedGrid>(`home/layout/${page}`, "PUT", {
        revision,
        items: draft,
        ...(canGroup ? { group_by_room: draftGrouped } : {}),
      });
      qc.setQueryData(queryKey, result);
      setDraft(null);
      setAdding(false);
      setMessage(t("Oppsettet er lagret.", "Layout saved."));
      editButton.current?.focus();
    } catch (error) {
      const conflict = String(error).includes("409");
      setMessage(
        conflict
          ? t(
              "Oppsettet er endret i et annet vindu. Avbryt og last inn siden på nytt før du redigerer videre.",
              "The layout changed in another window. Cancel and reload before editing again.",
            )
          : t(
              "Kunne ikke lagre. Endringene dine er fortsatt her. Prøv igjen.",
              "Could not save. Your changes are still here. Try again.",
            ),
      );
    } finally {
      setBusy(false);
    }
  }
  function update(item: GridItem) {
    setDraft((current) => current && changePlacement(current, item));
  }
  function changePlacement(items: GridItem[], item: GridItem) {
    return grouped
      ? changeRoomGrid(items, item, roomOf)
      : changeGrid(items, item);
  }
  function reorderPlacement(items: GridItem[], id: string, targetId: string) {
    return grouped
      ? reorderRoomGrid(items, id, targetId, roomOf)
      : reorderGrid(items, id, targetId);
  }
  function toggleGrouping(enabled: boolean) {
    setDraftGrouped(enabled);
    setDraft(
      (current) =>
        current &&
        (enabled
          ? normalizeRoomGrid(current, roomOf, true)
          : defaultGrid([...current].sort((a, b) => a.y - b.y || a.x - b.x))),
    );
  }
  function applyCard(selection: CardSelection) {
    setDraft((current) => {
      if (!current) return current;
      if (editingCard) {
        const item = current.find((item) => item.id === editingCard);
        if (!item) return current;
        const expand =
          ["graph", "horizon"].includes(selection.config.type) &&
          item.config?.type !== selection.config.type;
        return changePlacement(current, {
          ...item,
          config: selection.config,
          ...(expand
            ? {
                w: Math.max(2, item.w),
                h: Math.max(3, item.h),
                x: Math.min(item.x, 1),
              }
            : {}),
        });
      }
      if (current.length >= 300) return current;
      const id =
        selection.base &&
        !current.some((item) => item.id === selection.base!.id)
          ? selection.base.id
          : customCardId();
      const card = {
        id,
        config: selection.config,
        w: isAmbientType(selection.config.type)
          ? ambientSize(selection.config).w
          : selection.config.type === "graph"
            ? 2
            : selection.base?.w,
        h: isAmbientType(selection.config.type)
          ? ambientSize(selection.config).h
          : selection.config.type === "graph"
            ? 3
            : selection.base?.h,
      };
      return grouped
        ? addRoomCard(current, card, roomOf)
        : addGridCard(current, card);
    });
    setAdding(false);
    setEditingCard(null);
  }
  function start(
    event: PointerEvent<HTMLButtonElement>,
    id: string,
    resize: boolean,
  ) {
    if (!draft || busy || event.button !== 0 || !surface.current) return;
    const item = draft.find((item) => item.id === id)!;
    const box = surface.current.getBoundingClientRect();
    const styles = getComputedStyle(surface.current);
    const gap = parseFloat(styles.columnGap) || 16;
    gesture.current = {
      id,
      resize,
      startX: event.clientX,
      startY: event.clientY,
      startScroll: window.scrollY,
      item,
      items: draft,
      columnWidth: (box.width + gap) / columns,
      rowHeight: parseFloat(styles.gridAutoRows) + gap,
      columns,
      shown,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    pointer.current = { x: event.clientX, y: event.clientY };
    scrollFrame.current = requestAnimationFrame(scrollWhileDragging);
    setActive(id);
  }
  function scrollWhileDragging() {
    if (!gesture.current) return;
    const previous = window.scrollY;
    if (pointer.current.y > window.innerHeight - 70)
      window.scrollBy({ top: 12, behavior: "instant" });
    else if (pointer.current.y < 80)
      window.scrollBy({ top: -12, behavior: "instant" });
    if (window.scrollY !== previous)
      applyGesture(pointer.current.x, pointer.current.y);
    scrollFrame.current = requestAnimationFrame(scrollWhileDragging);
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    pointer.current = { x: event.clientX, y: event.clientY };
    applyGesture(event.clientX, event.clientY);
  }
  function applyGesture(clientX: number, clientY: number) {
    const g = gesture.current;
    if (!g) return;
    const dx = Math.round((clientX - g.startX) / g.columnWidth);
    const dy = Math.round(
      (clientY + window.scrollY - g.startY - g.startScroll) / g.rowHeight,
    );
    if (!g.resize && g.columns < 3) {
      const start = g.shown.find((item) => item.id === g.id)!;
      const x = Math.max(0, Math.min(g.columns - 1, start.x + dx)),
        y = Math.max(0, start.y + dy);
      const target = g.shown
        .filter((item) => !grouped || roomOf(item) === roomOf(g.item))
        .sort(
          (a, b) =>
            Math.abs(a.x - x) +
            Math.abs(a.y - y) -
            Math.abs(b.x - x) -
            Math.abs(b.y - y),
        )[0];
      setDraft(reorderPlacement(g.items, g.id, target.id));
      return;
    }
    const width = Math.max(1, Math.min(3, g.item.w + dx));
    const item = g.resize
      ? {
          ...g.item,
          x: Math.min(g.item.x, 3 - width),
          w: width,
          h: Math.max(1, Math.min(4, g.item.h + dy)),
        }
      : {
          ...g.item,
          x: Math.max(0, Math.min(3 - g.item.w, g.item.x + dx)),
          y: Math.max(0, g.item.y + dy),
        };
    setDraft(changePlacement(g.items, item));
  }
  function end(event: PointerEvent<HTMLButtonElement>, cancelled = false) {
    if (cancelled && gesture.current) setDraft(gesture.current.items);
    gesture.current = null;
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = null;
    setActive(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return (
    <section
      className="home-canvas"
      data-page={page}
      data-editing={editing}
      data-grouped={grouped}
      data-dragging={!!active}
      data-card-dialog={adding || !!editingCard}
      aria-label={title || t("Kort i hjemmet", "Home cards")}
    >
      <div className="home-canvas-toolbar">
        <div>
          <strong>{title || t("Ditt oppsett", "Your layout")}</strong>
          <span>
            {editing
              ? grouped
                ? t(
                    "Flytt og endre størrelse innenfor hvert rom.",
                    "Move and resize cards within each room.",
                  )
                : t(
                    "Dra i håndtaket. Endre størrelse fra hjørnet.",
                    "Drag the handle. Resize from the corner.",
                  )
              : t(
                  "Tilpass kortene slik du vil ha dem.",
                  "Arrange your cards your way.",
                )}
          </span>
        </div>
        <div className="home-canvas-actions">
          {editing ? (
            <>
              {canGroup && (
                <label className="home-canvas-group-toggle">
                  <input
                    type="checkbox"
                    checked={grouped}
                    disabled={busy || !!active}
                    onChange={(event) => toggleGrouping(event.target.checked)}
                  />
                  <House size={16} />
                  {t("Grupper etter rom", "Group by room")}
                </label>
              )}
              <button
                onClick={() => setAdding(!adding)}
                disabled={busy || draft.length >= 300}
                aria-expanded={adding}
                aria-haspopup="dialog"
              >
                <Plus size={17} />
                {t("Legg til kort", "Add card")}
              </button>
              <button
                onClick={() => {
                  setDraftGrouped(canGroup);
                  setDraft(
                    canGroup
                      ? normalizeRoomGrid(defaults, roomOf, true)
                      : defaults,
                  );
                  setMessage(
                    t(
                      "Startoppsettet er hentet. Lagre for å beholde det.",
                      "Default layout restored. Save to keep it.",
                    ),
                  );
                }}
                disabled={busy}
              >
                <RotateCcw size={16} />
                {t("Startoppsett", "Default layout")}
              </button>
              <button
                disabled={busy || !!active || !draft.length}
                onClick={() => {
                  setDraft([]);
                  setAdding(false);
                  setEditingCard(null);
                  setMessage(
                    t(
                      "Oppsettet er tømt. Legg til kort og lagre, eller velg Avbryt for å hente alt tilbake.",
                      "Layout cleared. Add cards and save, or cancel to restore everything.",
                    ),
                  );
                }}
              >
                <Trash2 size={16} />
                {t("Tøm oppsett", "Clear layout")}
              </button>
              <button onClick={cancel} disabled={busy}>
                <X size={17} />
                {t("Avbryt", "Cancel")}
              </button>
              <button
                className="primary"
                onClick={() => void save()}
                disabled={busy}
              >
                {busy ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <Check size={17} />
                )}
                {t("Lagre", "Save")}
              </button>
            </>
          ) : (
            <button
              ref={editButton}
              onClick={begin}
              disabled={!saved.data || saved.isError}
            >
              <Pencil size={17} />
              {t("Rediger oppsett", "Edit layout")}
            </button>
          )}
        </div>
      </div>
      {saved.isError && (
        <p role="alert">
          {t(
            "Kunne ikke hente ditt lagrede oppsett.",
            "Could not load your saved layout.",
          )}{" "}
          <button onClick={() => void saved.refetch()}>
            {t("Prøv igjen", "Retry")}
          </button>
        </p>
      )}
      {message && (
        <p className="home-canvas-message" role="status">
          {message}
        </p>
      )}
      {(adding || editingCard) && editing && (
        <CardBuilder
          key={editingCard || "add"}
          home={home}
          offline={offline}
          lang={lang}
          cards={cards}
          placed={layout}
          initial={
            editingCard
              ? {
                  item: layout.find((item) => item.id === editingCard)!,
                  card: catalog.get(editingCard)!,
                }
              : undefined
          }
          onClose={() => {
            setAdding(false);
            setEditingCard(null);
          }}
          onApply={applyCard}
        />
      )}
      <div
        ref={surface}
        className="home-canvas-grid"
        style={
          {
            "--canvas-columns": columns,
            ...(roomView?.template
              ? { gridTemplateRows: roomView.template }
              : {}),
          } as CSSProperties
        }
      >
        {shown.flatMap((item) => {
          const card = catalog.get(item.id)!;
          const group = roomView?.groups.find(
            (group) => group.items[0]?.id === item.id,
          );
          const original = layout.find((saved) => saved.id === item.id)!;
          const cardTitle = original.config?.title || card.title;
          const phase = Array.from(item.id).reduce(
            (sum, c) => sum + c.charCodeAt(0),
            0,
          );
          return [
            group && (
              <h2
                className="home-canvas-room-heading"
                key={`heading:${group.key}`}
                data-room={group.key}
                style={{ gridColumn: "1 / -1", gridRow: group.headingRow }}
              >
                <House size={18} aria-hidden="true" />
                <span>
                  {group.key === "shared"
                    ? t("Felles for hjemmet", "Shared across the home")
                    : group.key === "none"
                      ? t("Uten rom", "No room")
                      : home.areas.find(
                          (area) => `room:${area.area_id}` === group.key,
                        )?.name}
                </span>
                <small>
                  {group.items.length} {t("kort", "cards")}
                </small>
              </h2>
            ),
            <div
              key={item.id}
              className="home-canvas-cell"
              data-card={item.id}
              data-room={grouped ? roomOf(item) : undefined}
              data-rows={item.h}
              data-active={active === item.id}
              style={{
                gridColumn: `${item.x + 1} / span ${item.w}`,
                gridRow: `${roomView?.displayRows.get(item.id) ?? item.y + 1} / span ${item.h}`,
              }}
            >
              {editing && (
                <div className="home-canvas-card-tools">
                  <button
                    className="home-canvas-grip"
                    disabled={busy}
                    aria-label={`${t("Flytt", "Move")} ${cardTitle}`}
                    onPointerDown={(event) => start(event, item.id, false)}
                    onPointerMove={move}
                    onPointerUp={(event) => end(event)}
                    onPointerCancel={(event) => end(event, true)}
                    onKeyDown={(event) => {
                      const directions: Record<string, [number, number]> = {
                        ArrowLeft: [-1, 0],
                        ArrowRight: [1, 0],
                        ArrowUp: [0, -1],
                        ArrowDown: [0, 1],
                      };
                      if (directions[event.key]) {
                        event.preventDefault();
                        const [x, y] = directions[event.key];
                        if (columns < 3) {
                          const siblings = shown.filter(
                            (item) =>
                              !grouped || roomOf(item) === roomOf(original),
                          );
                          const index = siblings.findIndex(
                            (item) => item.id === original.id,
                          );
                          const target =
                            siblings[
                              Math.max(
                                0,
                                Math.min(
                                  siblings.length - 1,
                                  index + (y ? y * columns : x),
                                ),
                              )
                            ];
                          setDraft(
                            (current) =>
                              current &&
                              reorderPlacement(current, original.id, target.id),
                          );
                          return;
                        }
                        update({
                          ...original,
                          x: original.x + x,
                          y: original.y + y,
                        });
                      }
                    }}
                  >
                    <Grip size={18} />
                    <span>{cardTitle}</span>
                  </button>
                  <button
                    disabled={busy}
                    aria-label={`${t("Rediger kort", "Edit card")}: ${cardTitle}`}
                    onClick={() => setEditingCard(item.id)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    aria-label={`${t("Fjern", "Remove")} ${cardTitle}`}
                    disabled={busy}
                    onClick={() =>
                      setDraft(
                        (current) =>
                          current &&
                          (grouped
                            ? removeRoomCard(current, card.id, roomOf)
                            : removeGridCard(current, card.id)),
                      )
                    }
                  >
                    <X size={17} />
                  </button>
                </div>
              )}
              <div
                className="home-canvas-surface"
                style={
                  {
                    "--wiggle-angle": `${0.22 / Math.max(item.w, item.h / 2)}deg`,
                    "--wiggle-duration": `${560 + (phase % 5) * 37}ms`,
                    "--wiggle-delay": `${-(phase % 900)}ms`,
                  } as CSSProperties
                }
              >
                <HomeGridContent
                  title={cardTitle}
                  lang={lang}
                  editing={editing}
                  config={original.config}
                >
                  {original.config ? (
                    <ConfiguredHomeCard
                      config={original.config}
                      home={home}
                      offline={offline}
                      lang={lang}
                      original={card.content}
                      originalEntity={card.entityId}
                    />
                  ) : (
                    card.content
                  )}
                </HomeGridContent>
              </div>
              {editing && (
                <div className="home-canvas-resize-tools">
                  <label>
                    {t("Bredde", "Width")}
                    <select
                      aria-label={`${cardTitle}: ${t("bredde", "width")}`}
                      value={original.w}
                      disabled={busy}
                      onChange={(event) =>
                        update({
                          ...original,
                          x: Math.min(
                            original.x,
                            3 - Number(event.target.value),
                          ),
                          w: Number(event.target.value),
                        })
                      }
                    >
                      {[1, 2, 3].map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("Høyde", "Height")}
                    <select
                      aria-label={`${cardTitle}: ${t("høyde", "height")}`}
                      value={original.h}
                      disabled={busy}
                      onChange={(event) =>
                        update({ ...original, h: Number(event.target.value) })
                      }
                    >
                      {[1, 2, 3, 4].map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    aria-label={`${t("Endre størrelse på", "Resize")} ${cardTitle}`}
                    className="home-canvas-resize"
                    disabled={busy}
                    onPointerDown={(event) => start(event, item.id, true)}
                    onPointerMove={move}
                    onPointerUp={(event) => end(event)}
                    onPointerCancel={(event) => end(event, true)}
                  >
                    <Maximize2 size={17} />
                  </button>
                </div>
              )}
            </div>,
          ];
        })}
      </div>
      {!shown.length && (
        <div className="home-canvas-empty">
          <Plus size={28} />
          <h2>{t("Plass til det du trenger", "Room for what you need")}</h2>
          <p>
            {editing
              ? t(
                  "Velg «Legg til kort» for å fylle oppsettet.",
                  "Choose Add card to fill your layout.",
                )
              : t(
                  "Åpne redigering for å legge til kort eller hente startoppsettet.",
                  "Edit to add cards or restore the default layout.",
                )}
          </p>
        </div>
      )}
    </section>
  );
}
