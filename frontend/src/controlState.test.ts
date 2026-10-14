import { describe, expect, it } from "vitest";
import { controlState } from "./controlState";
const sensor = (device_class: string) => ({
  domain: "binary_sensor",
  attributes: { device_class },
});
describe("semantic device status", () => {
  it.each(["door", "window", "opening", "garage_door"])(
    "keeps HA normalized %s contact polarity",
    (kind) => {
      expect(controlState(sensor(kind), "on", "nb")).toBe("Åpen");
      expect(controlState(sensor(kind), "off", "nb")).toBe("Lukket");
      expect(controlState(sensor(kind), "on", "en")).toBe("Open");
      expect(controlState(sensor(kind), "off", "en")).toBe("Closed");
    },
  );
  it.each([
    ["battery", "Low battery", "Normal battery"],
    ["lock", "Unlocked", "Locked"],
    ["safety", "Unsafe", "Safe"],
    ["moisture", "Wet", "Dry"],
    ["motion", "Motion detected", "No motion"],
    ["smoke", "Smoke detected", "Clear"],
    ["connectivity", "Connected", "Disconnected"],
  ])("uses %s meaning", (kind, on, off) => {
    expect(controlState(sensor(kind), "on", "en")).toBe(on);
    expect(controlState(sensor(kind), "off", "en")).toBe(off);
  });
  it("does not interpret unknown data as safe or closed", () => {
    expect(controlState(sensor("door"), "unknown", "nb")).toBe("Ukjent");
    expect(controlState(sensor("door"), "unavailable", "nb")).toBe(
      "Utilgjengelig",
    );
    expect(controlState(sensor("smoke"), "unexpected", "nb")).toBe(
      "unexpected",
    );
  });
  it("preserves switch semantics and numeric measurements", () => {
    expect(
      controlState(
        { domain: "switch", attributes: { device_class: "door" } },
        "on",
        "nb",
      ),
    ).toBe("På");
    expect(controlState(undefined, "21.5", "nb")).toBe("21.5");
    expect(controlState(sensor("future_class"), "off", "en")).toBe("Off");
  });
});
