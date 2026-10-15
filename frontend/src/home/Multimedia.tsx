import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AudioLines,
  Speaker,
  Tv,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Square,
  Power,
  Volume2,
  VolumeX,
  Music2,
} from "lucide-react";
import { api } from "../api";
import type { Home, Control } from "../types";
import "./multimedia.css";

function MediaCard({
  c,
  home,
  lang,
  offline,
  featured = false,
}: {
  c: Control;
  home: Home;
  lang: string;
  offline: boolean;
  featured?: boolean;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const raw = c.attributes.volume_level;
  const measured =
    typeof raw === "number" && Number.isFinite(raw)
      ? Math.round(raw * 100)
      : null;
  const [volume, setVolume] = useState(measured ?? 0);
  useEffect(() => setVolume(measured ?? 0), [measured]);
  const actions = c.capabilities.flatMap((cap) => cap.actions);
  const supports = (action: string) => actions.includes(action);
  const unavailable = offline || c.availability !== "available";
  const blocked = unavailable || busy;
  const tv = ["tv", "projector"].includes(String(c.attributes.device_class));
  const Icon = tv ? Tv : Speaker;
  const playing = c.state === "playing" && !unavailable;
  const states: Record<string, string> = {
    playing: t("Spiller", "Playing"),
    paused: t("På pause", "Paused"),
    idle: t("Klar", "Idle"),
    off: t("Av", "Off"),
    on: t("På", "On"),
    buffering: t("Laster …", "Buffering …"),
    standby: t("Standby", "Standby"),
    unknown: t("Ukjent", "Unknown"),
    unavailable: t("Utilgjengelig", "Unavailable"),
  };
  async function command(action: string, value?: number) {
    if (blocked) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ status: string }>(
        `controls/${encodeURIComponent(c.entity_id)}/commands`,
        "POST",
        { action, ...(value === undefined ? {} : { value }) },
      );
      setMessage(
        result.status === "simulated"
          ? t("Simulert i demohjemmet", "Simulated in demo")
          : result.status === "state_updated"
            ? t("Oppdatert", "Updated")
            : t("Sendt – venter på enheten", "Sent – waiting for device"),
      );
      await qc.invalidateQueries({ queryKey: ["home"] });
    } catch {
      setMessage(
        t(
          "Kunne ikke bekrefte handlingen. Kontroller forbindelsen.",
          "Could not confirm the action. Check the connection.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  const button = (action: string, label: string, ButtonIcon: typeof Play) =>
    supports(action) && (
      <button
        key={action}
        title={label}
        aria-label={`${c.name}: ${label}`}
        disabled={blocked || (c.state === "off" && action !== "turn_on")}
        onClick={() => void command(action)}
      >
        <ButtonIcon size={20} />
      </button>
    );
  return (
    <article
      className={`media-player-card ${featured ? "media-featured" : ""}`}
      data-playing={playing}
    >
      <div className="media-art" aria-hidden="true">
        {tv ? (
          <Tv />
        ) : (
          <div className="media-record">
            <Music2 />
          </div>
        )}
        <span className="media-art-caption">
          {tv ? "SMARTi CINEMA" : "SMARTi AUDIO"}
        </span>
      </div>
      <div className="media-player-content">
        <header>
          <div>
            <span className="eyebrow">
              {home.areas.find((a) => a.area_id === c.area_id)?.name ||
                t("Uten rom", "Unassigned")}
            </span>
            <h2>{c.name}</h2>
          </div>
          <Icon size={23} />
        </header>
        <span className="media-state">
          <i />
          {unavailable
            ? t("Utilgjengelig", "Unavailable")
            : states[c.state] || c.state}
        </span>
        <div className="media-track">
          <h3>
            {unavailable
              ? t("Venter på forbindelse", "Waiting for connection")
              : String(
                  c.attributes.media_title ||
                    (playing
                      ? t("Avspilling pågår", "Playback in progress")
                      : t(
                          "Tid for noe du liker.",
                          "Time for something you love.",
                        )),
                )}
          </h3>
          <p>
            {unavailable
              ? "—"
              : String(
                  c.attributes.media_artist ||
                    c.attributes.media_series_title ||
                    c.attributes.app_name ||
                    c.attributes.source ||
                    t(
                      "Velg innhold i spillerens app",
                      "Choose content in the player's app",
                    ),
                )}
          </p>
        </div>
        <div className="media-transport">
          {button("media_previous_track", t("Forrige", "Previous"), SkipBack)}
          {playing
            ? button("media_pause", t("Pause", "Pause"), Pause)
            : button("media_play", t("Spill av", "Play"), Play)}
          {button("media_next_track", t("Neste", "Next"), SkipForward)}
          {button("media_stop", t("Stopp", "Stop"), Square)}
          <span />
          {button(
            c.state === "off" ? "turn_on" : "turn_off",
            c.state === "off"
              ? t("Slå på", "Turn on")
              : t("Slå av", "Turn off"),
            Power,
          )}
        </div>
        {(supports("set_volume") || supports("set_mute")) && (
          <div className="media-volume">
            {supports("set_mute") &&
            typeof c.attributes.is_volume_muted === "boolean" ? (
              <button
                aria-label={`${c.name}: ${c.attributes.is_volume_muted ? t("Slå på lyd", "Unmute") : t("Demp lyd", "Mute")}`}
                aria-pressed={c.attributes.is_volume_muted}
                disabled={blocked || c.state === "off"}
                onClick={() =>
                  void command("set_mute", c.attributes.is_volume_muted ? 0 : 1)
                }
              >
                {c.attributes.is_volume_muted ? (
                  <VolumeX size={18} />
                ) : (
                  <Volume2 size={18} />
                )}
              </button>
            ) : (
              <Volume2 size={18} />
            )}
            {supports("set_volume") && (
              <input
                aria-label={`${c.name}: ${t("Volum", "Volume")}`}
                type="range"
                min="0"
                max="100"
                step="1"
                value={volume}
                disabled={blocked || c.state === "off" || measured === null}
                onChange={(e) => setVolume(Number(e.target.value))}
                onPointerUp={(e) =>
                  void command("set_volume", Number(e.currentTarget.value))
                }
                onKeyUp={(e) => {
                  if (
                    [
                      "ArrowLeft",
                      "ArrowRight",
                      "ArrowUp",
                      "ArrowDown",
                      "Home",
                      "End",
                    ].includes(e.key)
                  )
                    void command("set_volume", Number(e.currentTarget.value));
                }}
              />
            )}
            <output>
              {unavailable || measured === null ? "—" : `${volume}%`}
            </output>
          </div>
        )}
        {!actions.length && (
          <p className="muted">
            {t(
              "Denne spilleren deler status, men støtter ikke styring her.",
              "This player reports status but does not support controls here.",
            )}
          </p>
        )}
        {message && (
          <p className="media-feedback" role="status">
            {message}
          </p>
        )}
      </div>
    </article>
  );
}
export function Multimedia({
  home,
  lang,
  offline,
}: {
  home: Home;
  lang: string;
  offline: boolean;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const [room, setRoom] = useState("all");
  const players = home.controls.filter(
    (c) => c.domain === "media_player" && !c.diagnostic,
  );
  const shown = players.filter(
    (c) => room === "all" || (c.area_id || "") === room,
  );
  const active = shown.find(
    (c) => c.state === "playing" && c.availability === "available" && !offline,
  );
  return (
    <section className="multimedia-view">
      <header className="multimedia-heading">
        <div>
          <span className="eyebrow">
            <AudioLines size={16} />
            {t("LYD & BILDE", "SOUND & VISION")}
          </span>
          <h1>{t("Sett stemningen.", "Set the mood.")}</h1>
          <p>
            {t(
              "Musikk i kjøkkenet. Film i stuen. Alt samlet her.",
              "Music in the kitchen. Movies in the living room. All together here.",
            )}
          </p>
        </div>
        <span className="media-device-count">
          <Speaker size={20} />
          {players.length} {t("spillere", "players")}
        </span>
      </header>
      {!!players.length && (
        <nav
          className="media-room-filter"
          aria-label={t("Multimedia-rom", "Multimedia rooms")}
        >
          {[
            { area_id: "all", name: t("Alle rom", "All rooms") },
            ...home.areas.filter((a) =>
              players.some((c) => c.area_id === a.area_id),
            ),
            ...(players.some((c) => !c.area_id)
              ? [{ area_id: "", name: t("Uten rom", "Unassigned") }]
              : []),
          ].map((a) => (
            <button
              key={a.area_id}
              aria-pressed={room === a.area_id}
              onClick={() => setRoom(a.area_id)}
            >
              {a.name}
            </button>
          ))}
        </nav>
      )}
      {!players.length ? (
        <div className="media-empty">
          <AudioLines size={52} />
          <h2>{t("Gi hjemmet en lydside.", "Give your home a soundtrack.")}</h2>
          <p>
            {t(
              "Høyttalere, TV-er og mediespillere dukker opp her når de er koblet til hjemmesentralen. Legg til produsentens integrasjon under Integrasjoner.",
              "Speakers, TVs and media players appear here once connected to your home controller. Add the manufacturer's integration under Integrations.",
            )}
          </p>
        </div>
      ) : (
        <>
          {active && (
            <>
              <h2 className="media-section-title">
                {t("Spiller nå", "Now playing")}
              </h2>
              <MediaCard
                key={active.entity_id}
                c={active}
                home={home}
                lang={lang}
                offline={offline}
                featured
              />
            </>
          )}
          <h2 className="media-section-title">
            {t("Dine spillere", "Your players")}
          </h2>
          <div className="media-player-grid">
            {shown
              .filter((c) => c !== active)
              .map((c) => (
                <MediaCard
                  key={c.entity_id}
                  c={c}
                  home={home}
                  lang={lang}
                  offline={offline}
                />
              ))}
          </div>
          {!shown.length && (
            <p>
              {t("Ingen spillere i dette rommet.", "No players in this room.")}
            </p>
          )}
        </>
      )}
    </section>
  );
}
