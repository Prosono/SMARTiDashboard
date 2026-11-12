import { Children, useContext, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronRight, Lightbulb } from "lucide-react";
import type { Home } from "../types";
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
import "./simpleDashboard.css";

function SimpleAgenda({ lang, offline }: { lang: string; offline: boolean }) {
  const en = lang === "en";
  const info = useQuery({
    queryKey: ["calendar"],
    queryFn: () =>
      api<{ today: string; timezone: string; calendars: string[] }>(
        "home/calendar",
      ),
    enabled: !offline,
    staleTime: 60000,
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
  renderCards: (cards: HomeGridCard[]) => ReactNode;
}) {
  const en = lang === "en",
    t = (nb: string, eng: string) => (en ? eng : nb);
  const render = useContext(MetricDeviceRenderer);
  const [panel, setPanel] = useState<"lights" | "calendar" | null>(null),
    [selected, setSelected] = useState<string | null>(null);
  const controls = home.controls.filter((c) => !c.diagnostic);
  const preferred = (domain: string) =>
    controls
      .filter((c) => c.domain === domain)
      .sort(
        (a, b) =>
          Number(home.favorites.includes(b.entity_id)) -
            Number(home.favorites.includes(a.entity_id)) ||
          Number(b.availability === "available") -
            Number(a.availability === "available") ||
          Number(b.state === "playing") - Number(a.state === "playing"),
      )[0];
  const climate = preferred("climate"),
    media = preferred("media_player"),
    vacuum = preferred("vacuum"),
    weather = preferred("weather");
  const lights = controls.filter((c) => c.domain === "light");
  const active = controls.find((c) => c.id === selected);
  const now = new Date();
  const tiles = (
    <>
      {showWeather && weather && (
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
            polished={true}
          />
        </div>
      )}
      {(!home.permissions || home.permissions.includes("calendar.view")) && (
        <button
          className="simple-dashboard-date simple-dashboard-tile"
          onClick={() => setPanel("calendar")}
          aria-haspopup="dialog"
        >
          <div className="simple-dashboard-card-heading">
            <CardIcon fallback={CalendarDays} size={23} />
            <span>
              <CardTitle>{t("Kalender", "Calendar")}</CardTitle>
            </span>
            <ChevronRight size={18} />
          </div>
          <div className="simple-date-content">
            <div className="simple-date-day">
              <CalendarArtwork day={now.getDate()} />
              <span>
                {now.toLocaleDateString(en ? "en-GB" : "nb-NO", {
                  ...{},
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
      )}
      {lights.length > 0 && (
        <GridLightingCard
          home={home}
          lang={lang}
          offline={offline}
          open={() => setPanel("lights")}
        />
      )}
      {media && (
        <div className="simple-dashboard-media">
          <MediaCard
            c={media}
            home={home}
            lang={lang}
            offline={offline}
            photo={homeAsset("home-multimedia")}
            overview={true}
          />
        </div>
      )}
      {climate && (
        <HarmonyDevices
          controls={[climate]}
          home={home}
          lang={lang}
          offline={offline}
        />
      )}
      {vacuum && (
        <div className="simple-dashboard-vacuum">
          <VacuumCard
            c={vacuum}
            home={home}
            lang={lang}
            offline={offline}
            simple
          />
        </div>
      )}
    </>
  );
  const titles = [
    t("Været nå", "Weather now"),
    t("Kalender", "Calendar"),
    t("Lys i hjemmet", "Home lighting"),
    media?.name || "",
    climate?.name || "",
    vacuum?.name || "",
  ];
  const ids = ["weather", "calendar", "lighting", "media", "climate", "vacuum"];
  const enabled = [
    showWeather && weather,
    !home.permissions || home.permissions.includes("calendar.view"),
    lights.length > 0,
    media,
    climate,
    vacuum,
  ];
  const indices = enabled.flatMap((value, index) => (value ? [index] : []));
  const cards = Children.toArray(tiles.props.children).map(
    (content, index) => ({
      id: ids[indices[index]],
      entityId: [weather, undefined, undefined, media, climate, vacuum][
        indices[index]
      ]?.entity_id,
      title: titles[indices[index]],
      content,
    }),
  );
  return (
    <>
      {renderCards(cards)}
      {panel && (
        <SettingsDialog
          title={
            panel === "calendar"
              ? t("Kalender", "Calendar")
              : t("Lys i hjemmet", "Home lighting")
          }
          lang={lang}
          onClose={() => setPanel(null)}
        >
          {panel === "calendar" ? (
            <Calendar lang={lang} offline={offline} />
          ) : (
            <div className="simple-dashboard-light-list">
              {home.areas
                .concat({ area_id: "", name: t("Uten rom", "No room") })
                .map((a) => {
                  const items = lights.filter(
                    (c) =>
                      (home.areas.some((r) => r.area_id === c.area_id)
                        ? c.area_id
                        : "") === a.area_id,
                  );
                  return items.length ? (
                    <section key={a.area_id}>
                      <h3>{a.name}</h3>
                      {items.map((c) => (
                        <button key={c.id} onClick={() => setSelected(c.id)}>
                          <Lightbulb size={20} />
                          <strong>{c.name}</strong>
                          <span>
                            {offline || c.availability !== "available"
                              ? t("Utilgjengelig", "Unavailable")
                              : c.state === "on"
                                ? t("På", "On")
                                : t("Av", "Off")}
                          </span>
                          <ChevronRight size={18} />
                        </button>
                      ))}
                    </section>
                  ) : null;
                })}
            </div>
          )}
          {active && render && (
            <SettingsDialog
              title={active.name}
              lang={lang}
              onClose={() => setSelected(null)}
            >
              {render(active)}
            </SettingsDialog>
          )}
        </SettingsDialog>
      )}
      {!panel && active && render && (
        <SettingsDialog
          title={active.name}
          lang={lang}
          onClose={() => setSelected(null)}
        >
          {render(active)}
        </SettingsDialog>
      )}
    </>
  );
}
