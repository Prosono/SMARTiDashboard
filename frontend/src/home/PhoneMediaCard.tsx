import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  CirclePlay,
  Minus,
  Plus,
  Power,
  SlidersHorizontal,
  Volume2,
} from "lucide-react";
import { api } from "../api";
import type { Control } from "../types";
import { mediaIcon } from "../MediaIcons";
import { CardTitle, cardImageURL } from "./CardPresentation";
import { MobileCardArtwork } from "./MobileCardArtwork";
import type { MobileCardProps } from "./MobileCardTile";
import { mediaArtworkKind, mediaDeviceArtwork } from "./mediaDeviceArtwork";
import { phoneMediaCompact } from "./phoneLayout";
import { usable } from "./homeModel";
import "./phoneMedia.css";

/** Touch-sized media controls; the full player remains available through Open. */
export function PhoneMediaCard({
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
    !home.permissions || home.permissions.includes("media.control");
  const supports = (action: string) =>
    c.capabilities.some((cap) => cap.actions.includes(action));
  const blocked = !available || !permitted || busy;
  const off = ["off", "standby"].includes(c.state);
  const power = off ? "turn_on" : "turn_off";
  const compact = phoneMediaCompact(c);
  const tv =
    ["tv", "projector"].includes(String(c.attributes.device_class)) ||
    ["tv", "projector"].includes(mediaArtworkKind(c) || "");
  const Icon = mediaIcon(c);
  const hasImage =
    config?.image !== "none" &&
    !!(cardImageURL(config?.image || "auto") || mediaDeviceArtwork(c));
  const raw = c.attributes.volume_level;
  const measured =
    typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= 1
      ? Math.round(raw * 100)
      : null;
  const volumeCap = c.capabilities.find((cap) =>
    cap.actions.includes("set_volume"),
  );
  const min = Math.max(0, volumeCap?.minimum ?? 0),
    max = Math.min(100, volumeCap?.maximum ?? 100);
  const step = volumeCap?.step ?? 1;
  const volumeTarget = (direction: number) =>
    measured === null || step <= 0 || max <= min
      ? null
      : Math.max(
          min,
          Math.min(
            max,
            Math.round((measured + direction * 5 - min) / step) * step + min,
          ),
        );
  const states: Record<string, string> = {
    playing: t("Spiller", "Playing"),
    paused: t("På pause", "Paused"),
    idle: t("Klar", "Ready"),
    on: t("På", "On"),
    off: t("Av", "Off"),
    standby: "Standby",
    buffering: t("Laster …", "Buffering …"),
  };
  const state = !available
    ? t("Utilgjengelig", "Unavailable")
    : states[c.state] || c.state;
  async function command(action: string, value?: number) {
    if (
      pending.current ||
      blocked ||
      !supports(action) ||
      (off && action !== "turn_on")
    )
      return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ status: string }>(
        `controls/${encodeURIComponent(c.entity_id)}/commands`,
        "POST",
        { action, ...(value === undefined ? {} : { value }) },
      );
      if (result.status === "failed") throw new Error("command_failed");
      if (result.status === "accepted_unconfirmed")
        setMessage(
          t("Sendt. Venter på bekreftelse.", "Sent. Waiting for confirmation."),
        );
      else if (result.status === "simulated")
        setMessage(t("Simulert i demohjemmet", "Simulated in demo"));
    } catch {
      setMessage(
        t(
          "Kunne ikke styre enheten. Prøv igjen.",
          "Could not control the device. Please retry.",
        ),
      );
    } finally {
      await query.invalidateQueries({ queryKey: ["home"] });
      pending.current = false;
      setBusy(false);
    }
  }
  const powerButton = supports(power) && (
    <button
      className="phone-media-power"
      data-on={!off && available}
      aria-label={`${off ? t("Slå på", "Turn on") : t("Slå av", "Turn off")}: ${c.name}`}
      disabled={blocked}
      onClick={() => void command(power)}
    >
      <Power size={23} />
    </button>
  );
  const artwork = hasImage ? (
    <MobileCardArtwork {...props} />
  ) : config?.image === "none" ? null : (
    <Icon className="phone-media-fallback" size={68} aria-hidden="true" />
  );
  return (
    <article
      className="phone-media"
      data-kind={compact ? "power" : tv ? "tv" : "speaker"}
      data-unavailable={!available}
    >
      <header>
        {compact && <Icon size={28} aria-hidden="true" />}
        <button
          className="phone-media-title"
          onClick={onOpen}
          aria-label={`${t("Detaljer", "Details")}: ${c.name}`}
        >
          <strong>
            <CardTitle>{c.name}</CardTitle>
          </strong>
          {!compact && !tv && (
            <small>
              {available &&
              c.attributes.media_title &&
              ["playing", "paused"].includes(c.state)
                ? String(c.attributes.media_title)
                : t("Mediespiller", "Media player")}
            </small>
          )}
        </button>
        {!compact && <span className="phone-media-state">{state}</span>}
        {compact && (
          <span className="phone-media-inline-state">
            <i data-on={!off && available} />
            {state}
          </span>
        )}
        {compact &&
          (powerButton || (
            <button
              className="phone-media-details"
              onClick={onOpen}
              aria-label={`${t("Åpne", "Open")}: ${c.name}`}
            >
              <ChevronRight />
            </button>
          ))}
      </header>
      {!compact && (
        <>
          <div className="phone-media-main">
            <button
              className="phone-media-art"
              onClick={onOpen}
              aria-label={`${t("Åpne spiller", "Open player")}: ${c.name}`}
            >
              {artwork}
            </button>
            {!tv && (
              <button className="phone-media-open" onClick={onOpen}>
                <CirclePlay size={22} />
                {t("Åpne spiller", "Open player")}
              </button>
            )}
          </div>
          {tv ? (
            <footer className="phone-media-tv-actions">
              <button className="phone-media-open" onClick={onOpen}>
                <SlidersHorizontal size={21} />
                {t("Fjernkontroll", "Controls")}
              </button>
              {powerButton}
            </footer>
          ) : volumeCap ? (
            <footer className="phone-media-volume">
              <Volume2 size={24} aria-hidden="true" />
              <span>{t("Volum", "Volume")}</span>
              <output aria-label={`${c.name}: ${t("Volum", "Volume")}`}>
                {available && measured !== null ? `${measured} %` : "—"}
              </output>
              {[-1, 1].map((direction) => {
                const target = volumeTarget(direction);
                return (
                  <button
                    key={direction}
                    aria-label={`${c.name}: ${direction < 0 ? t("Lavere volum", "Lower volume") : t("Høyere volum", "Higher volume")}`}
                    disabled={
                      blocked || off || target === null || target === measured
                    }
                    onClick={() => {
                      if (target !== null) void command("set_volume", target);
                    }}
                  >
                    {direction < 0 ? <Minus /> : <Plus />}
                  </button>
                );
              })}
            </footer>
          ) : (
            <footer className="phone-media-footer">
              {!permitted
                ? t("Kun visning", "View only")
                : t("Kontroller i spilleren", "Controls in player")}
              {powerButton}
            </footer>
          )}
        </>
      )}
      {message && (
        <small className="phone-command-status" role="status">
          {message}
        </small>
      )}
    </article>
  );
}
