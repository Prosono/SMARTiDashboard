import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Music2,
  Pause,
  Play,
  Power,
  SkipBack,
  SkipForward,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";
import { api } from "../api";
import type { Control } from "../types";

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clock(seconds: number | null): string {
  if (seconds === null) return "—:—";
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  return `${hours ? `${hours}:${String(minutes).padStart(2, "0")}` : Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Compact player: every control comes from the device's advertised capabilities. */
export function HighlightPlayer({
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
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [now, setNow] = useState(Date.now);
  const available = c.availability === "available";
  const playing = available && c.state === "playing";
  const poweredOff = c.state === "off";
  const blocked = busy || !available;
  const actions = c.capabilities.flatMap((cap) => cap.actions);
  const supports = (action: string) => actions.includes(action);
  const rawVolume = number(c.attributes.volume_level);
  const measuredVolume =
    rawVolume === null
      ? null
      : Math.round(Math.min(1, Math.max(0, rawVolume)) * 100);
  const [volume, setVolume] = useState(measuredVolume ?? 0);
  useEffect(() => setVolume(measuredVolume ?? 0), [measuredVolume]);

  const durationValue = number(c.attributes.media_duration);
  const duration =
    durationValue !== null && durationValue > 0 ? durationValue : null;
  const positionValue = number(c.attributes.media_position);
  const positionUpdated =
    typeof c.attributes.media_position_updated_at === "string"
      ? Date.parse(c.attributes.media_position_updated_at)
      : NaN;
  const canAdvance =
    playing && positionValue !== null && Number.isFinite(positionUpdated);
  useEffect(() => {
    if (!canAdvance) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [canAdvance, positionUpdated]);
  const position =
    positionValue === null
      ? null
      : Math.min(
          duration ?? Infinity,
          Math.max(
            0,
            positionValue +
              (canAdvance ? Math.max(0, now - positionUpdated) / 1000 : 0),
          ),
        );

  const state = !available
    ? t("Utilgjengelig", "Unavailable")
    : playing
      ? t("Spiller nå", "Now playing")
      : c.state === "paused"
        ? t("På pause", "Paused")
        : poweredOff
          ? t("Av", "Off")
          : c.state === "buffering"
            ? t("Laster …", "Buffering …")
            : c.state === "unknown"
              ? t("Ukjent status", "Unknown state")
              : t("Klar til å spille", "Ready to play");
  const title = String(c.attributes.media_title || c.name);
  const artist = String(
    c.attributes.media_artist ||
      c.attributes.media_series_title ||
      c.attributes.app_name ||
      c.attributes.source ||
      t("Velg innhold i spillerens app", "Choose content in the player's app"),
  );

  async function command(action: string, value?: number) {
    if (pending.current || !available || !supports(action)) return;
    pending.current = true;
    setBusy(true);
    setFeedback(t("Sender …", "Sending …"));
    try {
      const result = await api<{ status: string }>(
        `controls/${encodeURIComponent(c.entity_id)}/commands`,
        "POST",
        { action, ...(value === undefined ? {} : { value }) },
      );
      setFeedback(
        result.status === "simulated"
          ? t("Simulert i demohjemmet", "Simulated in demo")
          : result.status === "state_updated"
            ? t("Oppdatert", "Updated")
            : t("Sendt – venter på enheten", "Sent – waiting for device"),
      );
      await qc.invalidateQueries({ queryKey: ["home"] });
    } catch {
      setVolume(measuredVolume ?? 0);
      setFeedback(
        t(
          "Kunne ikke styre spilleren. Prøv igjen.",
          "Could not control player. Try again.",
        ),
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const mainAction =
    poweredOff && supports("turn_on")
      ? { action: "turn_on", label: t("Slå på", "Turn on"), Icon: Power }
      : playing && supports("media_pause")
        ? { action: "media_pause", label: t("Pause", "Pause"), Icon: Pause }
        : playing && supports("media_stop")
          ? { action: "media_stop", label: t("Stopp", "Stop"), Icon: Square }
          : !playing && supports("media_play")
            ? { action: "media_play", label: t("Spill av", "Play"), Icon: Play }
            : null;
  const volumeAvailable = supports("set_volume") || supports("set_mute");
  const muteKnown = typeof c.attributes.is_volume_muted === "boolean";
  const muted = c.attributes.is_volume_muted === true;

  return (
    <div className="hm-player" data-playing={playing}>
      <div className="hm-track">
        <div className="hm-art" aria-hidden="true">
          <img src="./brand/widget-fjord.jpg" alt="" />
          <Music2 size={21} />
        </div>
        <div className="hm-track-copy">
          <h3 title={title}>{title}</h3>
          <p title={artist}>{artist}</p>
          <span className="hm-state">
            <i />
            {state}
          </span>
        </div>
      </div>
      <div className="hm-progress">
        {duration !== null && position !== null ? (
          <progress
            aria-label={t("Avspillingsposisjon", "Playback position")}
            value={position}
            max={duration}
          />
        ) : (
          <div
            className="hm-progress-unavailable"
            aria-label={t(
              "Spilleren deler ikke avspillingsposisjon",
              "Player does not share playback position",
            )}
          />
        )}
        <div className="hm-times">
          <span>{clock(position)}</span>
          <span>{clock(duration)}</span>
        </div>
      </div>
      <div className="hm-transport">
        {supports("media_previous_track") ? (
          <button
            disabled={blocked || poweredOff}
            aria-label={t("Forrige spor", "Previous track")}
            onClick={() => void command("media_previous_track")}
          >
            <SkipBack size={26} fill="currentColor" />
          </button>
        ) : (
          <span />
        )}
        {mainAction ? (
          <button
            className="hm-play"
            disabled={
              blocked || (poweredOff && mainAction.action !== "turn_on")
            }
            aria-label={mainAction.label}
            onClick={() => void command(mainAction.action)}
          >
            <mainAction.Icon size={32} fill="currentColor" />
          </button>
        ) : (
          <span className="hm-no-controls">
            {t("Kun status", "Status only")}
          </span>
        )}
        {supports("media_next_track") ? (
          <button
            disabled={blocked || poweredOff}
            aria-label={t("Neste spor", "Next track")}
            onClick={() => void command("media_next_track")}
          >
            <SkipForward size={26} fill="currentColor" />
          </button>
        ) : (
          <span />
        )}
      </div>
      <div className="hm-volume">
        {volumeAvailable && (
          <>
            {supports("set_mute") && muteKnown ? (
              <button
                disabled={blocked || poweredOff}
                aria-label={
                  muted ? t("Slå på lyd", "Unmute") : t("Demp lyd", "Mute")
                }
                aria-pressed={muted}
                onClick={() => void command("set_mute", muted ? 0 : 1)}
              >
                {muted ? <VolumeX size={21} /> : <Volume2 size={21} />}
              </button>
            ) : (
              <Volume2 size={21} aria-hidden="true" />
            )}
            {supports("set_volume") && (
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={volume}
                aria-label={t("Volum", "Volume")}
                aria-valuetext={
                  measuredVolume === null
                    ? t("Ukjent volum", "Unknown volume")
                    : `${volume}%`
                }
                disabled={blocked || poweredOff || measuredVolume === null}
                onChange={(event) => setVolume(Number(event.target.value))}
                onPointerUp={(event) =>
                  void command("set_volume", Number(event.currentTarget.value))
                }
                onKeyUp={(event) => {
                  if (
                    [
                      "ArrowLeft",
                      "ArrowRight",
                      "ArrowUp",
                      "ArrowDown",
                      "Home",
                      "End",
                    ].includes(event.key)
                  )
                    void command(
                      "set_volume",
                      Number(event.currentTarget.value),
                    );
                }}
              />
            )}
            {supports("set_volume") && (
              <output>{measuredVolume === null ? "—" : `${volume}%`}</output>
            )}
          </>
        )}
      </div>
      <div className="hm-footer">
        <span className="hm-feedback" role="status">
          {feedback}
        </span>
        <button
          className="hm-more"
          onClick={open}
          aria-label={t("Åpne Multimedia", "Open Multimedia")}
        >
          {t("Multimedia", "Multimedia")}
          <ArrowUpRight size={16} />
        </button>
      </div>
    </div>
  );
}
