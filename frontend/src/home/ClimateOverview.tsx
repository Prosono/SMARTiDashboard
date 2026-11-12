import { HomeDeviceGrid } from "./HomeDeviceGrid";
import { MetricDetails } from "./MetricDetails";
import { CategoryHeading, CategorySummary } from "./CategoryIntro";
import { ToolbarToggle, useToolbarDisclosure } from "./ToolbarToggle";
import { useState } from "react";
import {
  Thermometer,
  Droplets,
  Leaf,
  Wind,
  Search,
  House,
  LayoutGrid,
} from "lucide-react";
import type { Control, Home } from "../types";
import { numeric, temperature, usable } from "./homeModel";
import { homeAsset } from "./HomeOverview";
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
}: {
  home: Home;
  offline: boolean;
  lang: string;
}) {
  const toolbar = useToolbarDisclosure();
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [room, setRoom] = useState("all");
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
    </section>
  );
}
