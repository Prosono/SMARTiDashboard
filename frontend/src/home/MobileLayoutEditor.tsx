import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Ellipsis,
  GripVertical,
  LayoutGrid,
  LoaderCircle,
  Pencil,
  Plus,
  RotateCcw,
  Settings2,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";
import type { Home } from "../types";
import type { GridItem } from "./homeGridModel";
import type { HomeGridCard } from "./HomeGrid";
import { CardIcon, CardPresentation } from "./CardPresentation";
import { MobileCardArtwork } from "./MobileCardArtwork";
import { SettingsDialog } from "./SettingsDialog";
import "./mobileLayoutEditor.css";

export function MobileLayoutToolbar({
  lang,
  busy,
  count,
  grouped,
  canGroup,
  onGroup,
  onAdd,
  onRestore,
  onClear,
  onCancel,
  onSave,
  children,
}: {
  lang: string;
  busy: boolean;
  count: number;
  grouped: boolean;
  canGroup: boolean;
  onGroup: (value: boolean) => void;
  onAdd: () => void;
  onRestore: () => void;
  onClear: () => void;
  onCancel: () => void;
  onSave: () => void;
  children?: ReactNode;
}) {
  const [options, showOptions] = useState(false);
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  return (
    <div className="mobile-layout-toolbar">
      <span className="mobile-layout-label">
        <Smartphone size={16} />
        {t("Mobiloppsett", "Phone layout")}
      </span>
      <div className="mobile-layout-main-actions">
        <button
          disabled={busy || count >= 300}
          onClick={onAdd}
          aria-label={t("Legg til kort", "Add card")}
        >
          <Plus size={19} />
          {t("Legg til", "Add")}
        </button>
        <button
          disabled={busy}
          onClick={() => showOptions(true)}
          aria-label={t("Valg for mobiloppsett", "Phone layout options")}
        >
          <Settings2 size={18} />
          {t("Valg", "Options")}
        </button>
        <button
          className="mobile-layout-cancel"
          disabled={busy}
          onClick={onCancel}
          aria-label={t("Avbryt", "Cancel")}
        >
          <X size={19} />
        </button>
        <button className="primary" disabled={busy} onClick={onSave}>
          {busy ? (
            <LoaderCircle size={17} className="spin" />
          ) : (
            <Check size={18} />
          )}
          {t("Lagre", "Save")}
        </button>
      </div>
      {options && (
        <SettingsDialog
          title={t("Mobiloppsett", "Phone layout")}
          compact
          lang={lang}
          onClose={() => showOptions(false)}
        >
          <div className="mobile-layout-options">
            {canGroup && (
              <label>
                <input
                  type="checkbox"
                  checked={grouped}
                  disabled={busy}
                  onChange={(e) => onGroup(e.target.checked)}
                />
                {t("Grupper etter rom", "Group by room")}
              </label>
            )}
            {children}
            <button
              disabled={busy}
              onClick={() => {
                onRestore();
                showOptions(false);
              }}
            >
              <RotateCcw size={19} />
              {t("Startoppsett", "Default layout")}
            </button>
            <button
              disabled={busy || !count}
              onClick={() => {
                onClear();
                showOptions(false);
              }}
            >
              <Trash2 size={19} />
              {t("Tøm oppsett", "Clear layout")}
            </button>
          </div>
        </SettingsDialog>
      )}
    </div>
  );
}

export function MobileLayoutEditor({
  items,
  catalog,
  home,
  offline,
  lang,
  grouped,
  roomOf,
  busy,
  onReorder,
  onEdit,
  onRemove,
}: {
  items: GridItem[];
  catalog: Map<string, HomeGridCard>;
  home: Home;
  offline: boolean;
  lang: string;
  grouped: boolean;
  roomOf: (item: GridItem) => string;
  busy: boolean;
  onReorder: (id: string, target: string) => void;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const [selected, select] = useState<string | null>(null),
    [dragging, setDragging] = useState<string | null>(null),
    [dropTarget, setDropTarget] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const drag = useRef<{
      id: string;
      pointerId: number;
      x: number;
      y: number;
      target?: string;
    } | null>(null),
    frame = useRef<number | null>(null);
  const ordered = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const latest = useRef({ ordered, grouped, roomOf, onReorder });
  latest.current = { ordered, grouped, roomOf, onReorder };
  function stop() {
    drag.current = null;
    setDragging(null);
    setDropTarget(null);
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );
  useEffect(() => {
    if (busy) stop();
  }, [busy]);
  function moveToPointer() {
    const active = drag.current;
    if (!active || !list.current) return;
    const target = document
      .elementsFromPoint(active.x, active.y)
      .map((node) => node.closest<HTMLElement>("[data-mobile-edit-card]"))
      .find((node) => node && list.current!.contains(node));
    const other = target?.dataset.mobileEditCard;
    active.target = undefined;
    if (!other || other === active.id) {
      setDropTarget(null);
      return;
    }
    const { ordered, grouped, roomOf } = latest.current;
    const source = ordered.find((item) => item.id === active.id),
      destination = ordered.find((item) => item.id === other);
    if (
      source &&
      destination &&
      (!grouped || roomOf(source) === roomOf(destination))
    ) {
      active.target = other;
      setDropTarget(other);
    } else setDropTarget(null);
  }
  function autoScroll() {
    if (!drag.current) return;
    const y = drag.current.y;
    if (y > innerHeight - 100) window.scrollBy({ top: 9, behavior: "instant" });
    else if (y < 100) window.scrollBy({ top: -9, behavior: "instant" });
    moveToPointer();
    frame.current = requestAnimationFrame(autoScroll);
  }
  const chosen = ordered.find((item) => item.id === selected);
  const siblings = chosen
    ? ordered.filter((item) => !grouped || roomOf(item) === roomOf(chosen))
    : [];
  const index = siblings.findIndex((item) => item.id === selected);
  return (
    <div
      ref={list}
      className="mobile-layout-editor"
      aria-label={t("Kort i mobiloppsettet", "Phone layout cards")}
    >
      {ordered.map((item, index) => {
        const card = catalog.get(item.id)!;
        const title = item.config?.title || card.title;
        const room = roomOf(item);
        const name =
          room === "none"
            ? t("Uten rom", "No room")
            : room === "shared"
              ? t("Felles for hjemmet", "Shared")
              : home.areas.find((a) => `room:${a.area_id}` === room)?.name;
        const first =
          grouped && (index === 0 || roomOf(ordered[index - 1]) !== room);
        return (
          <div key={item.id} className="mobile-layout-entry">
            {first && <h2>{name}</h2>}
            <div
              className="mobile-layout-row"
              data-mobile-edit-card={item.id}
              data-dragging={dragging === item.id}
              data-drop-target={dropTarget === item.id}
            >
              <button
                className="mobile-layout-grip"
                disabled={busy}
                aria-label={`${t("Flytt", "Move")} ${title}`}
                onPointerDown={(event) => {
                  if (
                    event.button !== 0 ||
                    !event.isPrimary ||
                    drag.current ||
                    busy
                  )
                    return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  drag.current = {
                    id: item.id,
                    pointerId: event.pointerId,
                    x: event.clientX,
                    y: event.clientY,
                  };
                  setDragging(item.id);
                  frame.current = requestAnimationFrame(autoScroll);
                }}
                onPointerMove={(event) => {
                  if (
                    drag.current?.id !== item.id ||
                    drag.current.pointerId !== event.pointerId
                  )
                    return;
                  drag.current.x = event.clientX;
                  drag.current.y = event.clientY;
                  moveToPointer();
                }}
                onPointerUp={(event) => {
                  const source = drag.current;
                  if (source?.pointerId !== event.pointerId) return;
                  if (
                    !busy &&
                    source?.target &&
                    latest.current.ordered.some(
                      (item) => item.id === source.target,
                    )
                  )
                    latest.current.onReorder(source.id, source.target);
                  stop();
                }}
                onPointerCancel={(event) => {
                  if (drag.current?.pointerId === event.pointerId) stop();
                }}
                onLostPointerCapture={(event) => {
                  if (drag.current?.pointerId === event.pointerId) stop();
                }}
                onKeyDown={(event) => {
                  if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
                  event.preventDefault();
                  const local = ordered.filter(
                    (other) => !grouped || roomOf(other) === room,
                  );
                  const next =
                    local[
                      local.findIndex((other) => other.id === item.id) +
                        (event.key === "ArrowUp" ? -1 : 1)
                    ];
                  if (next) onReorder(item.id, next.id);
                }}
              >
                <GripVertical size={20} />
              </button>
              <CardPresentation.Provider value={item.config || {}}>
                <span className="mobile-layout-thumbnail">
                  <CardIcon fallback={LayoutGrid} size={23} />
                  <MobileCardArtwork
                    card={card}
                    config={item.config}
                    home={home}
                    offline={offline}
                    lang={lang}
                  />
                </span>
              </CardPresentation.Provider>
              <span className="mobile-layout-card-name">{title}</span>
              <button
                className="mobile-layout-card-options"
                disabled={busy || !!dragging}
                aria-label={`${t("Valg for", "Options for")} ${title}`}
                onClick={() => select(item.id)}
              >
                <Ellipsis size={22} />
              </button>
            </div>
          </div>
        );
      })}
      {chosen && (
        <SettingsDialog
          title={chosen.config?.title || catalog.get(chosen.id)!.title}
          compact
          lang={lang}
          onClose={() => select(null)}
        >
          <div className="mobile-layout-options">
            <button
              disabled={busy}
              onClick={() => {
                onEdit(chosen.id);
                select(null);
              }}
            >
              <Pencil size={19} />
              {t("Rediger kort", "Edit card")}
            </button>
            <button
              disabled={busy || index <= 0}
              onClick={() => onReorder(chosen.id, siblings[index - 1].id)}
            >
              <ArrowUp size={19} />
              {t("Flytt opp", "Move up")}
            </button>
            <button
              disabled={busy || index >= siblings.length - 1}
              onClick={() => onReorder(chosen.id, siblings[index + 1].id)}
            >
              <ArrowDown size={19} />
              {t("Flytt ned", "Move down")}
            </button>
            <button
              disabled={busy}
              onClick={() => {
                onRemove(chosen.id);
                select(null);
              }}
            >
              <Trash2 size={19} />
              {t("Fjern kort", "Remove card")}
            </button>
          </div>
        </SettingsDialog>
      )}
    </div>
  );
}
