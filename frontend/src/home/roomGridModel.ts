import type { Home } from "../types";
import {
  addGridCard,
  changeGrid,
  defaultGrid,
  removeGridCard,
  reorderGrid,
  responsiveGrid,
  type GridItem,
  type GridSize,
  type HomeGridPage,
} from "./homeGridModel";

export const supportsRoomGrouping = (page: HomeGridPage) =>
  ["lights", "misc", "climate", "security", "media"].includes(page);
export type RoomOf = (item: GridItem) => string;
type RoomSection = { key: string; items: GridItem[] };
const ordered = (items: GridItem[]) =>
  [...items].sort((a, b) => a.y - b.y || a.x - b.x);
const height = (items: GridItem[]) =>
  Math.max(0, ...items.map((item) => item.y + item.h));

/** Only actual room assignments are used; cross-room sources belong to the shared section. */
export function cardRoom(
  sources: string[],
  home: Pick<Home, "controls" | "areas">,
) {
  return createRoomResolver(home)(sources);
}

export function createRoomResolver(home: Pick<Home, "controls" | "areas">) {
  const entities = new Map(home.controls.map((c) => [c.entity_id, c.area_id]));
  const knownRooms = new Set(home.areas.map((area) => area.area_id));
  return (sources: string[]) => {
    if (!sources.length) return "shared";
    const rooms = sources.map((id) => entities.get(id) || null);
    if (new Set(rooms).size > 1) return "shared";
    return rooms[0] !== null && knownRooms.has(rooms[0])
      ? `room:${rooms[0]}`
      : "none";
  };
}

export function roomSections(items: GridItem[], roomOf: RoomOf): RoomSection[] {
  const buckets = new Map<string, GridItem[]>();
  for (const item of ordered(items)) {
    const key = roomOf(item);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(item);
  }
  return [...buckets].map(([key, cards]) => {
    const top = Math.min(...cards.map((item) => item.y));
    return { key, items: cards.map((item) => ({ ...item, y: item.y - top })) };
  });
}

function joinRooms(sections: RoomSection[]): GridItem[] {
  let offset = 0;
  return sections.flatMap((section) => {
    if (!section.items.length) return [];
    const top = Math.min(...section.items.map((item) => item.y));
    const local = section.items.map((item) => ({ ...item, y: item.y - top }));
    const result = local.map((item) => ({
      ...item,
      y: item.y + offset,
    }));
    offset += height(local);
    return result;
  });
}

export function normalizeRoomGrid(
  items: GridItem[],
  roomOf: RoomOf,
  pack = false,
) {
  let sections = roomSections(items, roomOf);
  if (
    pack ||
    sections.reduce((sum, section) => sum + height(section.items), 0) > 2000
  )
    sections = sections.map((section) => ({
      ...section,
      items: defaultGrid(section.items),
    }));
  return joinRooms(sections);
}

/** Headers occupy display-only rows. Persisted geometry remains a valid three-column grid. */
export function roomGridView(
  items: GridItem[],
  roomOf: RoomOf,
  columns: number,
  compact = false,
  rowHeight = "128px",
) {
  const sections = roomSections(items, roomOf);
  let offset = 0;
  const rows: string[] = [],
    displayRows = new Map<string, number>();
  const groups = sections.map((section, index) => {
    const local = compact
      ? defaultGrid(section.items, columns)
      : responsiveGrid(section.items, columns);
    const size = height(local),
      headingRow = offset + index + 1;
    const shown = local.map((item) => ({ ...item, y: item.y + offset }));
    for (const item of shown) displayRows.set(item.id, item.y + index + 2);
    rows.push("36px", `repeat(${size}, ${rowHeight})`);
    offset += size;
    return { key: section.key, items: shown, headingRow };
  });
  return {
    groups,
    items: groups.flatMap((group) => group.items),
    template: rows.join(" "),
    displayRows,
  };
}

export function addRoomCard(items: GridItem[], card: GridSize, roomOf: RoomOf) {
  const sections = roomSections(items, roomOf);
  const key = roomOf({ ...card, x: 0, y: 0, w: card.w || 1, h: card.h || 2 });
  const section = sections.find((section) => section.key === key);
  if (section) section.items = addGridCard(section.items, card);
  else sections.push({ key, items: addGridCard([], card) });
  return joinRooms(sections);
}

export function removeRoomCard(items: GridItem[], id: string, roomOf: RoomOf) {
  if (!items.some((item) => item.id === id)) return items;
  return joinRooms(
    roomSections(items, roomOf).map((section) => ({
      ...section,
      items: removeGridCard(section.items, id),
    })),
  );
}

export function changeRoomGrid(
  items: GridItem[],
  changed: GridItem,
  roomOf: RoomOf,
) {
  const previous = items.find((item) => item.id === changed.id);
  if (!previous) return items;
  if (roomOf(previous) !== roomOf(changed))
    return addRoomCard(
      removeRoomCard(items, changed.id, roomOf),
      changed,
      roomOf,
    );
  const sections = roomSections(items, roomOf),
    key = roomOf(previous);
  const section = sections.find((section) => section.key === key)!;
  const top = Math.min(
    ...items.filter((item) => roomOf(item) === key).map((item) => item.y),
  );
  const otherHeight = sections
    .filter((section) => section.key !== key)
    .reduce((sum, section) => sum + height(section.items), 0);
  section.items = changeGrid(section.items, {
    ...changed,
    y: Math.max(0, Math.min(2000 - otherHeight - changed.h, changed.y - top)),
  });
  return joinRooms(sections);
}

export function reorderRoomGrid(
  items: GridItem[],
  id: string,
  targetId: string,
  roomOf: RoomOf,
) {
  const item = items.find((item) => item.id === id),
    target = items.find((item) => item.id === targetId);
  if (!item || !target || roomOf(item) !== roomOf(target)) return items;
  const key = roomOf(item);
  return joinRooms(
    roomSections(items, roomOf).map((section) =>
      section.key === key
        ? { ...section, items: reorderGrid(section.items, id, targetId) }
        : section,
    ),
  );
}
