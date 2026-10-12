import type { Control, Home } from "../types";
export const usable = (c: Control) =>
  c.availability === "available" &&
  (c.domain === "scene"
    ? c.state !== "unavailable"
    : !["unknown", "unavailable"].includes(c.state));
export function numeric(c: Control): number | null {
  if (!usable(c) || !c.state.trim()) return null;
  const value = Number(c.state);
  return Number.isFinite(value) ? value : null;
}
export function temperature(c: Control): number | null {
  const raw =
    c.domain === "climate" ? c.attributes.current_temperature : numeric(c);
  const unit =
    c.attributes.temperature_unit || c.attributes.unit_of_measurement;
  if (!usable(c) || typeof raw !== "number" || !Number.isFinite(raw))
    return null;
  return unit === "°F" ? ((raw - 32) * 5) / 9 : unit === "°C" ? raw : null;
}
export function overview(h: Home) {
  const controls = h.controls.filter(
    (c) => !c.diagnostic && c.domain !== "automation",
  );
  const byRoom = new Map<string, Control[]>();
  for (const c of controls) {
    if (c.area_id) {
      const list = byRoom.get(c.area_id) || [];
      list.push(c);
      byRoom.set(c.area_id, list);
    }
  }
  const temperatures = controls.filter(
    (c) =>
      c.area_id &&
      (c.domain === "climate" ||
        c.attributes.device_class === "temperature" ||
        (!c.attributes.device_class &&
          ["°C", "°F"].includes(String(c.attributes.unit_of_measurement)))) &&
      temperature(c) !== null,
  );
  // One representative reading per room avoids weighting rooms by sensor count.
  const roomTemps = h.areas.flatMap((a) => {
    const c = temperatures.find((c) => c.area_id === a.area_id);
    return c ? [temperature(c)!] : [];
  });
  const security = controls.filter(
    (c) =>
      ["lock", "alarm_control_panel"].includes(c.domain) ||
      (c.domain === "cover" &&
        ["garage", "gate"].includes(String(c.attributes.device_class))) ||
      (c.domain === "binary_sensor" &&
        [
          "door",
          "window",
          "opening",
          "garage_door",
          "motion",
          "smoke",
          "gas",
          "moisture",
          "safety",
        ].includes(String(c.attributes.device_class))),
  );
  const severity = (c: Control) => {
    if (!usable(c)) return 2;
    if (c.domain === "lock")
      return c.state === "locked" ? 0 : c.state === "unlocked" ? 1 : 2;
    if (c.domain === "alarm_control_panel")
      return c.state === "triggered"
        ? 3
        : [
              "disarmed",
              "armed_home",
              "armed_away",
              "armed_night",
              "armed_vacation",
              "armed_custom_bypass",
            ].includes(c.state)
          ? 0
          : 2;
    if (c.domain === "cover")
      return c.state === "closed"
        ? 0
        : ["open", "opening", "closing"].includes(c.state)
          ? 1
          : 2;
    if (!["on", "off"].includes(c.state)) return 2;
    return c.state === "on" &&
      ["smoke", "gas", "moisture", "safety"].includes(
        String(c.attributes.device_class),
      )
      ? 3
      : c.state === "on"
        ? 1
        : 0;
  };
  return {
    controls,
    byRoom,
    temperature: roomTemps.length
      ? roomTemps.reduce((a, b) => a + b, 0) / roomTemps.length
      : null,
    temperatureRooms: roomTemps.length,
    security: security.sort((a, b) => severity(b) - severity(a)),
    alerts: security.filter((c) => severity(c) >= 2),
    open: security.filter((c) => severity(c) === 1),
    meters: controls.filter(
      (c) =>
        c.domain === "sensor" &&
        ["W", "kW", "Wh", "kWh"].includes(
          String(c.attributes.unit_of_measurement),
        ) &&
        (!c.attributes.device_class ||
          ["power", "energy"].includes(String(c.attributes.device_class))),
    ),
    cameras: controls.filter((c) => c.domain === "camera"),
    weather: controls.find((c) => c.domain === "weather" && usable(c)),
    air: controls.filter((c) =>
      ["humidity", "carbon_dioxide", "aqi", "pm25"].includes(
        String(c.attributes.device_class),
      ),
    ),
    charging: controls.filter(
      (c) =>
        c.attributes.device_class === "battery_charging" ||
        ["ocpp", "easee", "zaptec", "wallbox", "tesla_wall_connector"].includes(
          c.integration || "",
        ),
    ),
    unavailable: controls.filter((c) => !usable(c)),
  };
}
export function reading(c: Control, lang: string) {
  const n = numeric(c);
  return n === null
    ? lang === "en"
      ? "Unavailable"
      : "Utilgjengelig"
    : `${n.toLocaleString(lang === "en" ? "en-GB" : "nb-NO", { maximumFractionDigits: 1 })} ${String(c.attributes.unit_of_measurement || "")}`;
}
