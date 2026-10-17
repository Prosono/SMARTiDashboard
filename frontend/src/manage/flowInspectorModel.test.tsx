import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FlowInspector } from "./FlowInspector";
import {
  changeConditionOperator,
  flowClockValue,
  flowDurationValue,
  flowFieldDraft,
  flowSelectionValid,
  flowInspectorProblem,
  parseFlowNumber,
  replaceFlowSelection,
  serviceTargetPath,
  updateFlowValue,
} from "./flowInspectorModel";
import type { Home } from "../types";

const home = {
  controls: [],
  areas: [],
  devices: [],
  favorites: [],
} as unknown as Home;
function inspect(
  row: unknown,
  kind: "actions" | "conditions" | "triggers" = "actions",
) {
  const onChange = vi.fn(),
    before = structuredClone(row);
  const html = renderToStaticMarkup(
    <FlowInspector
      row={row}
      home={home}
      lang="nb"
      kind={kind}
      onChange={onChange}
      onAdvanced={() => {}}
    />,
  );
  expect(onChange).not.toHaveBeenCalled();
  expect(row).toEqual(before);
  return html;
}

describe("lossless inspector updates", () => {
  it("validates initial required fields and targets without rejecting optional or dynamic targets", () => {
    expect(flowFieldDraft(undefined, "", { required: true }).valid).toBe(false);
    expect(flowFieldDraft(undefined, "", { number: true }).valid).toBe(false);
    expect(flowFieldDraft(undefined, "").valid).toBe(true);
    expect(
      flowFieldDraft("{{ count }}", "{{ count }}", { number: true }).valid,
    ).toBe(true);
    expect(
      flowFieldDraft("25:00", "25:00", { validate: flowClockValue }).valid,
    ).toBe(false);
    expect(flowSelectionValid("", true)).toBe(false);
    expect(flowSelectionValid([], true)).toBe(false);
    expect(flowSelectionValid(["light.one", ""], true)).toBe(false);
    expect(flowSelectionValid(undefined, false)).toBe(true);
    expect(flowSelectionValid("{{ entity }}", true)).toBe(true);
    expect(flowInspectorProblem({ condition: "numeric_state" })).toBe(
      "boundary",
    );
    expect(
      flowInspectorProblem({
        condition: "numeric_state",
        above: 20,
        below: 10,
      }),
    ).toBe("range");
    expect(
      flowInspectorProblem({
        condition: "numeric_state",
        above: "sensor.threshold",
      }),
    ).toBeNull();
    expect(flowInspectorProblem({ condition: "time", weekday: [] })).toBe(
      "weekdays",
    );
  });
  it("changes a nested delay only, without discarding repeat metadata, templates or disabled values", () => {
    const original = {
      repeat: {
        count: "{{ rounds }}",
        sequence: [
          {
            delay: { seconds: 5, milliseconds: "{{ jitter }}" },
            enabled: "{{ should_wait }}",
          },
        ],
      },
      metadata: { retained: [1, 2] },
    };
    const next = updateFlowValue(
      original,
      ["repeat", "sequence", 0, "delay", "seconds"],
      20,
    );
    expect(next).toEqual({
      ...original,
      repeat: {
        ...original.repeat,
        sequence: [
          {
            ...original.repeat.sequence[0],
            delay: { seconds: 20, milliseconds: "{{ jitter }}" },
          },
        ],
      },
    });
    expect(original.repeat.sequence[0].delay.seconds).toBe(5);
  });
  it("retains scalar/list targets and chooses their original storage location", () => {
    expect(replaceFlowSelection("light.one", 0, "light.two")).toBe("light.two");
    expect(replaceFlowSelection(["light.one"], 0, "light.two")).toEqual([
      "light.two",
    ]);
    for (const row of [
      { service: "light.turn_on", entity_id: ["light.one"], custom: "kept" },
      {
        service: "light.turn_on",
        data: { entity_id: ["light.one"], brightness: 123 },
        custom: "kept",
      },
      {
        service: "light.turn_on",
        data_template: {
          entity_id: "{{ selected }}",
          brightness: "{{ brightness }}",
        },
        custom: "kept",
      },
      {
        action: "light.turn_on",
        target: { entity_id: ["light.one"], area_id: "kitchen" },
        data: { brightness_pct: 20 },
        custom: "kept",
      },
    ]) {
      const path = serviceTargetPath(row),
        next = updateFlowValue(row, path, ["light.two"]);
      const expected = structuredClone(row);
      let parent: any = expected;
      for (const key of path.slice(0, -1)) parent = parent[key];
      parent[path.at(-1)!] = ["light.two"];
      expect(next).toEqual(expected);
      expect(Object.keys(next)).toEqual(Object.keys(row));
    }
  });
  it("keeps numeric strings as strings and rejects invalid drafts rather than converting them to zero", () => {
    expect(parseFlowNumber(5, "12")).toEqual({ valid: true, value: 12 });
    expect(parseFlowNumber("5", "12")).toEqual({ valid: true, value: "12" });
    for (const text of [
      "",
      " ",
      "-",
      "NaN",
      "Infinity",
      "{{ value }}",
      "sensor.limit",
    ])
      expect(parseFlowNumber(5, text).valid).toBe(false);
    expect(parseFlowNumber(5, "2.5", { integer: true }).valid).toBe(false);
    expect(parseFlowNumber(50, "101", { minimum: 0, maximum: 100 }).valid).toBe(
      false,
    );
  });
  it("changes boolean logic in both HA forms without losing children or custom options", () => {
    const conditions = [
      { condition: "state", state: ["on", "off"], entity_id: "light.one" },
    ];
    expect(
      changeConditionOperator(
        { condition: "and", conditions, enabled: false, future: "kept" },
        "or",
      ),
    ).toEqual({ condition: "or", conditions, enabled: false, future: "kept" });
    expect(
      changeConditionOperator(
        { not: conditions, alias: "Quiet", future: "kept" },
        "and",
      ),
    ).toEqual({ and: conditions, alias: "Quiet", future: "kept" });
  });
  it("validates clock and duration drafts while accepting HA expressions and time helpers", () => {
    for (const value of [
      "08:30",
      "23:59:59",
      "input_datetime.alarm",
      "sensor.next_alarm",
      "{{ chosen_time }}",
    ])
      expect(flowClockValue(value)).toBe(true);
    for (const value of ["", "tomorrow", "25:00:00", "12:61:00"])
      expect(flowClockValue(value)).toBe(false);
    for (const value of ["300", "00:05:00", "100:30:00", "{{ seconds }}"])
      expect(flowDurationValue(value)).toBe(true);
    expect(flowDurationValue("-00:30:00")).toBe(false);
    expect(flowDurationValue("-00:30:00", true)).toBe(true);
  });
  it("refuses nested edits inside template expressions or prototype keys", () => {
    expect(() =>
      updateFlowValue({ data: "{{ options }}" }, ["data", "temperature"], 21),
    ).toThrow();
    expect(() =>
      updateFlowValue({}, ["__proto__", "polluted"], true),
    ).toThrow();
  });
});

describe("inspector preservation on opening", () => {
  it("shows enabled templates as expressions rather than checked switches", () => {
    const html = inspect({
      action: "light.turn_on",
      target: { entity_id: "light.one" },
      enabled: "{{ chosen }}",
      data: { brightness_pct: "{{ level }}" },
    });
    expect(html).toContain("Når steget skal være aktivt");
    expect(html).not.toContain('type="checkbox"');
    expect(html).toContain("{{ chosen }}");
    expect(html).toContain("{{ level }}");
  });
  it("does not inject a single temperature into a thermostat range or change colour modes", () => {
    const temperature = inspect({
      action: "climate.set_temperature",
      target: { entity_id: "climate.room" },
      data: { target_temp_low: 18, target_temp_high: 23 },
    });
    expect(temperature).not.toContain("Ønsket temperatur");
    expect(temperature).toContain("Laveste temperatur");
    const colour = inspect({
      action: "light.turn_on",
      data: { rgb_color: [10, 20, 30] },
      target: { entity_id: "light.room" },
    });
    expect(colour).toContain("Valgt lysfarge beholdes");
    expect(colour).not.toContain("Velg fargetemperatur");
  });
  it("retains whole templated service data without offering conflicting fields", () => {
    const html = inspect({
      service: "light.turn_on",
      data_template: "{{ full_configuration }}",
    });
    expect(html).toContain("Handlingen beregner innstillingene selv");
    expect(html).not.toContain("Velg lysstyrke");
    expect(html).not.toContain("Velg enhet");
  });
  it("preserves single scene syntax and does not offer a list where HA expects one scene", () => {
    const html = inspect({ scene: "scene.evening" });
    expect(html).toContain("Scenen som skal aktiveres");
    expect(html).not.toContain("Legg til en enhet til");
  });
  it("opens complex structures, null state boundaries and unknown fields without rewriting", () => {
    inspect(
      {
        platform: "state",
        entity_id: ["binary_sensor.one"],
        from: null,
        to: ["on", "off"],
        future: { custom: true },
        for: { minutes: "{{ period }}" },
      },
      "triggers",
    );
    inspect({
      choose: [
        {
          alias: "Night",
          conditions: "{{ night }}",
          sequence: {
            action: "light.turn_on",
            target: { entity_id: "light.one" },
          },
        },
      ],
      default: { stop: "No match" },
      continue_on_error: true,
    });
    inspect({
      repeat: {
        for_each: "{{ items }}",
        sequence: [{ variables: { item: "{{ repeat.item }}" } }],
      },
    });
  });
});
