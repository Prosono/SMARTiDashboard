import {
  Activity,
  Battery,
  Blinds,
  CalendarDays,
  Camera,
  Droplets,
  Fan,
  LockKeyhole,
  Plug,
  ShieldCheck,
  Sparkles,
  Thermometer,
  UnlockKeyhole,
} from "lucide-react";
import { lightIcon } from "../LightAppearance";
import { mediaIcon } from "../MediaIcons";
import type { Control } from "../types";
import { RobotVacuumIcon } from "./RobotVacuumIcon";

/** Shared by dashboard cards, the device inventory and device details. */
export function deviceAppearance(c: Control) {
  const dc = c.attributes.device_class;
  if (c.domain === "sensor" && dc === "battery")
    return { Icon: Battery, tone: "energy" };
  if (c.domain === "light") return { Icon: lightIcon(c), tone: "light" };
  if (c.domain === "climate" || dc === "temperature")
    return { Icon: Thermometer, tone: "climate" };
  if (dc === "humidity" || dc === "moisture")
    return { Icon: Droplets, tone: "air" };
  if (c.domain === "fan") return { Icon: Fan, tone: "air" };
  if (c.domain === "switch") return { Icon: Plug, tone: "energy" };
  if (c.domain === "lock")
    return {
      Icon: c.state === "locked" ? LockKeyhole : UnlockKeyhole,
      tone: "security",
    };
  if (c.domain === "cover") return { Icon: Blinds, tone: "shade" };
  if (c.domain === "media_player") return { Icon: mediaIcon(c), tone: "media" };
  if (c.domain === "vacuum") return { Icon: RobotVacuumIcon, tone: "cleaning" };
  if (c.domain === "camera") return { Icon: Camera, tone: "security" };
  if (c.domain === "calendar") return { Icon: CalendarDays, tone: "neutral" };
  if (["scene", "script"].includes(c.domain))
    return { Icon: Sparkles, tone: "light" };
  if (["power", "energy"].includes(String(dc)))
    return { Icon: Plug, tone: "energy" };
  if (["binary_sensor", "alarm_control_panel"].includes(c.domain))
    return { Icon: ShieldCheck, tone: "security" };
  return { Icon: Activity, tone: "neutral" };
}

/** Match registry IDs, never names; prefer the device function over diagnostics. */
export function primaryDeviceControl(
  controls: Control[],
  deviceId?: string | null,
) {
  const candidates =
    deviceId === undefined
      ? controls
      : deviceId
        ? controls.filter((c) => c.device_id === deviceId)
        : [];
  return (
    candidates.find(
      (c) =>
        !c.diagnostic && !["sensor", "button", "update"].includes(c.domain),
    ) ||
    candidates.find((c) => !c.diagnostic) ||
    candidates[0]
  );
}
