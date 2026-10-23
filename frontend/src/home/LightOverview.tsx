import { CategoryHeading, CategorySummary } from "./CategoryIntro";
import { SettingsDialog } from "./SettingsDialog";
import { RoomArtwork } from "../rooms/RoomArtwork";
import { ToolbarToggle, useToolbarDisclosure } from "./ToolbarToggle";
import { useState, type ReactNode, type CSSProperties } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Lightbulb,
  Search,
  Power,
  Sun,
  Sparkles,
  ChevronRight,
  House,
} from "lucide-react";
import { api } from "../api";
import type { Control, Home } from "../types";
import { LightColor } from "../LightColor";
import { usable } from "./homeModel";
import { homeAsset, roomMood, type HomePreferences } from "./HomeOverview";
import "./lightOverview.css";

export function LightOverview({
  home,
  offline,
  lang,
  openRoom,
  scenes,
  renderControls,
}: {
  home: Home;
  offline: boolean;
  lang: string;
  openRoom?: (id: string) => void;
  scenes?: () => void;
  renderControls?: (controls: Control[]) => ReactNode;
}) {
  const [opened, open] = useState<string | null>(null);
  const selected = home.controls.find((c) => c.entity_id === opened);
  const toolbar = useToolbarDisclosure();
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const qc = useQueryClient();
  const prefs = useQuery({
    queryKey: ["home-preferences"],
    queryFn: () => api<HomePreferences>("home/preferences"),
  });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [room, setRoom] = useState<string | null>(null);
  const [pending, setPending] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const lights = home.controls.filter(
    (c) => c.domain === "light" && !c.diagnostic,
  );
  const rooms = [...home.areas, { area_id: "", name: t("Uten rom", "No room") }]
    .map((a) => ({
      ...a,
      items: lights.filter(
        (c) =>
          (home.areas.some((r) => r.area_id === c.area_id) ? c.area_id : "") ===
          a.area_id,
      ),
    }))
    .filter((a) => a.items.length);
  const on = lights.filter((c) => usable(c) && c.state === "on").length;
  async function send(c: Control, action: string, value?: number | number[]) {
    if (
      offline ||
      !home.connected ||
      !usable(c) ||
      pending.includes(c.entity_id)
    )
      return;
    setPending((p) => [...p, c.entity_id]);
    try {
      const r = await api<{ status: string }>(
        `controls/${encodeURIComponent(c.entity_id)}/commands`,
        "POST",
        { action, ...(value === undefined ? {} : { value }) },
      );
      if (r.status === "accepted_unconfirmed")
        setMessage(
          t(
            "Sendt – venter på bekreftelse fra lyset.",
            "Sent – waiting for the light to confirm.",
          ),
        );
      if (r.status === "failed")
        setMessage(
          t(
            "En handling feilet. Kontroller lyset før du prøver igjen.",
            "An action failed. Check the light before retrying.",
          ),
        );
      await qc.invalidateQueries({ queryKey: ["home"] });
    } catch {
      setMessage(
        t(
          "Kunne ikke styre lyset. Kontroller tilkoblingen.",
          "Could not control the light. Check the connection.",
        ),
      );
    } finally {
      setPending((p) => p.filter((id) => id !== c.entity_id));
    }
  }
  async function allOff() {
    setMessage("");
    // Sequential batches avoid flooding the hub with simultaneous commands.
    const targets = lights.filter(
      (c) =>
        usable(c) &&
        c.state === "on" &&
        c.capabilities.some((cap) => cap.actions.includes("turn_off")),
    );
    for (let i = 0; i < targets.length; i += 4)
      await Promise.all(
        targets.slice(i, i + 4).map((c) => send(c, "turn_off")),
      );
  }
  const visible = rooms
    .filter((a) => room === null || a.area_id === room)
    .map((a) => ({
      ...a,
      items: a.items.filter(
        (c) =>
          `${a.name} ${c.name}`
            .toLocaleLowerCase()
            .includes(search.toLocaleLowerCase()) &&
          (filter === "all" || (usable(c) && c.state === filter)),
      ),
    }))
    .filter((a) => a.items.length);
  return (
    <section className="light-overview">
      <CategoryHeading
        Icon={Lightbulb}
        title={t("Lys", "Lights")}
        subtitle={t(
          "Styr belysningen i hele hjemmet.",
          "Lighting for your whole home.",
        )}
      >
        <ToolbarToggle {...toolbar} lang={lang} />
      </CategoryHeading>
      <div
        className="lighting-toolbar"
        id={toolbar.id}
        hidden={!toolbar.expanded}
        data-collapsible-toolbar
        role="group"
        aria-label={t("Filtrer og styr lys", "Filter and control lights")}
      >
        <label className="lighting-search">
          <Search size={18} />
          <input
            aria-label={t("Søk etter rom eller lys", "Search rooms or lights")}
            placeholder={t(
              "Søk etter rom eller enhet…",
              "Search rooms or devices…",
            )}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div
          className="lighting-state"
          aria-label={t("Lysstatus", "Light status")}
        >
          {[
            ["all", t("Alle", "All")],
            ["on", t("På", "On")],
            ["off", t("Av", "Off")],
          ].map(([id, label]) => (
            <button
              key={id}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="lighting-room-filter">
          <House size={18} aria-hidden="true" />
          <select
            aria-label={t("Velg rom", "Choose room")}
            value={room === null ? "all" : `room:${room}`}
            onChange={(e) =>
              setRoom(e.target.value === "all" ? null : e.target.value.slice(5))
            }
          >
            <option value="all">
              {t("Alle rom", "All rooms")} ({rooms.length})
            </option>
            {rooms.map((a) => (
              <option key={a.area_id} value={`room:${a.area_id}`}>
                {a.name} ({a.items.length})
              </option>
            ))}
          </select>
        </label>
        {scenes && (
          <button className="lighting-scenes" onClick={scenes}>
            <Sparkles size={18} />
            {t("Scener", "Scenes")}
          </button>
        )}
        <button
          className="lighting-off"
          disabled={offline || !home.connected || !on || !!pending.length}
          onClick={() => void allOff()}
        >
          <Power size={18} />
          <span>
            <strong>{t("Slå av alle lys", "Turn off all lights")}</strong>
            <small>{t("I hele hjemmet", "Across your home")}</small>
          </span>
        </button>
      </div>
      <CategorySummary
        image={homeAsset("home-lighting")}
        eyebrow={t("LYS I HJEMMET", "HOME LIGHTING")}
        title={t(
          "God stemning starter med riktig lys.",
          "A good atmosphere starts with the right light.",
        )}
        description={
          offline
            ? t(
                "Venter på ferske data fra hjemmet.",
                "Waiting for fresh data from your home.",
              )
            : t(
                "Enklere hverdag. Et smartere hjem.",
                "Everyday comfort. A smarter home.",
              )
        }
        action={
          scenes && (
            <button onClick={scenes}>
              <Sparkles size={18} />
              {t("Stemningsmodus", "Scenes")}
              <ChevronRight size={18} />
            </button>
          )
        }
      >
        {[
          {
            Icon: Sun,
            value: offline ? "—" : `${on} / ${lights.length}`,
            label: t("Lys på", "Lights on"),
          },
          {
            Icon: House,
            value: home.areas.filter((a) =>
              lights.some((c) => c.area_id === a.area_id),
            ).length,
            label: t("Rom med lys", "Rooms with lights"),
          },
          {
            Icon: Power,
            value: offline ? "—" : lights.filter((c) => !usable(c)).length,
            label: t("Utilgjengelige", "Unavailable"),
          },
        ].map(({ Icon, value, label }) => (
          <div key={label}>
            <Icon size={24} />
            <span>
              <strong>{value}</strong>
              <small>{label}</small>
            </span>
          </div>
        ))}
      </CategorySummary>
      {message && <p role="status">{message}</p>}
      <div className="lighting-grid">
        {visible.map((a) => {
          const mood = roomMood(a.name),
            Icon = mood.Icon;
          const photo = prefs.data?.images[a.area_id]
            ? new URL(
                `api/home/room-image/${encodeURIComponent(a.area_id)}?v=${prefs.dataUpdatedAt}`,
                document.baseURI,
              ).href
            : homeAsset(mood.photo || "home-living");
          return (
            <article className="lighting-room" key={a.area_id}>
              <header>
                <RoomArtwork src={photo} alt="" loading="lazy" />
                <Icon size={24} />
                <div>
                  <h2>{a.name}</h2>
                  <small>
                    {a.items.length} {t("lys", "lights")}
                  </small>
                </div>
                {openRoom && a.area_id && (
                  <button
                    aria-label={`${t("Åpne rom", "Open room")} ${a.name}`}
                    onClick={() => openRoom(a.area_id)}
                  >
                    <ChevronRight />
                  </button>
                )}
              </header>
              <div className="lighting-devices">
                {a.items.map((c) => (
                  <LightTile
                    key={c.entity_id}
                    c={c}
                    lang={lang}
                    blocked={
                      offline ||
                      !home.connected ||
                      !usable(c) ||
                      pending.includes(c.entity_id)
                    }
                    busy={pending.includes(c.entity_id)}
                    send={send}
                    onOpen={
                      renderControls ? () => open(c.entity_id) : undefined
                    }
                  />
                ))}
              </div>
            </article>
          );
        })}
      </div>
      {!visible.length && (
        <p className="lighting-empty">
          {lights.length
            ? t(
                "Ingen lys passer med valgene dine.",
                "No lights match your filters.",
              )
            : t(
                "Legg til lys og knytt dem til et rom for å komme i gang.",
                "Add lights and assign them to a room to get started.",
              )}
        </p>
      )}
      {selected && renderControls && (
        <SettingsDialog
          title={selected.name}
          lang={lang}
          onClose={() => open(null)}
        >
          {renderControls([selected])}
        </SettingsDialog>
      )}
    </section>
  );
}
function LightTile({
  c,
  lang,
  blocked,
  busy,
  send,
  onOpen,
}: {
  c: Control;
  lang: string;
  blocked: boolean;
  busy: boolean;
  onOpen?: () => void;
  send: (
    c: Control,
    action: string,
    value?: number | number[],
  ) => Promise<void>;
}) {
  const on = c.state === "on" && usable(c),
    actions = c.capabilities.flatMap((cap) => cap.actions);
  const measured =
    on && typeof c.attributes.brightness === "number"
      ? Math.round((c.attributes.brightness / 255) * 100)
      : 0;
  const [draft, setDraft] = useState<number | null>(null);
  const value = draft ?? measured;
  return (
    <div className="lighting-tile" data-on={on} aria-busy={busy}>
      <div className="lighting-tile-top">
        <Lightbulb size={18} />
        <strong>
          {onOpen ? (
            <button
              className="device-open-detail"
              onClick={onOpen}
              aria-label={`${lang === "en" ? "Open" : "Åpne"} ${c.name}`}
            >
              {c.name}
              <ChevronRight size={14} />
            </button>
          ) : (
            c.name
          )}
        </strong>
        <button
          className="lighting-switch"
          role="switch"
          aria-checked={on}
          aria-label={c.name}
          disabled={blocked || !actions.includes(on ? "turn_off" : "turn_on")}
          onClick={() => void send(c, on ? "turn_off" : "turn_on")}
        >
          <span />
        </button>
      </div>
      {actions.includes("set_brightness") && (
        <div className="lighting-dimmer">
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            aria-label={`${c.name} ${lang === "en" ? "brightness" : "lysstyrke"}`}
            value={value}
            disabled={blocked}
            style={{ "--level": `${value}%` } as CSSProperties}
            onChange={(e) => setDraft(Number(e.target.value))}
            onPointerUp={(e) => {
              void send(c, "set_brightness", Number(e.currentTarget.value));
              setDraft(null);
            }}
            onKeyUp={(e) => {
              if (
                [
                  "ArrowLeft",
                  "ArrowRight",
                  "ArrowUp",
                  "ArrowDown",
                  "Home",
                  "End",
                  "PageUp",
                  "PageDown",
                ].includes(e.key)
              ) {
                void send(c, "set_brightness", Number(e.currentTarget.value));
                setDraft(null);
              }
            }}
          />
          <output>{value}%</output>
        </div>
      )}
      <LightColor
        c={c}
        lang={lang}
        disabled={blocked}
        change={(action, value) => void send(c, action, value)}
      />
      {!usable(c) && (
        <small>{lang === "en" ? "Unavailable" : "Utilgjengelig"}</small>
      )}
    </div>
  );
}
