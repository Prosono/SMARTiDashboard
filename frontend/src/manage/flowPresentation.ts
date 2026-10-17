import {
  AlarmClock,
  Bell,
  CalendarClock,
  CheckCheck,
  Clock3,
  DoorOpen,
  Fan,
  GitBranch,
  House,
  Layers,
  Lightbulb,
  ListOrdered,
  LockKeyhole,
  MapPin,
  Music2,
  PersonStanding,
  Radio,
  Repeat2,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Square,
  Sun,
  Sunrise,
  Sunset,
  Thermometer,
  Timer,
  ToggleLeft,
  Variable,
  Workflow,
  Zap,
} from "lucide-react";
import type { Home } from "../types";
import type { FlowPath } from "./flowStructure";
export type FlowKind = "triggers" | "conditions" | "actions";
export function kindAtPath(path: FlowPath): FlowKind {
  let kind: FlowKind = "actions";
  for (const part of path) {
    if (["triggers", "trigger", "wait_for_trigger"].includes(String(part)))
      kind = "triggers";
    if (
      [
        "conditions",
        "condition",
        "if",
        "while",
        "until",
        "and",
        "or",
        "not",
      ].includes(String(part))
    )
      kind = "conditions";
    if (
      ["actions", "sequence", "then", "else", "default", "parallel"].includes(
        String(part),
      )
    )
      kind = "actions";
  }
  return kind;
}
export function flowIcon(row: any, kind: FlowKind, home?: Home) {
  if (typeof row === "string") return Variable;
  if (!row || typeof row !== "object") return Workflow;
  if ("choose" in row || "if" in row) return GitBranch;
  if ("repeat" in row) return Repeat2;
  if ("parallel" in row) return Layers;
  if ("delay" in row) return Timer;
  if ("wait_template" in row || "wait_for_trigger" in row) return Clock3;
  if ("stop" in row) return Square;
  if ("variables" in row) return Variable;
  if ("sequence" in row) return ListOrdered;
  const type = String(
    row.trigger ||
      row.platform ||
      row.condition ||
      row.action ||
      row.service ||
      "",
  );
  if (type === "time" || type === "time_pattern") return AlarmClock;
  if (type === "sun")
    return row.event === "sunrise"
      ? Sunrise
      : row.event === "sunset"
        ? Sunset
        : Sun;
  if (type === "calendar") return CalendarClock;
  if (type === "template") return Variable;
  if (
    ["and", "or", "not", "trigger"].includes(type) ||
    row.and ||
    row.or ||
    row.not
  )
    return CheckCheck;
  if (type === "zone" || type.startsWith("zone.")) return MapPin;
  const id = Array.isArray(row.entity_id) ? row.entity_id[0] : row.entity_id;
  const cls = home?.controls.find((c) => c.entity_id === id)?.attributes
    ?.device_class;
  if (
    ["door", "window", "opening", "garage_door"].includes(String(cls)) ||
    type.startsWith("door.") ||
    type.startsWith("window.")
  )
    return DoorOpen;
  if (
    ["motion", "occupancy", "presence"].includes(String(cls)) ||
    /motion|occupancy/.test(type)
  )
    return PersonStanding;
  if (cls === "temperature" || type.startsWith("climate.")) return Thermometer;
  if (type.startsWith("light.")) return Lightbulb;
  if (type.startsWith("switch.") || type.startsWith("input_boolean."))
    return ToggleLeft;
  if (type.startsWith("notify.")) return Bell;
  if (type.startsWith("lock.")) return LockKeyhole;
  if (type.startsWith("alarm_control_panel.")) return Shield;
  if (type.startsWith("media_player.")) return Music2;
  if (type.startsWith("fan.")) return Fan;
  if (type.startsWith("scene.")) return Sparkles;
  if (type === "homeassistant") return House;
  if (type === "numeric_state") return SlidersHorizontal;
  return kind === "actions" ? Zap : Radio;
}
