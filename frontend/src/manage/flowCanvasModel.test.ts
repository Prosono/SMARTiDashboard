import { describe, it, expect } from "vitest";
import { canvasModel } from "./flowCanvasModel";
describe("canvas preserves HA control flow", () => {
  it("joins alternative triggers before sequential conditions and actions", () => {
    const c = {
      triggers: [{ trigger: "sun" }, { trigger: "time" }],
      conditions: [{ condition: "state" }],
      actions: [{ delay: 5 }, { action: "light.turn_on" }],
    };
    const original = structuredClone(c),
      g = canvasModel(c, "nb");
    expect(g.nodes).toHaveLength(6);
    expect(g.edges.filter((e) => e.to === "start")).toHaveLength(2);
    expect(
      g.edges.some(
        (e) => e.from === '["actions",0]' && e.to === '["actions",1]',
      ),
    ).toBe(true);
    expect(c).toEqual(original);
  });
  it("does not draw a continuing execution path after a stop action", () => {
    const graph = canvasModel(
      {
        triggers: [],
        conditions: [],
        actions: [{ stop: "Done" }, { delay: 1 }],
      },
      "nb",
    );
    expect(graph.edges.some((e) => e.from === '["actions",0]')).toBe(false);
  });
});
