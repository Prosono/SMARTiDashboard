import { describe, expect, it } from "vitest";
import type { Control } from "../types";
import { cardTone } from "./cardToneModel";
import { ambientChoices, ambientConfig } from "./ambientModel";
import { defaultCardConfig } from "./cardConfigModel";

const control = (
  domain: string,
  attributes: Record<string, unknown> = {},
): Control => ({
  id: `${domain}.test`,
  entity_id: `${domain}.test`,
  domain,
  attributes,
  name: "Custom title",
  state: "off",
  availability: "available",
  capabilities: [],
  diagnostic: false,
  device_id: null,
  area_id: null,
  updated_at: null,
  integration: null,
});

describe("card type surface colors", () => {
  it("gives overview widgets stable type colors without relying on titles", () => {
    for (const [id, expected] of Object.entries({
      routines: "plum",
      people: "fresh",
      calendar: "calendar",
      lighting: "lighting",
      "metric:energy": "energy",
      "metric:temperature": "temperature",
      "metric:humidity": "humidity",
      "room:renamed": "fresh",
      "summary:alerts": "cool",
      unknown: "neutral",
    }))
      expect(cardTone({ id }, undefined, [])).toBe(expected);
  });
  it("uses actual equipment domains, device classes and units", () => {
    const cases: [Control, string][] = [
      [control("light"), "lighting"],
      [control("climate"), "warm"],
      [control("sensor", { unit_of_measurement: "°F" }), "temperature"],
      [
        control("sensor", {
          device_class: "humidity",
          unit_of_measurement: "%",
        }),
        "humidity",
      ],
      [control("fan"), "fresh"],
      [control("vacuum"), "fresh"],
      [control("media_player"), "media"],
      [control("automation"), "plum"],
      [control("sensor", { unit_of_measurement: "kW" }), "energy"],
      [control("switch"), "misc"],
      [control("input_boolean"), "misc"],
      [control("cover"), "misc"],
      [control("cover", { device_class: "garage" }), "cool"],
      [control("cover", { device_class: "gate" }), "cool"],
      [control("cover", { device_class: "door" }), "cool"],
      [control("binary_sensor", { device_class: "moisture" }), "cool"],
      [control("sensor", { unit_of_measurement: "%" }), "neutral"],
    ];
    for (const [source, expected] of cases)
      expect(
        cardTone({ id: "device", entityId: source.entity_id }, undefined, [
          source,
        ]),
      ).toBe(expected);
  });
  it("distinguishes native energy categories while keeping custom sources authoritative", () => {
    for (const [id, expected] of Object.entries({
      flow: "energy-flow",
      power: "energy-use",
      today: "energy-use",
      history: "energy-status",
      spot: "energy-price",
      prices: "energy-status",
      "today-cost": "energy-cost",
      breakdown: "energy-cost",
      capacity: "energy-status",
      tariff: "energy-tariff",
      "price-hours": "energy-status",
      solar: "energy-solar",
      "self-supply": "energy-solar",
    }))
      expect(cardTone({ id: `energy:${id}` }, undefined, [])).toBe(expected);
    const source = control("sensor", { unit_of_measurement: "°C" });
    expect(
      cardTone({ id: "energy:power" }, defaultCardConfig([source.entity_id]), [
        source,
      ]),
    ).toBe("temperature");
  });
  it("colors all clock and sky designs from their configured type", () => {
    for (const choice of ambientChoices) {
      expect(cardTone(undefined, ambientConfig(choice.id), [])).toBe(
        choice.type === "date"
          ? "calendar"
          : choice.type === "daylight"
            ? "warm"
            : choice.type === "moon"
              ? "plum"
              : choice.type === "clock"
                ? "clock"
                : "cool",
      );
    }
  });
  it("updates with edited sources and keeps mixed or unknown graph families neutral", () => {
    const warm = control("sensor", { unit_of_measurement: "°C" }),
      cool = {
        ...control("sensor", { unit_of_measurement: "W" }),
        entity_id: "sensor.power",
      },
      secondWarm = {
        ...warm,
        entity_id: "sensor.fahrenheit",
        attributes: { unit_of_measurement: "°F" },
      };
    const controls = [warm, cool, secondWarm],
      config = {
        ...defaultCardConfig([warm.entity_id]),
        type: "graph" as const,
        title: "Energy",
        icon: "sun",
      };
    expect(cardTone(undefined, config, controls)).toBe("temperature");
    expect(
      cardTone(undefined, { ...config, sources: [cool.entity_id] }, controls),
    ).toBe("energy");
    expect(
      cardTone(
        undefined,
        { ...config, sources: [warm.entity_id, secondWarm.entity_id] },
        controls,
      ),
    ).toBe("temperature");
    expect(
      cardTone(
        undefined,
        { ...config, sources: [warm.entity_id, cool.entity_id] },
        controls,
      ),
    ).toBe("neutral");
    expect(
      cardTone(undefined, { ...config, sources: ["sensor.missing"] }, controls),
    ).toBe("neutral");
    expect(
      cardTone(
        { id: "metric:energy" },
        { ...config, sources: ["sensor.missing"] },
        controls,
      ),
    ).toBe("neutral");
  });
  it("keeps type colors stable across state and availability changes without modifying configuration", () => {
    const source = control("alarm_control_panel"),
      config = defaultCardConfig([source.entity_id]);
    const before = structuredClone({ source, config });
    expect(cardTone(undefined, config, [source])).toBe("cool");
    expect(
      cardTone(undefined, config, [
        { ...source, state: "triggered", availability: "unavailable" },
      ]),
    ).toBe("cool");
    expect({ source, config }).toEqual(before);
  });
});
