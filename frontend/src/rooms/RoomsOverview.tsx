import { RoomArtwork } from "./RoomArtwork";
import { useEffect, useId, useRef, useState } from "react";
import { RoomPageHeader } from "./RoomPageHeader";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  Lightbulb,
  Thermometer,
  Droplets,
  ChevronRight,
  DoorOpen,
  LayoutGrid,
} from "lucide-react";
import { api } from "../api";
import type { Home } from "../types";
import {
  roomMood,
  homeAsset,
  type HomePreferences,
} from "../home/HomeOverview";
import { usable, temperature, numeric } from "../home/homeModel";
import "./roomsOverview.css";
export function RoomsOverview({
  home,
  lang,
  offline,
  openRoom,
  manage,
}: {
  home: Home;
  lang: string;
  offline: boolean;
  openRoom: (id: string) => void;
  manage?: () => void;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchButton = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (searchOpen) searchInput.current?.focus();
  }, [searchOpen]);
  const searchId = useId();
  const [sort, setSort] = useState("name");
  const [failed, setFailed] = useState<string[]>([]);
  const prefs = useQuery({
    queryKey: ["home-preferences"],
    queryFn: () => api<HomePreferences>("home/preferences"),
  });
  const controls = home.controls.filter(
    (c) =>
      !c.diagnostic && !["person", "automation", "scene"].includes(c.domain),
  );
  const unassigned = controls.filter(
    (c) => !home.areas.some((a) => a.area_id === c.area_id),
  );
  const rooms = [
    ...home.areas,
    ...(unassigned.length
      ? [{ area_id: "", name: t("Uten rom", "No room") }]
      : []),
  ].map((a) => {
    const items = a.area_id
      ? controls.filter((c) => c.area_id === a.area_id)
      : unassigned;
    const lights = items.filter((c) => c.domain === "light");
    const temps = items.map(temperature).filter((n): n is number => n !== null);
    const humidity = items.find(
      (c) =>
        c.attributes.device_class === "humidity" &&
        c.attributes.unit_of_measurement === "%" &&
        numeric(c) !== null,
    );
    const openings = items.filter(
      (c) =>
        c.domain === "binary_sensor" &&
        ["door", "window", "opening", "garage_door"].includes(
          String(c.attributes.device_class),
        ) &&
        usable(c) &&
        c.state === "on",
    ).length;
    return {
      ...a,
      items,
      lights,
      on: lights.filter((c) => usable(c) && c.state === "on").length,
      temp: temps.length
        ? temps.reduce((a, b) => a + b, 0) / temps.length
        : null,
      humidity: humidity ? numeric(humidity) : null,
      unavailable: items.filter((c) => !usable(c)).length,
      openings,
    };
  });
  const shown = rooms
    .filter((a) =>
      a.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    )
    .sort((a, b) =>
      sort === "lights"
        ? b.on - a.on || a.name.localeCompare(b.name, lang)
        : a.name.localeCompare(b.name, lang),
    );
  const format = (n: number | null, unit: string) =>
    offline || n === null
      ? "—"
      : `${n.toLocaleString(lang === "en" ? "en-GB" : "nb-NO", { maximumFractionDigits: 1 })}${unit}`;
  return (
    <section className="rooms-overview" data-harmoni-rooms={true}>
      <RoomPageHeader
        title={t("Rom", "Rooms")}
        homeName={home.home_name}
        lang={lang}
        manage={manage}
        searchOpen={searchOpen}
        searchId={searchId}
        searchButton={searchButton}
        toggleSearch={() => {
          setSearchOpen(!searchOpen);
          if (searchOpen) setSearch("");
        }}
      />
      <div className="rooms-overview-toolbar">
        <label id={searchId} hidden={!searchOpen} className="room-search-field">
          <Search size={18} />
          <input
            ref={searchInput}
            aria-label={t("Søk etter rom", "Search rooms")}
            placeholder={t("Finn et rom…", "Find a room…")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setSearch("");
                setSearchOpen(false);
                searchButton.current?.focus();
              }
            }}
          />
        </label>
        <span>
          <LayoutGrid size={16} aria-hidden="true" />
          {home.areas.length} {t("rom", "rooms")}
          <i /> <Lightbulb size={16} />
          {offline ? "—" : rooms.reduce((sum, a) => sum + a.on, 0)}{" "}
          {t("lys på", "lights on")}
        </span>
        <select
          aria-label={t("Sorter rom", "Sort rooms")}
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="name">{t("Navn A–Å", "Name A–Z")}</option>
          <option value="lights">{t("Flest lys på", "Most lights on")}</option>
        </select>
      </div>
      <div className="rooms-overview-grid">
        {shown.map((a) => {
          const mood = roomMood(a.name),
            Icon = mood.Icon;
          const photo = prefs.data?.images[a.area_id]
            ? new URL(
                `api/home/room-image/${encodeURIComponent(a.area_id)}?v=${prefs.dataUpdatedAt}`,
                document.baseURI,
              ).href
            : homeAsset(mood.photo || "home-living");
          return (
            <button
              className="room-summary-card"
              data-card-tone="neutral"
              key={a.area_id}
              onClick={() => openRoom(a.area_id)}
            >
              <div className="room-summary-photo">
                {!failed.includes(photo) && (
                  <RoomArtwork
                    src={photo}
                    roomId={a.area_id}
                    alt=""
                    loading="lazy"
                    onError={() => setFailed((v) => [...v, photo])}
                  />
                )}
                <span className="room-summary-icon">
                  <Icon size={21} />
                </span>
                <span
                  className="room-summary-photo-state"
                  data-warning={offline || a.unavailable > 0}
                >
                  <i />
                  {offline
                    ? t("Frakoblet", "Disconnected")
                    : a.unavailable
                      ? `${a.unavailable} ${t("å sjekke", "to check")}`
                      : a.items.length
                        ? t("Tilgjengelig", "Available")
                        : t("Tomt rom", "Empty room")}
                </span>
              </div>
              <header>
                <div>
                  <h2>{a.name}</h2>
                  <small>
                    {a.items.length}{" "}
                    {a.items.length === 1
                      ? t("enhet", "device")
                      : t("enheter", "devices")}
                  </small>
                </div>
                <ChevronRight size={18} />
              </header>
              <div className="room-summary-readings">
                <span>
                  <Thermometer size={16} />
                  {format(a.temp, " °C")}
                </span>
                <span>
                  <Droplets size={16} />
                  {format(a.humidity, " %")}
                </span>
              </div>
              <footer>
                <span data-active={!offline && a.on > 0}>
                  <Lightbulb size={16} />
                  {offline ? "—" : a.on} / {a.lights.length}{" "}
                  {t("lys på", "lights on")}
                </span>
                {a.openings > 0 && !offline ? (
                  <span>
                    <DoorOpen size={15} />
                    {a.openings} {t("åpne", "open")}
                  </span>
                ) : (
                  <small>
                    {offline
                      ? t("Frakoblet", "Disconnected")
                      : a.unavailable
                        ? `${a.unavailable} ${t("utilgjengelige", "unavailable")}`
                        : a.items.length
                          ? t("Tilgjengelig", "Available")
                          : t("Ingen enheter ennå", "No devices yet")}
                  </small>
                )}
              </footer>
            </button>
          );
        })}
      </div>
      {!shown.length && (
        <p className="rooms-overview-empty">
          {rooms.length
            ? t("Ingen rom passer søket.", "No rooms match your search.")
            : t(
                "Opprett ditt første rom for å samle enhetene dine.",
                "Create your first room to organize your devices.",
              )}
        </p>
      )}
    </section>
  );
}
