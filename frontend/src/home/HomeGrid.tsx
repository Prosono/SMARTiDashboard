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
  LoaderCircle,
  Maximize2,
  Pencil,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { api } from "../api";
import {
  addGridCard,
  changeGrid,
  defaultGrid,
  responsiveGrid,
  reorderGrid,
  type GridItem,
  type HomeGridPage,
  type SavedGrid,
} from "./homeGridModel";
import "./homeGrid.css";
import { HomeGridGuard } from "./HomeGridGuard";

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
}: {
  page: HomeGridPage;
  cards: HomeGridCard[];
  lang: string;
  title?: string;
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
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [adding, setAdding] = useState(false),
    [active, setActive] = useState<string | null>(null);
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
  const catalog = useMemo(
    () => new Map(cards.map((card) => [card.id, card])),
    [cards],
  );
  const defaults = useMemo(
    () => defaultGrid(cards.filter((card) => !card.defaultHidden)),
    [cards],
  );
  const layout = draft ?? saved.data?.items ?? defaults;
  const editing = draft !== null;
  const visibleLayout = layout.filter(
    (item) =>
      catalog.has(item.id) && (editing || !catalog.get(item.id)!.hidden),
  );
  const shown =
    !editing && cards.some((card) => card.hidden)
      ? defaultGrid(
          [...visibleLayout].sort((a, b) => a.y - b.y || a.x - b.x),
          columns,
        )
      : responsiveGrid(visibleLayout, columns);
  const missing = cards.filter(
    (card) => !layout.some((item) => item.id === card.id),
  );

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
    setDraft((current) => current && changeGrid(current, item));
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
      const target = [...g.shown].sort(
        (a, b) =>
          Math.abs(a.x - x) +
          Math.abs(a.y - y) -
          Math.abs(b.x - x) -
          Math.abs(b.y - y),
      )[0];
      setDraft(reorderGrid(g.items, g.id, target.id));
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
    setDraft(changeGrid(g.items, item));
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
      aria-label={title || t("Kort i hjemmet", "Home cards")}
    >
      <div className="home-canvas-toolbar">
        <div>
          <strong>{title || t("Ditt oppsett", "Your layout")}</strong>
          <span>
            {editing
              ? t(
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
              <button
                onClick={() => setAdding(!adding)}
                disabled={busy}
                aria-expanded={adding}
              >
                <Plus size={17} />
                {t("Legg til kort", "Add card")}
              </button>
              <button
                onClick={() => {
                  setDraft(defaults);
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
      {adding && editing && (
        <div
          className="home-canvas-library"
          aria-label={t("Tilgjengelige kort", "Available cards")}
        >
          {missing.length ? (
            missing.map((card) => (
              <button
                key={card.id}
                disabled={busy}
                onClick={() =>
                  setDraft((current) => current && addGridCard(current, card))
                }
              >
                <Plus size={16} />
                {card.title}
              </button>
            ))
          ) : (
            <p>
              {t(
                "Alle tilgjengelige kort er i oppsettet.",
                "All available cards are in your layout.",
              )}
            </p>
          )}
        </div>
      )}
      <div
        ref={surface}
        className="home-canvas-grid"
        style={{ "--canvas-columns": columns } as CSSProperties}
      >
        {shown.map((item) => {
          const card = catalog.get(item.id)!;
          const original = layout.find((saved) => saved.id === item.id)!;
          return (
            <div
              key={item.id}
              className="home-canvas-cell"
              data-card={item.id}
              data-active={active === item.id}
              style={{
                gridColumn: `${item.x + 1} / span ${item.w}`,
                gridRow: `${item.y + 1} / span ${item.h}`,
              }}
            >
              {editing && (
                <div className="home-canvas-card-tools">
                  <button
                    className="home-canvas-grip"
                    disabled={busy}
                    aria-label={`${t("Flytt", "Move")} ${card.title}`}
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
                          const index = shown.findIndex(
                            (item) => item.id === original.id,
                          );
                          const target =
                            shown[
                              Math.max(
                                0,
                                Math.min(
                                  shown.length - 1,
                                  index + (y ? y * columns : x),
                                ),
                              )
                            ];
                          setDraft(
                            (current) =>
                              current &&
                              reorderGrid(current, original.id, target.id),
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
                    <span>{card.title}</span>
                  </button>
                  <button
                    aria-label={`${t("Fjern", "Remove")} ${card.title}`}
                    disabled={busy}
                    onClick={() =>
                      setDraft((current) =>
                        current!.filter((item) => item.id !== card.id),
                      )
                    }
                  >
                    <X size={17} />
                  </button>
                </div>
              )}
              <div
                className="home-canvas-content"
                {...(editing ? { inert: true } : {})}
              >
                {card.content}
              </div>
              {editing && (
                <div className="home-canvas-resize-tools">
                  <label>
                    {t("Bredde", "Width")}
                    <select
                      aria-label={`${card.title}: ${t("bredde", "width")}`}
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
                      aria-label={`${card.title}: ${t("høyde", "height")}`}
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
                    aria-label={`${t("Endre størrelse på", "Resize")} ${card.title}`}
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
            </div>
          );
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
