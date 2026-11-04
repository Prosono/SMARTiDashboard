import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowDown,
  AirVent,
  CalendarDays,
  CarFront,
  ChevronRight,
  Droplets,
  Fan,
  Minus,
  Plus,
  Thermometer,
} from "lucide-react";
import { api } from "../api";
import type { Control } from "../types";
import { ThermostatModeIcon } from "../Thermostat";
import { CardIcon, CardTitle, cardImageURL } from "./CardPresentation";
import { MobileCardArtwork } from "./MobileCardArtwork";
import type { MobileCardProps } from "./MobileCardTile";
import { measurementParts, usable } from "./homeModel";
import { controlState } from "../controlState";

const finite = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export function PhoneClimateCard({
  c,
  onOpen,
  ...props
}: MobileCardProps & { c: Control; onOpen: () => void }) {
  const { home, offline, lang, config } = props;
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const query = useQueryClient(),
    pending = useRef(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const available = !offline && home.connected && usable(c);
  const permitted =
    !home.permissions || home.permissions.includes("climate.control");
  const climate = c.domain === "climate";
  const info = [
    c.name,
    c.device_name,
    c.entity_id,
    c.attributes.device_class,
    c.attributes.smarti_device_model,
  ]
    .filter((v) => typeof v === "string")
    .join(" ");
  const ac =
    climate &&
    (/\b(ac|air[ _-]?con(?:ditioner)?|airconditioning)\b|varmepumpe|luft[ -]til[ -]luft/i.test(
      info,
    ) ||
      c.attributes.icon === "mdi:air-conditioner");
  const forecast = !climate && /forecast|prognos/i.test(info);
  const water =
    c.attributes.device_class === "humidity" ||
    /duggpunkt|dew[ _-]?point/i.test(info);
  const mode = !available ? "unavailable" : c.state;
  const tone =
    !available || mode === "off"
      ? "off"
      : mode === "cool" || c.attributes.hvac_action === "cooling"
        ? "cool"
        : mode === "heat" || c.attributes.hvac_action === "heating"
          ? "heat"
          : "neutral";
  const modes: Record<string, string> = {
    heat: t("Varmemodus", "Heat mode"),
    cool: t("Kjølemodus", "Cool mode"),
    heat_cool: t("Varme / kjøling", "Heat / cool"),
    auto: "Auto",
    dry: t("Avfukting", "Dry"),
    fan_only: t("Vifte", "Fan"),
    off: t("Av", "Off"),
  };
  const cap = c.capabilities.find((cap) =>
    cap.actions.includes("set_temperature"),
  );
  const target = finite(c.attributes.temperature),
    measured = finite(c.attributes.current_temperature);
  const min = finite(cap?.minimum),
    max = finite(cap?.maximum),
    step = finite(cap?.step);
  const valid =
    !!cap &&
    min !== null &&
    max !== null &&
    max > min &&
    step !== null &&
    step > 0 &&
    target !== null;
  const unit = String(c.attributes.temperature_unit || cap?.unit || "");
  const format = (value: number | null, suffix = unit) =>
    !available || value === null
      ? "—"
      : `${value.toLocaleString(lang === "en" ? "en-GB" : "nb-NO", { maximumFractionDigits: 3 })}${suffix ? ` ${suffix}` : ""}`;
  const low = finite(c.attributes.target_temp_low),
    high = finite(c.attributes.target_temp_high);
  const targetLabel =
    available && target === null && low !== null && high !== null
      ? `${format(low, "")}–${format(high)}`
      : format(target);
  const state = !available
    ? offline || !home.connected
      ? t("Frakoblet", "Disconnected")
      : t("Utilgjengelig", "Unavailable")
    : controlState(c, c.state, lang);
  const subtitle =
    c.device_name && c.device_name !== c.name
      ? c.device_name
      : String(c.attributes.smarti_device_model || "");
  async function adjust(direction: number) {
    if (pending.current || !available || !permitted || busy || !valid) return;
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
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ status: string }>(
        `controls/${encodeURIComponent(c.entity_id)}/commands`,
        "POST",
        { action: "set_temperature", value },
      );
      if (result.status === "failed") throw new Error("command_failed");
      if (result.status === "simulated")
        setMessage(t("Simulert i demohjemmet", "Simulated in demo"));
      else if (result.status !== "state_updated")
        setMessage(
          t("Sendt. Venter på termostaten.", "Sent. Waiting for thermostat."),
        );
    } catch {
      setMessage(
        t(
          "Kunne ikke stille temperaturen. Prøv igjen.",
          "Could not set the temperature. Please retry.",
        ),
      );
    } finally {
      await query.invalidateQueries({ queryKey: ["home"] });
      pending.current = false;
      setBusy(false);
    }
  }
  if (climate)
    return (
      <article
        className={`phone-climate-device ${ac ? "phone-climate-ac" : "phone-climate-thermostat"}`}
        data-tone={tone}
        data-unavailable={!available}
        aria-busy={busy}
      >
        <header>
          <button
            className="phone-climate-name"
            onClick={onOpen}
            aria-label={`${t("Detaljer", "Details")}: ${c.name}`}
          >
            {config?.image && cardImageURL(config.image) ? (
              <MobileCardArtwork {...props} />
            ) : (
              config?.icon !== "none" && (
                <CardIcon fallback={ac ? AirVent : Thermometer} size={24} />
              )
            )}
            <strong>
              <CardTitle>{c.name}</CardTitle>
            </strong>
          </button>
          {ac ? (
            <ChevronRight size={21} aria-hidden="true" />
          ) : (
            <button
              className="phone-climate-mode"
              onClick={onOpen}
              aria-label={`${c.name}: ${t("modus og innstillinger", "mode and settings")}`}
            >
              <ThermostatModeIcon
                c={available ? c : { ...c, availability: "unavailable" }}
                size={16}
              />
              {available
                ? modes[mode] || t("Ukjent modus", "Unknown mode")
                : state}
            </button>
          )}
        </header>
        {ac ? (
          <button
            className="phone-climate-ac-values"
            onClick={onOpen}
            aria-label={`${t("Åpne klima", "Open climate")}: ${c.name}`}
          >
            <div>
              <span>{t("Målt temperatur", "Measured temperature")}</span>
              <strong>{format(measured)}</strong>
            </div>
            <div>
              <span>{t("Måltemperatur", "Target temperature")}</span>
              <strong>{targetLabel}</strong>
            </div>
          </button>
        ) : (
          <>
            <span className="phone-climate-target-label">
              {t("Ønsket temperatur", "Target temperature")}
            </span>
            <div className="phone-climate-setpoint">
              {[-1, 1].map((direction) => (
                <button
                  key={direction}
                  data-direction={direction}
                  aria-label={`${c.name}: ${direction < 0 ? t("Senk ønsket temperatur", "Decrease target temperature") : t("Øk ønsket temperatur", "Increase target temperature")}`}
                  disabled={
                    !valid ||
                    !available ||
                    !permitted ||
                    busy ||
                    (direction < 0 ? target! <= min! : target! >= max!)
                  }
                  onClick={() => void adjust(direction)}
                >
                  {direction < 0 ? <Minus size={26} /> : <Plus size={26} />}
                </button>
              ))}
              <strong>{targetLabel}</strong>
            </div>
            <div className="phone-climate-measured">
              {t("Målt av termostat", "Measured by thermostat")}:{" "}
              <strong>{format(measured)}</strong>
            </div>
          </>
        )}
        {!permitted && (
          <small className="phone-climate-feedback">
            {t("Kun visning", "View only")}
          </small>
        )}
        {message && (
          <small className="phone-climate-feedback" role="status">
            {message}
          </small>
        )}
      </article>
    );
  const parts = available ? measurementParts(c, lang) : null;
  const Icon =
    c.domain === "fan"
      ? Fan
      : water
        ? Droplets
        : /\bbil\b|\bcar\b|vehicle/i.test(info)
          ? CarFront
          : forecast
            ? CalendarDays
            : c.attributes.device_class === "temperature" ||
                ["°C", "°F"].includes(String(c.attributes.unit_of_measurement))
              ? Thermometer
              : Activity;
  return (
    <button
      className="phone-climate-device phone-climate-sensor"
      data-forecast={forecast && !water}
      data-unavailable={!available}
      onClick={onOpen}
      aria-label={`${c.name}: ${parts ? `${parts.value} ${parts.unit}` : state}. ${t("Detaljer", "Details")}`}
    >
      <span className="phone-climate-sensor-icon">
        {config?.image && cardImageURL(config.image) ? (
          <MobileCardArtwork {...props} />
        ) : (
          config?.icon !== "none" && (
            <>
              {forecast &&
                !water &&
                (!config?.icon || config.icon === "auto") && (
                  <Thermometer size={24} />
                )}
              <CardIcon fallback={Icon} size={24} />
              {/minimum|\bmin\b/i.test(info) &&
                (!config?.icon || config.icon === "auto") && (
                  <ArrowDown size={15} />
                )}
            </>
          )
        )}
      </span>
      <strong className="phone-climate-sensor-title">
        <CardTitle>{c.name}</CardTitle>
      </strong>
      <span className="phone-climate-reading">
        {parts ? `${parts.value} ${parts.unit}` : state}
      </span>
      {subtitle && <small>{subtitle}</small>}
      <ChevronRight className="phone-climate-chevron" size={20} />
    </button>
  );
}
