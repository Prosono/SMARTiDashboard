import { describe, expect, it } from "vitest";
import { defaultGrid, type GridItem } from "./homeGridModel";
import { defaultCardConfig } from "./cardConfigModel";
import {
  addRoomCard,
  cardRoom,
  changeRoomGrid,
  normalizeRoomGrid,
  removeRoomCard,
  reorderRoomGrid,
  roomGridView,
  roomSections,
  supportsRoomGrouping,
} from "./roomGridModel";

const roomOf = (item: GridItem) =>
  item.config?.sources[0] || item.id.split(":")[0];
const original = () =>
  defaultGrid([
    {
      id: "living:a",
      w: 2,
      h: 3,
      config: {
        ...defaultCardConfig(["living"]),
        title: "My light",
        icon: "light",
        image: "office",
      },
    },
    { id: "kitchen:a" },
    { id: "living:b" },
    { id: "none:a" },
  ]);
function valid(items: GridItem[], columns = 3) {
  const occupied = new Set<string>();
  expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
  for (const item of items) {
    expect(item.x).toBeGreaterThanOrEqual(0);
    expect(item.x + item.w).toBeLessThanOrEqual(columns);
    expect(item.y).toBeGreaterThanOrEqual(0);
    expect(item.y + item.h).toBeLessThanOrEqual(2000);
    for (let y = item.y; y < item.y + item.h; y++)
      for (let x = item.x; x < item.x + item.w; x++) {
        const cell = `${x},${y}`;
        expect(occupied.has(cell)).toBe(false);
        occupied.add(cell);
      }
  }
}

describe("room-grouped personal grids", () => {
  it("groups only the requested categories and resolves actual, missing and cross-room sources", () => {
    for (const page of [
      "lights",
      "misc",
      "climate",
      "security",
      "media",
    ] as const)
      expect(supportsRoomGrouping(page)).toBe(true);
    expect(supportsRoomGrouping("overview")).toBe(false);
    expect(supportsRoomGrouping("overview_simple")).toBe(false);
    const home = {
      areas: [
        { area_id: "living", name: "Stue" },
        { area_id: "kitchen", name: "Kjøkken" },
      ],
      controls: [
        { entity_id: "light.a", area_id: "living" },
        { entity_id: "light.b", area_id: "living" },
        { entity_id: "light.c", area_id: "kitchen" },
        { entity_id: "light.d", area_id: "gone" },
      ],
    } as Parameters<typeof cardRoom>[1];
    expect(cardRoom(["light.a", "light.b"], home)).toBe("room:living");
    expect(cardRoom(["light.a", "light.c"], home)).toBe("shared");
    expect(cardRoom(["missing"], home)).toBe("none");
    expect(cardRoom(["light.d"], home)).toBe("none");
    expect(cardRoom([], home)).toBe("shared");
    expect(
      cardRoom(["missing"], {
        ...home,
        areas: [...home.areas, { area_id: "none", name: "None" }],
      }),
    ).toBe("none");
  });
  it("packs legacy layouts by room without changing sizes, metadata or the saved input", () => {
    const items = original(),
      before = structuredClone(items);
    const packed = normalizeRoomGrid(items, roomOf, true);
    expect(roomSections(packed, roomOf).map((section) => section.key)).toEqual([
      "living",
      "kitchen",
      "none",
    ]);
    expect(packed.map((item) => item.id)).toEqual([
      "living:a",
      "living:b",
      "kitchen:a",
      "none:a",
    ]);
    expect(packed.find((item) => item.id === "living:a")).toMatchObject({
      w: 2,
      h: 3,
      config: items[0].config,
    });
    expect(normalizeRoomGrid(packed, roomOf)).toEqual(packed);
    expect(items).toEqual(before);
    valid(packed);
  });
  it("keeps room headings out of persisted geometry and reflows within rooms on narrow screens", () => {
    const items = normalizeRoomGrid(original(), roomOf, true),
      before = structuredClone(items);
    for (const columns of [1, 2, 3]) {
      const view = roomGridView(items, roomOf, columns);
      valid(view.items, columns);
      expect(view.groups).toHaveLength(3);
      for (const group of view.groups)
        for (const item of group.items) {
          expect(view.displayRows.get(item.id)).toBeGreaterThan(
            group.headingRow,
          );
          expect(
            view.groups.some(
              (other) =>
                other.headingRow >= view.displayRows.get(item.id)! &&
                other.headingRow < view.displayRows.get(item.id)! + item.h,
            ),
          ).toBe(false);
        }
    }
    expect(items).toEqual(before);
  });
  it("confines moves, resizing and touch reordering to the card's room", () => {
    const items = normalizeRoomGrid(original(), roomOf, true);
    const grown = changeRoomGrid(
      items,
      { ...items[0], x: 2, y: 1, w: 3, h: 4 },
      roomOf,
    );
    expect(grown.find((item) => item.id === "living:a")).toMatchObject({
      x: 0,
      w: 3,
      h: 4,
      config: items[0].config,
    });
    expect(roomSections(grown, roomOf).map((section) => section.key)).toEqual([
      "living",
      "kitchen",
      "none",
    ]);
    expect(reorderRoomGrid(items, "living:a", "kitchen:a", roomOf)).toBe(items);
    const reordered = reorderRoomGrid(items, "living:a", "living:b", roomOf);
    expect(reordered.slice(0, 2).map((item) => item.id)).toEqual([
      "living:b",
      "living:a",
    ]);
    valid(grown);
    valid(reordered);
  });
  it("adds to the matching room, closes deletion gaps and removes empty sections", () => {
    const items = normalizeRoomGrid(original(), roomOf, true);
    const added = addRoomCard(items, { id: "kitchen:b", h: 4 }, roomOf);
    expect(
      roomSections(added, roomOf).find((section) => section.key === "kitchen")!
        .items,
    ).toHaveLength(2);
    const removed = removeRoomCard(added, "living:a", roomOf);
    expect(removed.find((item) => item.id === "living:b")).toMatchObject({
      x: 0,
      y: 0,
    });
    const noLiving = removeRoomCard(removed, "living:b", roomOf);
    expect(
      roomSections(noLiving, roomOf).map((section) => section.key),
    ).toEqual(["kitchen", "none"]);
    expect(removeRoomCard(noLiving, "missing", roomOf)).toBe(noLiving);
    expect(removeRoomCard([items[0]], items[0].id, roomOf)).toEqual([]);
    valid(added);
    valid(removed);
    valid(noLiving);
  });
  it("reassigns an edited card when its chosen source belongs to another room", () => {
    const items = normalizeRoomGrid(original(), roomOf, true);
    const changed = {
      ...items[0],
      config: { ...items[0].config!, sources: ["kitchen"] },
    };
    const result = changeRoomGrid(items, changed, roomOf);
    expect(result).toHaveLength(items.length);
    expect(
      roomSections(result, roomOf)
        .find((section) => section.key === "kitchen")!
        .items.map((item) => item.id),
    ).toEqual(["kitchen:a", "living:a"]);
    expect(result.find((item) => item.id === changed.id)!.config).toEqual(
      changed.config,
    );
    valid(result);
  });
  it("keeps maximum catalogs and large movements inside the backend's geometry limits", () => {
    const items = defaultGrid(
      Array.from({ length: 300 }, (_, i) => ({ id: `room${i}:a`, w: 3, h: 4 })),
    );
    const grouped = normalizeRoomGrid(items, roomOf, true);
    expect(grouped).toHaveLength(300);
    valid(changeRoomGrid(grouped, { ...grouped[0], y: 1996 }, roomOf));
    expect(roomGridView(grouped, roomOf, 1).groups).toHaveLength(300);
  });
});
