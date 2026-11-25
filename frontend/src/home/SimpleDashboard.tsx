import { useContext, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Blinds,
  CalendarDays,
  ChevronRight,
  LockKeyhole,
  Thermometer,
} from "lucide-react";
import type { Control, Home } from "../types";
import { api } from "../api";
import { Weather } from "./Weather";
import { Calendar } from "./Calendar";
import { MediaCard } from "./Multimedia";
import { VacuumCard } from "./Cleaning";
import { SettingsDialog } from "./SettingsDialog";
import { MetricDeviceRenderer } from "./MetricDetails";
import { homeAsset } from "./HomeOverview";
import type { HomeGridCard } from "./HomeGrid";
import { HarmonyDevices } from "./HarmonyDevices";
import { GridLightingCard } from "./GridLightingCard";
import { CardIcon, CardTitle } from "./CardPresentation";
import { CalendarArtwork } from "./CalendarArtwork";
import {
  OverviewDeviceList,
  type OverviewDeviceKind,
} from "./OverviewDeviceList";
import "./simpleDashboard.css";

export function SimpleAgenda({
  lang,
  offline,
  live = false,
}: {
  lang: string;
  offline: boolean;
  live?: boolean;
}) {
  const en = lang === "en";
  const info = useQuery({
    queryKey: ["calendar"],
    queryFn: () =>
      api<{ today: string; timezone: string; calendars: string[] }>(
        "home/calendar",
      ),
    enabled: !offline,
    staleTime: 60000,
    refetchInterval: live ? 60000 : false,
  });
  const day = info.data?.today;
  const agenda = useQuery({
    queryKey: ["calendar-events", day, info.data?.calendars],
    queryFn: () =>
      api<{
        days: Record<
          string,
          { start: string; summary: string; all_day: boolean }[]
        >;
        failed: string[];
      }>(`home/calendar/events?start=${day}`),
    enabled: !!day && !!info.data?.calendars.length && !offline,
    retry: false,
    staleTime: 60000,
    refetchInterval: live ? 300000 : false,
  });
  const events = day ? (agenda.data?.days[day] ?? []) : [];
  if (offline)
    return (
      <p className="simple-agenda-empty">
        {en ? "Calendar unavailable" : "Kalender er utilgjengelig"}
      </p>
    );
  if (!info.data && info.isPending)
    return (
      <p className="simple-agenda-empty">
        {en ? "Loading calendar…" : "Henter kalender…"}
      </p>
    );
  if (info.isError || agenda.isError || !!agenda.data?.failed?.length)
    return (
      <p className="simple-agenda-empty">
        {en ? "Calendar could not be loaded" : "Kunne ikke hente kalenderen"}
      </p>
    );
  if (!info.data?.calendars.length)
    return (
      <p className="simple-agenda-empty">
        {en
          ? "Choose calendars to see your plans"
          : "Velg kalendere for å se planene dine"}
      </p>
    );
  if (agenda.isPending)
    return (
      <p className="simple-agenda-empty">
        {en ? "Loading events…" : "Henter avtaler…"}
      </p>
    );
  if (!events.length)
    return (
      <p className="simple-agenda-empty">
        {en ? "No events today" : "Ingen avtaler i dag"}
      </p>
    );
  return (
    <div className="simple-agenda">
      {events.slice(0, 2).map((event, i) => (
        <div key={`${event.start}-${i}`}>
          <i />
          <span>
            <strong>{event.summary || (en ? "Event" : "Avtale")}</strong>
            <small>
              {event.all_day
                ? en
                  ? "All day"
                  : "Hele dagen"
                : new Date(event.start).toLocaleTimeString(
                    en ? "en-GB" : "nb-NO",
                    {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: info.data?.timezone,
                    },
                  )}
            </small>
          </span>
        </div>
      ))}
      {events.length > 2 && (
        <small>
          {en ? `${events.length - 2} more` : `${events.length - 2} flere`}
        </small>
      )}
    </div>
  );
}

const shadeClasses = new Set([
  "",
  "awning",
  "blind",
  "curtain",
  "shade",
  "shutter",
]);
const temperatureUnits = new Set(["°C", "°F", "K"]);

function isRoomReading({ domain, attributes }: Control) {
  if (["climate", "humidifier"].includes(domain)) {
    return [attributes.current_temperature, attributes.current_humidity].some(
      (value) => typeof value === "number" && Number.isFinite(value),
    );
  }
  return (
    domain === "sensor" &&
    (["temperature", "humidity"].includes(String(attributes.device_class)) ||
      (!attributes.device_class &&
        temperatureUnits.has(String(attributes.unit_of_measurement))))
  );
}

export function SimpleDashboard({
  home,
  lang,
  offline,
  showWeather = true,
  renderCards,
}: {
  home: Home;
  lang: string;
  offline: boolean;
  showWeather?: boolean;
  renderCards: (cards: HomeGridCard[], openReadings: () => void) => ReactNode;
}) {
  const en = lang === "en";
  const t = (nb: string, eng: string) => (en ? eng : nb);
  const render = useContext(MetricDeviceRenderer);
  const [panel, setPanel] = useState<OverviewDeviceKind | "calendar" | null>(
    null,
  );
  const [selected, setSelected] = useState<string | null>(null);
  const controls = home.controls.filter((c) => !c.diagnostic);
  const canView = (feature: string) =>
    !home.permissions || home.permissions.includes(`${feature}.view`);
  const preferred = (items: Control[]) =>
    items
      .slice()
      .sort(
        (a, b) =>
          Number(home.favorites.includes(b.entity_id)) -
            Number(home.favorites.includes(a.entity_id)) ||
          Number(b.availability === "available") -
            Number(a.availability === "available") ||
          Number(b.state === "playing") - Number(a.state === "playing"),
      )[0];
  const groups: Record<OverviewDeviceKind, Control[]> = {
    lighting: canView("lights")
      ? controls.filter((c) => c.domain === "light")
      : [],
    climate: canView("climate")
      ? controls.filter((c) =>
          ["climate", "fan", "humidifier"].includes(c.domain),
        )
      : [],
    media: canView("media")
      ? controls.filter((c) => c.domain === "media_player")
      : [],
    locks: canView("security")
      ? controls.filter((c) => c.domain === "lock")
      : [],
    covers: canView("security")
      ? controls.filter(
          (c) =>
            c.domain === "cover" &&
            shadeClasses.has(String(c.attributes.device_class || "")),
        )
      : [],
    readings: canView("climate") ? controls.filter(isRoomReading) : [],
  };
  const titles: Record<OverviewDeviceKind | "calendar", string> = {
    lighting: t("Lys i hjemmet", "Home lighting"),
    climate: t("Klima", "Climate"),
    media: t("Multimedia", "Media"),
    locks: t("Låser", "Locks"),
    covers: t("Rullgardiner", "Blinds"),
    readings: t("Temperatur og fuktighet", "Temperature and humidity"),
    calendar: t("Kalender", "Calendar"),
  };
  const climate = preferred(
    groups.climate.filter((c) => c.domain === "climate"),
  );
  const media = preferred(groups.media);
  const vacuum = preferred(controls.filter((c) => c.domain === "vacuum"));
  const weather = preferred(controls.filter((c) => c.domain === "weather"));
  const openPanel = (kind: Exclude<typeof panel, null>) => () => {
    setSelected(null);
    setPanel(kind);
  };
  const openReadings = openPanel("readings");
  const closePanel = () => {
    setSelected(null);
    setPanel(null);
  };
  const device =
    panel && panel !== "calendar"
      ? groups[panel].find((c) => c.id === selected)
      : undefined;
  const cards: HomeGridCard[] = [];

  if (showWeather && weather) {
    cards.push({
      id: "weather",
      entityId: weather.entity_id,
      title: t("Været nå", "Weather now"),
      content: (
        <div className="simple-dashboard-weather">
          <Weather
            c={
              offline
                ? {
                    ...weather,
                    availability: "unavailable",
                    attributes: { ...weather.attributes, temperature: null },
                  }
                : weather
            }
            lang={lang}
            compact
            polished
          />
        </div>
      ),
    });
  }
  if (canView("calendar")) {
    const now = new Date();
    cards.push({
      id: "calendar",
      title: titles.calendar,
      content: (
        <button
          type="button"
          className="simple-dashboard-date simple-dashboard-tile"
          onClick={openPanel("calendar")}
          aria-haspopup="dialog"
        >
          <div className="simple-dashboard-card-heading">
            <CardIcon fallback={CalendarDays} size={23} />
            <span>
              <CardTitle>{titles.calendar}</CardTitle>
            </span>
            <ChevronRight size={18} />
          </div>
          <div className="simple-date-content">
            <div className="simple-date-day">
              <CalendarArtwork day={now.getDate()} />
              <span>
                {now.toLocaleDateString(en ? "en-GB" : "nb-NO", {
                  month: "long",
                })}
              </span>
            </div>
            <SimpleAgenda lang={lang} offline={offline} />
          </div>
          <small>
            {t("Se dagens planer", "See today's plans")}{" "}
            <ChevronRight size={16} />
          </small>
        </button>
      ),
    });
  }
  if (groups.lighting.length) {
    const open = openPanel("lighting");
    cards.push({
      id: "lighting",
      title: titles.lighting,
      openDetails: open,
      content: (
        <GridLightingCard
          home={home}
          lang={lang}
          offline={offline}
          open={open}
        />
      ),
    });
  }
  if (media) {
    const open = openPanel("media");
    cards.push({
      id: "media",
      entityId: media.entity_id,
      title: titles.media,
      openDetails: open,
      content: (
        <div className="simple-dashboard-media">
          <MediaCard
            c={media}
            home={home}
            lang={lang}
            offline={offline}
            photo={homeAsset("home-multimedia")}
            overview
            openOverview={open}
          />
        </div>
      ),
    });
  }
  if (climate) {
    const open = openPanel("climate");
    cards.push({
      id: "climate",
      entityId: climate.entity_id,
      title: titles.climate,
      openDetails: open,
      content: (
        <HarmonyDevices
          controls={[climate]}
          home={home}
          lang={lang}
          offline={offline}
          overview={{ title: titles.climate, open }}
        />
      ),
    });
  }
  if (vacuum) {
    cards.push({
      id: "vacuum",
      entityId: vacuum.entity_id,
      title: vacuum.name,
      content: (
        <div className="simple-dashboard-vacuum">
          <VacuumCard
            c={vacuum}
            home={home}
            lang={lang}
            offline={offline}
            simple
          />
        </div>
      ),
    });
  }
  for (const [kind, Icon, icon] of [
    ["climate", Thermometer, "climate"],
    ["locks", LockKeyhole, "lock"],
    ["covers", Blinds, "cover"],
    ["readings", Thermometer, "temperature"],
  ] as const) {
    if (!groups[kind].length || (kind === "climate" && climate)) continue;
    const count = groups[kind].length;
    const noun = t(
      count === 1 ? "enhet" : "enheter",
      count === 1 ? "device" : "devices",
    );
    const open = openPanel(kind);
    cards.push({
      id: kind,
      title: titles[kind],
      openDetails: open,
      summary: { reading: `${count} ${noun}`, detail: "", icon },
      content: (
        <button
          type="button"
          className="overview-category-card"
          aria-label={titles[kind]}
          aria-haspopup="dialog"
          onClick={open}
        >
          <span className="simple-dashboard-card-heading">
            <CardIcon fallback={Icon} size={23} />
            <span>
              <CardTitle>{titles[kind]}</CardTitle>
            </span>
            <ChevronRight size={18} aria-hidden="true" />
          </span>
          <span className="overview-category-count">
            <strong>{count}</strong> {noun}
          </span>
        </button>
      ),
    });
  }

  return (
    <>
      {renderCards(cards, openReadings)}
      {panel && (
        <SettingsDialog
          title={titles[panel]}
          lang={lang}
          compact={panel !== "calendar"}
          onClose={closePanel}
        >
          {panel === "calendar" ? (
            <Calendar lang={lang} offline={offline} />
          ) : (
            <>
              {panel === "lighting" && (
                <div className="overview-lighting-bulk">
                  <GridLightingCard
                    home={home}
                    lang={lang}
                    offline={offline || !home.connected}
                    compact
                  />
                </div>
              )}
              <OverviewDeviceList
                kind={panel}
                controls={groups[panel]}
                home={home}
                lang={lang}
                offline={offline}
                onSelect={(c) => setSelected(c.id)}
              />
            </>
          )}
          {device && render && (
            <SettingsDialog
              title={device.name}
              presentation="device"
              lang={lang}
              onClose={() => setSelected(null)}
            >
              {render(device)}
            </SettingsDialog>
          )}
        </SettingsDialog>
      )}
    </>
  );
}
