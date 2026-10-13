import { CatmullRomCurve3 } from "three";
import { expect, it } from "vitest";
import { createEnergyRoutes } from "./energyFlowPaths";
import type { FlowRole } from "./energyFlowModel";

it("gives every external connection its own house terminal and approach", () => {
  const routes = createEnergyRoutes();
  const external: FlowRole[] = ["solar", "grid", "battery", "ev"];
  for (let i = 0; i < external.length; i++) {
    const a = routes[external[i]];
    for (const other of external.slice(i + 1)) {
      const b = routes[other];
      // A common final point recreated the old outdoor hub instead of distinct
      // inverter, meter, battery and charging connections on the actual house.
      expect(a.at(-1)!.distanceTo(b.at(-1)!)).toBeGreaterThan(0.5);
      expect(a.at(-2)!.distanceTo(b.at(-2)!)).toBeGreaterThan(0.3);
    }
  }
});

it("builds usable, finite curves without coincident steps or an internal detour outdoors", () => {
  const routes = createEnergyRoutes();
  for (const points of Object.values(routes)) {
    expect(points.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < points.length; i++) {
      expect(points[i].toArray().every(Number.isFinite)).toBe(true);
      if (i > 0)
        expect(points[i].distanceTo(points[i - 1])).toBeGreaterThan(0.01);
    }
    const curve = new CatmullRomCurve3(points, false, "centripetal");
    expect(curve.getLength()).toBeGreaterThan(0.5);
    for (const point of curve.getSpacedPoints(100)) {
      expect(point.toArray().every(Number.isFinite)).toBe(true);
      // Curved corners must not dive beneath the home's floor level.
      expect(point.y).toBeGreaterThanOrEqual(0);
    }
  }
  // Home consumption is an interior circuit, independent of external terminals.
  for (const point of routes.home) {
    expect(Math.abs(point.x)).toBeLessThan(1.8);
    expect(Math.abs(point.z)).toBeLessThan(1.55);
  }
});
