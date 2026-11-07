import type { Control } from "../types";
import { hasAirConditionerHint } from "./equipmentModel";

export function monetarySensor(c: Control) {
  return (
    c.attributes.device_class === "monetary" ||
    /^(NOK|SEK|DKK|EUR|USD|GBP|kr|øre|öre|€|\$|£)(\/kWh)?$/i.test(
      String(c.attributes.unit_of_measurement || "").trim(),
    )
  );
}

/** Illustrative categories for measured and computed entities; never a claimed product model. */
export function sensorArtworkKind(c: Control): string | null {
  if (c.domain !== "sensor") return null;
  const dc = String(c.attributes.device_class || "");
  const unit = String(c.attributes.unit_of_measurement || "").trim();
  const hints = [
    c.entity_id,
    c.name,
    c.device_name,
    c.integration,
    c.attributes.icon,
  ]
    .filter((v) => typeof v === "string")
    .join(" ")
    .toLowerCase()
    .replace(/[_-]/g, " ");
  if (dc === "battery") return "battery";
  if (monetarySensor(c)) return "money";
  if (["power", "energy"].includes(dc) || /^(k?W|k?Wh|MW|MWh)$/.test(unit))
    return "meter";
  if (/\bbackup\b|sikkerhetskop|database backup|backup restore/.test(hints))
    return "backup";
  if (hasAirConditionerHint(c)) return "air-conditioner";
  if (
    /people|person count|personer|occupancy|people inside|account group/.test(
      hints,
    )
  )
    return "presence";
  if (dc === "timestamp" || dc === "date") return "calendar";
  if (
    [
      "temperature",
      "humidity",
      "pressure",
      "carbon_dioxide",
      "volatile_organic_compounds",
    ].includes(dc) ||
    ["°C", "°F", "hPa", "ppm"].includes(unit)
  )
    return "environment";
  return "data";
}

export function sensorDeviceArtwork(c: Control): string | null {
  const kind = sensorArtworkKind(c);
  return kind
    ? new URL(`home/equipment/${kind}.webp`, document.baseURI).href
    : null;
}
