import { controlState } from "./controlState";
import { sensorDisplayValue } from "./sensorValueModel";
import type { Control, Home } from "./types";

const roomNames = new WeakMap<Home["areas"], Map<string, string>>();
const deviceRooms = new WeakMap<Home["devices"], Map<string, string | null>>();

// These integrations reach devices over the local network. HA's integration
// metadata does not distinguish the device's Wi-Fi and Ethernet links.
const networkProviders = new Map([
  ["shelly", "Shelly"],
  ["esphome", "ESPHome"],
  ["tplink", "TP-Link Smart Home"],
  ["wled", "WLED"],
]);

export function deviceWorkspaceNetworkProviders(
  controls: readonly Pick<Control, "id" | "device_id" | "integration">[],
) {
  const byDevice = new Map<string, string>();
  const byControl = new Map<string, string>();
  for (const control of controls) {
    const provider = networkProviders.get(control.integration ?? "");
    if (!provider) continue;
    byControl.set(control.id, provider);
    if (control.device_id) byDevice.set(control.device_id, provider);
  }
  // Other entities attached to the same device can use a proxy integration.
  for (const control of controls) {
    const provider = control.device_id && byDevice.get(control.device_id);
    if (provider && !byControl.has(control.id))
      byControl.set(control.id, provider);
  }
  return byControl;
}

export function deviceWorkspaceRoomId(control: Control, home: Home) {
  let names = roomNames.get(home.areas);
  if (!names) {
    names = new Map(home.areas.map(({ area_id, name }) => [area_id, name]));
    roomNames.set(home.areas, names);
  }
  let assignments = deviceRooms.get(home.devices);
  if (!assignments) {
    assignments = new Map(
      home.devices.map(({ id, area_id }) => [id, area_id ?? null]),
    );
    deviceRooms.set(home.devices, assignments);
  }
  const area =
    control.area_id ||
    (control.device_id && assignments.get(control.device_id));
  return area && names.has(area) ? area : "";
}

export function deviceWorkspaceRoom(
  control: Control,
  home: Home,
  lang: string,
) {
  const id = deviceWorkspaceRoomId(control, home);
  return (
    roomNames.get(home.areas)?.get(id) ||
    (lang === "en" ? "Unassigned" : "Ufordelt")
  );
}

type Tone = "positive" | "negative" | "neutral" | "warning";

const unsafeSensor = new Set([
  "carbon_monoxide",
  "gas",
  "glass_break",
  "moisture",
  "problem",
  "safety",
  "smoke",
  "tamper",
]);

const activeClimateModes = new Set([
  "auto",
  "cool",
  "dry",
  "fan_only",
  "heat",
  "heat_cool",
]);

export function deviceWorkspaceStatus(
  control: Control,
  lang: string,
  offline: boolean,
): { label: string; tone: Tone } {
  const en = lang === "en";
  if (offline) return { label: en ? "Offline" : "Frakoblet", tone: "negative" };
  if (control.availability !== "available" || control.state === "unavailable")
    return { label: en ? "Unavailable" : "Utilgjengelig", tone: "negative" };
  if (control.state === "unknown")
    return { label: en ? "Unknown" : "Ukjent", tone: "neutral" };
  if (control.domain === "sensor") {
    const value = sensorDisplayValue(control, lang);
    return {
      label: [value.value, value.unit].filter(Boolean).join(" "),
      tone: "neutral",
    };
  }
  if (control.domain === "climate" && activeClimateModes.has(control.state))
    return { label: en ? "On" : "På", tone: "positive" };
  const label = controlState(control, control.state, lang);
  if (control.state === "triggered" || control.state === "jammed")
    return { label, tone: "warning" };
  if (
    control.domain === "binary_sensor" &&
    unsafeSensor.has(String(control.attributes.device_class))
  )
    return { label, tone: control.state === "on" ? "warning" : "positive" };
  const active = [
    "on",
    "locked",
    "closed",
    "docked",
    "playing",
    "cleaning",
    "home",
    "open",
  ].includes(control.state);
  return { label, tone: active ? "positive" : "neutral" };
}
