import { describe, expect, it } from "vitest";
import {
  addGridCard,
  changeGrid,
  defaultGrid,
  responsiveGrid,
  reorderGrid,
  removeGridCard,
  type GridItem,
} from "./homeGridModel";

function valid(items: GridItem[], columns = 3) {
  const cells = new Set<string>();
  expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
  for (const item of items) {
    expect(item.x).toBeGreaterThanOrEqual(0);
    expect(item.x + item.w).toBeLessThanOrEqual(columns);
    expect(item.y).toBeGreaterThanOrEqual(0);
    for (let y = item.y; y < item.y + item.h; y++)
      for (let x = item.x; x < item.x + item.w; x++) {
        const cell = `${x},${y}`;
        expect(cells.has(cell)).toBe(false);
        cells.add(cell);
      }
  }
}

describe("personal home grid", () => {
  it("closes first and middle deletion gaps across columns and rows without changing the saved input", () => {
    const original = defaultGrid(
      Array.from({ length: 9 }, (_, id) => ({ id: String(id) })),
    );
    const before = structuredClone(original);
    for (const id of ["0", "4", "8"]) {
      const remaining = removeGridCard(original, id);
      expect(remaining.map((item) => item.id)).toEqual(
        original.filter((item) => item.id !== id).map((item) => item.id),
      );
      expect(remaining.map(({ x, y }) => [x, y])).toEqual([
        [0, 0],
        [1, 0],
        [2, 0],
        [0, 2],
        [1, 2],
        [2, 2],
        [0, 4],
        [1, 4],
      ]);
      valid(remaining);
    }
    expect(original).toEqual(before);
  });
  it("compacts mixed rectangles in visual order and preserves custom card configuration", () => {
    const config = {
      type: "graph",
      title: "My graph",
      icon: "chart",
      image: "",
      sources: ["sensor.a", "sensor.b"],
      period: "168",
    } as const;
    const original: GridItem[] = [
      { id: "small", x: 2, y: 2, w: 1, h: 1 },
      { id: "deleted", x: 0, y: 0, w: 3, h: 2 },
      { id: "tall", x: 2, y: 3, w: 1, h: 2 },
      {
        id: "wide",
        x: 0,
        y: 2,
        w: 2,
        h: 3,
        config: { ...config, sources: [...config.sources] },
      },
    ];
    const before = structuredClone(original);
    const remaining = removeGridCard(original, "deleted");
    expect(remaining).toEqual([
      { ...original[3], x: 0, y: 0 },
      { ...original[0], x: 2, y: 0 },
      { ...original[2], x: 2, y: 1 },
    ]);
    for (const columns of [1, 2, 3])
      valid(responsiveGrid(remaining, columns), columns);
    expect(original).toEqual(before);
    valid(remaining);
  });
  it("handles removing the final card and leaves unknown removals untouched", () => {
    const original = [{ id: "last", x: 2, y: 8, w: 1, h: 4 }];
    expect(removeGridCard(original, "last")).toEqual([]);
    expect(removeGridCard(original, "missing")).toBe(original);
    expect(removeGridCard([], "missing")).toEqual([]);
  });
  it("reorders touch cards while retaining their desktop sizes", () => {
    const original = defaultGrid([
      { id: "a", w: 2, h: 3 },
      { id: "b" },
      { id: "c", h: 4 },
    ]);
    const moved = reorderGrid(original, "a", "c");
    expect(moved.map((item) => item.id)).toEqual(["b", "c", "a"]);
    expect(moved.find((item) => item.id === "a")).toMatchObject({ w: 2, h: 3 });
    valid(moved);
  });
  it("prepopulates three columns and preserves all cards when moving into occupied cells", () => {
    const cards = Array.from({ length: 18 }, (_, id) => ({ id: String(id) }));
    const original = defaultGrid(cards);
    expect(original.slice(0, 3).map((item) => item.x)).toEqual([0, 1, 2]);
    const moved = changeGrid(original, { ...original[10], x: 0, y: 0 });
    expect(moved).toHaveLength(original.length);
    expect(moved.find((item) => item.id === "10")).toMatchObject({
      x: 0,
      y: 0,
    });
    valid(moved);
  });
  it("grows rectangles across rows without overlaps or lost cards, and clamps out-of-bounds movement", () => {
    const original = defaultGrid(
      Array.from({ length: 16 }, (_, id) => ({ id: String(id) })),
    );
    const grown = changeGrid(original, {
      ...original[4],
      x: 2,
      y: -3,
      w: 3,
      h: 4,
    });
    expect(grown.find((item) => item.id === "4")).toMatchObject({
      x: 0,
      y: 0,
      w: 3,
      h: 4,
    });
    expect(grown).toHaveLength(16);
    valid(grown);
  });
  it("reflows to tablet and phone without mutating the saved desktop layout", () => {
    const original = defaultGrid([
      { id: "wide", w: 3, h: 3 },
      { id: "normal" },
      { id: "tall", h: 4 },
    ]);
    const before = structuredClone(original);
    for (const columns of [1, 2, 3]) {
      const shown = responsiveGrid(original, columns);
      expect(shown).toHaveLength(3);
      valid(shown, columns);
    }
    expect(original).toEqual(before);
  });
  it("fills available gaps when adding a card, including a maximum sized catalog", () => {
    const original = defaultGrid([
      { id: "a" },
      { id: "b" },
      { id: "c" },
    ]).filter((item) => item.id !== "b");
    const added = addGridCard(original, { id: "d" });
    expect(added.find((item) => item.id === "d")).toMatchObject({ x: 1, y: 0 });
    valid(added);
    const full = defaultGrid(
      Array.from({ length: 300 }, (_, id) => ({ id: String(id), w: 3, h: 4 })),
    );
    expect(full).toHaveLength(300);
    valid(full);
    valid(responsiveGrid(full, 1), 1);
  });
});
