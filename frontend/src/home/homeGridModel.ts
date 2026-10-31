export type GridItem = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
};
export type GridSize = { id: string; w?: number; h?: number };
export type HomeGridPage =
  | "overview"
  | "overview_simple"
  | "lights"
  | "climate"
  | "security"
  | "media"
  | "misc";
export type SavedGrid = { revision: number; items: GridItem[] | null };

const overlaps = (a: GridItem, b: GridItem) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function available(item: GridItem, placed: GridItem[], columns: number) {
  return (
    item.x >= 0 &&
    item.x + item.w <= columns &&
    item.y >= 0 &&
    item.y + item.h <= 2000 &&
    !placed.some((other) => overlaps(item, other))
  );
}

/** Find a complete free rectangle, including for cards spanning several rows. */
function vacant(
  item: GridItem,
  placed: GridItem[],
  columns: number,
  start = 0,
): GridItem {
  for (let y = start; y <= 2000 - item.h; y++) {
    for (let x = 0; x <= columns - item.w; x++) {
      const candidate = { ...item, x, y };
      if (available(candidate, placed, columns)) return candidate;
    }
  }
  // A full 300-card catalog fits even when every card spans all columns and four rows.
  throw new Error("grid_full");
}

export function defaultGrid(cards: GridSize[], columns = 3): GridItem[] {
  const result: GridItem[] = [];
  for (const card of cards) {
    result.push(
      vacant(
        {
          id: card.id,
          x: 0,
          y: 0,
          w: Math.min(columns, card.w || 1),
          h: card.h || 2,
        },
        result,
        columns,
      ),
    );
  }
  return result;
}

/** Pin the edited card and push colliding cards into free rows. No item is lost. */
export function changeGrid(items: GridItem[], changed: GridItem): GridItem[] {
  const pinned = {
    ...changed,
    w: Math.max(1, Math.min(3, changed.w)),
    h: Math.max(1, Math.min(4, changed.h)),
  };
  pinned.x = Math.max(0, Math.min(3 - pinned.w, pinned.x));
  pinned.y = Math.max(0, Math.min(1996, pinned.y));
  const result = [pinned];
  for (const item of items
    .filter((item) => item.id !== pinned.id)
    .sort((a, b) => a.y - b.y || a.x - b.x)) {
    result.push(available(item, result, 3) ? item : vacant(item, result, 3));
  }
  return result.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Small screens reflow a copy; the saved three-column arrangement stays intact. */
export function responsiveGrid(items: GridItem[], columns: number): GridItem[] {
  if (columns === 3) return items;
  const result: GridItem[] = [];
  for (const item of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    result.push(
      vacant({ ...item, w: Math.min(columns, item.w) }, result, columns),
    );
  }
  return result;
}

export function addGridCard(items: GridItem[], card: GridSize) {
  return [
    ...items,
    vacant(
      { id: card.id, x: 0, y: 0, w: card.w || 1, h: card.h || 2 },
      items,
      3,
    ),
  ];
}

/** Touch layouts reorder whole cards; widths remain expressed in the desktop grid. */
export function reorderGrid(items: GridItem[], id: string, targetId: string) {
  const ordered = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const from = ordered.findIndex((item) => item.id === id),
    to = ordered.findIndex((item) => item.id === targetId);
  if (from < 0 || to < 0 || from === to) return items;
  const [moved] = ordered.splice(from, 1);
  ordered.splice(to, 0, moved);
  return defaultGrid(ordered);
}
