import type { Control, Home } from "../types";

const LOW_BATTERY_LEVEL = 20;
type BatteryReading = { level: number; control: Control };
type BatteryObservation = { level: number; fromAttribute: boolean };

const deviceNames = new WeakMap<Home["devices"], Map<string, string>>();
const readings = new WeakMap<
  Home["controls"],
  ReadonlyMap<string, BatteryReading>
>();

export function deviceName(control: Control, home: Home): string {
  if (control.device_name?.trim()) return control.device_name.trim();
  if (!control.device_id) return "";
  let names = deviceNames.get(home.devices);
  if (!names) {
    names = new Map(
      home.devices.map((device) => [device.id, device.name?.trim() || ""]),
    );
    deviceNames.set(home.devices, names);
  }
  return names.get(control.device_id) || "";
}

export function batteryDeviceKey(control: Control): string {
  return control.device_id
    ? `device:${control.device_id}`
    : `entity:${control.id}`;
}

export function isLowBattery(level: number | null): boolean {
  return level !== null && level < LOW_BATTERY_LEVEL;
}

function percentage(value: unknown): number | null {
  if (typeof value === "string" && value.trim()) value = Number(value);
  return typeof value === "number" && value >= 0 && value <= 100 ? value : null;
}

function observeBattery(control: Control): BatteryObservation | null {
  if (
    control.availability !== "available" ||
    control.state === "unavailable" ||
    control.state === "unknown"
  )
    return null;

  const direct = percentage(control.attributes.battery_level);
  if (direct !== null) return { level: direct, fromAttribute: true };
  if (
    control.domain === "sensor" &&
    control.attributes.device_class === "battery" &&
    control.attributes.unit_of_measurement === "%"
  ) {
    const level = percentage(control.state);
    if (level !== null) return { level, fromAttribute: false };
  }
  return null;
}

export function batteryReadings(
  home: Home,
): ReadonlyMap<string, BatteryReading> {
  const cached = readings.get(home.controls);
  if (cached) return cached;
  const result = new Map<string, BatteryReading & BatteryObservation>();
  for (const control of home.controls) {
    const observation = observeBattery(control);
    if (!observation) continue;
    const key = batteryDeviceKey(control);
    const previous = result.get(key);
    const updated = Date.parse(control.updated_at || "") || 0;
    const previousUpdate = Date.parse(previous?.control.updated_at || "") || 0;
    if (
      !previous ||
      updated > previousUpdate ||
      (updated === previousUpdate &&
        observation.fromAttribute &&
        !previous.fromAttribute)
    ) {
      result.set(key, { control, ...observation });
    }
  }
  readings.set(home.controls, result);
  return result;
}

export function deviceBattery(control: Control, home: Home): number | null {
  return (
    batteryReadings(home).get(batteryDeviceKey(control))?.level ??
    observeBattery(control)?.level ??
    null
  );
}
