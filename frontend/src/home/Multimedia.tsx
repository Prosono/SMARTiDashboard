import { mediaIcon } from "../MediaIcons";
import { mediaDeviceArtwork } from "./mediaDeviceArtwork";
import { MetricDetails, MetricDeviceRenderer } from "./MetricDetails";
import { CategoryHeading } from "./CategoryIntro";
import { ToolbarToggle, useToolbarDisclosure } from "./ToolbarToggle";
import { allViews } from "../access";
import { useContext, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  House,
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
  Search,
  LayoutGrid,
  List,
  Layers,
  Sparkles,
} from "lucide-react";
import { api } from "../api";
import type { Home, Control } from "../types";
import "./lightOverview.css";
import "./climateOverview.css";
import "./multimedia.css";
import { homeAsset, roomMood, type HomePreferences } from "./HomeOverview";
import { Scenes } from "./Scenes";
import { SettingsDialog, InSettingsDialog } from "./SettingsDialog";

export function MediaCard({
  c,
  home,
  lang,
  offline,
}: {
  c: Control;
  home: Home;
  lang: string;
  offline: boolean;
  photo: string;
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
  const Icon = mediaIcon(c);
  const renderDevice = useContext(MetricDeviceRenderer);
  const inDialog = useContext(InSettingsDialog);
  const [opened, setOpened] = useState(false);
  const artworkKey = c.attributes.smarti_artwork;
  const artwork =
    artworkKey && !["off", "idle", "standby"].includes(c.state)
      ? new URL(
          `api/controls/${encodeURIComponent(c.entity_id)}/artwork?v=${encodeURIComponent(String(artworkKey))}`,
          document.baseURI,
        ).href
      : "";
  const [failedArtwork, setFailedArtwork] = useState("");
  const [failedDeviceArtwork, setFailedDeviceArtwork] = useState("");
  const explicitImage =
    typeof c.attributes.smarti_media_image === "string" &&
    c.attributes.smarti_media_image !== "auto";
  const showArtwork = Boolean(
    !explicitImage && !unavailable && artwork && failedArtwork !== artwork,
  );
  const deviceArtwork = mediaDeviceArtwork(c);
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
        data-action={action}
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
      className="media-player-card"
      data-playing={playing}
      data-unavailable={unavailable}
    >
      <div className="media-art">
        <div>
          {!inDialog && renderDevice ? (
            <button
              className="media-open-device"
              aria-label={`${t("Åpne", "Open")} ${c.name}`}
              aria-haspopup="dialog"
              onClick={() => setOpened(true)}
            >
              {c.name}
              <Icon size={20} />
            </button>
          ) : (
            <strong>{c.name}</strong>
          )}
          <span>
            {home.areas.find((a) => a.area_id === c.area_id)?.name ||
              t("Uten rom", "Unassigned")}
          </span>
        </div>
      </div>
      <div className="media-player-content">
        <div className="media-info-region">
          <div className="media-info-copy">
            <span className="media-state">
              <i />
              {unavailable
                ? t("Utilgjengelig", "Unavailable")
                : states[c.state] || c.state}
            </span>
            <div className="media-track">
              <div>
                <h3>
                  {unavailable
                    ? t("Venter på forbindelse", "Waiting for connection")
                    : String(
                        c.attributes.media_title ||
                          (playing
                            ? t("Avspilling pågår", "Playback in progress")
                            : t("Ingen avspilling", "Nothing playing")),
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
            </div>
          </div>
          <div className="media-device-visual" aria-hidden="true">
            {showArtwork ? (
              <img
                src={artwork || undefined}
                alt=""
                onError={() => setFailedArtwork(String(artwork))}
              />
            ) : deviceArtwork && failedDeviceArtwork !== deviceArtwork ? (
              <img
                className="media-product-image"
                src={deviceArtwork}
                alt=""
                loading="lazy"
                onError={() => setFailedDeviceArtwork(deviceArtwork)}
              />
            ) : (
              <Icon size={124} />
            )}
          </div>
        </div>
        {typeof c.attributes.media_duration === "number" &&
          c.attributes.media_duration > 0 &&
          typeof c.attributes.media_position === "number" &&
          !unavailable && (
            <div
              className="media-progress"
              aria-label={t(
                "Rapportert avspillingsposisjon",
                "Reported playback position",
              )}
            >
              <span>{clock(c.attributes.media_position)}</span>
              <progress
                max={c.attributes.media_duration}
                value={Math.min(
                  c.attributes.media_position,
                  c.attributes.media_duration,
                )}
              />
              <span>{clock(c.attributes.media_duration)}</span>
            </div>
          )}
        <div className="media-controls-row">
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
                    void command(
                      "set_mute",
                      c.attributes.is_volume_muted ? 0 : 1,
                    )
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
        </div>
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
      {opened && renderDevice && (
        <SettingsDialog
          title={c.name}
          lang={lang}
          onClose={() => setOpened(false)}
        >
          {renderDevice(c)}
        </SettingsDialog>
      )}
    </article>
  );
}

function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export function Multimedia({
  home,
  lang,
  offline,
  admin,
}: {
  home: Home;
  lang: string;
  offline: boolean;
  admin: boolean;
}) {
  const toolbar = useToolbarDisclosure();
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const [room, setRoom] = useState("all");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [layout, setLayout] = useState("cards");
  const [showAll, setShowAll] = useState(false);
  useEffect(() => setShowAll(false), [room, search, filter]);
  const [scenes, showScenes] = useState(false);
  const prefs = useQuery({
    queryKey: ["home-preferences"],
    queryFn: () => api<HomePreferences>("home/preferences"),
  });
  const players = home.controls.filter(
    (c) => c.domain === "media_player" && !c.diagnostic,
  );
  const available = (c: Control) => !offline && c.availability === "available";
  const playing = players.filter((c) => available(c) && c.state === "playing");
  const grouped = (c: Control) =>
    Array.isArray(c.attributes.group_members) &&
    c.attributes.group_members.length > 1;
  const shown = players.filter(
    (c) =>
      (room === "all" || (c.area_id || "") === room) &&
      `${c.name} ${home.areas.find((a) => a.area_id === c.area_id)?.name || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === "all" ||
        (filter === "playing"
          ? available(c) && c.state === "playing"
          : filter === "tv"
            ? ["tv", "projector"].includes(String(c.attributes.device_class))
            : grouped(c))),
  );
  const photo = (c: Control) =>
    c.area_id && prefs.data?.images[c.area_id]
      ? new URL(
          `api/home/room-image/${encodeURIComponent(c.area_id)}?v=${prefs.dataUpdatedAt}`,
          document.baseURI,
        ).href
      : homeAsset(
          roomMood(home.areas.find((a) => a.area_id === c.area_id)?.name || "")
            .photo || "home-living",
        );
  return (
    <section className="multimedia-view">
      <CategoryHeading
        Icon={AudioLines}
        title={t("Multimedia", "Multimedia")}
        subtitle={t(
          "Musikk, film og lyd i hele hjemmet.",
          "Music, movies and sound throughout your home.",
        )}
      >
        <ToolbarToggle {...toolbar} lang={lang} />
      </CategoryHeading>
      <div
        className="lighting-toolbar climate-toolbar media-toolbar"
        id={toolbar.id}
        hidden={!toolbar.expanded}
        data-collapsible-toolbar
        role="group"
        aria-label={t("Filtrer multimedia", "Filter multimedia")}
      >
        <label className="lighting-search">
          <Search size={19} />
          <input
            aria-label={t("Søk i multimedia", "Search multimedia")}
            placeholder={t(
              "Søk etter rom eller spiller…",
              "Search rooms or players…",
            )}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="lighting-room-filter">
          <House size={18} />
          <select
            aria-label={t("Multimedia-rom", "Multimedia room")}
            value={room}
            onChange={(e) => setRoom(e.target.value)}
          >
            <option value="all">
              {t("Alle rom", "All rooms")} (
              {
                home.areas.filter((a) =>
                  players.some((c) => c.area_id === a.area_id),
                ).length
              }
              )
            </option>
            {home.areas
              .filter((a) => players.some((c) => c.area_id === a.area_id))
              .map((a) => (
                <option key={a.area_id} value={a.area_id}>
                  {a.name}
                </option>
              ))}
            {players.some((c) => !c.area_id) && (
              <option value="">{t("Uten rom", "Unassigned")}</option>
            )}
          </select>
        </label>
        <div className="lighting-state media-view-switch">
          <button
            aria-label={t("Kort", "Cards")}
            aria-pressed={layout === "cards"}
            onClick={() => setLayout("cards")}
          >
            <LayoutGrid size={16} />
            {t("Kort", "Cards")}
          </button>
          <button
            aria-label={t("Liste", "List")}
            aria-pressed={layout === "list"}
            onClick={() => setLayout("list")}
          >
            <List size={16} />
            {t("Liste", "List")}
          </button>
        </div>
        <div className="climate-tabs media-filter-row">
          <nav aria-label={t("Multimediafilter", "Multimedia filters")}>
            {[
              ["all", t("Alle spillere", "All players")],
              ["playing", t("Spiller nå", "Playing now")],
              ["tv", t("TV og film", "TV & movies")],
              ["groups", t("Grupperte spillere", "Grouped players")],
            ].map(([id, label]) => (
              <button
                key={id}
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
              >
                {id === "all" ? (
                  <LayoutGrid size={17} />
                ) : id === "playing" ? (
                  <Music2 size={17} />
                ) : id === "tv" ? (
                  <Tv size={17} />
                ) : (
                  <Layers size={17} />
                )}
                {label}
              </button>
            ))}
          </nav>
          <button
            disabled={!allViews(home)}
            className="media-scenes-button"
            onClick={() => showScenes(true)}
          >
            <Sparkles size={18} />
            {t("Scener", "Scenes")}
          </button>
        </div>
      </div>
      <div className="media-summary-metrics">
        {[
          {
            Icon: Music2,
            value: offline ? "—" : playing.length,
            label: t("Spiller nå", "Playing now"),
            controls: playing,
          },
          {
            Icon: Speaker,
            value: players.length,
            label: t("Spillere", "Players"),
            controls: players,
          },
          {
            Icon: Tv,
            value: offline
              ? "—"
              : players.filter(
                  (c) =>
                    available(c) &&
                    ["tv", "projector"].includes(
                      String(c.attributes.device_class),
                    ) &&
                    !["off", "standby"].includes(c.state),
                ).length,
            label: t("TV på", "TVs on"),
            controls: players.filter(
              (c) =>
                available(c) &&
                ["tv", "projector"].includes(
                  String(c.attributes.device_class),
                ) &&
                !["off", "standby"].includes(c.state),
            ),
          },
          {
            Icon: Volume2,
            value: offline
              ? "—"
              : players.filter(
                  (c) => available(c) && c.attributes.is_volume_muted === true,
                ).length,
            label: t("Dempet", "Muted"),
            controls: players.filter(
              (c) => available(c) && c.attributes.is_volume_muted === true,
            ),
          },
        ].map(({ Icon, value, label, controls }) => (
          <MetricDetails
            key={label}
            label={label}
            controls={controls}
            home={home}
            lang={lang}
          >
            <Icon size={24} />
            <span>
              <strong>{value}</strong>
              <small>{label}</small>
            </span>
          </MetricDetails>
        ))}
      </div>
      <div
        className={`media-player-grid ${layout === "list" ? "is-list" : ""}`}
      >
        {(showAll || layout === "list" ? shown : shown.slice(0, 6)).map((c) => (
          <MediaCard
            key={c.id}
            c={c}
            home={home}
            lang={lang}
            offline={offline}
            photo={photo(c)}
          />
        ))}
      </div>
      {!shown.length && (
        <div className="media-empty">
          <AudioLines size={40} />
          <h2>
            {players.length
              ? t("Ingen spillere i dette utvalget", "No matching players")
              : t("Gi hjemmet en lydside.", "Give your home a soundtrack.")}
          </h2>
          <p>
            {players.length
              ? t(
                  "Prøv et annet rom eller filter.",
                  "Try a different room or filter.",
                )
              : t(
                  "Legg til høyttalere og TV-er under Integrasjoner. De vises automatisk her.",
                  "Add speakers and TVs under Integrations. They appear here automatically.",
                )}
          </p>
        </div>
      )}
      {shown.length > 6 && layout !== "list" && (
        <button
          className="media-show-all"
          aria-expanded={showAll}
          onClick={() => setShowAll(!showAll)}
        >
          <List size={20} />
          {showAll
            ? t("Vis færre", "Show fewer")
            : t(
                `Vis alle ${shown.length} spillere`,
                `Show all ${shown.length} players`,
              )}
        </button>
      )}
      {scenes && (
        <SettingsDialog
          title={t("Scener", "Scenes")}
          lang={lang}
          onClose={() => showScenes(false)}
        >
          <Scenes home={home} lang={lang} offline={offline} admin={admin} />
        </SettingsDialog>
      )}
    </section>
  );
}
