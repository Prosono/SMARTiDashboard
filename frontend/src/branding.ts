import type { Home } from "./types";
// Display-only branding. Never apply to entity IDs, domains, URLs or saved configs.
export function smartiName(value: string): string {
  return value
    .replace(/\bhome[\s_-]*assistant\b/gi, "SMARTi")
    .replace(/\bHA\b/g, "SMARTi");
}
export function isSmartiIntegration(domain: string): boolean {
  return (
    ["homeassistant", "home_assistant", "hassio", "hass"].includes(domain) ||
    domain.startsWith("homeassistant_")
  );
}
export function integrationName(domain: string): string {
  return isSmartiIntegration(domain)
    ? "SMARTi"
    : smartiName(domain.replaceAll("_", " "));
}

export function homeDisplay(home: Home): Home {
  return {
    ...home,
    home_name: smartiName(home.home_name),
    controls: home.controls.map((c) => ({ ...c, name: smartiName(c.name) })),
  };
}
