import { HomeDeviceGrid } from "./HomeDeviceGrid";
import { MetricDetails } from "./MetricDetails";
import { CategoryHeading, CategorySummary } from "./CategoryIntro";
import { ToolbarToggle, useToolbarDisclosure } from "./ToolbarToggle";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Lightbulb, Search, Power, Sun, Sparkles, House } from "lucide-react";
import { api } from "../api";
import type { Control, Home } from "../types";
import { usable } from "./homeModel";
import { homeAsset } from "./HomeOverview";
import "./lightOverview.css";

export function LightOverview({
  home,
  offline,
  lang,
  scenes,
}: {
  home: Home;
  offline: boolean;
  lang: string;
  scenes?: () => void;
}) {
  const toolbar = useToolbarDisclosure();
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const qc = useQueryClient();
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
  const summary = (
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
    >
      {[
        {
          Icon: Sun,
          value: offline ? "—" : `${on} / ${lights.length}`,
          label: t("Lys på", "Lights on"),
          controls: lights.filter((c) => usable(c) && c.state === "on"),
        },
        {
          Icon: House,
          value: home.areas.filter((a) =>
            lights.some((c) => c.area_id === a.area_id),
          ).length,
          label: t("Rom med lys", "Rooms with lights"),
          controls: lights.filter((c) =>
            home.areas.some((a) => a.area_id === c.area_id),
          ),
        },
        {
          Icon: Power,
          value: offline ? "—" : lights.filter((c) => !usable(c)).length,
          label: t("Utilgjengelige", "Unavailable"),
          controls: lights.filter((c) => !usable(c)),
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
    </CategorySummary>
  );
  return (
    <section className="light-overview">
      <CategoryHeading
        summary={summary}
        image={homeAsset("home-lighting")}
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
      {message && <p role="status">{message}</p>}
      <HomeDeviceGrid
        page="lights"
        controls={lights}
        home={home}
        offline={offline}
        lang={lang}
        visible={
          new Set(visible.flatMap((a) => a.items.map((c) => c.entity_id)))
        }
      />
    </section>
  );
}
