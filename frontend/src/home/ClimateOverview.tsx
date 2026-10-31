import { useContext } from "react";
import { HeaderAppearance } from "./HomeAppearance";
import { HomeDeviceGrid } from "./HomeDeviceGrid";
import { MetricDetails } from "./MetricDetails";
import { CategoryHeading, CategorySummary } from "./CategoryIntro";
import { RoomArtwork } from "../rooms/RoomArtwork";
import { ToolbarToggle, useToolbarDisclosure } from "./ToolbarToggle";
import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import {
  Thermometer,
  Droplets,
  Leaf,
  Wind,
  Search,
  House,
  ChevronRight,
  Flame,
  Snowflake,
  LayoutGrid,
  List,
  Plus,
  Minus,
} from "lucide-react";
import type { Control, Home } from "../types";
import { numeric, temperature, usable, reading } from "./homeModel";
import { homeAsset, roomMood, type HomePreferences } from "./HomeOverview";
import { SettingsDialog } from "./SettingsDialog";
import "./lightOverview.css";
import "./climateOverview.css";

const airClasses = [
  "carbon_dioxide",
  "aqi",
  "pm25",
  "pm10",
  "volatile_organic_compounds",
  "volatile_organic_compounds_parts",
];
function category(c: Control) {
  if (c.domain === "fan") return "ventilation";
  if (
    c.domain === "climate" ||
    c.attributes.device_class === "temperature" ||
    ["°C", "°F"].includes(String(c.attributes.unit_of_measurement))
  )
    return "temperature";
  if (c.attributes.device_class === "humidity") return "humidity";
  if (airClasses.includes(String(c.attributes.device_class))) return "air";
  return "";
}
const mean = (values: (number | null)[]) => {
  const good = values.filter((v): v is number => v !== null);
  return good.length ? good.reduce((a, b) => a + b, 0) / good.length : null;
};
export function ClimateOverview({
  home,
  offline,
  lang,
  renderControls,
}: {
  home: Home;
  offline: boolean;
  lang: string;
  renderControls: (c: Control[]) => ReactNode;
}) {
  const toolbar = useToolbarDisclosure();
  const harmony = useContext(HeaderAppearance);
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const prefs = useQuery({
    queryKey: ["home-preferences"],
    queryFn: () => api<HomePreferences>("home/preferences"),
  });
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [room, setRoom] = useState("all");
  const [layout, setLayout] = useState("cards");
  const [opened, setOpened] = useState<string | null>(null);
  const fmt = (v: number | null, unit = "") =>
    v === null || offline
      ? "—"
      : `${v.toLocaleString(lang === "en" ? "en-GB" : "nb-NO", { maximumFractionDigits: 1 })}${unit}`;
  const controls = home.controls.filter((c) => !c.diagnostic && !!category(c));
  const rooms = [...home.areas, { area_id: "", name: t("Uten rom", "No room") }]
    .map((a) => {
      const items = controls.filter(
        (c) =>
          (home.areas.some((r) => r.area_id === c.area_id) ? c.area_id : "") ===
          a.area_id,
      );
      const thermostat = items.find((c) => c.domain === "climate" && usable(c));
      const temp = thermostat ? temperature(thermostat) : null;
      const humidity = items
        .filter(
          (c) =>
            category(c) === "humidity" &&
            c.attributes.unit_of_measurement === "%",
        )
        .map(numeric)
        .filter((v) => v !== null && v >= 0 && v <= 100);
      return {
        ...a,
        items,
        thermostat,
        temp:
          temp ??
          mean(
            items.filter((c) => category(c) === "temperature").map(temperature),
          ),
        humidity: mean(humidity),
        air: items.filter((c) => category(c) === "air"),
        fans: items.filter((c) => category(c) === "ventilation"),
      };
    })
    .filter((a) => a.items.length);
  const shown = rooms.filter(
    (a) =>
      (room === "all" || `room:${a.area_id}` === room) &&
      `${a.name} ${a.items.map((c) => c.name).join(" ")}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()) &&
      (kind === "all" || a.items.some((c) => category(c) === kind)),
  );
  const active = rooms.find((a) => a.area_id === opened);
  const co2 = controls.filter(
    (c) =>
      c.attributes.device_class === "carbon_dioxide" &&
      c.attributes.unit_of_measurement === "ppm",
  );
  const tabs = [
    { id: "all", label: t("Oversikt", "Overview"), Icon: LayoutGrid },
    {
      id: "temperature",
      label: t("Temperatur", "Temperature"),
      Icon: Thermometer,
    },
    { id: "humidity", label: t("Fuktighet", "Humidity"), Icon: Droplets },
    { id: "air", label: t("Luftkvalitet", "Air quality"), Icon: Leaf },
    { id: "ventilation", label: t("Ventilasjon", "Ventilation"), Icon: Wind },
  ];
  const summary = (
    <CategorySummary
      image={homeAsset("home-climate")}
      eyebrow={t("KLIMA I HJEMMET", "HOME CLIMATE")}
      title={t("Inneklimaet akkurat nå", "Your indoor climate now")}
      description={
        offline
          ? t(
              "Venter på ferske målinger fra hjemmet.",
              "Waiting for fresh readings from your home.",
            )
          : t(
              `Målinger fra ${rooms.length} rom, samlet på ett sted.`,
              `Readings from ${rooms.length} rooms, together in one place.`,
            )
      }
    >
      <MetricDetails
        label={t("Snittemperatur", "Average temperature")}
        controls={rooms.flatMap((a) =>
          a.thermostat && temperature(a.thermostat) !== null
            ? [a.thermostat]
            : a.items.filter(
                (c) => category(c) === "temperature" && temperature(c) !== null,
              ),
        )}
        home={home}
        lang={lang}
      >
        <Thermometer />
        <span>
          <strong>{fmt(mean(rooms.map((a) => a.temp)), " °C")}</strong>
          <small>{t("Snittemperatur", "Average temperature")}</small>
        </span>
      </MetricDetails>
      <MetricDetails
        label={t("Snittfuktighet", "Average humidity")}
        controls={controls.filter(
          (c) =>
            category(c) === "humidity" &&
            c.attributes.unit_of_measurement === "%" &&
            numeric(c) !== null &&
            numeric(c)! >= 0 &&
            numeric(c)! <= 100,
        )}
        home={home}
        lang={lang}
      >
        <Droplets />
        <span>
          <strong>{fmt(mean(rooms.map((a) => a.humidity)), " %")}</strong>
          <small>{t("Snittfuktighet", "Average humidity")}</small>
        </span>
      </MetricDetails>
      <MetricDetails
        label={t("CO₂ · gjennomsnitt", "CO₂ · average")}
        controls={co2.filter((c) => numeric(c) !== null)}
        home={home}
        lang={lang}
      >
        <Leaf />
        <span>
          <strong>{fmt(mean(co2.map(numeric)), " ppm")}</strong>
          <small>{t("CO₂ · gjennomsnitt", "CO₂ · average")}</small>
        </span>
      </MetricDetails>
    </CategorySummary>
  );
  return (
    <section className="climate-overview">
      <CategoryHeading
        summary={summary}
        image={homeAsset("home-climate")}
        Icon={Thermometer}
        title={t("Klima", "Climate")}
        subtitle={t(
          "Et behagelig hjem. Alltid.",
          "A comfortable home. Always.",
        )}
      >
        <ToolbarToggle {...toolbar} lang={lang} />
      </CategoryHeading>
      <div
        className="lighting-toolbar climate-toolbar"
        id={toolbar.id}
        hidden={!toolbar.expanded}
        data-collapsible-toolbar
        role="group"
        aria-label={t("Filtrer klima", "Filter climate")}
      >
        <label className="lighting-search">
          <Search size={18} />
          <input
            aria-label={t("Søk i klima", "Search climate")}
            placeholder={t(
              "Søk etter rom eller enhet…",
              "Search rooms or devices…",
            )}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="lighting-room-filter">
          <House size={18} />
          <select
            aria-label={t("Velg klimarom", "Choose climate room")}
            value={room}
            onChange={(e) => setRoom(e.target.value)}
          >
            <option value="all">
              {t("Alle rom", "All rooms")} ({rooms.length})
            </option>
            {rooms.map((a) => (
              <option value={`room:${a.area_id}`} key={a.area_id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <div className="lighting-state climate-layout">
          {[
            { id: "cards", Icon: LayoutGrid, label: t("Kort", "Cards") },
            { id: "list", Icon: List, label: t("Liste", "List") },
          ].map(({ id, Icon, label }) => (
            <button
              key={id}
              aria-pressed={layout === id}
              onClick={() => setLayout(id)}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
        <div className="climate-tabs">
          {tabs.map(({ id, Icon, label }) => (
            <button
              key={id}
              aria-pressed={kind === id}
              onClick={() => setKind(id)}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </div>
      </div>
      {summary}
      {harmony ? (
        <HomeDeviceGrid
          page="climate"
          controls={controls}
          home={home}
          offline={offline}
          lang={lang}
          visible={
            new Set(
              shown.flatMap((a) =>
                a.items
                  .filter((c) => kind === "all" || category(c) === kind)
                  .map((c) => c.entity_id),
              ),
            )
          }
        />
      ) : (
        <>
          <div className="climate-room-heading">
            <h2>
              {room === "all"
                ? t("Hjemmets rom", "Rooms in your home")
                : rooms.find((a) => `room:${a.area_id}` === room)?.name}
            </h2>
            <span>
              {shown.length} {t("rom", "rooms")}
            </span>
          </div>
          <div
            className={`climate-room-grid ${layout === "list" ? "is-list" : ""}`}
          >
            {shown.map((a) => {
              const mood = roomMood(a.name),
                Icon = mood.Icon;
              const photo = prefs.data?.images[a.area_id]
                ? new URL(
                    `api/home/room-image/${encodeURIComponent(a.area_id)}?v=${prefs.dataUpdatedAt}`,
                    document.baseURI,
                  ).href
                : homeAsset(mood.photo || "home-living");
              const hvac = offline
                ? ""
                : String(a.thermostat?.attributes.hvac_action || "");
              const heating = hvac === "heating",
                cooling = hvac === "cooling";
              const target = a.thermostat?.attributes.temperature;
              const unit = a.thermostat?.attributes.temperature_unit;
              const desired =
                typeof target === "number" && (unit === "°C" || unit === "°F")
                  ? unit === "°F"
                    ? ((target - 32) * 5) / 9
                    : target
                  : null;
              const air = a.air.find((c) => usable(c)) || a.air[0];
              const primary =
                kind === "humidity"
                  ? fmt(a.humidity, " %")
                  : kind === "air"
                    ? air && !offline
                      ? reading(air, lang)
                      : "—"
                    : kind === "ventilation"
                      ? `${a.fans.length} ${t("enheter", "devices")}`
                      : fmt(a.temp, " °C");
              const dialLevel = offline
                ? 0
                : kind === "humidity"
                  ? (a.humidity ?? 0)
                  : ["air", "ventilation"].includes(kind)
                    ? 0
                    : a.temp === null
                      ? 0
                      : Math.min(100, Math.max(0, ((a.temp - 5) / 30) * 100));
              return (
                <article
                  className="climate-room-card"
                  data-mode={heating ? "heating" : cooling ? "cooling" : "idle"}
                  key={a.area_id}
                >
                  <button
                    type="button"
                    className="climate-room-banner"
                    onClick={() => setOpened(a.area_id)}
                    aria-label={`${t("Åpne klima for", "Open climate for")} ${a.name}`}
                  >
                    {!failedImages.includes(photo) && (
                      <RoomArtwork
                        src={photo}
                        alt=""
                        loading="lazy"
                        onError={() =>
                          setFailedImages((previous) => [...previous, photo])
                        }
                      />
                    )}
                    <span className="climate-room-icon">
                      <Icon size={22} />
                    </span>
                    <strong>{a.name}</strong>
                    <ChevronRight size={18} />
                  </button>
                  <div className="climate-room-reading">
                    <div>
                      <strong>{primary}</strong>
                      <small>
                        {kind === "all" || kind === "temperature"
                          ? desired !== null
                            ? `${t("Ønsket", "Target")} ${fmt(desired, " °C")}`
                            : t("Målt temperatur", "Measured temperature")
                          : kind === "humidity"
                            ? t("Relativ luftfuktighet", "Relative humidity")
                            : kind === "air"
                              ? air?.name || t("Ingen måling", "No reading")
                              : t("Åpne for styring", "Open controls")}
                      </small>
                    </div>
                    <div className="climate-dial" aria-hidden="true">
                      <svg viewBox="0 0 80 80">
                        <circle cx="40" cy="40" r="31" />
                        <circle
                          cx="40"
                          cy="40"
                          r="31"
                          pathLength="100"
                          strokeDasharray={`${dialLevel} 100`}
                        />
                      </svg>
                      {kind === "humidity" ? (
                        <Droplets />
                      ) : kind === "air" ? (
                        <Leaf />
                      ) : kind === "ventilation" ? (
                        <Wind />
                      ) : heating ? (
                        <Flame />
                      ) : cooling ? (
                        <Snowflake />
                      ) : (
                        <Thermometer />
                      )}
                    </div>
                  </div>
                  <div className="climate-mode">
                    {offline
                      ? t("Frakoblet", "Disconnected")
                      : heating
                        ? t("Varmer", "Heating")
                        : cooling
                          ? t("Kjøler", "Cooling")
                          : hvac === "idle"
                            ? t("Hviler", "Idle")
                            : a.thermostat?.state === "off"
                              ? t("Av", "Off")
                              : a.thermostat
                                ? t("Klimastyring", "Climate control")
                                : t("Sensorer", "Sensors")}
                  </div>
                  {a.items
                    .filter(
                      (c) =>
                        c.domain === "climate" &&
                        c.capabilities.some((cap) =>
                          cap.actions.includes("set_temperature"),
                        ),
                    )
                    .map((c) => (
                      <QuickTemperature
                        key={c.entity_id}
                        c={c}
                        lang={lang}
                        offline={offline || !home.connected}
                        showName={
                          a.items.filter((c) => c.domain === "climate").length >
                          1
                        }
                      />
                    ))}
                  <footer>
                    <span>
                      <Droplets size={16} />
                      {fmt(a.humidity, " %")}
                    </span>
                    <span>
                      <Leaf size={16} />
                      {air && !offline
                        ? reading(air, lang)
                        : t("Ingen luftmåling", "No air reading")}
                    </span>
                  </footer>
                </article>
              );
            })}
          </div>
          {!shown.length && (
            <p className="climate-empty">
              {controls.length
                ? t(
                    "Ingen rom passer med filtrene dine.",
                    "No rooms match your filters.",
                  )
                : t(
                    "Koble til termostater eller klimasensorer for å se målinger her.",
                    "Connect thermostats or climate sensors to see readings here.",
                  )}
            </p>
          )}
        </>
      )}
      {active && (
        <SettingsDialog
          title={active.name}
          lang={lang}
          onClose={() => setOpened(null)}
        >
          <p className="climate-dialog-hint">
            {t(
              "Temperatur, innstillinger og målinger for rommet.",
              "Temperature, settings and readings for this room.",
            )}
          </p>
          {renderControls(active.items)}
        </SettingsDialog>
      )}
    </section>
  );
}

function QuickTemperature({
  c,
  lang,
  offline,
  showName,
}: {
  c: Control;
  lang: string;
  offline: boolean;
  showName: boolean;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const cap = c.capabilities.find((v) => v.actions.includes("set_temperature"));
  const target = c.attributes.temperature;
  const min = cap?.minimum,
    max = cap?.maximum,
    step = cap?.step;
  const valid =
    typeof target === "number" &&
    Number.isFinite(target) &&
    typeof min === "number" &&
    typeof max === "number" &&
    typeof step === "number" &&
    step > 0 &&
    max > min;
  const blocked = offline || !usable(c) || busy || !valid;
  async function adjust(direction: number) {
    if (blocked || !valid) return;
    const value = Number(
      Math.min(
        max!,
        Math.max(
          min!,
          min! + Math.round((target - min!) / step! + direction) * step!,
        ),
      ).toFixed(6),
    );
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ status: string }>(
        `controls/${encodeURIComponent(c.entity_id)}/commands`,
        "POST",
        { action: "set_temperature", value },
      );
      if (result.status === "accepted_unconfirmed")
        setMessage(
          t("Sendt – venter på bekreftelse.", "Sent – awaiting confirmation."),
        );
      if (result.status === "failed")
        setMessage(
          t("Kunne ikke endre temperaturen.", "Could not change temperature."),
        );
      await qc.invalidateQueries({ queryKey: ["home"] });
    } catch {
      setMessage(
        t("Kunne ikke endre temperaturen.", "Could not change temperature."),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="climate-quick-temperature" aria-busy={busy}>
      {showName && <small>{c.name}</small>}
      <div>
        <button
          type="button"
          aria-label={`${t("Senk temperatur", "Decrease temperature")} ${c.name}`}
          disabled={blocked || (valid && target <= min!)}
          onClick={() => void adjust(-1)}
        >
          <Minus size={17} />
        </button>
        <span>
          {t("Ønsket", "Target")}{" "}
          <strong>
            {typeof target === "number" && usable(c) && !offline
              ? target.toLocaleString(lang === "en" ? "en-GB" : "nb-NO", {
                  maximumFractionDigits: 2,
                })
              : "—"}{" "}
            {String(c.attributes.temperature_unit || cap?.unit || "°")}
          </strong>
        </span>
        <button
          type="button"
          aria-label={`${t("Øk temperatur", "Increase temperature")} ${c.name}`}
          disabled={blocked || (valid && target >= max!)}
          onClick={() => void adjust(1)}
        >
          <Plus size={17} />
        </button>
      </div>
      {message && <small role="status">{message}</small>}
    </div>
  );
}
