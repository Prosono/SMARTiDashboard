import { describe, expect, it } from "vitest";
import type { Control, Home } from "../types";
import {
  deviceBattery,
  deviceReading,
  equipmentArt,
  finiteReading,
  lightColor,
  lightPercentage,
  securityAttention,
} from "./equipmentModel";

const control = (changes: Partial<Control> = {}): Control => ({
  id: "light.one",
  entity_id: "light.one",
  name: "Stuelampe",
  domain: "light",
  state: "on",
  area_id: "living",
  device_id: "d1",
  availability: "available",
  updated_at: null,
  integration: null,
  diagnostic: false,
  attributes: {},
  capabilities: [],
  ...changes,
});
const home = (controls: Control[]) => ({ controls }) as Home;

describe("equipment card data", () => {
  it("keeps lighting types distinct and honors the resident's explicit choice", () => {
    for (const [name, kind] of [
      ["LED lysskinne", "track"],
      ["Spottskinne stue", "track"],
      ["Utelys", "outdoor"],
      ["Spot kjøkken", "spot"],
      ["Taklampe", "ceiling"],
      ["Bordlampe", "desk"],
      ["Gulvlampe", "floor"],
      ["LED-list", "strip"],
      ["LED taklampe", "ceiling"],
      ["LED spot", "spot"],
      ["LED lyspære", "bulb"],
    ]) {
      expect(equipmentArt(control({ name }))).toBe(kind);
    }
    expect(
      equipmentArt(
        control({ name: "LED-list", attributes: { smarti_icon: "track" } }),
      ),
    ).toBe("track");
    expect(
      equipmentArt(
        control({ name: "Lysskinne", attributes: { smarti_icon: "sun" } }),
      ),
    ).toBe("spot");
  });
  it("uses charger artwork only with explicit EV hints, preserving ordinary switches and phone chargers", () => {
    expect(
      equipmentArt(control({ domain: "switch", name: "Elbillader garasje" })),
    ).toBe("charger");
    expect(
      equipmentArt(
        control({
          domain: "switch",
          name: "Lading",
          attributes: { icon: "mdi:ev-station" },
        }),
      ),
    ).toBe("charger");
    expect(
      equipmentArt(
        control({ domain: "switch", name: "Smart stikkontakt lader telefon" }),
      ),
    ).toBe("plug");
    expect(equipmentArt(control({ domain: "switch", name: "Lysbryter" }))).toBe(
      "switch",
    );
    for (const [device_class, kind] of [
      ["motion", "movement"],
      ["occupancy", "presence"],
      ["moisture", "leak"],
      ["smoke", "smoke"],
    ])
      expect(
        equipmentArt(
          control({ domain: "binary_sensor", attributes: { device_class } }),
        ),
      ).toBe(kind);
  });
  it("respects chosen light art and distinguishes actual cover and sensor classes", () => {
    expect(equipmentArt(control({ domain: "climate", name: "Stue AC" }))).toBe(
      "air-conditioner",
    );
    expect(
      equipmentArt(control({ domain: "climate", name: "Gulvvarme" })),
    ).toBe("thermostat");
    expect(equipmentArt(control({ domain: "fan" }))).toBe("fan");
    expect(equipmentArt(control({ domain: "alarm_control_panel" }))).toBe(
      "alarm",
    );
    expect(
      equipmentArt(
        control({ name: "LED kjøkken", attributes: { smarti_icon: "floor" } }),
      ),
    ).toBe("floor");
    expect(equipmentArt(control({ name: "LED kjøkken" }))).toBe("strip");
    for (const [device_class, kind] of [
      ["curtain", "curtain"],
      ["awning", "awning"],
      ["garage", "garage"],
      ["shade", "roller"],
    ])
      expect(
        equipmentArt(
          control({ domain: "cover", attributes: { device_class } }),
        ),
      ).toBe(kind);
    expect(
      equipmentArt(
        control({
          domain: "binary_sensor",
          attributes: { device_class: "smoke" },
        }),
      ),
    ).toBe("smoke");
    expect(equipmentArt(control({ domain: "switch", name: "Takvarme" }))).toBe(
      "switch",
    );
  });
  it("never turns missing, nonfinite, strings, or invalid measurements into readings", () => {
    for (const value of [null, undefined, NaN, Infinity, "42", true, -1, 101])
      expect(finiteReading(value, 0, 100)).toBeNull();
    expect(finiteReading(0, 0, 100)).toBe(0);
    expect(lightPercentage(control({ attributes: { brightness: 255 } }))).toBe(
      100,
    );
    expect(
      lightPercentage(control({ attributes: { brightness: 500 } })),
    ).toBeNull();
    expect(lightPercentage(control({ state: "off" }))).toBe(0);
    expect(
      lightColor(control({ attributes: { rgb_color: [255, 60, 120] } })),
    ).toBe("rgb(255 60 120)");
    expect(
      lightColor(control({ attributes: { rgb_color: [NaN, 60, 120] } })),
    ).toBe("#ffb347");
  });
  it("uses only one unambiguous real measurement from the same physical device", () => {
    const device = control({ domain: "switch" });
    const power = control({
      id: "sensor.power",
      domain: "sensor",
      state: "134",
      attributes: { device_class: "power", unit_of_measurement: "W" },
    });
    expect(deviceReading(device, home([power]), "power")).toBe(power);
    expect(
      deviceReading(
        { ...device, device_id: null },
        home([{ ...power, device_id: null }]),
        "power",
      ),
    ).toBeUndefined();
    expect(
      deviceReading(device, home([{ ...power, device_id: "other" }]), "power"),
    ).toBeUndefined();
    expect(
      deviceReading(
        device,
        home([power, { ...power, id: "another" }]),
        "power",
      ),
    ).toBeUndefined();
    expect(
      deviceReading(
        device,
        home([{ ...power, availability: "unavailable" }]),
        "power",
      ),
    ).toBeUndefined();
  });
  it("keeps real zero battery values and distinguishes active safety alerts from normal/open states", () => {
    const sensor = control({
      domain: "sensor",
      state: "82",
      attributes: { device_class: "battery", unit_of_measurement: "%" },
    });
    expect(
      deviceBattery(
        control({ attributes: { battery_level: 0 } }),
        home([sensor]),
      ),
    ).toBe(0);
    expect(deviceBattery(control(), home([sensor]))).toBe(82);
    expect(
      deviceBattery(control(), home([{ ...sensor, state: "unknown" }])),
    ).toBeNull();
    expect(
      securityAttention(
        control({
          domain: "binary_sensor",
          attributes: { device_class: "moisture" },
        }),
      ),
    ).toBe(true);
    expect(
      securityAttention(
        control({
          domain: "binary_sensor",
          attributes: { device_class: "door" },
        }),
      ),
    ).toBe(false);
    expect(
      securityAttention(
        control({
          domain: "binary_sensor",
          availability: "unavailable",
          attributes: { device_class: "smoke" },
        }),
      ),
    ).toBe(false);
  });
});
