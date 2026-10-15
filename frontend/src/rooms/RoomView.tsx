import { RoomSettings } from "./RoomSettings";
import { useId, useState, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Settings2,
  Lightbulb,
  Thermometer,
  Shield,
  Zap,
  SlidersHorizontal,
  Camera,
  Search,
  Radio,
  Droplets,
  LayoutGrid,
  Leaf,
} from "lucide-react";
import type { Home, Control } from "../types";
import { api } from "../api";
import { overview, temperature, usable, reading } from "../home/homeModel";
import {
  roomMood,
  homeAsset,
  type HomePreferences,
} from "../home/HomeOverview";
import { CameraCard } from "../home/HomeMedia";
import "./room.css";
export function RoomView({
  home,
  room,
  rooms,
  offline,
  lang,
  admin,
  renderControls,
  add,
}: {
  home: Home;
  room: string;
  rooms: Home["areas"];
  offline: boolean;
  lang: string;
  admin: boolean;
  renderControls: (controls: Control[]) => ReactNode;
  add: () => void;
}) {
  const en = lang === "en",
    t = (nb: string, english: string) => (en ? english : nb);
  const id = useId().replaceAll(":", "");
  const [editing, setEditing] = useState(false);
  const view = useQuery({
    queryKey: ["room-view", room],
    queryFn: () =>
      api<{ hidden: string[] }>(`home/room-view/${encodeURIComponent(room)}`),
    enabled: !!room,
  });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  useEffect(() => {
    setCategory("all");
    setSearch("");
    expand([]);
  }, [room]);
  const [expanded, expand] = useState<string[]>([]);
  const prefs = useQuery({
    queryKey: ["home-preferences"],
    queryFn: () => api<HomePreferences>("home/preferences"),
  });
  const name =
    rooms.find((a) => a.area_id === room)?.name ||
    t("Uten rom", "Without a room");
  const mood = roomMood(name),
    Icon = mood.Icon;
  const personal = !!prefs.data?.images[room];
  const photo = personal
    ? new URL(
        `api/home/room-image/${encodeURIComponent(room)}?v=${prefs.dataUpdatedAt}`,
        document.baseURI,
      ).href
    : mood.photo
      ? homeAsset(mood.photo)
      : null;
  const [failedPhoto, setFailedPhoto] = useState("");
  const controls = home.controls.filter(
    (c) =>
      !c.diagnostic &&
      !["person", "automation"].includes(c.domain) &&
      (c.area_id || "") === room,
  );
  const model = overview({ ...home, controls });
  const climates = controls.filter(
    (c) =>
      c.domain === "climate" ||
      (c.domain === "sensor" &&
        (["temperature", "humidity", "carbon_dioxide", "aqi", "pm25"].includes(
          String(c.attributes.device_class),
        ) ||
          ["°C", "°F"].includes(String(c.attributes.unit_of_measurement)))),
  );
  const lights = controls.filter((c) => c.domain === "light");
  const power = controls.filter(
    (c) => c.domain === "switch" || model.meters.includes(c),
  );
  const used = new Set(
    [...climates, ...lights, ...power, ...model.security, ...model.cameras].map(
      (c) => c.id,
    ),
  );
  const groups = [
    {
      id: "lights",
      name: t("Lys & stemning", "Lighting"),
      hint: t(
        "Lysene akkurat slik du vil ha dem.",
        "Set the light for your moment.",
      ),
      Icon: Lightbulb,
      items: lights,
    },
    {
      id: "climate",
      name: t("Klima & luft", "Climate & air"),
      hint: t(
        "Temperatur, varme og luftkvalitet.",
        "Temperature, heating and air quality.",
      ),
      Icon: Thermometer,
      items: climates,
    },
    {
      id: "power",
      name: t("Strøm & stikkontakter", "Power & outlets"),
      hint: t(
        "Styr strømmen og følg målingene.",
        "Control outlets and follow readings.",
      ),
      Icon: Zap,
      items: power,
    },
    {
      id: "security",
      name: t("Sikkerhet & åpninger", "Security & openings"),
      hint: t(
        "Låser, dører og signaler fra rommet.",
        "Locks, doors and signals from this room.",
      ),
      Icon: Shield,
      items: model.security,
    },
    {
      id: "cameras",
      name: t("Kameraer", "Cameras"),
      hint: t(
        "Livevideo når kameraet er synlig.",
        "Live video while the camera is visible.",
      ),
      Icon: Camera,
      items: model.cameras,
    },
    {
      id: "other",
      name: t("Andre enheter & handlinger", "Other devices & actions"),
      hint: t(
        "Resten av det som hører til her.",
        "Everything else in this room.",
      ),
      Icon: SlidersHorizontal,
      items: controls.filter((c) => !used.has(c.id)),
    },
  ].filter((g) => g.items.length);
  const filtered = groups
    .filter((g) => category === "all" || category === g.id)
    .map((g) => ({
      ...g,
      items: g.items
        .filter((c) => !view.data?.hidden.includes(c.entity_id))
        .filter((c) =>
          `${c.name} ${g.name}`
            .toLocaleLowerCase()
            .includes(search.toLocaleLowerCase()),
        ),
    }))
    .filter((g) => g.items.length);
  const tempControl = climates.find((c) => temperature(c) !== null),
    temp = tempControl ? temperature(tempControl) : null;
  const humidity = climates.find(
    (c) => c.attributes.device_class === "humidity" && usable(c),
  );
  const air = climates.find(
    (c) =>
      ["carbon_dioxide", "aqi", "pm25"].includes(
        String(c.attributes.device_class),
      ) && usable(c),
  );
  const available = controls.filter(usable).length;
  return (
    <div className="room-detail home-overview">
      {editing && (
        <RoomSettings
          home={home}
          room={room}
          name={name}
          controls={controls}
          lang={lang}
          admin={admin}
          hidden={view.data?.hidden}
          close={() => setEditing(false)}
          add={() => {
            setEditing(false);
            add();
          }}
        />
      )}
      <header
        className={`room-detail-hero ${photo && failedPhoto !== photo ? "has-photo" : ""}`}
      >
        {photo && failedPhoto !== photo && (
          <img src={photo} alt="" onError={() => setFailedPhoto(photo)} />
        )}
        <div className="room-hero-copy">
          <span className="room-eyebrow">
            <Icon size={20} />
            {home.home_name}
          </span>
          <h1>{name}</h1>
          <p>
            {offline
              ? t(
                  "Venter på ferske data fra rommet.",
                  "Waiting for fresh room data.",
                )
              : t(
                  "Lys, komfort og kontroll. Akkurat slik du vil ha det.",
                  "Lighting, comfort and control. Just the way you like it.",
                )}
          </p>
          {admin && (
            <button
              className="room-hero-settings"
              onClick={() => setEditing(true)}
            >
              <Settings2 size={17} />
              {t("Administrer rom", "Manage rooms")}
            </button>
          )}
        </div>
        <div className="room-hero-summary">
          <Icon size={24} />
          <span>{t("Ditt rom, samlet", "Your room, connected")}</span>
          <strong>{controls.length}</strong>
          <small>
            {t("kontroller og målepunkter", "controls and readings")}
          </small>
        </div>
        {photo && failedPhoto !== photo && (
          <small className="room-photo-caption">
            {personal
              ? t("Ditt rombilde", "Your room photo")
              : t("Stemningsbilde", "Decorative image")}
          </small>
        )}
      </header>
      <div
        className="room-at-a-glance"
        aria-label={t("Romstatus", "Room status")}
      >
        {!!lights.length && (
          <div data-kind="lights">
            <Lightbulb />
            <span>
              {t("Lys på", "Lights on")}
              <strong>
                {offline
                  ? "—"
                  : lights.filter((c) => usable(c) && c.state === "on").length}
                <small> / {lights.length}</small>
              </strong>
            </span>
          </div>
        )}
        {tempControl && (
          <div data-kind="temperature">
            <Thermometer />
            <span>
              {t("Temperatur", "Temperature")}
              <strong>
                {offline
                  ? "—"
                  : temp?.toLocaleString(en ? "en-GB" : "nb-NO", {
                      maximumFractionDigits: 1,
                    })}
                <small> °C</small>
              </strong>
              <small>{tempControl.name}</small>
            </span>
          </div>
        )}
        {humidity && (
          <div data-kind="humidity">
            <Droplets />
            <span>
              {t("Luftfuktighet", "Humidity")}
              <strong>{offline ? "—" : reading(humidity, lang)}</strong>
            </span>
          </div>
        )}
        {air && (
          <div data-kind="air">
            <Leaf />
            <span>
              {t("Luftkvalitet", "Air quality")}
              <strong>{offline ? "—" : reading(air, lang)}</strong>
              <small>{air.name}</small>
            </span>
          </div>
        )}
        <div data-kind="connection">
          <Radio />
          <span>
            {t("Tilkobling", "Connection")}
            <strong>
              {offline
                ? t("Ukjent", "Unknown")
                : model.unavailable.length
                  ? `${model.unavailable.length} ${t("å sjekke", "to check")}`
                  : controls.length
                    ? t("Tilgjengelig", "Available")
                    : t("Ingen enheter", "No devices")}
            </strong>
            <small>
              {offline
                ? t("Venter på oppdatering", "Waiting for an update")
                : `${available} / ${controls.length} ${t("tilgjengelige", "available")}`}
            </small>
          </span>
        </div>
      </div>
      {!!model.alerts.length && (
        <div className="notice" role="status">
          <Shield size={20} />
          {offline
            ? t("Sikkerhetsstatus er ukjent.", "Security status is unknown.")
            : t("Se over sikkerhetsstatus: ", "Check security status: ")}
          {!offline && model.alerts.map((c) => c.name).join(", ")}
        </div>
      )}
      {!!groups.length && (
        <div className="room-navigation">
          <nav aria-label={t("Inndelinger i rommet", "Room sections")}>
            <button
              aria-pressed={category === "all"}
              onClick={() => {
                setCategory("all");
                setSearch("");
              }}
            >
              <LayoutGrid size={17} />
              {t("Alle", "All")}
              <span>{controls.length}</span>
            </button>
            {groups.map((g) => (
              <button
                key={g.id}
                aria-pressed={category === g.id}
                onClick={() => {
                  setSearch("");
                  setCategory(g.id);
                }}
              >
                <g.Icon size={17} />
                {g.name}
                <span>{g.items.length}</span>
              </button>
            ))}
          </nav>
          <label className="room-detail-search">
            <Search size={18} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t(
                "Finn noe i rommet…",
                "Find something in this room…",
              )}
              aria-label={t("Søk i rommet", "Search this room")}
            />
          </label>
        </div>
      )}
      {!controls.length && (
        <div className="home-empty-view">
          <Icon size={32} />
          <h2>{t("Rom for mer", "Room for more")}</h2>
          <p>
            {t(
              "Legg enheter i dette rommet for å samle lys, klima og styring her.",
              "Assign devices to this room to bring lighting, climate and controls together.",
            )}
          </p>
          {admin && (
            <button className="home-customize" onClick={() => setEditing(true)}>
              {t("Administrer rom", "Manage rooms")}
            </button>
          )}
        </div>
      )}
      {!!controls.length && !filtered.length && (
        <p className="empty" role="status">
          {search
            ? t("Ingen enheter passer søket.", "No matching devices.")
            : t(
                "Ingen synlige kontroller her. Velg Administrer rom for å vise dem igjen.",
                "No visible controls here. Use Manage room to show them again.",
              )}
        </p>
      )}
      <div className="room-sections">
        {filtered.map((g) => (
          <section
            className={`room-section room-section-${g.id}`}
            id={`${id}-${g.id}`}
            key={g.id}
            aria-labelledby={`${id}-${g.id}-title`}
          >
            <header>
              <span className="room-section-icon">
                <g.Icon size={22} />
              </span>
              <div>
                <h2 id={`${id}-${g.id}-title`}>{g.name}</h2>
                <p>{g.hint}</p>
              </div>
              <span className="room-section-count">{g.items.length}</span>
            </header>
            {g.id === "cameras" ? (
              <div className="home-camera-grid">
                {(expanded.includes(g.id) ? g.items : g.items.slice(0, 3)).map(
                  (c) => (
                    <CameraCard
                      key={c.id}
                      c={c}
                      offline={offline}
                      lang={lang}
                    />
                  ),
                )}
              </div>
            ) : (
              renderControls(
                expanded.includes(g.id) ? g.items : g.items.slice(0, 12),
              )
            )}
            {g.items.length > (g.id === "cameras" ? 3 : 12) && (
              <button
                className="home-customize"
                onClick={() =>
                  expand(
                    expanded.includes(g.id)
                      ? expanded.filter((v) => v !== g.id)
                      : [...expanded, g.id],
                  )
                }
              >
                {expanded.includes(g.id)
                  ? t("Vis færre", "Show fewer")
                  : `${t("Vis alle", "Show all")} (${g.items.length})`}
              </button>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
