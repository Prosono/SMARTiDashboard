import { describe, expect, it } from "vitest";
import type { Control, Home } from "../types";
import { mobileCardSummary, mobileGridItems } from "./mobileCardModel";
import { defaultCardConfig } from "./cardConfigModel";
import { defaultGrid } from "./homeGridModel";
import { roomGridView } from "./roomGridModel";
import { weatherLabel, weatherScene } from "./weatherPresentation";

const control = (
  domain: string,
  state: string,
  attributes = {},
  extra = {},
): Control => ({
  id: `${domain}.test`,
  entity_id: `${domain}.test`,
  domain,
  state,
  attributes,
  name: "Test",
  area_id: "living",
  device_id: null,
  capabilities: [],
  availability: "available",
  diagnostic: false,
  updated_at: null,
  integration: null,
  ...extra,
});
const home = (controls: Control[]): Home => ({
  controls,
  areas: [{ area_id: "living", name: "Stue" }],
  devices: [],
  favorites: [],
  home_name: "Home",
  mode: "demo",
  connected: true,
  error: null,
  last_sync: null,
  ha_version: null,
  revision: 0,
});
const summary = (c: Control, id = "test", config = defaultCardConfig()) =>
  mobileCardSummary(
    { id, title: "Card", entityId: c.entity_id },
    config,
    home([c]),
    false,
    "nb",
  );

describe("phone tile readings", () => {
  it("distinguishes a measured zero, missing values and a disconnected home", () => {
    expect(
      summary(control("sensor", "0", { unit_of_measurement: "W" })).reading,
    ).toBe("0 W");
    expect(summary(control("sensor", "unknown")).unavailable).toBe(true);
    expect(
      summary(control("sensor", "20", {}, { availability: "unavailable" }))
        .unavailable,
    ).toBe(true);
    expect(
      mobileCardSummary(
        { id: "lighting", title: "Light" },
        undefined,
        home([]),
        true,
        "nb",
      ).reading,
    ).toBe("Frakoblet");
    expect(
      mobileCardSummary(
        { id: "lighting", title: "Light" },
        undefined,
        { ...home([]), connected: false },
        false,
        "en",
      ).reading,
    ).toBe("Disconnected");
  });
  it("respects explicit sources instead of substituting the original device", () => {
    const result = summary(
      control("sensor", "500"),
      "test",
      defaultCardConfig(["sensor.deleted"]),
    );
    expect(result.unavailable).toBe(true);
    expect(result.detail).toBe("Datakilden mangler");
  });
  it("normalizes metric Fahrenheit and power without treating counters as watts", () => {
    expect(
      summary(
        control("sensor", "68", { unit_of_measurement: "°F" }),
        "metric:temperature",
      ).reading,
    ).toBe("20 °C");
    expect(
      summary(control("sensor", "8300", { unit_of_measurement: "W" })).reading,
    ).toBe("8,3 kW");
    expect(
      summary(control("sensor", "8300", { unit_of_measurement: "kWh" }))
        .reading,
    ).toBe("8 300 kWh");
    expect(
      summary(control("sensor", "68", { unit_of_measurement: "°F" }), "test", {
        ...defaultCardConfig(),
        type: "graph",
      }).reading,
    ).toBe("20 °C");
  });
  it("keeps native thermostat units, actual modes and unknown targets", () => {
    const c = control("climate", "auto", {
      temperature: 72,
      current_temperature: 75,
      temperature_unit: "°F",
      hvac_action: "cooling",
    });
    expect(summary(c)).toMatchObject({
      reading: "72 °F",
      detail: "Kjøler · rommet 75°F",
      climateTone: "cool",
    });
    expect(summary({ ...c, state: "off" }).climateTone).toBe("off");
    expect(summary(control("climate", "heat", {})).reading).toBe("—");
  });
  it("counts known lights without declaring unavailable lights off", () => {
    const result = mobileCardSummary(
      { id: "lighting", title: "Lys" },
      undefined,
      home([
        control("light", "on"),
        control("light", "off", {}, { entity_id: "light.off" }),
        control("light", "unknown", {}, { entity_id: "light.unknown" }),
      ]),
      false,
      "nb",
    );
    expect(result).toMatchObject({ reading: "1 på", detail: "1 ukjent" });
  });
  it("localizes weather labels and keeps precise mixed-weather fallbacks", () => {
    expect(
      summary(
        control("weather", "rainy", {
          temperature: 7.2,
          temperature_unit: "°C",
        }),
      ),
    ).toMatchObject({ reading: "7,2°C", detail: "Regn" });
    expect(weatherLabel("fog", "en")).toBe("Fog");
    expect(weatherScene("partlycloudy", true)).toBe("night");
    expect(weatherScene("partlycloudy", false)).toBe("partly-cloudy");
    expect(weatherScene("snowy-rainy")).toBeNull();
    expect(weatherScene("unknown")).toBeNull();
  });
  it("exposes multiple graph sources and real media metadata", () => {
    const result = summary(
      control("sensor", "20", { unit_of_measurement: "°C" }),
      "test",
      { ...defaultCardConfig(["sensor.test", "sensor.other"]), type: "graph" },
    );
    expect(result.detail).toBe("2 datakilder");
    expect(
      summary(control("media_player", "playing", { media_title: "Elegi" })),
    ).toMatchObject({ reading: "Spiller", detail: "Elegi" });
  });
});
describe("display-only phone geometry", () => {
  it("packs square tiles without changing saved desktop sizes or card settings", () => {
    const saved = defaultGrid([
      { id: "a", w: 2, h: 4, config: defaultCardConfig(["light.a"]) },
      { id: "b", w: 1, h: 3 },
      { id: "c", w: 3, h: 2 },
    ]);
    const before = structuredClone(saved);
    const packed = defaultGrid(mobileGridItems(saved), 2);
    expect(saved).toEqual(before);
    expect(packed.map(({ x, y, w, h }) => ({ x, y, w, h }))).toEqual([
      { x: 0, y: 0, w: 1, h: 1 },
      { x: 1, y: 0, w: 1, h: 1 },
      { x: 0, y: 1, w: 1, h: 1 },
    ]);
    expect(packed[0].config).toEqual(saved[0].config);
  });
  it("retains room headings and square tracks when groups contain odd counts", () => {
    const saved = defaultGrid([{ id: "a" }, { id: "b" }, { id: "c" }]);
    const view = roomGridView(
      mobileGridItems(saved),
      (item) => (item.id === "c" ? "room:b" : "room:a"),
      2,
      true,
      "var(--mobile-card-row)",
    );
    expect(view.template).toContain("var(--mobile-card-row)");
    expect(view.items.every((i) => i.w === 1 && i.h === 1)).toBe(true);
    expect(view.groups).toHaveLength(2);
  });
});

it("energy module summaries retain reported values, defer to explicit sources and stop claiming live readings offline", () => {
  const card = {
    id: "energy:power",
    title: "Effekt nå",
    summary: { reading: "4,2 kW", detail: "Målt effekt", icon: "energy" },
  };
  const meter = control("sensor", "0", {
    device_class: "power",
    unit_of_measurement: "W",
  });
  expect(
    mobileCardSummary(card, undefined, home([meter]), false, "nb").reading,
  ).toBe("4,2 kW");
  expect(
    mobileCardSummary(card, undefined, home([meter]), true, "nb").reading,
  ).toBe("Frakoblet");
  expect(
    mobileCardSummary(
      card,
      defaultCardConfig([meter.entity_id]),
      home([meter]),
      false,
      "nb",
    ).reading,
  ).not.toBe("4,2 kW");
});
