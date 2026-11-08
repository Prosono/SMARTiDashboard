import { describe, it, expect } from "vitest";
import type { Control, Home } from "../types";
import {
  createSimulationScenario,
  simulateFlow,
  simulationFrame,
  simulationInputs,
  simulationPath,
  type SimulationScenario,
} from "./flowSimulation";
const control = (
  id: string,
  state: string,
  attributes: Record<string, unknown> = {},
): Control => ({
  id,
  entity_id: id,
  domain: id.split(".")[0],
  name: id,
  state,
  attributes,
  capabilities: [],
  area_id: "living",
  device_id: id,
  availability: "available",
  updated_at: null,
  integration: null,
  diagnostic: false,
});
const home = {
  controls: [
    control("binary_sensor.motion", "off"),
    control("sensor.temp", "18"),
    control("light.lamp", "off", { brightness: 0 }),
    control("light.other", "off"),
    control("climate.ac", "heat", { temperature: 19, current_temperature: 16 }),
    control("input_number.threshold", "20"),
  ],
  devices: [],
  areas: [],
} as unknown as Home;
const on = {
  action: "light.turn_on",
  target: { entity_id: "light.lamp" },
  data: { brightness_pct: 50 },
};
const off = { action: "light.turn_off", target: { entity_id: "light.lamp" } };
const base = (actions: any[] = [on], conditions: any[] = []) => ({
  triggers: [
    {
      trigger: "state",
      entity_id: "binary_sensor.motion",
      from: "off",
      to: "on",
    },
  ],
  conditions,
  actions,
});
function scenario(config: any): SimulationScenario {
  const s = createSimulationScenario(
    config,
    home,
    new Date("2026-11-08T18:00:00"),
  );
  if (s.after["binary_sensor.motion"])
    s.after["binary_sensor.motion"].state = "on";
  return s;
}
const ends = (result: ReturnType<typeof simulateFlow>) =>
  result.events.filter((e) => e.status !== "running");
describe("virtual flow execution", () => {
  it("runs solely on copies and never mutates the native config, home or scenario", () => {
    const config = base(),
      s = scenario(config),
      before = structuredClone({ config, home, s });
    const r = simulateFlow(config, home, s);
    expect(r.status).toBe("completed");
    expect(r.states["light.lamp"].state).toBe("on");
    expect(r.states["light.lamp"].attributes.brightness).toBe(128);
    expect({ config, home, s }).toEqual(before);
  });
  it("requires an actual state transition and preserves zero-valued attributes", () => {
    const config = base(
      [],
      [
        {
          condition: "numeric_state",
          entity_id: "light.lamp",
          attribute: "brightness",
          below: 1,
        },
      ],
    );
    const s = scenario(config);
    expect(simulateFlow(config, home, s).status).toBe("completed");
    s.before["binary_sensor.motion"].state = "on";
    expect(simulateFlow(config, home, s).status).toBe("not-triggered");
  });
  it("numeric triggers cross exclusive thresholds, rather than matching a value already inside", () => {
    const config = {
        ...base(),
        triggers: [
          { trigger: "numeric_state", entity_id: "sensor.temp", above: 20 },
        ],
      },
      s = scenario(config);
    s.after["sensor.temp"].state = "20";
    expect(simulateFlow(config, home, s).status).toBe("not-triggered");
    s.after["sensor.temp"].state = "21";
    expect(simulateFlow(config, home, s).status).toBe("completed");
    s.before["sensor.temp"].state = "21";
    s.after["sensor.temp"].state = "22";
    expect(simulateFlow(config, home, s).status).toBe("not-triggered");
  });
  it("a threshold-helper change alone does not fire a numeric trigger", () => {
    const config = {
        ...base(),
        triggers: [
          {
            trigger: "numeric_state",
            entity_id: "sensor.temp",
            below: "input_number.threshold",
          },
        ],
      },
      s = scenario(config);
    s.before["input_number.threshold"].state = "17";
    s.after["input_number.threshold"].state = "20";
    expect(simulateFlow(config, home, s).status).toBe("not-triggered");
  });
  it("stops at unmet top-level requirements and leaves later cards unvisited", () => {
    const c = base(
      [on],
      [{ condition: "state", entity_id: "light.lamp", state: "on" }],
    );
    const r = simulateFlow(c, home, scenario(c));
    expect(r.status).toBe("stopped");
    expect(r.events.some((e) => e.path[0] === "actions")).toBe(false);
  });
  it("supports nested AND/OR/NOT and trigger IDs without running unreachable templates", () => {
    const c = base(
      [on],
      [
        {
          condition: "or",
          conditions: [
            {
              condition: "not",
              conditions: [
                { condition: "state", entity_id: "light.lamp", state: "on" },
              ],
            },
            { condition: "template", value_template: "{{ bad }}" },
          ],
        },
        { condition: "trigger", id: ["0"] },
      ],
    );
    expect(simulateFlow(c, home, scenario(c)).status).toBe("completed");
  });
  it("chooses the first matching branch and records nested paths", () => {
    const c = base([
      {
        choose: [
          {
            conditions: [
              {
                condition: "numeric_state",
                entity_id: "sensor.temp",
                above: 30,
              },
            ],
            sequence: [off],
          },
          {
            conditions: [
              {
                condition: "numeric_state",
                entity_id: "sensor.temp",
                below: 20,
              },
            ],
            sequence: [on],
          },
        ],
        default: [off],
      },
    ]);
    const r = simulateFlow(c, home, scenario(c));
    expect(r.states["light.lamp"].state).toBe("on");
    expect(
      r.events.some(
        (e) =>
          JSON.stringify(e.path) === '["actions",0,"choose",1,"sequence",0]',
      ),
    ).toBe(true);
    expect(r.events.some((e) => e.path.includes("default"))).toBe(false);
  });
  it("an action condition only stops its own nested sequence, but stops the root sequence when placed there", () => {
    const condition = {
      condition: "state",
      entity_id: "light.lamp",
      state: "on",
    };
    const nested = base([{ if: [], then: [condition, off] }, on]);
    const result = simulateFlow(nested, home, scenario(nested));
    expect(result.status).toBe("completed");
    expect(result.states["light.lamp"].state).toBe("on");
    const root = base([condition, on]);
    expect(simulateFlow(root, home, scenario(root)).status).toBe("stopped");
  });
  it("advances virtual time instantly for delays and trigger hold durations", () => {
    const c = base([{ delay: 300 }, on]);
    (c.triggers[0] as any).for = { seconds: 30 };
    const start = performance.now(),
      r = simulateFlow(c, home, scenario(c));
    expect(performance.now() - start).toBeLessThan(100);
    expect(r.events.at(-1)?.at).toBe(330000);
  });
  it("merges parallel branches by virtual time and joins at the longest branch", () => {
    const c = base([
      {
        parallel: [
          { sequence: [{ delay: 30 }, on] },
          {
            sequence: [
              { delay: 10 },
              { ...on, target: { entity_id: "light.other" } },
            ],
          },
        ],
      },
      off,
    ]);
    const r = simulateFlow(c, home, scenario(c));
    const changes = r.events.filter((e) => Object.keys(e.changes).length);
    expect(changes.map((e) => [e.at, Object.keys(e.changes)[0]])).toEqual([
      [10000, "light.other"],
      [30000, "light.lamp"],
      [30000, "light.lamp"],
    ]);
    expect(r.parallel).toBe(true);
  });
  it("Stop propagates out of nested branches while already-started parallel work finishes", () => {
    const c = base([
      {
        parallel: [
          { sequence: [{ delay: 2 }, { stop: "Done" }, on] },
          { sequence: [{ delay: 10 }, on] },
        ],
      },
      off,
    ]);
    const r = simulateFlow(c, home, scenario(c));
    expect(r.status).toBe("stopped");
    expect(r.states["light.lamp"].state).toBe("on");
    expect(
      r.events.some((e) => JSON.stringify(e.path) === '["actions",1]'),
    ).toBe(false);
  });
  it("supports counted loops, while/until checks and bounds runaway loops", () => {
    const c = base([{ repeat: { count: 3, sequence: [{ delay: 2 }] } }, on]);
    expect(simulateFlow(c, home, scenario(c)).events.at(-1)?.at).toBe(6000);
    const bad = base([
      {
        repeat: {
          until: [{ condition: "state", entity_id: "light.lamp", state: "on" }],
          sequence: [{ delay: 1 }],
        },
      },
    ]);
    expect(simulateFlow(bad, home, scenario(bad)).status).toBe("limited");
  });
  it("blocks unsupported expressions, then only proceeds after an explicit manual assumption", () => {
    const c = base(
        [on],
        [
          {
            condition: "template",
            value_template: "{{ states('sensor.temp') | float > 15 }}",
          },
        ],
      ),
      s = scenario(c);
    const blocked = simulateFlow(c, home, s);
    expect(blocked.status).toBe("blocked");
    expect(blocked.events.at(-1)?.decision).toBe("condition");
    s.decisions[simulationPath(["conditions", 0])] = true;
    const r = simulateFlow(c, home, s);
    expect(r.status).toBe("completed");
    expect(r.events.some((e) => e.status === "assumed")).toBe(true);
  });
  it("never pretends that unknown services/templates have changed devices", () => {
    const c = base([
        { action: "script.turn_on", target: { entity_id: "script.away" } },
        on,
      ]),
      s = scenario(c);
    expect(simulateFlow(c, home, s).status).toBe("blocked");
    s.decisions[simulationPath(["actions", 0])] = "continue";
    const r = simulateFlow(c, home, s);
    expect(r.status).toBe("completed");
    expect(ends(r).find((e) => e.status === "assumed")?.changes).toEqual({});
  });
  it("sets thermostat targets without inventing a measured temperature or heating activity", () => {
    const c = base([
      {
        action: "climate.set_temperature",
        target: { entity_id: "climate.ac" },
        data: { temperature: 21 },
      },
    ]);
    const r = simulateFlow(c, home, scenario(c));
    expect(r.states["climate.ac"].attributes).toEqual({
      temperature: 21,
      current_temperature: 16,
    });
  });
  it("conditions with for count from the last virtual state change", () => {
    const c = base([
      { delay: 20 },
      on,
      { delay: 10 },
      { condition: "state", entity_id: "light.lamp", state: "on", for: 15 },
      off,
    ]);
    const r = simulateFlow(c, home, scenario(c));
    expect(r.status).toBe("stopped");
    expect(r.states["light.lamp"].state).toBe("on");
  });
  it("skips disabled steps and rejects startup templates without an ineffective override", () => {
    const c = base([{ ...off, enabled: false }, on]);
    expect(simulateFlow(c, home, scenario(c)).status).toBe("completed");
    const variable = { ...c, variables: { something: "{{ x }}" } };
    const r = simulateFlow(variable, home, scenario(variable));
    expect(r.status).toBe("blocked");
    expect(r.events.at(-1)?.decision).toBeUndefined();
  });
  it("uses the scenario clock for overnight time windows and weekday checks", () => {
    const c = base(
        [on],
        [
          {
            condition: "time",
            after: "22:00",
            before: "06:00",
            weekday: ["sun"],
          },
        ],
      ),
      s = scenario(c);
    s.now = "2026-11-08T23:00";
    expect(simulateFlow(c, home, s).status).toBe("completed");
    s.now = "2026-11-08T12:00";
    expect(simulateFlow(c, home, s).status).toBe("stopped");
  });
  it("only collects explicit virtual dependencies and honors area/domain targeting", () => {
    const c = base([
      { action: "light.turn_on", target: { area_id: "living" } },
    ]);
    expect(
      simulationInputs(c, home)
        .map((i) => i.id)
        .sort(),
    ).toEqual(["binary_sensor.motion", "light.lamp", "light.other"]);
  });
  it("projects only already-played trace events onto canvas roots", () => {
    const c = base([{ delay: 30 }, on]),
      r = simulateFlow(c, home, scenario(c));
    const beginning = simulationFrame(r.events, 1);
    expect(beginning.nodes['["triggers",0]']).toBe("running");
    expect(beginning.visited.has('["actions",0]')).toBe(false);
    const last = simulationFrame(r.events, r.events.length);
    expect(last.activeNode).toBeNull();
    expect(last.nodes['["actions",1]']).toBe("done");
  });
});
it("a template hold duration can be explicitly assumed once without an assumption loop", () => {
  const c = base();
  (c.triggers[0] as any).for = { seconds: "{{ hold }}" };
  const s = scenario(c);
  expect(simulateFlow(c, home, s).status).toBe("blocked");
  s.decisions[simulationPath(["triggers", 0])] = true;
  const result = simulateFlow(c, home, s);
  expect(result.status).toBe("completed");
  expect(result.events.some((e) => e.status === "assumed")).toBe(true);
});
it("invalid clock input asks to repair the scenario, not for an ineffective assumption", () => {
  const c = base(),
    s = scenario(c);
  s.now = "";
  const r = simulateFlow(c, home, s);
  expect(r.status).toBe("blocked");
  expect(r.events.at(-1)?.decision).toBeUndefined();
});
it("invalid service values and non-actuator homeassistant targets are not simulated as successful effects", () => {
  for (const action of [
    { ...on, data: { rgb_color: [400, 0, 0] } },
    { action: "homeassistant.turn_on", target: { entity_id: "sensor.temp" } },
  ]) {
    const c = base([action]),
      r = simulateFlow(c, home, scenario(c));
    expect(r.status).toBe("blocked");
    expect(r.events.every((e) => Object.keys(e.changes).length === 0)).toBe(
      true,
    );
  }
});
it("bounds excessive parallel work and non-finite virtual time without freezing or producing invalid timestamps", () => {
  const c = base([
    { parallel: Array.from({ length: 65 }, () => ({ delay: 1 })) },
  ]);
  expect(simulateFlow(c, home, scenario(c)).status).toBe("limited");
  const huge = base([{ delay: 1e308 }]),
    r = simulateFlow(huge, home, scenario(huge));
  expect(r.status).toBe("blocked");
  expect(r.events.every((e) => Number.isFinite(e.at))).toBe(true);
});
