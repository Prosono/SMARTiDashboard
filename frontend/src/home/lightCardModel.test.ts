import { describe, expect, it } from "vitest";
import type { Control } from "../types";
import { lightCardStyle } from "./lightCardModel";
import { defaultCardConfig } from "./cardConfigModel";
const light = (
  id = "test",
  rgb: unknown = [255, 0, 0],
  mode = "rgb",
): Control => ({
  id: `light.${id}`,
  entity_id: `light.${id}`,
  domain: "light",
  name: id,
  attributes: { rgb_color: rgb, color_mode: mode },
  state: "on",
  availability: "available",
  diagnostic: false,
  capabilities: [],
  device_id: null,
  area_id: null,
  updated_at: null,
  integration: null,
});
const paint = (c: Control, connected = true) =>
  lightCardStyle(
    { id: "device", entityId: c.entity_id },
    undefined,
    [c],
    connected,
  ) as Record<string, string>;
const luminance = (rgb: number[]) =>
  rgb
    .map((v) => v / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);

describe("light card surfaces", () => {
  it("uses exact reported RGB, including HA-derived colors for HS/XY modes", () => {
    for (const mode of ["rgb", "rgbw", "rgbww", "hs", "xy"])
      expect(paint(light("a", [21, 162, 239], mode))["--card-color"]).toBe(
        "rgb(21 162 239)",
      );
    expect(paint(light())["--card-depth"]).toBe("rgb(255 0 0)");
  });
  it("does not use stale RGB in white modes, invalid colors, white or black", () => {
    for (const mode of [
      "color_temp",
      "white",
      "brightness",
      "onoff",
      "unknown",
    ])
      expect(paint(light("a", [255, 0, 0], mode))["--card-color"]).toBe(
        "rgb(243 205 102)",
      );
    for (const rgb of [
      null,
      [],
      [1, 2],
      [1, 2, 3, 4],
      [NaN, 0, 0],
      [Infinity, 0, 0],
      [-1, 0, 0],
      [256, 0, 0],
      ["255", 0, 0],
      [255, 255, 255],
      [0, 0, 0],
    ])
      expect(paint(light("a", rgb))["--card-color"]).toBe("rgb(243 205 102)");
  });
  it("keeps off, unavailable, unknown and disconnected lights on the yellow category surface", () => {
    for (const state of ["off", "unavailable", "unknown"])
      expect(paint({ ...light(), state })["--card-color"]).toBe(
        "rgb(243 205 102)",
      );
    expect(
      paint({ ...light(), availability: "unavailable" })["--card-color"],
    ).toBe("rgb(243 205 102)");
    expect(paint(light(), false)["--card-color"]).toBe("rgb(243 205 102)");
  });
  it("uses a group's shared color and leaves mixed colors or whites yellow", () => {
    const a = light("a"),
      b = light("b"),
      group = { id: "lighting" };
    expect(
      (lightCardStyle(group, undefined, [a, b]) as Record<string, string>)[
        "--card-color"
      ],
    ).toBe("rgb(255 0 0)");
    expect(
      (
        lightCardStyle(group, undefined, [
          a,
          light("b", [0, 0, 255]),
        ]) as Record<string, string>
      )["--card-color"],
    ).toBe("rgb(243 205 102)");
    expect(
      (
        lightCardStyle(group, undefined, [
          a,
          light("b", [255, 255, 255]),
        ]) as Record<string, string>
      )["--card-color"],
    ).toBe("rgb(243 205 102)");
    expect(
      (
        lightCardStyle(group, undefined, [a, { ...b, state: "off" }]) as Record<
          string,
          string
        >
      )["--card-color"],
    ).toBe("rgb(255 0 0)");
  });
  it("follows edited sources without changing controls or card configuration", () => {
    const a = light("a"),
      b = light("b", [0, 0, 255]),
      config = defaultCardConfig([b.entity_id]),
      controls = [a, b];
    const before = structuredClone({ controls, config });
    expect(
      (
        lightCardStyle(
          { id: "device", entityId: a.entity_id },
          config,
          controls,
        ) as Record<string, string>
      )["--card-color"],
    ).toBe("rgb(0 0 255)");
    expect({ controls, config }).toEqual(before);
  });
  it("chooses readable text across the RGB gamut, including near the black/white contrast crossover", () => {
    for (const r of [0, 32, 64, 96, 128, 160, 192, 224, 255])
      for (const g of [0, 32, 64, 96, 128, 160, 192, 224, 255])
        for (const b of [0, 32, 64, 96, 128, 160, 192, 224, 255]) {
          const style = paint(light("a", [r, g, b])),
            background = style["--card-color"].match(/\d+/g)!.map(Number);
          const ink = style["--text"]
            .slice(1)
            .match(/../g)!
            .map((h) => parseInt(h, 16));
          const a = luminance(background),
            c = luminance(ink);
          expect(
            (Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05),
          ).toBeGreaterThanOrEqual(4.5);
          expect(style["--muted"]).toBe(style["--text"]);
        }
  });
});
