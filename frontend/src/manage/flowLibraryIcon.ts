import {
  BatteryLow,
  BatteryFull,
  Car,
  CloudRain,
  Droplets,
  DoorOpen,
  DoorClosed,
  Flame,
  Gauge,
  House,
  LogOut,
  Moon,
  PersonStanding,
  PlugZap,
  Power,
  Radio,
  ShieldAlert,
  Sun,
  Sunrise,
  Sunset,
  Thermometer,
  Wind,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { flowIcon, type FlowKind } from "./flowPresentation";
import { newFlowStep } from "./flowLibrary";
const icons: Record<string, LucideIcon> = {
  sunrise: Sunrise,
  sunset: Sunset,
  morning: Sunrise,
  daylight: Sun,
  evening: Moon,
  night: Moon,
  motion: PersonStanding,
  still: PersonStanding,
  home: House,
  away: LogOut,
  door: DoorOpen,
  closed: DoorClosed,
  warm: Thermometer,
  cold: Thermometer,
  humidity: Droplets,
  "humidity-low": Droplets,
  leak: Droplets,
  smoke: Flame,
  power: Gauge,
  energy: Zap,
  charging: Car,
  "charging-done": Car,
  solar: Sun,
  dark: Moon,
  "battery-low": BatteryLow,
  "battery-full": BatteryFull,
  "co2-high": Wind,
  "price-high": Zap,
  "price-low": Zap,
  "device-on": Power,
  "device-off": Power,
  unavailable: Radio,
  rain: CloudRain,
  wind: Wind,
  "alarm-active": ShieldAlert,
  "power-low": PlugZap,
};
export function flowLibraryIcon(kind: FlowKind, id?: string): LucideIcon {
  if (!id)
    return kind === "triggers"
      ? Zap
      : kind === "conditions"
        ? ShieldAlert
        : Power;
  return (
    icons[id.replace(/^preset:/, "")] || flowIcon(newFlowStep(kind, id), kind)
  );
}
