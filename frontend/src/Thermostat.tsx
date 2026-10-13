import {
  Flame,
  Snowflake,
  Power,
  Fan,
  Droplets,
  Minus,
  Plus,
} from "lucide-react";
import type { Control } from "./types";
import "./thermostat.css";

export function Thermostat({
  c,
  lang,
  disabled,
  change,
}: {
  c: Control;
  lang: string;
  disabled: boolean;
  change: (value: number) => void;
}) {
  const en = lang === "en",
    t = (nb: string, english: string) => (en ? english : nb);
  const cap = c.capabilities.find((v) => v.actions.includes("set_temperature"));
  const available = !disabled && c.availability === "available";
  const known = c.availability === "available";
  const n = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  const target = n(c.attributes.temperature),
    current = n(c.attributes.current_temperature);
  const min = cap?.minimum ?? null,
    max = cap?.maximum ?? null,
    step = cap?.step ?? null;
  const unit = String(c.attributes.temperature_unit || cap?.unit || "°");
  const modes: Record<string, string> = {
    heat: t("Varme", "Heat"),
    cool: t("Kjøling", "Cool"),
    heat_cool: t("Varme / kjøling", "Heat / cool"),
    auto: "Auto",
    off: t("Av", "Off"),
    dry: t("Avfukting", "Dry"),
    fan_only: t("Vifte", "Fan"),
  };
  const actions: Record<string, string> = {
    heating: t("Varmer opp", "Heating"),
    cooling: t("Kjøler ned", "Cooling"),
    idle: t("Hviler", "Idle"),
    off: t("Avslått", "Off"),
    drying: t("Avfukter", "Drying"),
    fan: t("Viften går", "Fan running"),
    defrosting: t("Avrimer", "Defrosting"),
  };
  const action = String(c.attributes.hvac_action || "");
  const tone =
    !known || c.state === "off"
      ? "off"
      : action === "cooling" || c.state === "cool"
        ? "cool"
        : action === "heating" || c.state === "heat"
          ? "heat"
          : "auto";
  const Icon =
    tone === "off"
      ? Power
      : tone === "cool"
        ? Snowflake
        : c.state === "dry"
          ? Droplets
          : c.state === "fan_only"
            ? Fan
            : Flame;
  const format = (value: number | null) =>
    value === null || !known
      ? "—"
      : value.toLocaleString(en ? "en-GB" : "nb-NO", {
          maximumFractionDigits: 3,
        });
  const valid =
    min !== null &&
    max !== null &&
    step !== null &&
    step > 0 &&
    max > min &&
    target !== null;
  const fraction = valid
    ? Math.max(0, Math.min(1, (target! - min!) / (max! - min!)))
    : 0;
  function adjust(direction: number) {
    if (!valid || !available) return;
    const value = Math.min(
      max!,
      Math.max(
        min!,
        min! + Math.round((target! - min!) / step! + direction) * step!,
      ),
    );
    change(Number(value.toFixed(6)));
  }
  return (
    <div className="thermostat" data-tone={tone}>
      <div className="thermostat-mode">
        <Icon size={16} />
        <span>
          {known
            ? modes[c.state] || c.state
            : t("Utilgjengelig", "Unavailable")}
        </span>
        <small>
          {known
            ? actions[action] || t("Drift ukjent", "Activity unknown")
            : ""}
        </small>
      </div>
      <div className="thermostat-dial">
        <svg viewBox="0 0 240 145" aria-hidden="true">
          <path
            className="thermostat-track"
            d="M22 124 A98 98 0 0 1 218 124"
            pathLength="100"
          />
          {valid && known && (
            <path
              className="thermostat-arc"
              d="M22 124 A98 98 0 0 1 218 124"
              pathLength="100"
              strokeDasharray={`${fraction * 100} 100`}
            />
          )}
          {valid && known && (
            <circle
              className="thermostat-knob"
              cx={120 - 98 * Math.cos(fraction * Math.PI)}
              cy={124 - 98 * Math.sin(fraction * Math.PI)}
              r="6"
            />
          )}
        </svg>
        <div className="thermostat-target">
          <span>{t("Ønsket", "Target")}</span>
          <strong>
            {target !== null
              ? format(target)
              : known &&
                  n(c.attributes.target_temp_low) !== null &&
                  n(c.attributes.target_temp_high) !== null
                ? `${format(n(c.attributes.target_temp_low))}–${format(n(c.attributes.target_temp_high))}`
                : "—"}
            <small>{unit}</small>
          </strong>
        </div>
      </div>
      <div className="thermostat-adjust">
        <button
          aria-label={`${c.name}: ${t("Ønsket temperatur", "Target temperature")} −`}
          disabled={!available || !valid || target! <= min!}
          onClick={() => adjust(-1)}
        >
          <Minus size={22} />
        </button>
        <span>
          {t("I rommet", "In the room")}
          <strong>
            {format(current)} {unit}
          </strong>
        </span>
        <button
          aria-label={`${c.name}: ${t("Ønsket temperatur", "Target temperature")} +`}
          disabled={!available || !valid || target! >= max!}
          onClick={() => adjust(1)}
        >
          <Plus size={22} />
        </button>
      </div>
      {!cap && (
        <small className="thermostat-readonly">
          {t(
            "Temperaturstyring er ikke tilgjengelig for denne enheten.",
            "Temperature control is unavailable for this device.",
          )}
        </small>
      )}
    </div>
  );
}
