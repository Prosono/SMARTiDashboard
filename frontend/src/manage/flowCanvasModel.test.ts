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
  it.each([
    [{ condition: "state", entity_id: "light.a", state: "on" }, "Hvis oppfylt"],
    [
      { and: [{ condition: "state", entity_id: "light.a", state: "on" }] },
      "Hvis oppfylt",
    ],
    [{ or: [] }, "Hvis oppfylt"],
    [{ not: [] }, "Hvis oppfylt"],
    [
      { condition: "template", value_template: "{{ ready }}", enabled: false },
      "Hoppes over",
    ],
    [
      {
        condition: "template",
        value_template: "{{ ready }}",
        enabled: "{{ use_check }}",
      },
      "Hvis oppfylt eller hoppet over",
    ],
  ])(
    "labels a condition action's continuation accurately: %j",
    (condition, label) => {
      const config = {
        triggers: [],
        conditions: [],
        actions: [condition, { delay: 1 }],
      };
      const before = structuredClone(config);
      const graph = canvasModel(config, "nb");
      expect(
        graph.edges.find((edge) => edge.from === '["actions",0]')?.label,
      ).toBe(label);
      expect(config).toEqual(before);
    },
  );
  it("keeps a conditional continuation after a templated stop", () => {
    const config = {
      triggers: [],
      conditions: [],
      actions: [
        { stop: "Only when enabled", enabled: "{{ should_stop }}" },
        { delay: 1 },
        { action: "light.turn_on" },
      ],
    };
    const graph = canvasModel(config, "en");
    expect(
      graph.edges.find((edge) => edge.from === '["actions",0]')?.label,
    ).toBe("If the step is skipped");
    expect(graph.edges.find((edge) => edge.from === '["actions",1]')?.to).toBe(
      '["actions",2]',
    );
  });
  it("continues after disabled stops but not explicitly enabled stops", () => {
    for (const enabled of [false, true]) {
      const graph = canvasModel(
        {
          triggers: [],
          conditions: [],
          actions: [{ stop: "Done", enabled }, { delay: 1 }],
        },
        "nb",
      );
      const edge = graph.edges.find((item) => item.from === '["actions",0]');
      expect(edge?.label).toBe(enabled ? undefined : "Hoppes over");
    }
  });
});
