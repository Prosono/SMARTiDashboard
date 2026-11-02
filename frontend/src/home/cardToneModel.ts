import type { Control } from "../types";
import type { CardConfig } from "./homeGridModel";

export type CardTone =
  | "lighting"
  | "clock"
  | "calendar"
  | "energy"
  | "energy-flow"
  | "energy-use"
  | "energy-price"
  | "energy-solar"
  | "temperature"
  | "humidity"
  | "warm"
  | "fresh"
  | "cool"
  | "media"
  | "misc"
  | "plum"
  | "neutral";

function controlTone(control: Control): CardTone {
  const { domain, attributes } = control;
  const kind = String(attributes.device_class || ""),
    unit = String(attributes.unit_of_measurement || "");
  if (domain === "media_player") return "media";
  if (["scene", "script", "automation"].includes(domain)) return "plum";
  if (domain === "light") return "lighting";
  if (
    ["switch", "input_boolean"].includes(domain) ||
    (domain === "cover" && !["garage", "gate", "door"].includes(kind))
  )
    return "misc";
  if (
    ["lock", "alarm_control_panel", "binary_sensor", "cover"].includes(domain)
  )
    return "cool";
  if (domain === "climate") return "warm";
  if (kind === "temperature" || ["°C", "°F"].includes(unit))
    return "temperature";
  if (["humidity", "moisture"].includes(kind)) return "humidity";
  if (
    ["power", "energy"].includes(kind) ||
    ["W", "kW", "Wh", "kWh"].includes(unit)
  )
    return "energy";
  if (
    ["fan", "vacuum", "person"].includes(domain) ||
    [
      "humidity",
      "moisture",
      "carbon_dioxide",
      "volatile_organic_compounds",
      "pm1",
      "pm10",
      "pm25",
    ].includes(kind)
  )
    return "fresh";
  if (
    domain === "weather" ||
    ["power", "energy", "battery", "voltage", "current"].includes(kind) ||
    ["W", "kW", "Wh", "kWh"].includes(unit)
  )
    return "cool";
  return "neutral";
}

const widgetTones: Record<string, CardTone> = {
  weather: "cool",
  routines: "plum",
  scenes: "plum",
  people: "fresh",
  calendar: "calendar",
  lighting: "lighting",
  climate: "warm",
  media: "media",
  vacuum: "fresh",
  "metric:energy": "energy",
  "metric:temperature": "temperature",
  "metric:humidity": "humidity",
  "summary:alerts": "cool",
  "summary:batteries": "misc",
  "summary:connection": "misc",
};

const energyTones: Record<string, CardTone> = {
  flow: "energy-flow",
  solar: "energy-solar",
  "self-supply": "energy-solar",
  spot: "energy-price",
  prices: "energy-price",
  cost: "energy-price",
  "today-cost": "energy-price",
  breakdown: "energy-price",
  schemes: "energy-price",
  timing: "energy-price",
};

/** Presentation follows actual sources/type, never a translated or user-written title. */
export function cardTone(
  card: { id: string; entityId?: string } | undefined,
  config: CardConfig | undefined,
  controls: Control[],
): CardTone {
  if (config?.type === "clock") return "clock";
  if (config?.type === "horizon") return "cool";
  if (config?.type === "moon") return "plum";
  if (config?.type === "date") return "calendar";
  if (config?.type === "daylight") return "warm";
  const sources = config?.sources.length
    ? config.sources
    : card?.entityId
      ? [card.entityId]
      : [];
  const tones = new Set(
    sources.flatMap((id) => {
      const control = controls.find((control) => control.entity_id === id);
      return control ? [controlTone(control)] : [];
    }),
  );
  if (sources.length) return tones.size === 1 ? [...tones][0] : "neutral";
  if (card?.id.startsWith("room:")) return "fresh";
  if (card?.id.startsWith("energy:"))
    return energyTones[card.id.slice(7)] || "energy-use";
  return widgetTones[card?.id || ""] || "neutral";
}
