import { HomeGrid } from "./HomeGrid";
import { deviceGridCards } from "./HomeDeviceGrid";
import { SimpleDashboard } from "./SimpleDashboard";
import { Presence } from "./People";
import { RoomArtwork } from "../rooms/RoomArtwork";
import { Miscellaneous, hasMiscellaneous } from "./Miscellaneous";
import { HomeAlertsDialog } from "./HomeAlerts";
import { batteryAlerts } from "./homeModel";
import { HomeBannerless } from "./CategoryIntro";
import { HomePageTools, useHomePageTools } from "./HomePageTools";
import { HomeToolbar } from "./HomeToolbar";
import { SettingsDialog } from "./SettingsDialog";
import { homeAsset, roomMood } from "./HomeOverview";
import { Multimedia } from "./Multimedia";
import { SecurityOverview } from "./SecurityOverview";
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { House, Search, Star } from "lucide-react";
import type { Home, Control } from "../types";
export function SimpleHome({
  home,
  lang,
  offline,
  renderControls,
  admin = false,
}: {
  admin?: boolean;
  home: Home;
  lang: string;
  offline: boolean;
  renderControls: (c: Control[]) => ReactNode;
}) {
  const en = lang === "en";
  const [room, setRoom] = useState("welcome"),
    [search, setSearch] = useState(""),
    [limit, setLimit] = useState(4);
  const [showAlerts, setShowAlerts] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<"devices" | "misc" | "media" | "security">(
    "devices",
  );
  const tools = useHomePageTools();
  useLayoutEffect(() => {
    if (showSearch) searchInput.current?.focus();
  }, [showSearch]);
  const controls = home.controls.filter(
    (c) =>
      !c.diagnostic &&
      ![
        "automation",
        "scene",
        "script",
        "update",
        "button",
        "camera",
        "media_player",
      ].includes(c.domain),
  );
  const shown = controls.filter(
    (c) =>
      (room === "all" ||
        (room === "welcome" && !!search) ||
        (["favorites", "welcome"].includes(room)
          ? home.favorites.includes(c.entity_id)
          : (c.area_id || "none") === room)) &&
      c.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  shown.sort(
    (a, b) =>
      Number(home.favorites.includes(b.entity_id)) -
        Number(home.favorites.includes(a.entity_id)) ||
      Number(b.capabilities.length > 0) - Number(a.capabilities.length > 0),
  );
  const lowBatteries = useMemo(() => batteryAlerts(home), [home]);
  const alerts = [
    ...controls
      .filter(
        (c) =>
          c.state === "triggered" ||
          (c.domain === "binary_sensor" &&
            ["smoke", "gas", "carbon_monoxide", "moisture"].includes(
              String(c.attributes.device_class),
            ) &&
            c.state === "on"),
      )
      .map((control) => ({ kind: "security" as const, control })),
    ...lowBatteries,
  ];
  const titles = {
    devices: en ? "Overview" : "Oversikt",
    misc: en ? "More" : "Mer",
    media: "Multimedia",
    security: en ? "Security" : "Sikkerhet",
  };
  function openSubview(next: typeof view) {
    setShowSearch(false);
    setView(next);
  }
  const toolbar = (
    <HomeToolbar
      home={home}
      lang={lang}
      title={titles[view]}
      date={new Date()}
      alerts={alerts.length}
      tools={tools}
      openAlerts={() => setShowAlerts(true)}
      openSearch={
        view === "devices"
          ? () => {
              setRoom("all");
              setLimit(8);
              setShowSearch(true);
            }
          : undefined
      }
      LocationIcon={House}
    />
  );
  const alertDialog = showAlerts && (
    <HomeAlertsDialog
      alerts={alerts}
      home={home}
      lang={lang}
      offline={offline}
      onClose={() => setShowAlerts(false)}
    />
  );
  if (view !== "devices")
    return (
      <HomePageTools.Provider value={tools.context}>
        <HomeBannerless.Provider value={true}>
          <section
            className="simple-home simple-home-dashboard"
            data-home-banners="off"
            data-phone-section={true}
          >
            {toolbar}
            {alertDialog}
            <button data-home-grid-leave onClick={() => setView("devices")}>
              {en ? "← Back to my home" : "← Tilbake til hjemmet"}
            </button>
            {view === "misc" ? (
              <Miscellaneous home={home} lang={lang} offline={offline} />
            ) : view === "media" ? (
              <Multimedia
                home={home}
                lang={lang}
                offline={offline}
                admin={false}
              />
            ) : (
              <SecurityOverview
                home={home}
                lang={lang}
                offline={offline}
                renderControls={renderControls}
              />
            )}
          </section>
        </HomeBannerless.Provider>
      </HomePageTools.Provider>
    );
  const browse = (focusSearch = false) => (
    <details className="simple-dashboard-browse" open={true}>
      <summary>{en ? "Rooms and all devices" : "Rom og alle enheter"}</summary>
      {room === "welcome" && !search && (
        <section className="simple-room-section">
          <h2>
            {en ? "Where would you like to start?" : "Hvor vil du begynne?"}
          </h2>
          <div className="simple-room-tiles">
            {home.areas.slice(0, 6).map((a) => {
              const { Icon, photo } = roomMood(a.name);
              return (
                <button
                  key={a.area_id}
                  onClick={() => {
                    setRoom(a.area_id);
                    setLimit(4);
                  }}
                >
                  <RoomArtwork
                    roomId={a.area_id}
                    src={homeAsset(photo || "home-living")}
                    alt=""
                  />
                  <span>
                    <Icon size={20} />
                    {a.name}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}
      <div className="simple-shortcuts">
        {hasMiscellaneous(home) && (
          <button onClick={() => openSubview("misc")}>
            {en ? "More" : "Diverse"}
          </button>
        )}
        {home.controls.some((c) => c.domain === "media_player") && (
          <button onClick={() => openSubview("media")}>
            {en ? "Music and TV" : "Musikk og TV"}
          </button>
        )}
        {home.controls.some((c) =>
          ["camera", "alarm_control_panel"].includes(c.domain),
        ) && (
          <button onClick={() => openSubview("security")}>
            {en ? "Cameras and security" : "Kameraer og trygghet"}
          </button>
        )}
      </div>
      <div className="simple-filters">
        <label>
          {en ? "Choose room" : "Velg rom"}
          <select
            value={room}
            onChange={(e) => {
              setRoom(e.target.value);
              setLimit(8);
            }}
          >
            <option value="welcome">{en ? "My home" : "Mitt hjem"}</option>
            <option value="all">{en ? "All rooms" : "Alle rom"}</option>
            <option value="favorites">
              {en ? "My favorites" : "Mine favoritter"}
            </option>
            {home.areas.map((a) => (
              <option key={a.area_id} value={a.area_id}>
                {a.name}
              </option>
            ))}
            <option value="none">{en ? "Without a room" : "Uten rom"}</option>
          </select>
        </label>
        <label>
          <Search size={19} />
          {en ? "Find a device" : "Finn en enhet"}
          <input
            ref={focusSearch ? searchInput : undefined}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setLimit(8);
            }}
            placeholder={
              en ? "For example: kitchen light" : "For eksempel: kjøkkenlys"
            }
          />
        </label>
      </div>
      <h2>
        {["welcome", "favorites"].includes(room) && !search
          ? en
            ? "Your favorites"
            : "Dine favoritter"
          : en
            ? "Your devices"
            : "Dine enheter"}
      </h2>
      <p className="simple-help">
        <Star size={18} />
        {en
          ? "Use the star on a device to find it in My favorites."
          : "Trykk på stjernen ved en enhet for å finne den igjen i Mine favoritter."}
      </p>
      <p aria-live="polite">
        {en
          ? `Showing ${Math.min(limit, shown.length)} of ${shown.length} devices`
          : `Viser ${Math.min(limit, shown.length)} av ${shown.length} enheter`}
      </p>
      {renderControls(shown.slice(0, limit))}
      {!shown.length && (
        <p>
          {en
            ? "No devices here. Choose another room or change your search."
            : room === "welcome" && !search
              ? "Velg et rom over for å finne enhetene dine. Stjernemerk dem du bruker ofte, så vises de her."
              : "Ingen enheter her. Velg et annet rom eller endre søket."}
        </p>
      )}
      {shown.length > limit && (
        <button className="secondary" onClick={() => setLimit((v) => v + 8)}>
          {en ? "Show more devices" : "Vis flere enheter"}
        </button>
      )}
    </details>
  );
  return (
    <HomePageTools.Provider value={tools.context}>
      <HomeBannerless.Provider value={true}>
        <section
          className="simple-home simple-home-dashboard"
          data-home-banners="off"
          data-phone-section={true}
        >
          <h1 className="home-page-title">{home.home_name}</h1>
          {toolbar}

          {offline && (
            <p role="status">
              {en
                ? "The home is disconnected. Values may be old; controls are paused."
                : "Hjemmet er frakoblet. Tallene kan være gamle, og styringen er satt på pause."}
            </p>
          )}
          {alertDialog}
          {showSearch && (
            <SettingsDialog
              title={en ? "Search devices" : "Søk etter enheter"}
              lang={lang}
              onClose={() => setShowSearch(false)}
            >
              {browse(true)}
            </SettingsDialog>
          )}

          <SimpleDashboard
            home={home}
            lang={lang}
            offline={offline}
            renderCards={(cards) => (
              <HomeGrid
                page="overview_simple"
                home={home}
                offline={offline}
                lang={lang}
                cards={[
                  ...cards,
                  ...(!home.permissions ||
                  home.permissions.includes("people.view")
                    ? [
                        {
                          id: "people",
                          title: en ? "Who's home" : "Hvem er hjemme",
                          content: (
                            <Presence
                              home={home}
                              lang={lang}
                              offline={offline}
                              admin={admin}
                            />
                          ),
                        },
                      ]
                    : []),
                  ...deviceGridCards({
                    controls: controls.filter((c) =>
                      [
                        "light",
                        "switch",
                        "input_boolean",
                        "fan",
                        "cover",
                        "lock",
                      ].includes(c.domain),
                    ),
                    home,
                    offline,
                    lang,
                  }).map((card) => ({
                    ...card,
                    defaultHidden: !home.favorites.some(
                      (id) => `device:${id}` === card.id,
                    ),
                  })),
                  {
                    id: "browse",
                    title: en ? "Rooms and all devices" : "Rom og alle enheter",
                    content: browse(),
                    w: 3,
                    h: 3,
                  },
                ]}
              />
            )}
          />
        </section>
      </HomeBannerless.Provider>
    </HomePageTools.Provider>
  );
}
