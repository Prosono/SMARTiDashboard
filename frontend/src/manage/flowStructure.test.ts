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
