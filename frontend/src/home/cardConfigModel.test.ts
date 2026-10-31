import { describe, expect, it } from "vitest";
import {
  compatibleSources,
  defaultCardConfig,
  graphGeometry,
  graphPoints,
  unitInfo,
} from "./cardConfigModel";
import {
  addGridCard,
  changeGrid,
  defaultGrid,
  reorderGrid,
  responsiveGrid,
} from "./homeGridModel";

const sensor = (unit: string) => ({
  attributes: { unit_of_measurement: unit },
});
describe("personal cards and shared graph scales", () => {
  it("preserves the entire card configuration through moves, resize, touch reordering and reflow", () => {
    const config = {
      ...defaultCardConfig(["sensor.a", "sensor.b"]),
      type: "graph" as const,
      title: "Temperatur",
      icon: "temperature",
      image: "office",
    };
    const original = defaultGrid([{ id: "a", config }, { id: "b" }]);
    const moved = changeGrid(original, { ...original[0], w: 2, h: 3 });
    const reordered = reorderGrid(moved, "a", "b");
    for (const columns of [1, 2, 3])
      expect(
        responsiveGrid(reordered, columns).find((item) => item.id === "a")
          ?.config,
      ).toEqual(config);
    expect(addGridCard([], { id: "a", config })[0].config).toEqual(config);
    expect(original[0].config).toEqual(config);
  });
  it("converts comparable units without conflating power, energy and temperature", () => {
    expect(compatibleSources(sensor("kW"), sensor("W"))).toBe(true);
    expect(compatibleSources(sensor("°F"), sensor("°C"))).toBe(true);
    expect(compatibleSources(sensor("kWh"), sensor("Wh"))).toBe(true);
    expect(compatibleSources(sensor("W"), sensor("kWh"))).toBe(false);
    expect(compatibleSources(sensor("°C"), sensor("%"))).toBe(false);
    expect(unitInfo("°F").convert(68)).toBeCloseTo(20);
    expect(unitInfo("Wh").convert(500)).toBe(0.5);
    expect(unitInfo("kW").convert(0)).toBe(0);
  });
  it("keeps null/nonfinite samples as gaps and retains a real zero", () => {
    const points = graphPoints(
      [
        { time: "2026-10-31T01:00:00Z", value: 0 },
        { time: "2026-10-31T02:00:00Z", value: null },
        { time: "2026-10-31T03:00:00Z", value: Infinity },
        { time: "2026-10-31T04:00:00Z", value: 3 },
      ],
      "kW",
    );
    expect(points.map((p) => p.value)).toEqual([0, null, null, 3000]);
    const graph = graphGeometry([{ points }])!;
    expect(graph.segments(points)).toHaveLength(2);
    const broken = graphPoints(
      [points[0], { time: "invalid", value: 7 }, points[3]],
      "W",
    );
    expect(graph.segments(broken)).toHaveLength(2);
    expect(
      graphGeometry([
        {
          points: [
            { time: "bad", value: 2 },
            { time: "2026-10-31T02:00:00Z", value: null },
          ],
        },
      ]),
    ).toBeNull();
  });
  it("uses one actual time axis and one value axis across sources with different sample times", () => {
    const a = graphPoints(
      [
        { time: "2026-10-31T00:00:00Z", value: 10 },
        { time: "2026-10-31T04:00:00Z", value: 30 },
      ],
      "°C",
    );
    const b = graphPoints([{ time: "2026-10-31T02:00:00Z", value: 68 }], "°F");
    const graph = graphGeometry([{ points: a }, { points: b }])!;
    expect(graph.x(b[0])).toBeCloseTo((graph.x(a[0]) + graph.x(a[1])) / 2);
    expect(graph.y(b[0])).toBeCloseTo((graph.y(a[0]) + graph.y(a[1])) / 2);
    expect(Number.isFinite(graph.y(b[0]))).toBe(true);
  });
});
