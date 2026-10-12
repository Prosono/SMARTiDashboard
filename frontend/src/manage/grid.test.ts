import { describe, it, expect } from "vitest";
import {
  addTile,
  moveTile,
  overlaps,
  type Breakpoint,
  type Tile,
} from "./grid";
import { normalizedConfig } from "./Automations";
describe("responsive layouts", () => {
  it("keeps movement isolated and moves colliding tiles out of the way", () => {
    const a = addTile([], "control", "one"),
      b = addTile([a], "control", "two");
    const old = structuredClone([a, b]);
    const moved = moveTile([a, b], b.id, "desktop", { x: 0, y: 0 });
    expect(overlaps(moved[0].layouts.desktop, moved[1].layouts.desktop)).toBe(
      false,
    );
    expect(moved[0].layouts.phone).toEqual(old[0].layouts.phone);
    expect([a, b]).toEqual(old);
  });
  it("clamps size and position at every breakpoint", () => {
    const tile = addTile([], "text", null);
    for (const bp of ["phone", "tablet", "desktop"] as Breakpoint[]) {
      const result = moveTile([tile], tile.id, bp, {
        x: 999,
        w: 99,
        y: -4,
        h: 99,
      })[0].layouts[bp];
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
      expect(result.h).toBe(8);
      expect(result.w).toBe(bp === "phone" ? 2 : bp === "tablet" ? 6 : 12);
    }
  });
  it("packs sixty tiles without overlaps or missing breakpoints", () => {
    const tiles: Tile[] = [];
    for (let i = 0; i < 60; i++)
      tiles.push(addTile(tiles, "control", String(i)));
    for (const bp of ["phone", "tablet", "desktop"] as Breakpoint[])
      for (let i = 0; i < tiles.length; i++)
        for (let j = i + 1; j < tiles.length; j++)
          expect(overlaps(tiles[i].layouts[bp], tiles[j].layouts[bp])).toBe(
            false,
          );
  });
});
it("preserves advanced automation data while normalizing legacy lists", () => {
  const config = {
    alias: "Complex",
    trigger: { platform: "state", entity_id: ["light.a", "light.b"] },
    action: { choose: [{ conditions: "{{ true }}", sequence: [] }] },
    variables: { keep: "template" },
    mode: "parallel",
  };
  const normalized = normalizedConfig(config);
  expect(normalized.actions[0]).toEqual(config.action);
  expect(normalized.triggers[0]).toEqual(config.trigger);
  expect(normalized.variables).toEqual(config.variables);
  expect(config).toHaveProperty("trigger");
});
