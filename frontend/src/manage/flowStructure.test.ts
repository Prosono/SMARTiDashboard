import { describe, it, expect } from "vitest";
import {
  flowGroups,
  readFlowPath,
  replaceFlowPath,
  structureSummary,
} from "./flowStructure";
describe("lossless advanced flow projection", () => {
  const config = {
    variables: { keep: "{{ secret_value }}" },
    actions: [
      {
        choose: [
          {
            conditions: '{{ is_state("sun.sun", "below_horizon") }}',
            sequence: [
              {
                repeat: {
                  count: 3,
                  sequence: [
                    { delay: { seconds: 5 } },
                    {
                      action: "light.turn_on",
                      target: { entity_id: ["light.a", "light.b"] },
                      data: { brightness_pct: 25 },
                    },
                  ],
                },
              },
            ],
          },
        ],
        default: [{ stop: "No match" }],
        enabled: false,
      },
    ],
  };
  it("projects choose branches and template shorthand without evaluating or mutating", () => {
    const before = structuredClone(config);
    const groups = flowGroups(config.actions[0], ["actions", 0], "nb");
    expect(groups.map((g) => g.path)).toEqual([
      ["actions", 0, "choose", 0, "conditions"],
      ["actions", 0, "choose", 0, "sequence"],
      ["actions", 0, "default"],
    ]);
    expect(groups[0].value).toBe(config.actions[0].choose[0].conditions);
    expect(config).toEqual(before);
  });
  it("changes only a deep leaf, preserving disabled state, templates and service data", () => {
    const path = [
      "actions",
      0,
      "choose",
      0,
      "sequence",
      0,
      "repeat",
      "sequence",
      0,
      "delay",
    ];
    const changed = replaceFlowPath(config, path, 10);
    expect(readFlowPath(changed, path)).toBe(10);
    expect(readFlowPath(config, path)).toEqual({ seconds: 5 });
    expect(changed.variables).toEqual(config.variables);
    expect(changed.actions[0].enabled).toBe(false);
    expect(changed.actions[0].choose[0].sequence[0].repeat.sequence[1]).toEqual(
      config.actions[0].choose[0].sequence[0].repeat.sequence[1],
    );
  });
  it("handles if, repeat until/while, parallel, sequential and boolean shorthand", () => {
    for (const [row, count] of [
      [{ if: [{ or: [{ condition: "state" }] }], then: [], else: [] }, 3],
      [{ repeat: { while: [], sequence: [], until: [] } }, 3],
      [{ parallel: [{ sequence: [] }, { delay: 1 }] }, 1],
      [{ condition: "not", conditions: [] }, 1],
      [{ and: [] }, 1],
      [{ wait_for_trigger: [{ trigger: "state" }] }, 1],
    ] as const)
      expect(flowGroups(row, [], "nb")).toHaveLength(count);
  });
  it("projects nested trigger lists without flattening the source", () => {
    const row = {
      triggers: [
        { trigger: "state", entity_id: "light.a" },
        { trigger: "sun", event: "sunset" },
      ],
    };
    const groups = flowGroups(row, ["triggers", 2], "nb");
    expect(groups).toHaveLength(1);
    expect(groups[0].path).toEqual(["triggers", 2, "triggers"]);
    expect(groups[0].kind).toBe("triggers");
    expect(groups[0].value).toBe(row.triggers);
    const changed = replaceFlowPath(
      row,
      ["triggers", 0, "entity_id"],
      "light.b",
    );
    expect(row.triggers[0].entity_id).toBe("light.a");
    expect(changed.triggers[0].entity_id).toBe("light.b");
  });
  it("preserves paths through action condition lists and implicit AND arrays", () => {
    const config = {
      actions: [
        {
          condition: [
            { condition: "state", entity_id: "light.a", state: "on" },
            [{ condition: "numeric_state", entity_id: "sensor.a", above: 0 }],
          ],
        },
      ],
    };
    const outer = flowGroups(config.actions[0], ["actions", 0], "nb");
    expect(outer[0].path).toEqual(["actions", 0, "condition"]);
    expect(outer[0].kind).toBe("conditions");
    const nested = flowGroups(
      config.actions[0].condition[1],
      ["actions", 0, "condition", 1],
      "nb",
    );
    expect(nested[0].path).toEqual(["actions", 0, "condition", 1]);
    expect(nested[0].value).toBe(config.actions[0].condition[1]);
    const path = [...nested[0].path, 0, "above"];
    const changed = replaceFlowPath(config, path, 5);
    expect(readFlowPath(changed, path)).toBe(5);
    expect(readFlowPath(config, path)).toBe(0);
    expect(changed.actions[0].condition[0]).toEqual(
      config.actions[0].condition[0],
    );
    expect(structureSummary(config.actions[0], "nb")?.title).toBe(
      "Alle krav må stemme",
    );
    expect(structureSummary(config.actions[0].condition[1], "nb")?.title).toBe(
      "Alle krav må stemme",
    );
  });
  it("recognizes falsy values and explicit timeout behavior", () => {
    expect(structureSummary({ delay: 0 }, "nb")?.detail).toBe("0 sekunder");
    expect(structureSummary({ stop: "" }, "nb")?.title).toBe("Stopp her");
    expect(
      structureSummary({ trigger: "sun", event: "sunset" }, "nb"),
    ).toBeNull();
    expect(
      structureSummary(
        {
          wait_template: "{{ ready }}",
          timeout: 30,
          continue_on_timeout: false,
        },
        "nb",
      )?.detail,
    ).toContain("stopp ved tidsgrensen");
  });
  it("rejects invented or unsafe edit paths", () => {
    expect(() => replaceFlowPath(config, ["missing"], 1)).toThrow();
    expect(() => replaceFlowPath(config, ["__proto__"], {})).toThrow();
  });
});
