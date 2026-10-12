import { describe, expect, it } from "vitest";
import { planConnection } from "./flowConnections";
import { canvasModel } from "./flowCanvasModel";
const id = (kind: string, index: number) => JSON.stringify([kind, index]);
const fixture = () => ({
  triggers: [{ trigger: "time", at: "20:00:00" }],
  conditions: [],
  actions: [
    {
      action: "light.turn_on",
      target: { entity_id: "light.a" },
      data: { brightness: "{{ level }}" },
    },
    { delay: 60 },
    {
      action: "light.turn_off",
      enabled: false,
      target: { entity_id: "light.a" },
    },
  ],
  mode: "queued",
  variables: { level: 120 },
});
describe("real canvas connections", () => {
  it("reconnects sequence in either direction without dropping settings or creating a loop", () => {
    for (const [from, to, order] of [
      [0, 2, [0, 2, 1]],
      [2, 0, [1, 2, 0]],
    ] as const) {
      const config = fixture(),
        before = structuredClone(config);
      const plan = planConnection(
        config,
        id("actions", from),
        id("actions", to),
        "sequence",
        "nb",
      );
      expect(plan.ok).toBe(true);
      if (!plan.ok) throw new Error(plan.message);
      expect(plan.patch.actions).toEqual(order.map((i) => config.actions[i]));
      const saved = { ...config, ...plan.patch };
      expect(saved.variables).toEqual(before.variables);
      expect(saved.mode).toBe("queued");
      expect(config).toEqual(before);
      expect(canvasModel(saved, "nb").edges).toHaveLength(4);
    }
  });
  it("can select a different first action from Start", () => {
    const c = fixture();
    const p = planConnection(c, "start", id("actions", 2), "sequence", "nb");
    expect(p.ok && p.patch.actions).toEqual([
      c.actions[2],
      c.actions[0],
      c.actions[1],
    ]);
  });
  it("groups two cards into native parallel sequences, preserving data and other actions", () => {
    const c = fixture(),
      before = structuredClone(c);
    const p = planConnection(
      c,
      id("actions", 0),
      id("actions", 2),
      "parallel",
      "nb",
    );
    expect(p.ok && p.patch.actions).toEqual([
      {
        parallel: [{ sequence: [c.actions[0]] }, { sequence: [c.actions[2]] }],
      },
      c.actions[1],
    ]);
    expect(c).toEqual(before);
  });
  it("does not bypass global requirements or connect actions back to triggers", () => {
    const c = {
      ...fixture(),
      conditions: [
        { condition: "state", entity_id: "switch.a", state: "on" },
        { condition: "template", value_template: "{{ ready }}" },
      ],
    };
    for (const [from, to] of [
      ["start", id("actions", 1)],
      [id("conditions", 0), id("actions", 1)],
      [id("actions", 0), id("triggers", 0)],
      [id("actions", 0), id("conditions", 0)],
    ])
      expect(planConnection(c, from, to, "sequence", "nb").ok).toBe(false);
    const p = planConnection(
      c,
      id("conditions", 1),
      id("actions", 1),
      "sequence",
      "nb",
    );
    expect(p.ok && p.patch.actions[0]).toEqual(c.actions[1]);
  });
  it("rejects self links, duplicate links, missing cards and outgoing active stops", () => {
    const c = fixture();
    for (const [from, to] of [
      [id("actions", 0), id("actions", 0)],
      [id("actions", 0), id("actions", 1)],
      ["missing", id("actions", 2)],
    ])
      expect(planConnection(c, from, to, "sequence", "en").ok).toBe(false);
    expect(
      planConnection(
        { ...c, actions: [{ stop: "" }, { delay: 3 }] },
        id("actions", 0),
        id("actions", 1),
        "sequence",
        "nb",
      ).ok,
    ).toBe(false);
    expect(
      planConnection(
        { ...c, actions: [{ variables: { a: 1 } }, { delay: 3 }] },
        id("actions", 0),
        id("actions", 1),
        "parallel",
        "nb",
      ).ok,
    ).toBe(false);
  });
});
