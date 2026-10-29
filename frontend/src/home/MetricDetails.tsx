import { createPortal } from "react-dom";
import { useState, type ReactNode } from "react";
import { SettingsDialog } from "./SettingsDialog";
import { reading } from "./homeModel";
import type { Control, Home } from "../types";

function status(c: Control, lang: string) {
  const en = lang === "en";
  if (c.availability !== "available")
    return en ? "Unavailable" : "Utilgjengelig";
  if (
    c.domain === "climate" &&
    typeof c.attributes.current_temperature === "number"
  )
    return `${c.attributes.current_temperature} ${c.attributes.temperature_unit || "°C"}`;
  if (c.state.trim() !== "" && Number.isFinite(Number(c.state)))
    return reading(c, lang);
  const labels: Record<string, string> = {
    on: "På",
    off: "Av",
    playing: "Spiller",
    paused: "På pause",
    idle: "Inaktiv",
    standby: "Standby",
    locked: "Låst",
    unlocked: "Ulåst",
    open: "Åpen",
    closed: "Lukket",
    docked: "I ladestasjonen",
    cleaning: "Rengjør",
    armed_home: "Aktivert hjemme",
    armed_away: "Aktivert borte",
    disarmed: "Deaktivert",
    triggered: "Alarm utløst",
  };
  return en
    ? c.state.replaceAll("_", " ")
    : labels[c.state] || c.state.replaceAll("_", " ");
}

export function MetricDetails({
  label,
  controls,
  home,
  lang,
  children,
}: {
  label: string;
  controls: Control[];
  home: Home;
  lang: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const en = lang === "en";
  const groups = [
    ...home.areas,
    { area_id: "", name: en ? "No room" : "Uten rom" },
  ]
    .map((a) => ({
      ...a,
      controls: controls.filter(
        (c) =>
          (home.areas.some((r) => r.area_id === c.area_id) ? c.area_id : "") ===
          a.area_id,
      ),
    }))
    .filter((a) => a.controls.length);
  return (
    <>
      <button
        type="button"
        className="category-metric-button"
        aria-label={label}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {children}
      </button>
      {open &&
        createPortal(
          <SettingsDialog
            title={label}
            lang={lang}
            onClose={() => setOpen(false)}
          >
            <div className="metric-details">
              <p>
                {en
                  ? `${controls.length} ${controls.length === 1 ? "device" : "devices"} in this selection`
                  : `${controls.length} ${controls.length === 1 ? "enhet" : "enheter"} i dette utvalget`}
              </p>
              {!home.connected && (
                <p role="status">
                  {en
                    ? "Connection lost. Showing last known readings."
                    : "Tilkoblingen er brutt. Viser sist kjente målinger."}
                </p>
              )}
              {!controls.length && (
                <p>
                  {en
                    ? "No devices match right now."
                    : "Ingen enheter passer i dette utvalget akkurat nå."}
                </p>
              )}
              {groups.map((a) => (
                <section key={a.area_id}>
                  <h3>{a.name}</h3>
                  <ul>
                    {a.controls.map((c) => (
                      <li key={c.id}>
                        <strong>{c.name}</strong>
                        <span>{status(c, lang)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </SettingsDialog>,
          document.body,
        )}
    </>
  );
}
