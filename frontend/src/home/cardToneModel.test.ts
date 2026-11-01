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
  it("gives overview widgets stable, restrained type colors without relying on titles", () => {
    for (const [id, expected] of Object.entries({
      routines: "plum",
      people: "fresh",
      calendar: "warm",
      lighting: "warm",
      "metric:energy": "cool",
      "metric:temperature": "warm",
      "metric:humidity": "fresh",
      "room:renamed": "fresh",
      "summary:alerts": "cool",
      unknown: "neutral",
    }))
      expect(cardTone({ id }, undefined, [])).toBe(expected);
  });
  it("uses actual equipment domains, device classes and units", () => {
    const cases: [Control, string][] = [
      [control("light"), "warm"],
      [control("climate"), "warm"],
      [control("sensor", { unit_of_measurement: "°F" }), "warm"],
      [
        control("sensor", {
          device_class: "humidity",
          unit_of_measurement: "%",
        }),
        "fresh",
      ],
      [control("fan"), "fresh"],
      [control("vacuum"), "fresh"],
      [control("media_player"), "plum"],
      [control("automation"), "plum"],
      [control("sensor", { unit_of_measurement: "kW" }), "cool"],
      [control("switch"), "cool"],
      [control("cover"), "cool"],
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
  it("colors all clock and sky designs from their configured type", () => {
    for (const choice of ambientChoices) {
      expect(cardTone(undefined, ambientConfig(choice.id), [])).toBe(
        ["date", "daylight"].includes(choice.type)
          ? "warm"
          : choice.type === "moon"
            ? "plum"
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
    expect(cardTone(undefined, config, controls)).toBe("warm");
    expect(
      cardTone(undefined, { ...config, sources: [cool.entity_id] }, controls),
    ).toBe("cool");
    expect(
      cardTone(
        undefined,
        { ...config, sources: [warm.entity_id, secondWarm.entity_id] },
        controls,
      ),
    ).toBe("warm");
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
