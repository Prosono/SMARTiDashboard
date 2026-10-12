import type { Home } from "../types";
import { words } from "./shared";
export function entityState(
  id: string,
  state: unknown,
  home: Home,
  lang: string,
): string {
  const t = (nb: string, en: string) => words(lang, nb, en),
    c = home.controls.find((x) => x.entity_id === id);
  if (state === "unavailable") return t("Frakoblet", "Offline");
  if (state === "unknown" || state == null) return t("Ukjent", "Unknown");
  if (state === "on" || state === "off") {
    const on = state === "on",
      type = String(c?.attributes.device_class);
    if (["door", "window", "opening"].includes(type))
      return on ? t("Åpen", "Open") : t("Lukket", "Closed");
    if (["motion", "occupancy", "presence"].includes(type))
      return on
        ? t("Aktivitet", "Activity")
        : t("Ingen aktivitet", "No activity");
    if (c?.domain === "binary_sensor")
      return on ? t("Aktiv", "Active") : t("Inaktiv", "Inactive");
    return on ? t("På", "On") : t("Av", "Off");
  }
  return String(state);
}
