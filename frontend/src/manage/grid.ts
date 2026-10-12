export type Breakpoint = "phone" | "tablet" | "desktop";
export type Cell = { x: number; y: number; w: number; h: number };
export type Tile = {
  id: string;
  kind: "control" | "heading" | "text";
  control_id: string | null;
  title: string;
  text: string;
  layouts: Record<Breakpoint, Cell>;
};
export type Board = {
  id: string;
  name: string;
  scope: "private" | "shared";
  revision: number;
  tiles: Tile[];
  editable: boolean;
};
export const columns: Record<Breakpoint, number> = {
  phone: 2,
  tablet: 6,
  desktop: 12,
};
export function overlaps(a: Cell, b: Cell) {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  );
}
export function moveTile(
  tiles: Tile[],
  id: string,
  bp: Breakpoint,
  change: Partial<Cell>,
): Tile[] {
  const next = structuredClone(tiles);
  const tile = next.find((t) => t.id === id);
  if (!tile) return next;
  const cell = { ...tile.layouts[bp], ...change };
  cell.w = Math.max(1, Math.min(columns[bp], cell.w));
  cell.h = Math.max(1, Math.min(8, cell.h));
  cell.x = Math.max(0, Math.min(columns[bp] - cell.w, cell.x));
  cell.y = Math.max(0, Math.min(400, cell.y));
  tile.layouts[bp] = cell;
  const placed = [cell];
  for (const other of next
    .filter((t) => t.id !== id)
    .sort(
      (a, b) =>
        a.layouts[bp].y - b.layouts[bp].y || a.layouts[bp].x - b.layouts[bp].x,
    )) {
    const c = other.layouts[bp];
    while (placed.some((p) => overlaps(p, c))) c.y++;
    placed.push(c);
  }
  return next;
}
export function addTile(
  tiles: Tile[],
  kind: Tile["kind"],
  control_id: string | null,
): Tile {
  const layouts = {} as Record<Breakpoint, Cell>;
  for (const bp of Object.keys(columns) as Breakpoint[]) {
    const c = {
      x: 0,
      y: 0,
      w:
        bp === "phone"
          ? 2
          : kind === "heading"
            ? columns[bp]
            : bp === "tablet"
              ? 3
              : 4,
      h: kind === "heading" ? 1 : kind === "control" ? 4 : 3,
    };
    while (tiles.some((t) => overlaps(t.layouts[bp], c))) {
      c.x++;
      if (c.x + c.w > columns[bp]) {
        c.x = 0;
        c.y++;
      }
    }
    layouts[bp] = c;
  }
  return {
    id: crypto.randomUUID(),
    kind,
    control_id,
    title: "",
    text: "",
    layouts,
  };
}
