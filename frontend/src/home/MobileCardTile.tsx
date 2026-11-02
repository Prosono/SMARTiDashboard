import { useState, type ElementType } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Battery,
  Blinds,
  CalendarDays,
  Camera,
  ChevronRight,
  Clock3,
  Cloud,
  Droplets,
  Fan,
  Flame,
  House,
  LayoutGrid,
  Lightbulb,
  LockKeyhole,
  Moon,
  Network,
  Plug,
  ShieldCheck,
  Snowflake,
  Sparkles,
  Speaker,
  Sun,
  SunMoon,
  Thermometer,
  TriangleAlert,
  Users,
  Zap,
} from "lucide-react";
import { api } from "../api";
import type { Control, Home } from "../types";
import type { CardConfig } from "./homeGridModel";
import { CardIcon, CardPresentation, cardImageURL } from "./CardPresentation";
import { ClockFace, useSky } from "./AmbientCard";
import { clockDetails, clockZone, isAmbientType } from "./ambientModel";
import { useWallTime } from "./useWallTime";
import {
  mobileCardSummary,
  type MobileCardRef,
  type MobileSummary,
} from "./mobileCardModel";
import { usable } from "./homeModel";
import { useWeatherNight } from "./WeatherArtwork";
import { weatherScene } from "./weatherPresentation";

export type MobileCardProps = {
  card: MobileCardRef;
  config?: CardConfig;
  home: Home;
  offline: boolean;
  lang: string;
};
const icons = new Map<string, ElementType>([
  ["light", Lightbulb],
  ["climate", Thermometer],
  ["temperature", Thermometer],
  ["humidity", Droplets],
  ["moisture", Droplets],
  ["power", Zap],
  ["energy", Zap],
  ["weather", Cloud],
  ["media", Speaker],
  ["vacuum", House],
  ["fan", Fan],
  ["cover", Blinds],
  ["lock", LockKeyhole],
  ["binary_sensor", ShieldCheck],
  ["alarm_control_panel", ShieldCheck],
  ["switch", Plug],
  ["input_boolean", Plug],
  ["camera", Camera],
  ["routines", LayoutGrid],
  ["scenes", Sparkles],
  ["room", House],
  ["network", Network],
  ["alert", TriangleAlert],
  ["battery", Battery],
  ["clock", Clock3],
  ["date", CalendarDays],
  ["calendar", CalendarDays],
  ["moon", Moon],
  ["horizon", SunMoon],
  ["daylight", Sun],
  ["people", Users],
]);
function Tile({
  card,
  config,
  lang,
  onOpen,
  summary,
  clock,
  poster,
}: MobileCardProps & {
  onOpen: () => void;
  summary: MobileSummary;
  clock?: ReturnType<typeof clockDetails>;
  poster?: string;
}) {
  const [failed, setFailed] = useState("");
  const Icon =
    summary.icon === "climate"
      ? summary.climateTone === "cool"
        ? Snowflake
        : summary.climateTone === "heat"
          ? Flame
          : Thermometer
      : icons.get(summary.icon) || Activity;
  const title = config?.title || card.title;
  const photo =
    config?.image && !["auto", "none"].includes(config.image)
      ? cardImageURL(config.image)
      : config?.type === "picture" && config.image === "auto"
        ? cardImageURL("living")
        : config?.image === "none"
          ? undefined
          : poster;
  const analog =
    clock &&
    config?.type === "clock" &&
    config.clock_style &&
    config.clock_style !== "digital";
  return (
    <CardPresentation.Provider value={config || {}}>
      <button
        type="button"
        className="mobile-card-tile"
        aria-label={`${lang === "en" ? "Open card" : "Åpne kort"}: ${title}. ${summary.reading}. ${summary.detail}`}
        aria-haspopup="dialog"
        onClick={onOpen}
        data-unavailable={summary.unavailable || undefined}
        data-climate-tone={summary.climateTone}
        data-photo={(photo && failed !== photo) || undefined}
        data-clock={analog || undefined}
        data-reading-long={summary.reading.length > 11 || undefined}
      >
        {photo && failed !== photo && (
          <img
            className="mobile-card-photo"
            src={photo}
            alt=""
            loading="lazy"
            onError={() => setFailed(photo)}
          />
        )}
        <span className="mobile-card-top" aria-hidden="true">
          {config?.icon !== "none" ? (
            <CardIcon fallback={Icon} size={23} />
          ) : (
            <span />
          )}
          <ChevronRight size={15} />
        </span>
        <strong className="mobile-card-title">{title}</strong>
        <span className="mobile-card-reading">
          {analog ? (
            <ClockFace
              clock={clock}
              style={config.clock_style!}
              seconds={false}
              mini
            />
          ) : (
            summary.reading
          )}
        </span>
        <span className="mobile-card-detail">{summary.detail}</span>
      </button>
    </CardPresentation.Provider>
  );
}
function AmbientTile(props: MobileCardProps & { onOpen: () => void }) {
  const sky = useSky(),
    now = useWallTime(false),
    zone = clockZone(sky.data?.timezone),
    clock = clockDetails(now, zone.zone, props.lang, props.config?.time_format),
    en = props.lang === "en",
    type = props.config?.type || "date",
    day = type === "date" || props.card.id === "calendar";
  const summary: MobileSummary = day
    ? {
        reading: String(clock.day),
        detail: `${clock.monthName}${zone.home ? "" : en ? " · local date" : " · lokal dato"}`,
        icon: "calendar",
      }
    : type === "clock"
      ? {
          reading: `${clock.time}${clock.period ? ` ${clock.period}` : ""}`,
          detail: zone.home ? clock.date : en ? "Local time" : "Lokal tid",
          icon: "clock",
        }
      : !props.offline &&
          props.home.connected &&
          type === "moon" &&
          typeof sky.data?.moon.fraction === "number" &&
          Number.isFinite(sky.data.moon.fraction)
        ? {
            reading: `${Math.round(sky.data.moon.fraction * 100)} %`,
            detail: en ? "Illuminated" : "Belyst",
            icon: "moon",
          }
        : !props.offline &&
            props.home.connected &&
            sky.data?.available &&
            sky.data.sun &&
            Number.isFinite(sky.data.sun.altitude)
          ? {
              reading: `${Math.round(sky.data.sun.altitude)}°`,
              detail: en ? "Sun above the horizon" : "Sol over horisonten",
              icon: type,
            }
          : {
              reading: "—",
              detail: en ? "Position unavailable" : "Posisjon mangler",
              icon: type,
              unavailable: true,
            };
  return <Tile {...props} summary={summary} clock={clock} />;
}
function PeopleTile(props: MobileCardProps & { onOpen: () => void }) {
  const q = useQuery({
      queryKey: ["people-preferences"],
      queryFn: () =>
        api<{ people: string[] | null; only_home: boolean }>("home/people"),
      retry: false,
    }),
    en = props.lang === "en",
    all = props.home.controls.filter(
      (c) =>
        c.domain === "person" &&
        !c.diagnostic &&
        (q.data?.people === null || q.data?.people.includes(c.entity_id)),
    ),
    known = all.filter(usable),
    count = known.filter((c) => c.state === "home").length,
    unknown = all.length - known.length;
  const summary: MobileSummary =
    props.offline || !props.home.connected
      ? {
          reading: en ? "Disconnected" : "Frakoblet",
          detail: en ? "Open for details" : "Åpne for detaljer",
          icon: "people",
          unavailable: true,
        }
      : !q.data
        ? {
            reading: "—",
            detail: en ? "Open people" : "Åpne personer",
            icon: "people",
          }
        : {
            reading: `${count} ${en ? "home" : "hjemme"}`,
            detail: unknown
              ? `${unknown} ${en ? "unknown" : "ukjent"}`
              : known
                  .filter((c) => c.state === "home")
                  .map((c) => c.name)
                  .join(", ") || (en ? "Nobody home" : "Ingen hjemme"),
            icon: "people",
          };
  return <Tile {...props} summary={summary} />;
}
function WeatherTile(
  props: MobileCardProps & { onOpen: () => void; control: Control },
) {
  const night = useWeatherNight(props.control);
  const summary = mobileCardSummary(
    props.card,
    props.config,
    props.home,
    props.offline,
    props.lang,
  );
  const scene = !summary.unavailable
    ? weatherScene(props.control.state, night)
    : null;
  return (
    <Tile
      {...props}
      summary={summary}
      poster={
        scene
          ? new URL(`home/weather/${scene}.webp`, document.baseURI).href
          : undefined
      }
    />
  );
}
export function MobileCardTile(
  props: MobileCardProps & { onOpen: () => void },
) {
  if (
    isAmbientType(props.config?.type || "") ||
    (!props.config?.sources.length && props.card.id === "calendar")
  )
    return <AmbientTile {...props} />;
  if (!props.config?.sources.length && props.card.id === "people")
    return <PeopleTile {...props} />;
  const source = props.config?.sources[0] || props.card.entityId;
  const weather = props.home.controls.find(
    (c) => c.entity_id === source && c.domain === "weather",
  );
  if (weather) return <WeatherTile {...props} control={weather} />;
  return (
    <Tile
      {...props}
      summary={mobileCardSummary(
        props.card,
        props.config,
        props.home,
        props.offline,
        props.lang,
      )}
    />
  );
}
