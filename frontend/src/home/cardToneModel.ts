import type { Control } from "../types";
import type { CardConfig } from "./homeGridModel";

export type CardTone = "warm" | "fresh" | "cool" | "plum" | "neutral";

function controlTone(control: Control): CardTone {
  const { domain, attributes } = control;
  const kind = String(attributes.device_class || ""),
    unit = String(attributes.unit_of_measurement || "");
  if (["media_player", "scene", "script", "automation"].includes(domain))
    return "plum";
  if (
    ["lock", "alarm_control_panel", "binary_sensor", "cover"].includes(domain)
  )
    return "cool";
  if (
    domain === "light" ||
    domain === "climate" ||
    kind === "temperature" ||
    ["°C", "°F"].includes(unit)
  )
    return "warm";
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
    ["weather", "switch", "input_boolean"].includes(domain) ||
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
  calendar: "warm",
  lighting: "warm",
  climate: "warm",
  media: "plum",
  vacuum: "fresh",
  "metric:energy": "cool",
  "metric:temperature": "warm",
  "metric:humidity": "fresh",
  "summary:alerts": "cool",
  "summary:batteries": "cool",
  "summary:connection": "cool",
};

/** Presentation follows actual sources/type, never a translated or user-written title. */
export function cardTone(
  card: { id: string; entityId?: string } | undefined,
  config: CardConfig | undefined,
  controls: Control[],
): CardTone {
  if (config?.type === "clock" || config?.type === "horizon") return "cool";
  if (config?.type === "moon") return "plum";
  if (config?.type === "date" || config?.type === "daylight") return "warm";
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
  return widgetTones[card?.id || ""] || "neutral";
}
