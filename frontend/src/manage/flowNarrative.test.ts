import { describe, it, expect } from "vitest";
import { flowNarrative, type NarrativeKey } from "./flowNarrative";
import type { Home, Control } from "../types";
const control = (
  entity_id: string,
  name: string,
  attributes = {},
  device_id = "dev1",
) =>
  ({
    entity_id,
    name,
    attributes,
    device_id,
    domain: entity_id.split(".")[0],
  }) as Control;
const home = {
  controls: [
    control("binary_sensor.door", "Ytterdør", { device_class: "door" }),
    control("light.kitchen", "Kjøkkenlys", {}, "dev2"),
    control("sensor.temperature", "Temperatur", { unit_of_measurement: "°C" }),
    control("input_number.threshold", "Temperaturgrense"),
    control("zone.home", "Hjemme"),
  ],
  areas: [{ area_id: "kitchen", name: "Kjøkken" }],
} as Home;
const describeRow = (row: any, key: NarrativeKey = "triggers", lang = "nb") =>
  flowNarrative(row, key, home, lang);
describe("HA flow narratives preserve meaning", () => {
  it("uses device class words for state changes and keeps from/to/for", () => {
    const s = describeRow({
      trigger: "state",
      entity_id: "binary_sensor.door",
      from: "off",
      to: "on",
      for: { minutes: 5 },
    });
    expect(s.title).toBe("Ytterdør");
    expect(s.detail).toContain("Fra Lukket");
    expect(s.detail).toContain("Til Åpen");
    expect(s.detail).toContain("5 min");
  });
  it("does not describe an attribute as the device's own state", () => {
    const s = describeRow({
      platform: "state",
      entity_id: "binary_sensor.door",
      attribute: "battery_low",
      to: "on",
    });
    expect(s.detail).toContain("Til on");
    expect(s.detail).toContain("battery low");
    expect(s.detail).not.toContain("Åpen");
  });
  it("distinguishes all changes from state-only changes with explicit null", () => {
    expect(
      describeRow({ trigger: "state", entity_id: "light.kitchen" }).detail,
    ).toContain("eller en egenskap");
    expect(
      describeRow({ trigger: "state", entity_id: "light.kitchen", to: null })
        .detail,
    ).not.toContain("egenskap");
    expect(
      describeRow({
        trigger: "state",
        entity_id: "light.kitchen",
        not_from: ["unknown", "unavailable"],
        not_to: "off",
      }).detail,
    ).toContain("Ikke fra");
  });
  it("keeps multi-entity condition semantics and does not use one device class for mixed targets", () => {
    const s = describeRow(
      {
        condition: "state",
        entity_id: ["binary_sensor.door", "light.kitchen"],
        state: "on",
        match: "any",
      },
      "conditions",
    );
    expect(s.title).toBe("Ytterdør, Kjøkkenlys");
    expect(s.detail).toContain("Er on");
    expect(s.detail).toContain("Minst én");
    expect(
      describeRow(
        {
          condition: "state",
          entity_id: ["light.kitchen"],
          state: ["on", "off"],
        },
        "conditions",
      ).detail,
    ).toContain("eller");
  });
  it("distinguishes threshold crossing from a static range check and preserves zero and expressions", () => {
    const trigger = {
      trigger: "numeric_state",
      entity_id: "sensor.temperature",
      above: 0,
      below: "input_number.threshold",
      for: "00:02:00",
      value_template: "{{ value | float * 2 }}",
    };
    const s = describeRow(trigger);
    expect(s.detail).toContain("går inn i området");
    expect(s.detail).toContain("Over 0");
    expect(s.detail).toContain("Temperaturgrense");
    expect(s.detail).toContain("2 min");
    expect(s.detail).toContain(trigger.value_template);
    expect(
      describeRow({ ...trigger, condition: "numeric_state" }, "conditions")
        .detail,
    ).not.toContain("går inn");
  });
  it.each([
    [
      { trigger: "time", at: ["07:00:00", "22:00:00"] },
      "07:00:00 eller 22:00:00",
    ],
    [
      {
        condition: "time",
        after: "22:00:00",
        before: "06:00:00",
        weekday: ["mon", "fri"],
      },
      "mandag, fredag",
    ],
    [
      { trigger: "time_pattern", minutes: "/5", seconds: 0 },
      "Minutt: hver 5 · Sekund: 0",
    ],
    [{ trigger: "sun", event: "sunset", offset: "-00:15:00" }, "-00:15:00"],
    [
      {
        condition: "sun",
        after: "sunset",
        after_offset: "00:30:00",
        before: "sunrise",
      },
      "forskyvning 30 min",
    ],
    [
      {
        trigger: "calendar",
        entity_id: "calendar.work",
        event: "end",
        offset: "-00:05:00",
      },
      "-00:05:00",
    ],
    [
      { trigger: "mqtt", topic: "z2m/button/action", payload: "single" },
      "single",
    ],
    [
      {
        trigger: "event",
        event_type: "button_pressed",
        event_data: { button: 1 },
      },
      "button: 1",
    ],
    [
      {
        trigger: "zone",
        entity_id: "person.olga",
        zone: "zone.home",
        event: "leave",
      },
      "Hjemme",
    ],
    [
      { trigger: "tag", tag_id: ["front-door", "bedroom"] },
      "front-door, bedroom",
    ],
    [
      { trigger: "conversation", command: ["good night", "sleep time"] },
      "good night eller sleep time",
    ],
  ])("describes supported timing and event data %#", (row, expected) => {
    expect(
      describeRow(row, "condition" in row ? "conditions" : "triggers").detail,
    ).toContain(expected);
  });
  it("shows all device qualifiers and does not translate an unknown device type to an invented behavior", () => {
    const s = describeRow({
      trigger: "device",
      device_id: "dev2",
      type: "button_long_press",
      subtype: "button_2",
      for: 2,
    });
    expect(s.title).toBe("Langt trykk");
    expect(s.detail).toContain("Kjøkkenlys");
    expect(s.detail).toContain("button 2");
    expect(
      describeRow({
        trigger: "device",
        device_id: "unknown",
        domain: "custom",
        type: "rare_event",
      }).title,
    ).toContain("rare event");
    expect(
      describeRow(
        { domain: "light", device_id: "dev2", type: "turn_on" },
        "actions",
      ).title,
    ).toBe("Slå på");
  });
  it("keeps webhook credentials out of overview text", () => {
    const s = describeRow({
      trigger: "webhook",
      webhook_id: "private-secret",
      allowed_methods: ["POST"],
      local_only: false,
    });
    expect(s.detail).toContain("POST");
    expect(s.detail).toContain("utenfra");
    expect(JSON.stringify(s)).not.toContain("private-secret");
  });
  it("preserves templates and aliases without claiming to know their outcome", () => {
    const expression = "{{ is_state('light.kitchen', 'on') }}";
    const s = describeRow({
      trigger: "template",
      alias: "Kveldsro",
      value_template: expression,
      for: 10,
    });
    expect(s.title).toBe("Kveldsro");
    expect(s.detail).toContain("Når et uttrykk blir sant");
    expect(s.detail).toContain(expression);
    expect(describeRow(expression, "conditions")).toEqual({
      title: "Sjekk et uttrykk",
      detail: expression,
    });
  });
  it("distinguishes the trigger-ID condition from a normal trigger", () => {
    expect(
      describeRow(
        { condition: "trigger", id: ["night", "away"] },
        "conditions",
      ),
    ).toEqual({
      title: "Startet av en bestemt hendelse",
      detail: "Utløser-ID: night eller away",
    });
  });
  it("describes action targets and values while preserving unknown parameters", () => {
    const s = describeRow(
      {
        action: "light.turn_on",
        target: {
          entity_id: "light.kitchen",
          area_id: "kitchen",
          device_id: "dev2",
        },
        data: {
          brightness_pct: 40,
          transition: 2,
          color_temp_kelvin: 2700,
          custom_field: "{{ value }}",
        },
      },
      "actions",
    );
    expect(s.title).toBe("Slå på");
    expect(s.detail).toContain("Kjøkkenlys");
    expect(s.detail).toContain("Rom: Kjøkken");
    expect(s.detail).toContain("Lysstyrke: 40 %");
    expect(s.detail).toContain("Overgang: 2 s");
    expect(s.detail).toContain("2700 K");
    expect(s.detail).toContain("{{ value }}");
    expect(
      describeRow(
        { service: "media_player.volume_set", data: { volume_level: 0.25 } },
        "actions",
      ).detail,
    ).toContain("25 %");
    expect(
      describeRow({ action: "lock.unlock", data: { code: "1234" } }, "actions")
        .detail,
    ).not.toContain("1234");
  });
  it("keeps choose, if and repeat semantics precise", () => {
    expect(
      describeRow({ choose: [{ conditions: [], sequence: [] }] }, "actions")
        .detail,
    ).toContain("Ingen treff: fortsett");
    expect(
      describeRow({ choose: [], default: [] }, "actions").detail,
    ).toContain("reserveveien");
    expect(describeRow({ if: [], then: [] }, "actions").detail).toContain(
      "fortsett etter",
    );
    expect(
      describeRow({ repeat: { until: [], sequence: [] } }, "actions").detail,
    ).toContain("minst én gang");
    expect(
      describeRow({ repeat: { while: [], sequence: [] } }, "actions").detail,
    ).toContain("før hver runde");
    expect(
      describeRow({ repeat: { count: 0, sequence: [] } }, "actions").title,
    ).toBe("Gjenta 0 ganger");
  });
  it("shows wait timeout behavior, zero delay and disabled/error flags", () => {
    const s = describeRow(
      {
        wait_for_trigger: [{ trigger: "state" }],
        timeout: 30,
        continue_on_timeout: false,
        enabled: false,
        continue_on_error: true,
      },
      "actions",
    );
    expect(s.detail).toContain("Vent maksimalt 30 sek");
    expect(s.detail).toContain("Stopp ved tidsgrensen");
    expect(s.detail).toContain("Deaktivert");
    expect(s.detail).toContain("ved feil");
    expect(
      describeRow({ wait_template: "{{ ready }}", timeout: 0 }, "actions")
        .detail,
    ).toContain("Fortsett også ved tidsgrensen");
    expect(describeRow({ delay: 0 }, "actions").title).toBe("Vent 0 sek");
    expect(describeRow({ stop: "" }, "actions").title).toBe("Stopp her");
  });
  it("does not mistake a modern domain trigger for a service action", () => {
    expect(
      describeRow({
        trigger: "light.turned_on",
        target: { area_id: "kitchen" },
      }).title,
    ).toBe("Et lys slås på");
    expect(
      describeRow({
        trigger: "new_integration.special_event",
        target: { entity_id: "light.kitchen" },
        options: { threshold: 4 },
      }).detail,
    ).toContain('"threshold":4');
  });
  it("explains that conditions placed among actions stop only the current sequence", () => {
    const row = { condition: "state", entity_id: "light.kitchen", state: "on" };
    expect(describeRow(row, "actions").detail).toContain(
      "stopper resten av denne sekvensen",
    );
    expect(describeRow(row, "conditions").detail).not.toContain(
      "stopper resten",
    );
  });
  it("explains condition arrays as AND and preserves original nested values", () => {
    const conditions = [
      { condition: "state", entity_id: "light.kitchen", state: "on" },
      [
        {
          condition: "numeric_state",
          entity_id: "sensor.temperature",
          above: 0,
        },
      ],
    ];
    const row = { condition: conditions, alias: "Før vi fortsetter" };
    const before = structuredClone(row);
    expect(describeRow(row, "actions").detail).toContain("Alle krav må stemme");
    expect(describeRow(row, "actions").detail).toContain(
      "stopper resten av denne sekvensen",
    );
    expect(describeRow(conditions, "conditions").title).toBe(
      "Alle krav må stemme",
    );
    expect(describeRow(conditions, "conditions").detail).not.toContain(
      "stopper resten",
    );
    expect(describeRow([], "conditions").title).toBe("Alle krav må stemme");
    expect(row).toEqual(before);
  });
  it("does not invent notification behavior for a maintenance action", () => {
    expect(describeRow({ action: "notify.reload" }, "actions").title).toBe(
      "Kjør notify.reload",
    );
  });
  it("does not mutate nested configuration and has English descriptions", () => {
    const row = {
      alias: "Nested",
      choose: [
        {
          conditions: [
            { condition: "template", value_template: "{{ ready }}" },
          ],
          sequence: [{ action: "light.turn_on", data: { brightness_pct: 20 } }],
        },
      ],
      default: [],
      enabled: false,
    };
    const before = structuredClone(row);
    describeRow(row, "actions");
    expect(row).toEqual(before);
    expect(
      describeRow({ repeat: { until: [], sequence: [] } }, "actions", "en")
        .detail,
    ).toContain("at least once");
  });
});

it("resolves HA registry IDs without rewriting device automation configuration", () => {
  const h = { ...home, controls: [{...home.controls[2], id: "registry-temperature"}] };
  const row = {trigger:"device", domain:"sensor", device_id:"dev1", entity_id:"registry-temperature", type:"temperature", above:22};
  const before = structuredClone(row);
  expect(flowNarrative(row,"triggers",h,"nb").detail).toContain("Temperatur");
  expect(flowNarrative(row,"triggers",h,"nb").detail).not.toContain("registry-temperature");
  expect(row).toEqual(before);
});
