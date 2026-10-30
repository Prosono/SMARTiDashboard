import { RobotVacuumIcon } from "./RobotVacuumIcon";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Brush,
  Play,
  Pause,
  House,
  Square,
  MapPin,
  Settings2,
  Star,
  Battery,
  Search,
} from "lucide-react";
import { api } from "../api";
import type { Control, Home } from "../types";
import { useExperience } from "../Experience";
import { SettingsDialog } from "./SettingsDialog";
import "./cleaning.css";
const states: Record<string, [string, string]> = {
  cleaning: ["Rengjør", "Cleaning"],
  docked: ["I ladestasjonen", "At the dock"],
  returning: ["På vei til ladestasjonen", "Returning to dock"],
  paused: ["På pause", "Paused"],
  idle: ["Klar", "Idle"],
  error: ["Trenger hjelp", "Needs help"],
  unavailable: ["Utilgjengelig", "Unavailable"],
  unknown: ["Ukjent status", "Unknown status"],
  on: ["På", "On"],
  off: ["Av", "Off"],
};
export function VacuumCard({
  c,
  home,
  lang,
  offline,
  simple = false,
}: {
  c: Control;
  home: Home;
  lang: string;
  offline: boolean;
  simple?: boolean;
}) {
  const en = lang === "en",
    mode = useExperience(),
    qc = useQueryClient();
  const [details, setDetails] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [selected, select] = useState<string[]>([]);
  const actions = c.capabilities.flatMap((cap) => cap.actions);
  const disabled = busy || offline || c.availability !== "available";
  const status = offline
    ? en
      ? "Connection lost"
      : "Forbindelsen er brutt"
    : states[c.availability === "available" ? c.state : c.availability]?.[
        en ? 1 : 0
      ] || c.state;
  const batterySensor = c.device_id
    ? home.controls.find(
        (v) =>
          v.device_id === c.device_id &&
          v.domain === "sensor" &&
          v.attributes.device_class === "battery" &&
          v.availability === "available",
      )
    : undefined;
  const rawBattery = c.attributes.battery_level ?? batterySensor?.state;
  const battery =
    rawBattery !== null &&
    rawBattery !== undefined &&
    rawBattery !== "" &&
    Number.isFinite(Number(rawBattery)) &&
    Number(rawBattery) >= 0 &&
    Number(rawBattery) <= 100
      ? Number(rawBattery)
      : null;
  const speeds = Array.isArray(c.attributes.fan_speed_list)
    ? c.attributes.fan_speed_list.filter(
        (v): v is string => typeof v === "string",
      )
    : [];
  const rooms = home.areas.filter(
    (a) =>
      Array.isArray(c.attributes.smarti_cleaning_areas) &&
      c.attributes.smarti_cleaning_areas.includes(a.area_id),
  );
  async function send(action: string, extra: Record<string, unknown> = {}) {
    if (disabled || !actions.includes(action)) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ status: string }>(
        `controls/${encodeURIComponent(c.entity_id)}/commands`,
        "POST",
        { action, ...extra },
      );
      setMessage(
        result.status === "simulated"
          ? en
            ? "Simulated in demo mode."
            : "Simulert i demomodus."
          : en
            ? "Command sent. Waiting for the robot's status."
            : "Kommando sendt. Venter på status fra roboten.",
      );
      await qc.invalidateQueries({ queryKey: ["home"] });
    } catch {
      setMessage(
        en
          ? "Could not confirm the command. Check the robot's status before trying again."
          : "Kunne ikke bekrefte kommandoen. Sjekk robotens status før du prøver igjen.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function favorite() {
    try {
      await api(`favorites/${encodeURIComponent(c.entity_id)}`, "PUT");
      await qc.invalidateQueries({ queryKey: ["home"] });
    } catch {
      setMessage(
        en ? "Could not save favorite." : "Kunne ikke lagre favoritt.",
      );
    }
  }
  const start = actions.includes("start") ? "start" : "turn_on";
  const controls = (
    <div className="vacuum-actions">
      {actions.includes(start) && c.state !== "cleaning" && (
        <button disabled={disabled} onClick={() => void send(start)}>
          <Play size={18} />
          {c.state === "paused"
            ? en
              ? "Resume"
              : "Fortsett"
            : en
              ? "Start cleaning"
              : "Start rengjøring"}
        </button>
      )}
      {actions.includes("pause") && c.state === "cleaning" && (
        <button disabled={disabled} onClick={() => void send("pause")}>
          <Pause size={18} />
          {en ? "Pause" : "Pause"}
        </button>
      )}
      {actions.includes("return_to_base") && (
        <button
          disabled={disabled || ["docked", "returning"].includes(c.state)}
          onClick={() => void send("return_to_base")}
        >
          <House size={18} />
          {en ? "Return to dock" : "Til ladestasjonen"}
        </button>
      )}
      {!actions.includes("pause") &&
        actions.includes("stop") &&
        c.state === "cleaning" && (
          <button disabled={disabled} onClick={() => void send("stop")}>
            <Square size={18} />
            {en ? "Stop" : "Stopp"}
          </button>
        )}
    </div>
  );
  return (
    <article
      className={`vacuum-card ${c.state === "cleaning" && !offline ? "is-cleaning" : ""}`}
    >
      <header>
        <div className="vacuum-illustration" aria-hidden="true">
          {simple ? (
            <img
              src={new URL("home/simple-vacuum.webp", document.baseURI).href}
              alt=""
            />
          ) : (
            <RobotVacuumIcon size={50} />
          )}
        </div>
        <div>
          <small>
            {home.areas.find((a) => a.area_id === c.area_id)?.name ||
              (en ? "Cleaning" : "Rengjøring")}
          </small>
          <h3>{c.name}</h3>
        </div>
        <button
          className="icon-button"
          aria-label={`${en ? "Favorite" : "Favoritt"}: ${c.name}`}
          aria-pressed={home.favorites.includes(c.entity_id)}
          onClick={() => void favorite()}
        >
          <Star size={20} />
        </button>
      </header>
      <div className="vacuum-status">
        <strong>{status}</strong>
        {battery !== null && (
          <span>
            <Battery size={18} />
            {battery}%
            {offline || c.availability !== "available"
              ? en
                ? " · last reported"
                : " · sist meldt"
              : ""}
          </span>
        )}
      </div>
      {controls}
      <button
        className="vacuum-details"
        aria-haspopup="dialog"
        onClick={() => setDetails(true)}
      >
        <Settings2 size={17} />
        {en ? "Details and options" : "Detaljer og valg"}
      </button>
      {message && <p role="status">{message}</p>}
      {details && (
        <SettingsDialog
          title={c.name}
          lang={lang}
          onClose={() => setDetails(false)}
          compact
        >
          <p className="vacuum-dialog-status">{status}</p>
          {controls}
          {c.state === "error" && (
            <p role="alert">
              {typeof c.attributes.error === "string"
                ? c.attributes.error
                : en
                  ? "Check the robot and its dock for an obstruction or maintenance warning."
                  : "Sjekk roboten og ladestasjonen for hindringer eller vedlikeholdsvarsel."}
            </p>
          )}
          {actions.includes("set_fan_speed") && speeds.length > 0 && (
            <label>
              {en ? "Suction power" : "Sugestyrke"}
              <select
                aria-label={en ? "Suction power" : "Sugestyrke"}
                disabled={disabled}
                value={
                  speeds.includes(String(c.attributes.fan_speed))
                    ? String(c.attributes.fan_speed)
                    : ""
                }
                onChange={(e) =>
                  void send("set_fan_speed", { fan_speed: e.target.value })
                }
              >
                <option value="" disabled>
                  {en ? "Choose power" : "Velg styrke"}
                </option>
                {speeds.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          )}
          {actions.includes("clean_area") && rooms.length > 0 && (
            <fieldset className="vacuum-rooms">
              <legend>
                {en ? "Clean selected rooms" : "Rengjør valgte rom"}
              </legend>
              {rooms.map((a) => (
                <label key={a.area_id}>
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={selected.includes(a.area_id)}
                    onChange={(e) =>
                      select((v) =>
                        e.target.checked
                          ? [...v, a.area_id]
                          : v.filter((id) => id !== a.area_id),
                      )
                    }
                  />
                  {a.name}
                </label>
              ))}
              <button
                disabled={disabled || !selected.length}
                onClick={() => void send("clean_area", { area_ids: selected })}
              >
                <Brush size={18} />
                {en ? "Clean rooms" : "Rengjør rom"}
              </button>
            </fieldset>
          )}
          {mode !== "simple" && (
            <div className="vacuum-actions">
              {[
                { id: "stop", nb: "Stopp", en: "Stop", Icon: Square },
                {
                  id: "locate",
                  nb: "Finn roboten",
                  en: "Locate robot",
                  Icon: MapPin,
                },
                {
                  id: "clean_spot",
                  nb: "Rengjør her",
                  en: "Spot clean",
                  Icon: Brush,
                },
                { id: "turn_off", nb: "Slå av", en: "Turn off", Icon: Square },
              ]
                .filter((a) => actions.includes(a.id))
                .map((a) => (
                  <button
                    key={a.id}
                    disabled={disabled}
                    onClick={() => void send(a.id)}
                  >
                    <a.Icon size={18} />
                    {en ? a.en : a.nb}
                  </button>
                ))}
            </div>
          )}
          {!actions.length && (
            <p>
              {en
                ? "Viewing only. Controls appear when the robot supports them and your account has permission."
                : "Kun visning. Styring vises når roboten støtter det og kontoen din har tilgang."}
            </p>
          )}
          {mode === "advanced" && (
            <p className="note">
              {c.entity_id}
              {c.updated_at &&
                ` · ${new Date(c.updated_at).toLocaleString(en ? "en-GB" : "nb-NO")}`}
            </p>
          )}
          {message && <p role="status">{message}</p>}
        </SettingsDialog>
      )}
    </article>
  );
}
export function Cleaning({
  home,
  lang,
  offline,
}: {
  home: Home;
  lang: string;
  offline: boolean;
}) {
  const [search, setSearch] = useState("");
  const en = lang === "en";
  const robots = home.controls.filter(
    (c) =>
      c.domain === "vacuum" &&
      c.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  return (
    <section className="cleaning-view">
      <header className="cleaning-heading">
        <Brush size={34} />
        <div>
          <h1>{en ? "Cleaning" : "Rengjøring"}</h1>
          <p>{en ? "A little help, every day." : "Litt hjelp i hverdagen."}</p>
        </div>
      </header>
      <label className="cleaning-search">
        <Search size={19} />
        <input
          aria-label={en ? "Find robot" : "Finn robot"}
          placeholder={
            en ? "Search robot vacuums…" : "Søk etter robotstøvsuger…"
          }
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <div className="cleaning-grid">
        {robots.map((c) => (
          <VacuumCard
            key={c.id}
            c={c}
            home={home}
            lang={lang}
            offline={offline}
          />
        ))}
      </div>
      {!robots.length && (
        <p>
          {en ? "No robot vacuums found." : "Ingen robotstøvsugere funnet."}
        </p>
      )}
    </section>
  );
}
