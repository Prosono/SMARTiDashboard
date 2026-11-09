import { controlState } from "./controlState";
import type { Control } from "./types";

export type HouseLogEntry = {
  when: string;
  name: string | null;
  entity_id: string | null;
  state: string | null;
  message: string | null;
  context_name: string | null;
  context_entity_id: string | null;
};
export const houseLogCategories = [
  ["lights", "Lys og brytere", "Lights and switches"],
  ["security", "Sikkerhet", "Security"],
  ["people", "Tilstedeværelse", "Presence"],
  ["automations", "Automasjoner og scener", "Automations and scenes"],
  ["climate", "Klima", "Climate"],
  ["media", "Multimedia", "Media"],
  ["other", "Andre hendelser", "Other events"],
] as const;
export type HouseLogCategory = (typeof houseLogCategories)[number][0];

export function houseLogCategory(
  entry: HouseLogEntry,
  control?: Control,
): HouseLogCategory {
  const domain = control?.domain || entry.entity_id?.split(".")[0];
  const kind =
    typeof control?.attributes.device_class === "string"
      ? control.attributes.device_class
      : "";
  if (["light", "switch", "input_boolean"].includes(domain || ""))
    return "lights";
  if (["person", "device_tracker"].includes(domain || "")) return "people";
  if (["automation", "script", "scene"].includes(domain || ""))
    return "automations";
  if (
    ["lock", "alarm_control_panel", "camera"].includes(domain || "") ||
    [
      "door",
      "window",
      "opening",
      "garage_door",
      "motion",
      "occupancy",
      "smoke",
      "gas",
      "carbon_monoxide",
      "moisture",
      "tamper",
      "safety",
    ].includes(kind)
  )
    return "security";
  if (
    ["climate", "fan", "humidifier", "weather"].includes(domain || "") ||
    ["temperature", "humidity", "carbon_dioxide", "pressure"].includes(kind)
  )
    return "climate";
  if (domain === "media_player") return "media";
  return "other";
}

export function houseLogMessage(
  entry: HouseLogEntry,
  control: Control | undefined,
  lang: string,
) {
  return (
    entry.message ||
    (entry.state != null ? controlState(control, entry.state, lang) : "") ||
    (lang === "en" ? "Activity recorded" : "Aktivitet registrert")
  );
}

export function filterHouseLog(
  entries: readonly HouseLogEntry[],
  controls: ReadonlyMap<string, Control>,
  filter: { text: string; area: string; category: string },
  lang: string,
) {
  const search = filter.text.trim().toLocaleLowerCase();
  return entries
    .filter((entry) => {
      const control = controls.get(entry.entity_id || "");
      return (
        (!filter.area || control?.area_id === filter.area) &&
        (!filter.category ||
          houseLogCategory(entry, control) === filter.category) &&
        (!search ||
          [
            entry.name,
            control?.name,
            entry.entity_id,
            houseLogMessage(entry, control, lang),
            entry.context_name,
            entry.context_entity_id,
          ]
            .join(" ")
            .toLocaleLowerCase()
            .includes(search))
      );
    })
    .slice()
    .sort((a, b) => {
      const stamp = (value: string) =>
        Number.isFinite(Date.parse(value)) ? Date.parse(value) : -Infinity;
      return stamp(b.when) - stamp(a.when) || 0;
    });
}

export function houseLogDays(
  entries: readonly HouseLogEntry[],
  lang: string,
  timeZone?: string,
) {
  const locale = lang === "en" ? "en-GB" : "nb-NO";
  const keyFormat = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  });
  const titleFormat = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  });
  const groups = new Map<
    string,
    { key: string; title: string; entries: HouseLogEntry[] }
  >();
  for (const entry of entries) {
    const date = new Date(entry.when),
      valid = Number.isFinite(+date);
    const key = valid ? keyFormat.format(date) : "unknown";
    if (!groups.has(key))
      groups.set(key, {
        key,
        title: valid
          ? titleFormat.format(date)
          : lang === "en"
            ? "Unknown date"
            : "Ukjent dato",
        entries: [],
      });
    groups.get(key)!.entries.push(entry);
  }
  return [...groups.values()];
}
