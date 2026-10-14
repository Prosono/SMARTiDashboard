import { SettingsDialog } from "./SettingsDialog";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CarFront,
  PlugZap,
  BatteryCharging,
  Gauge,
  Route,
  Settings2,
} from "lucide-react";
import { api } from "../api";
import type { Home, Control } from "../types";
import { reading } from "./homeModel";
import { smartiName } from "../branding";
import "./vehicle.css";
type Pref = {
  name: string;
  battery: string | null;
  range: string | null;
  power: string | null;
  energy: string | null;
  status: string | null;
  switch: string | null;
};
type Kind = Exclude<keyof Pref, "name">;
const kinds: Kind[] = [
  "battery",
  "range",
  "power",
  "energy",
  "status",
  "switch",
];
export function Vehicle({
  home,
  offline,
  lang,
}: {
  home: Home;
  offline: boolean;
  lang: string;
}) {
  const en = lang === "en",
    t = (nb: string, english: string) => (en ? english : nb),
    qc = useQueryClient();
  const q = useQuery({
    queryKey: ["vehicle"],
    queryFn: () => api<Pref>("home/vehicle"),
  });
  const [draft, edit] = useState<Pref | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const names: Record<Kind, string> = {
    battery: t("Batterinivå", "Battery level"),
    range: t("Rekkevidde", "Range"),
    power: t("Ladeeffekt", "Charging power"),
    energy: t("Energimåler", "Energy meter"),
    status: t("Status", "Status"),
    switch: t("Bryter for lading", "Charging switch"),
  };
  const p = q.data,
    configured = p && kinds.some((k) => p[k]);
  const control = (kind: Kind) =>
    home.controls.find((c) => c.entity_id === p?.[kind]);
  function candidates(kind: Kind) {
    const units: Partial<Record<Kind, string[]>> = {
      battery: ["%"],
      range: ["km", "mi"],
      power: ["W", "kW"],
      energy: ["Wh", "kWh"],
    };
    return home.controls.filter((c) =>
      kind === "switch"
        ? c.domain === "switch" &&
          c.capabilities.some(
            (cap) =>
              cap.actions.includes("turn_on") &&
              cap.actions.includes("turn_off"),
          )
        : kind === "status"
          ? ["sensor", "binary_sensor"].includes(c.domain)
          : c.domain === "sensor" &&
            units[kind]?.includes(String(c.attributes.unit_of_measurement)),
    );
  }
  const usable = (c?: Control) =>
    !!c && !offline && c.availability === "available";
  async function save() {
    setBusy(true);
    setError("");
    try {
      await api("home/vehicle", "PUT", draft);
      await qc.invalidateQueries({ queryKey: ["vehicle"] });
      edit(null);
    } catch {
      setError(
        t(
          "Kunne ikke lagre. Kontroller målepunktene.",
          "Could not save. Check the selected entities.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  const charger = control("switch");
  async function toggle() {
    if (!charger || !usable(charger) || !["on", "off"].includes(charger.state))
      return;
    const on = charger.state !== "on";
    if (
      !window.confirm(
        `${on ? t("Slå på", "Turn on") : t("Slå av", "Turn off")}: ${charger.name}?`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await api<{ status: string }>(
        `controls/${encodeURIComponent(charger.entity_id)}/commands`,
        "POST",
        { action: on ? "turn_on" : "turn_off" },
      );
      setMessage(
        r.status === "simulated"
          ? t("Simulert i demohjemmet.", "Simulated in demo home.")
          : r.status === "state_updated"
            ? t("Bryteren er oppdatert.", "Switch state updated.")
            : t(
                "Kommando sendt. Venter på bekreftet status.",
                "Command sent. Waiting for confirmed state.",
              ),
      );
      await qc.invalidateQueries({ queryKey: ["home"] });
    } catch {
      setError(
        t(
          "Kommandoen kunne ikke bekreftes. Kontroller laderen.",
          "Command was not confirmed. Check the charger.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  const battery = control("battery"),
    level =
      usable(battery) && Number.isFinite(Number(battery!.state))
        ? Number(battery!.state)
        : null;
  const status = control("status");
  const stateText = (c?: Control) =>
    !usable(c)
      ? t("Ukjent", "Unknown")
      : c?.domain === "binary_sensor"
        ? c.state === "on"
          ? t("På", "On")
          : t("Av", "Off")
        : c!.state;
  return (
    <section
      className="home-vehicle"
      aria-label={t("Elbil og lader", "EV and charger")}
    >
      <header>
        <div>
          <span className="eyebrow">
            {t("Klar for neste tur", "Ready for the next trip")}
          </span>
          <h2>
            <CarFront size={23} />
            {p?.name || t("Elbil & lader", "EV & charger")}
          </h2>
        </div>
        <button
          disabled={!p || busy}
          onClick={() => {
            edit(draft ? null : { ...p! });
            setError("");
          }}
          aria-expanded={!!draft}
        >
          <Settings2 size={17} />
          {t("Tilpass", "Configure")}
        </button>
      </header>
      {q.isPending && <p>{t("Henter oppsett…", "Loading settings…")}</p>}
      {q.isError && (
        <p role="alert">
          {t("Oppsettet kunne ikke hentes.", "Could not load settings.")}{" "}
          <button onClick={() => q.refetch()}>
            {t("Prøv igjen", "Retry")}
          </button>
        </p>
      )}
      {draft && (
        <SettingsDialog
          title={t("Din bil og lader", "Your EV and charger")}
          lang={lang}
          busy={busy}
          onClose={() => edit(null)}
        >
          {error && <p role="alert">{error}</p>}{" "}
          <fieldset disabled={busy}>
            <legend>{t("Din bil og lader", "Your EV and charger")}</legend>
            <p>
              {t(
                "Velg målepunkter fra bilen og laderen som er koblet til hjemmesentralen. Du kan la felt stå tomme.",
                "Choose entities from the car and charger connected to your home hub. Fields can be left empty.",
              )}
            </p>
            <label>
              {t("Navn", "Name")}
              <input
                maxLength={80}
                value={draft.name}
                onChange={(e) => edit({ ...draft, name: e.target.value })}
              />
            </label>
            <div className="vehicle-fields">
              {kinds.map((kind) => (
                <label key={kind}>
                  {names[kind]}
                  <select
                    aria-label={names[kind]}
                    value={draft[kind] || ""}
                    onChange={(e) =>
                      edit({ ...draft, [kind]: e.target.value || null })
                    }
                  >
                    <option value="">{t("Ikke valgt", "Not selected")}</option>
                    {draft[kind] &&
                      !candidates(kind).some(
                        (c) => c.entity_id === draft[kind],
                      ) && (
                        <option value={draft[kind]!}>
                          {t(
                            "Tidligere valg er utilgjengelig",
                            "Previous selection unavailable",
                          )}
                        </option>
                      )}
                    {candidates(kind).map((c) => (
                      <option key={c.id} value={c.entity_id}>
                        {smartiName(c.name)} · {c.entity_id}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <small>
              {t(
                "Velg bare en ladebryter du vet styrer lading. SMARTi endrer ikke strømgrense eller ladeplan.",
                "Only choose a switch known to control charging. SMARTi does not change current limits or charging schedules.",
              )}
            </small>
            <div className="vehicle-actions">
              <button onClick={save}>{t("Lagre", "Save")}</button>
              <button onClick={() => edit(null)}>
                {t("Avbryt", "Cancel")}
              </button>
            </div>
          </fieldset>
        </SettingsDialog>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {p && !configured && !draft && (
        <div className="vehicle-empty">
          <PlugZap size={34} />
          <div>
            <h3>{t("Bilen får sin egen plass", "A place for your EV")}</h3>
            <p>
              {t(
                "Koble bil eller lader til hjemmesentralen. Velg deretter batteri, rekkevidde og lading her – alt samlet før neste tur.",
                "Connect your car or charger to the home hub, then choose battery, range and charging readings here.",
              )}
            </p>
            <button onClick={() => edit({ ...p })}>
              {t("Velg målepunkter", "Choose entities")}
            </button>
          </div>
        </div>
      )}
      {configured && (
        <div className="vehicle-panel">
          <div className="vehicle-battery">
            <BatteryCharging size={28} />
            <span>{t("Batteri", "Battery")}</span>
            <strong>
              {level === null
                ? "—"
                : level.toLocaleString(en ? "en-GB" : "nb-NO", {
                    maximumFractionDigits: 0,
                  })}
              <small>%</small>
            </strong>
            <div className="vehicle-battery-track" aria-hidden="true">
              <i
                style={{ width: `${Math.max(0, Math.min(100, level ?? 0))}%` }}
              />
            </div>
            <small>
              {battery?.name ||
                t("Velg batterimåler", "Choose a battery sensor")}
            </small>
          </div>
          <div className="vehicle-readings">
            {(["range", "power", "energy"] as Kind[]).map((kind) => {
              const c = control(kind),
                Icon =
                  kind === "range" ? Route : kind === "power" ? PlugZap : Gauge;
              return (
                <div key={kind}>
                  <Icon size={20} />
                  <span>{names[kind]}</span>
                  <strong>{usable(c) ? reading(c!, lang) : "—"}</strong>
                  <small>{c?.name || t("Ikke valgt", "Not selected")}</small>
                </div>
              );
            })}
          </div>
          <div className="vehicle-footer">
            <span>
              {status
                ? `${status.name}: ${stateText(status)}`
                : t("Statusmåler ikke valgt", "No status sensor selected")}
            </span>
            {p?.switch && (
              <button
                disabled={
                  busy ||
                  !usable(charger) ||
                  !["on", "off"].includes(charger?.state || "")
                }
                onClick={toggle}
              >
                {charger?.state === "on"
                  ? t("Slå av ladebryter", "Turn charging switch off")
                  : t("Slå på ladebryter", "Turn charging switch on")}
              </button>
            )}
          </div>
          {offline && (
            <p role="status">
              {t(
                "Frakoblet. Venter på ferske data.",
                "Offline. Waiting for fresh data.",
              )}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
