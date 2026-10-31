import { describe, expect, it } from "vitest";
import {
  addGridCard,
  changeGrid,
  defaultGrid,
  responsiveGrid,
  reorderGrid,
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
