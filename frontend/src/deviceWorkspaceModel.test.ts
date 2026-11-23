import { expect, it } from "vitest";
import { deviceWorkspaceNetworkProviders } from "./deviceWorkspaceModel";

it("classifies network controls from their integration and physical device", () => {
  const controls = [
    { id: "relay", device_id: "shelly-1pm", integration: "shelly" },
    {
      id: "aliased-light",
      device_id: "shelly-1pm",
      integration: "switch_as_x",
    },
    { id: "temperature", device_id: "esp-probe", integration: "esphome" },
    { id: "plug", device_id: "tapo-plug", integration: "tplink" },
    { id: "led-strip", device_id: null, integration: "wled" },
    { id: "unknown-mqtt", device_id: "zigbee-plug", integration: "mqtt" },
    { id: "matter-light", device_id: "matter-light", integration: "matter" },
    { id: "unlinked", device_id: null, integration: "switch_as_x" },
  ];

  expect(deviceWorkspaceNetworkProviders(controls)).toEqual(
    new Map([
      ["relay", "Shelly"],
      ["aliased-light", "Shelly"],
      ["temperature", "ESPHome"],
      ["plug", "TP-Link Smart Home"],
      ["led-strip", "WLED"],
    ]),
  );
});
