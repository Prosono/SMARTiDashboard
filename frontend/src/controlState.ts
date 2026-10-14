import type { Control } from "./types";

type Labels = [string, string, string, string]; // on/off Norwegian, on/off English
const binaryLabels: Record<string, Labels> = {
  door: ["Åpen", "Lukket", "Open", "Closed"],
  window: ["Åpen", "Lukket", "Open", "Closed"],
  opening: ["Åpen", "Lukket", "Open", "Closed"],
  garage_door: ["Åpen", "Lukket", "Open", "Closed"],
  motion: ["Bevegelse", "Ingen bevegelse", "Motion detected", "No motion"],
  occupancy: ["Tilstedeværelse", "Ingen tilstedeværelse", "Occupied", "Clear"],
  presence: ["Hjemme", "Borte", "Home", "Away"],
  moisture: ["Vått", "Tørt", "Wet", "Dry"],
  smoke: ["Røyk oppdaget", "Ingen røyk", "Smoke detected", "Clear"],
  gas: ["Gass oppdaget", "Ingen gass", "Gas detected", "Clear"],
  carbon_monoxide: [
    "Karbonmonoksid oppdaget",
    "Ingen karbonmonoksid",
    "Carbon monoxide detected",
    "Clear",
  ],
  glass_break: [
    "Glassbrudd oppdaget",
    "Ingen glassbrudd",
    "Glass break detected",
    "Clear",
  ],
  battery: ["Lavt batteri", "Normalt batteri", "Low battery", "Normal battery"],
  battery_charging: ["Lader", "Lader ikke", "Charging", "Not charging"],
  connectivity: ["Tilkoblet", "Frakoblet", "Connected", "Disconnected"],
  lock: ["Ulåst", "Låst", "Unlocked", "Locked"],
  tamper: [
    "Manipulering oppdaget",
    "Ingen manipulering",
    "Tampering detected",
    "Clear",
  ],
  problem: ["Problem", "OK", "Problem", "OK"],
  safety: ["Utrygt", "Trygt", "Unsafe", "Safe"],
  vibration: ["Vibrasjon", "Ingen vibrasjon", "Vibration detected", "Clear"],
  sound: ["Lyd oppdaget", "Ingen lyd", "Sound detected", "Clear"],
  light: ["Lys oppdaget", "Ingen lys", "Light detected", "No light"],
  cold: ["Kaldt", "Normalt", "Cold", "Normal"],
  heat: ["Varmt", "Normalt", "Hot", "Normal"],
  moving: ["I bevegelse", "I ro", "Moving", "Not moving"],
  running: ["Kjører", "Kjører ikke", "Running", "Not running"],
  plug: ["Plugget inn", "Frakoblet", "Plugged in", "Unplugged"],
  power: ["På", "Av", "On", "Off"],
  update: [
    "Oppdatering tilgjengelig",
    "Oppdatert",
    "Update available",
    "Up-to-date",
  ],
};

// Only translate presentation. Never change the raw value sent to services or automations.
// HA normalizes Z2M contact values: binary_sensor on means open, off means closed.
export function controlState(
  control: Pick<Control, "domain" | "attributes"> | undefined,
  state: unknown,
  lang: string,
): string {
  const en = lang === "en";
  if (state == null || state === "unknown") return en ? "Unknown" : "Ukjent";
  if (state === "unavailable") return en ? "Unavailable" : "Utilgjengelig";
  if (state === "on" || state === "off") {
    const labels =
      control?.domain === "binary_sensor"
        ? binaryLabels[String(control.attributes.device_class)]
        : undefined;
    if (labels) return labels[(en ? 2 : 0) + (state === "off" ? 1 : 0)];
    return state === "on" ? (en ? "On" : "På") : en ? "Off" : "Av";
  }
  if (control?.domain === "lock") {
    if (state === "locked") return en ? "Locked" : "Låst";
    if (state === "unlocked") return en ? "Unlocked" : "Ulåst";
  }
  return String(state);
}
