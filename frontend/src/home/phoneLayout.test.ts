import { describe, expect, it } from "vitest";
import { phoneItems, phoneDeviceSize } from "./phoneLayout";
import type { Control } from "../types";
import { defaultCardConfig } from "./cardConfigModel";

describe("phone display adaptation", () => {
  it("keeps saved geometry and custom source configuration intact while prioritising wide alerts", () => {
    const items = [
      { id: "camera", x: 0, y: 0, w: 3, h: 4 },
      {
        id: "alert",
        x: 1,
        y: 4,
        w: 2,
        h: 2,
        config: {
          ...defaultCardConfig(["binary_sensor.door"]),
          title: "My door",
        },
      },
    ];
    const before = structuredClone(items);
    const adapted = phoneItems(
      items,
      (item) => ({
        w: 2,
        h: item.id === "alert" ? 1 : 2,
        order: item.id === "alert" ? 0 : 1,
      }),
      true,
    );
    expect(adapted.map((item) => item.id)).toEqual(["alert", "camera"]);
    expect(adapted[0].config).toEqual(items[1].config);
    expect(items).toEqual(before);
  });
  it("gives unavailable and alarm sensors prominence without treating a normal open contact as an alarm", () => {
    const sensor = {
      domain: "binary_sensor",
      state: "off",
      availability: "available",
      attributes: { device_class: "smoke" },
      id: "binary_sensor.test",
      entity_id: "binary_sensor.test",
      device_id: null,
      area_id: null,
      name: "Sensor",
      capabilities: [],
      diagnostic: false,
      integration: null,
      updated_at: null,
    } as Control;
    expect(phoneDeviceSize(sensor).w).toBe(1);
    expect(phoneDeviceSize({ ...sensor, state: "on" }).w).toBe(2);
    expect(phoneDeviceSize({ ...sensor, availability: "unavailable" }).w).toBe(
      2,
    );
    expect(
      phoneDeviceSize({
        ...sensor,
        state: "on",
        attributes: { device_class: "window" },
      }).w,
    ).toBe(1);
  });
});
