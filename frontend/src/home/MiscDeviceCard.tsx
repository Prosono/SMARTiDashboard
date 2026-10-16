import { useState, type CSSProperties } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowUp,
  ArrowDown,
  Square,
  Power,
  Plug,
  Blinds,
  MapPin,
  LoaderCircle,
} from "lucide-react";
import { api } from "../api";
import type { Control, Home } from "../types";
import { SettingsDialog } from "./SettingsDialog";

export function MiscDeviceCard({
  c,
  home,
  lang,
  offline,
}: {
  c: Control;
  home: Home;
  lang: string;
  offline: boolean;
}) {
  const en = lang === "en",
    cover = c.domain === "cover",
    qc = useQueryClient();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const actions = c.capabilities.flatMap((cap) => cap.actions);
  const feature = cover ? "security" : "other";
  const canControl =
    !home.permissions || home.permissions.includes(feature + ".control");
  const available =
    !offline && home.connected && c.availability === "available";
  const disabled = busy || !available || !canControl;
  const on = available && c.state === "on";
  const rawPosition = c.attributes.current_position;
  const position =
    typeof rawPosition === "number" && Number.isFinite(rawPosition)
      ? Math.max(0, Math.min(100, rawPosition))
      : null;
  const knownPosition = position ?? (c.state === "closed" ? 0 : null);
  const labels: Record<string, string> = en
    ? {
        open: "Open",
        closed: "Closed",
        opening: "Opening",
        closing: "Closing",
        on: "On",
        off: "Off",
      }
    : {
        open: "Åpen",
        closed: "Lukket",
        opening: "Åpner",
        closing: "Lukker",
        on: "På",
        off: "Av",
      };
  const status = !available
    ? offline || !home.connected
      ? en
        ? "Connection lost"
        : "Forbindelsen er brutt"
      : en
        ? "Unavailable"
        : "Utilgjengelig"
    : labels[c.state] || (en ? "Unknown status" : "Ukjent status");
  async function send(action: string) {
    if (disabled || !actions.includes(action)) return;
    setConfirm(null);
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ status: string }>(
        `controls/${encodeURIComponent(c.entity_id)}/commands`,
        "POST",
        { action, confirmed: cover && action !== "stop_cover" },
      );
      setMessage(
        result.status === "state_updated"
          ? en
            ? "Updated"
            : "Oppdatert"
          : result.status === "simulated"
            ? en
              ? "Demo action"
              : "Demohandling"
            : result.status === "failed"
              ? en
                ? "The action failed. Check the device."
                : "Handlingen feilet. Kontroller enheten."
              : en
                ? "Sent — waiting for confirmation."
                : "Sendt – venter på bekreftelse.",
      );
      await qc.invalidateQueries({ queryKey: ["home"] });
    } catch {
      setMessage(
        en
          ? "Could not send the command. Check the connection."
          : "Kunne ikke sende kommandoen. Sjekk tilkoblingen.",
      );
    } finally {
      setBusy(false);
    }
  }
  const room =
    home.areas.find((a) => a.area_id === c.area_id)?.name ||
    (en ? "No room" : "Uten rom");
  return (
    <article
      className="misc-device-card"
      data-active={on}
      data-available={available}
      aria-busy={busy}
    >
      <header>
        {cover ? <Blinds size={22} /> : <Plug size={22} />}
        <div>
          <h3>{c.name}</h3>
          <small>
            <MapPin size={12} />
            {room}
          </small>
        </div>
        <span className="misc-device-status">
          {busy && <LoaderCircle size={14} className="misc-loading" />}
          {status}
        </span>
      </header>
      {cover ? (
        <>
          <div className="misc-cover-overview">
            <div
              className="misc-window"
              aria-hidden="true"
              data-known={knownPosition !== null}
              style={
                {
                  "--closed": `${100 - (knownPosition ?? 50)}%`,
                } as CSSProperties
              }
            >
              <div className="misc-blind-slats" />
              <span />
            </div>
            <div>
              <strong>
                {available && position !== null
                  ? `${position}%`
                  : available && c.state === "closed"
                    ? "0%"
                    : "—"}
              </strong>
              <span>
                {available
                  ? en
                    ? "Open"
                    : "Åpning"
                  : en
                    ? "No fresh reading"
                    : "Ingen fersk måling"}
              </span>
              {available && position === null && c.state !== "closed" && (
                <small>
                  {en
                    ? "Position is not reported"
                    : "Posisjon rapporteres ikke"}
                </small>
              )}
            </div>
          </div>
          <div className="misc-cover-actions">
            {[
              {
                action: "open_cover",
                Icon: ArrowUp,
                label: en ? "Open" : "Åpne",
              },
              {
                action: "stop_cover",
                Icon: Square,
                label: en ? "Stop" : "Stopp",
              },
              {
                action: "close_cover",
                Icon: ArrowDown,
                label: en ? "Close" : "Lukk",
              },
            ]
              .filter((a) => actions.includes(a.action))
              .map(({ action, Icon, label }) => (
                <button
                  key={action}
                  disabled={disabled}
                  onClick={() =>
                    action === "stop_cover"
                      ? void send(action)
                      : setConfirm(action)
                  }
                >
                  <Icon size={19} />
                  {label}
                </button>
              ))}
          </div>
        </>
      ) : (
        <div className="misc-socket-overview">
          <div className="misc-socket" aria-hidden="true">
            <i />
            <i />
            <span />
          </div>
          <button
            className="misc-power"
            disabled={
              disabled ||
              !["on", "off"].includes(c.state) ||
              !actions.includes(on ? "turn_off" : "turn_on")
            }
            aria-label={`${en ? (on ? "Turn off" : "Turn on") : on ? "Slå av" : "Slå på"}: ${c.name}`}
            onClick={() => void send(on ? "turn_off" : "turn_on")}
          >
            <Power size={27} />
            <span>
              {en ? (on ? "Turn off" : "Turn on") : on ? "Slå av" : "Slå på"}
            </span>
          </button>
        </div>
      )}
      {!canControl && (
        <small className="misc-readonly">
          {en ? "View only" : "Kun visning"}
        </small>
      )}
      <p className="misc-device-feedback" role="status">
        {message}
      </p>
      {confirm && (
        <SettingsDialog
          title={`${confirm === "open_cover" ? (en ? "Open" : "Åpne") : en ? "Close" : "Lukk"} ${c.name}?`}
          lang={lang}
          onClose={() => setConfirm(null)}
        >
          <p>
            {en
              ? "The device will move. Make sure its path is clear."
              : "Enheten vil bevege seg. Kontroller at ingenting er i veien."}
          </p>
          <div className="misc-confirm-actions">
            <button onClick={() => setConfirm(null)}>
              {en ? "Cancel" : "Avbryt"}
            </button>
            <button disabled={disabled} onClick={() => void send(confirm)}>
              {en ? "Confirm" : "Bekreft"}
            </button>
          </div>
        </SettingsDialog>
      )}
    </article>
  );
}
