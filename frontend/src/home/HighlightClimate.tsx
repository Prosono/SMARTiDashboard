import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Droplets,
  Flame,
  Minus,
  Plus,
  Snowflake,
  Thermometer,
} from "lucide-react";
import { api } from "../api";
import type { Control } from "../types";

const numberOrNull = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export function HighlightClimate({
  c,
  lang,
  open,
}: {
  c: Control;
  lang: string;
  open: () => void;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const thermostat = c.domain === "climate";
  const known = c.availability === "available";
  const cap = thermostat
    ? c.capabilities.find((v) => v.actions.includes("set_temperature"))
    : undefined;
  const target = numberOrNull(c.attributes.temperature);
  const measured = thermostat
    ? numberOrNull(c.attributes.current_temperature)
    : c.state.trim()
      ? numberOrNull(Number(c.state))
      : null;
  const min = numberOrNull(cap?.minimum),
    max = numberOrNull(cap?.maximum),
    step = numberOrNull(cap?.step);
  const adjustable =
    !!cap &&
    min !== null &&
    max !== null &&
    max > min &&
    step !== null &&
    step > 0 &&
    target !== null;
  const unit = String(
    thermostat
      ? c.attributes.temperature_unit || cap?.unit || "°"
      : c.attributes.unit_of_measurement || "°",
  );
  const format = (value: number | null) =>
    !known || value === null
      ? "—"
      : value.toLocaleString(lang === "en" ? "en-GB" : "nb-NO", {
          maximumFractionDigits: 2,
        });
  const action = String(c.attributes.hvac_action || "");
  const activity: Record<string, string> = {
    heating: t("Varmer opp", "Heating"),
    cooling: t("Kjøler ned", "Cooling"),
    idle: t("Hviler", "Idle"),
    off: t("Avslått", "Off"),
    drying: t("Avfukter", "Drying"),
    fan: t("Viften går", "Fan running"),
    defrosting: t("Avrimer", "Defrosting"),
  };
  const modes: Record<string, string> = {
    heat: t("Varme", "Heat"),
    cool: t("Kjøling", "Cool"),
    heat_cool: t("Varme / kjøling", "Heat / cool"),
    auto: "Auto",
    off: t("Avslått", "Off"),
    dry: t("Avfukting", "Dry"),
    fan_only: t("Vifte", "Fan"),
  };
  const tone =
    !known || c.state === "off"
      ? "off"
      : action === "heating"
        ? "heat"
        : action === "cooling"
          ? "cool"
          : "neutral";
  const ModeIcon =
    tone === "heat" ? Flame : tone === "cool" ? Snowflake : Thermometer;
  const humidity = numberOrNull(
    c.attributes.current_humidity ?? c.attributes.humidity,
  );
  const targetLow = numberOrNull(c.attributes.target_temp_low),
    targetHigh = numberOrNull(c.attributes.target_temp_high);
  const targetLabel =
    target !== null
      ? `${format(target)}${unit}`
      : targetLow !== null && targetHigh !== null
        ? `${format(targetLow)}–${format(targetHigh)}${unit}`
        : t("Ikke oppgitt", "Not reported");

  async function adjust(direction: -1 | 1) {
    if (!adjustable || !known || busy) return;
    const value = Number(
      Math.min(
        max!,
        Math.max(
          min!,
          min! + Math.round((target! - min!) / step! + direction) * step!,
        ),
      ).toFixed(6),
    );
    if (value === target) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ status: string }>(
        `controls/${encodeURIComponent(c.entity_id)}/commands`,
        "POST",
        { action: "set_temperature", value },
      );
      setMessage(
        result.status === "state_updated"
          ? t("Temperaturen er oppdatert", "Temperature updated")
          : result.status === "simulated"
            ? t("Simulert i demohjemmet", "Simulated in demo")
            : t(
                "Sendt – venter på termostaten",
                "Sent – waiting for thermostat",
              ),
      );
      await qc.invalidateQueries({ queryKey: ["home"] });
    } catch {
      setMessage(
        t(
          "Kunne ikke bekrefte endringen. Kontroller termostaten.",
          "Could not confirm the change. Check the thermostat.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="hc-climate"
      data-tone={tone}
      aria-label={t("Inneklima", "Indoor climate")}
    >
      <div className="hc-primary">
        <Thermometer className="hc-thermometer" aria-hidden="true" />
        <div>
          <span className="hc-caption">
            {t("I rommet nå", "In the room now")}
          </span>
          <strong className="hc-temperature">
            {format(measured)}
            <small>{unit}</small>
          </strong>
        </div>
      </div>
      <div className="hc-status">
        <span className="hc-state">
          <ModeIcon size={16} aria-hidden="true" />
          {!known
            ? t("Utilgjengelig", "Unavailable")
            : thermostat
              ? activity[action] ||
                modes[c.state] ||
                t("Drift ukjent", "Activity unknown")
              : t("Målt temperatur", "Measured temperature")}
        </span>
        {humidity !== null && known && (
          <span className="hc-humidity">
            <Droplets size={16} aria-hidden="true" />
            {format(humidity)} %
          </span>
        )}
      </div>
      {thermostat && (
        <div className="hc-adjust">
          {adjustable && (
            <button
              aria-label={`${c.name}: ${t("Senk ønsket temperatur", "Decrease target temperature")}`}
              disabled={!known || busy || target! <= min!}
              onClick={() => void adjust(-1)}
            >
              <Minus size={24} />
            </button>
          )}
          <div className="hc-target">
            <span>{t("Ønsket temperatur", "Target temperature")}</span>
            <strong>{known ? targetLabel : "—"}</strong>
          </div>
          {adjustable && (
            <button
              aria-label={`${c.name}: ${t("Øk ønsket temperatur", "Increase target temperature")}`}
              disabled={!known || busy || target! >= max!}
              onClick={() => void adjust(1)}
            >
              <Plus size={24} />
            </button>
          )}
        </div>
      )}
      <p className="hc-message" role="status">
        {busy ? t("Stiller temperaturen…", "Setting temperature…") : message}
      </p>
      <button className="hc-open" onClick={open}>
        {t("Åpne klima", "Open climate")}
        <ArrowUpRight size={17} />
      </button>
    </section>
  );
}
