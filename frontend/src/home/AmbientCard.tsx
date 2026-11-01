import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  Clock3,
  Moon,
  Orbit,
  Sun,
  Sunrise,
  Sunset,
  SunMoon,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { api } from "../api";
import type { Home } from "../types";
import type { CardConfig } from "./homeGridModel";
import { CardIcon, CardTitle } from "./CardPresentation";
import {
  ambientTitle,
  clockDetails,
  clockZone,
  compass,
  daylightSegments,
  moonShape,
  skyPath,
  skyX,
  skyY,
  type Sky,
  type SkyPosition,
} from "./ambientModel";
import { useWallTime } from "./useWallTime";
import "./ambientCards.css";

export const ambientGlyph = (type: string) =>
  type === "horizon"
    ? SunMoon
    : type === "daylight"
      ? Sunrise
      : type === "moon"
        ? Moon
        : type === "date"
          ? CalendarDays
          : Clock3;
export const useSky = () =>
  useQuery({
    queryKey: ["home-sky"],
    queryFn: () => api<Sky>("home/sky"),
    staleTime: 30000,
    refetchInterval: 60000,
    retry: false,
  });
const phases = [
  ["Nymåne", "New moon"],
  ["Voksende månesigd", "Waxing crescent"],
  ["Første kvarter", "First quarter"],
  ["Voksende måne", "Waxing gibbous"],
  ["Fullmåne", "Full moon"],
  ["Minkende måne", "Waning gibbous"],
  ["Siste kvarter", "Last quarter"],
  ["Minkende månesigd", "Waning crescent"],
];
export function MoonDisc({
  phase,
  size = 100,
}: {
  phase: number;
  size?: number;
}) {
  return (
    <svg
      className="ambient-moon-disc"
      viewBox="-44 -44 88 88"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <circle r="40" fill="var(--moon-dark)" />
      <path d={moonShape(phase)} fill="var(--moon-light)" />
      <circle cx="-13" cy="-17" r="6" fill="var(--moon-crater)" />
      <circle cx="10" cy="16" r="9" fill="var(--moon-crater)" />
      <circle cx="18" cy="-11" r="4" fill="var(--moon-crater)" />
      <circle r="40" fill="none" stroke="var(--line)" strokeWidth=".7" />
    </svg>
  );
}
export function ClockFace({
  clock,
  style,
  seconds,
  mini = false,
}: {
  clock: ReturnType<typeof clockDetails>;
  style: string;
  seconds: boolean;
  mini?: boolean;
}) {
  if (style === "analog")
    return (
      <svg
        className="ambient-dial"
        viewBox="0 0 220 220"
        role={mini ? undefined : "img"}
        aria-label={mini ? undefined : clock.full}
      >
        <circle className="ambient-dial-edge" cx="110" cy="110" r="100" />
        {Array.from({ length: 60 }, (_, i) => (
          <line
            key={i}
            transform={`rotate(${i * 6} 110 110)`}
            x1="110"
            x2="110"
            y1={i % 5 ? 17 : 15}
            y2={i % 5 ? 20 : 24}
            className={i % 5 ? "ambient-tick" : "ambient-tick-hour"}
          />
        ))}
        {[12, 3, 6, 9].map((n, i) => (
          <text
            key={n}
            x={[110, 181, 110, 39][i]}
            y={[46, 115, 185, 115][i]}
            textAnchor="middle"
          >
            {n}
          </text>
        ))}
        <line
          className="ambient-hand-hour"
          transform={`rotate(${((clock.hour % 12) + clock.minute / 60 + clock.second / 3600) * 30} 110 110)`}
          x1="110"
          y1="116"
          x2="110"
          y2="59"
        />
        <line
          className="ambient-hand-minute"
          transform={`rotate(${(clock.minute + clock.second / 60) * 6} 110 110)`}
          x1="110"
          y1="119"
          x2="110"
          y2="36"
        />
        {seconds && (
          <line
            className="ambient-hand-second"
            transform={`rotate(${clock.second * 6} 110 110)`}
            x1="110"
            y1="129"
            x2="110"
            y2="27"
          />
        )}
        <circle cx="110" cy="110" r="5" fill="var(--accent)" />
        <circle cx="110" cy="110" r="2" fill="var(--surface)" />
      </svg>
    );
  if (style === "orbital")
    return (
      <div className="ambient-orbital-face">
        <svg viewBox="0 0 240 240" aria-hidden="true">
          {[104, 91, 78].map((r, i) => (
            <g key={r} transform="rotate(-90 120 120)">
              <circle className="ambient-orbit-track" cx="120" cy="120" r={r} />
              <circle
                className={`ambient-orbit ambient-orbit-${i}`}
                cx="120"
                cy="120"
                r={r}
                pathLength="100"
                strokeDasharray={`${[(clock.hour + clock.minute / 60) / 24, (clock.minute + clock.second / 60) / 60, clock.second / 60][i] * 100} 100`}
              />
            </g>
          ))}
          {Array.from({ length: 24 }, (_, i) => (
            <line
              key={i}
              transform={`rotate(${i * 15} 120 120)`}
              x1="120"
              x2="120"
              y1="4"
              y2={i % 6 ? 7 : 11}
              className="ambient-orbit-notch"
            />
          ))}
        </svg>
        <div>
          <time aria-label={clock.full}>{clock.time}</time>
          {seconds && (
            <span>
              {clock.seconds} <small>SEC</small>
            </span>
          )}
          {clock.period && <small>{clock.period}</small>}
        </div>
      </div>
    );
  return (
    <div className="ambient-digital-face">
      <time aria-label={clock.full}>{clock.time}</time>
      <span>
        {seconds && <b>{clock.seconds}</b>}
        {clock.period && <small>{clock.period}</small>}
      </span>
    </div>
  );
}

function Horizon({ sky, lang }: { sky: Sky; lang: string }) {
  const id = useId().replaceAll(":", ""),
    en = lang === "en";
  const plot = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 600, height: 220 });
  useEffect(() => {
    const node = plot.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(180, Math.round(entry.contentRect.width)),
        height = Math.max(100, Math.round(entry.contentRect.height));
      setSize((old) =>
        old.width === width && old.height === height ? old : { width, height },
      );
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const x = (azimuth: number) => skyX(azimuth, size.width),
    y = (altitude: number) => skyY(altitude, size.height);
  const sun = sky.sun!,
    moon = sky.moon as SkyPosition;
  const label = (name: string, point: SkyPosition) =>
    `${name}: ${Math.round(point.azimuth)}° ${compass(point.azimuth, lang)}, ${Math.abs(point.altitude).toFixed(1)}° ${point.altitude >= 0 ? (en ? "above the horizon" : "over horisonten") : en ? "below the horizon" : "under horisonten"}`;
  return (
    <>
      <div className="ambient-horizon-plot" ref={plot}>
        <svg
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="img"
          aria-label={`${label(en ? "Sun" : "Sol", sun)}. ${label(en ? "Moon" : "Måne", moon)}.`}
        >
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop
                stopColor={sun.altitude > 0 ? "#f0b45f" : "#627b9d"}
                stopOpacity=".22"
              />
              <stop offset="1" stopColor="var(--surface)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect
            x="34"
            y="22"
            width={size.width - 68}
            height={y(0) - 22}
            fill={`url(#${id})`}
            rx="7"
          />
          {[90, 45, -45, -90].map((altitude) => (
            <line
              key={altitude}
              x1="34"
              x2={size.width - 34}
              y1={y(altitude)}
              y2={y(altitude)}
              className="ambient-sky-guide"
            />
          ))}
          <line
            x1="34"
            x2={size.width - 34}
            y1={y(0)}
            y2={y(0)}
            className="ambient-horizon-line"
          />
          <text x="28" y={y(90) + 3} textAnchor="end">
            90°
          </text>
          <text x="28" y={y(0) + 3} textAnchor="end">
            0°
          </text>
          <text x="28" y={y(-90) + 3} textAnchor="end">
            −90°
          </text>
          {["N", en ? "E" : "Ø", "S", en ? "W" : "V", "N"].map((label, i) => (
            <text key={i} x={x(i * 90)} y={size.height - 6} textAnchor="middle">
              {label}
            </text>
          ))}
          <path
            d={skyPath(
              sky.path.map((point) => point.sun),
              size.width,
              size.height,
            )}
            className="ambient-sun-path"
          />
          <path
            d={skyPath(
              sky.path.map((point) => point.moon),
              size.width,
              size.height,
            )}
            className="ambient-moon-path"
          />
          <g
            transform={`translate(${x(sun.azimuth)} ${y(sun.altitude)})`}
            className="ambient-sun-marker"
          >
            <circle r="7" />
            {Array.from({ length: 8 }, (_, i) => (
              <line
                key={i}
                transform={`rotate(${i * 45})`}
                x1="0"
                x2="0"
                y1="-11"
                y2="-14"
              />
            ))}
          </g>
          <g
            transform={`translate(${x(moon.azimuth)} ${y(moon.altitude)})`}
            className="ambient-moon-marker"
          >
            <circle r="7" />
          </g>
        </svg>
      </div>
      <div className="ambient-sky-readings">
        {[
          { name: en ? "Sun" : "Sol", point: sun, Icon: Sun },
          { name: en ? "Moon" : "Måne", point: moon, Icon: Moon },
        ].map(({ name, point, Icon }) => (
          <div key={name}>
            <Icon size={20} />
            <span>
              <strong>
                {name}{" "}
                <b>
                  {Math.round(point.azimuth)}° {compass(point.azimuth, lang)}
                </b>
              </strong>
              <small>
                {point.altitude >= 0
                  ? en
                    ? "Above"
                    : "Over"
                  : en
                    ? "Below"
                    : "Under"}{" "}
                {en ? "horizon" : "horisonten"} ·{" "}
                {Math.abs(point.altitude).toLocaleString(
                  en ? "en-GB" : "nb-NO",
                  { maximumFractionDigits: 1 },
                )}
                °
              </small>
            </span>
            {point.altitude >= 0 ? (
              <ArrowUpRight size={17} />
            ) : (
              <ArrowDownRight size={17} />
            )}
          </div>
        ))}
      </div>
    </>
  );
}

export function AmbientCard({
  config,
  home,
  lang,
}: {
  config: CardConfig;
  home: Home;
  lang: string;
}) {
  const en = lang === "en",
    t = (nb: string, english: string) => (en ? english : nb);
  const now = useWallTime(
    config.type === "clock" && config.show_seconds !== false,
  );
  const query = useSky();
  const sky = query.data,
    zone = clockZone(sky?.timezone),
    clock = clockDetails(now, zone.zone, lang, config.time_format || "24h");
  const title = ambientTitle(config, lang),
    Icon =
      config.type === "clock" && config.clock_style === "orbital"
        ? Orbit
        : ambientGlyph(config.type);
  const skyTime = (value?: string | null) =>
    value
      ? new Date(value).toLocaleTimeString(en ? "en-GB" : "nb-NO", {
          timeZone: zone.zone,
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        })
      : "—";
  const stale =
    !!sky && (query.isError || now - Date.parse(sky.generated_at) > 120000);
  const foot = stale
    ? `${t("Sist beregnet", "Last calculated")} ${skyTime(sky?.generated_at)}`
    : sky?.demo
      ? t("Demoplassering · Oslo", "Demo location · Oslo")
      : sky?.location_status === "cached"
        ? t(
            "Beregnet fra siste lagrede hjemmeplassering",
            "Calculated from the last known home location",
          )
        : `${t("Beregnet for", "Calculated for")} ${home.home_name}`;
  return (
    <article
      className={`ambient-card ambient-${config.type} ${config.type === "clock" ? `ambient-clock-${config.clock_style || "digital"}` : ""}`}
      aria-label={config.title || title}
      data-stale={stale}
    >
      <header className="ambient-heading">
        <CardIcon fallback={Icon} size={19} />
        <strong>
          <CardTitle>{title}</CardTitle>
        </strong>
        {["clock", "date"].includes(config.type) && (
          <small>
            {zone.home ? clock.zoneName : t("Enhetens tid", "Panel time")}
          </small>
        )}
      </header>
      {config.type === "clock" ? (
        <>
          <div className="ambient-clock-main">
            <ClockFace
              clock={clock}
              style={config.clock_style || "digital"}
              seconds={config.show_seconds !== false}
            />
          </div>
          <div className="ambient-clock-date">
            <span>{clock.weekday}</span>
            <strong>{clock.date}</strong>
            {config.clock_style === "analog" && (
              <time>
                {clock.time} {clock.period}
              </time>
            )}
          </div>
        </>
      ) : config.type === "date" ? (
        <>
          <div className="ambient-date-body">
            <strong>{clock.day}</strong>
            <span>
              {clock.weekday}
              <b>
                {clock.monthName} {clock.year}
              </b>
            </span>
          </div>
          <div className="ambient-date-meta">
            <span>
              {t("Uke", "Week")} <b>{clock.week}</b>
            </span>
            <span>
              {t("Dag", "Day")} {clock.dayOfYear} / {clock.daysInYear}
            </span>
          </div>
          <progress
            className="ambient-year-progress"
            value={clock.dayOfYear}
            max={clock.daysInYear}
            aria-label={t("Årets dager", "Days of the year")}
          />
        </>
      ) : config.type === "moon" && sky ? (
        <>
          <div className="ambient-moon-body">
            <MoonDisc phase={sky.moon.phase} size={126} />
            <div>
              <strong>
                {phases[Math.round(sky.moon.phase * 8) % 8][en ? 1 : 0]}
              </strong>
              <span>
                {t("Ca.", "About")} {Math.round(sky.moon.fraction * 100)} %{" "}
                {t("belyst", "illuminated")}
              </span>
            </div>
          </div>
          <div className="ambient-event-times">
            <span>
              <ArrowUpRight size={16} />
              {t("Opp i dag", "Rise today")}
              <b>{skyTime(sky.moon.rise)}</b>
            </span>
            <span>
              <ArrowDownRight size={16} />
              {t("Ned i dag", "Set today")}
              <b>{skyTime(sky.moon.set)}</b>
            </span>
          </div>
          <small className="ambient-source-note">
            {stale
              ? foot
              : sky.available
                ? sky.moon.state === "always_up"
                  ? t(
                      "Månen er over horisonten hele dagen",
                      "The moon is above the horizon all day",
                    )
                  : sky.moon.state === "always_down"
                    ? t(
                        "Månen er under horisonten hele dagen",
                        "The moon is below the horizon all day",
                      )
                    : foot
                : t(
                    "Månefase beregnet · sett hjemmeplassering for opp/ned-tider",
                    "Calculated phase · set home location for rise/set times",
                  )}
          </small>
        </>
      ) : sky?.available && sky.sun ? (
        config.type === "horizon" ? (
          <>
            <Horizon sky={sky} lang={lang} />
            <small className="ambient-source-note">
              {foot} · {skyTime(sky.generated_at)}
            </small>
          </>
        ) : (
          <>
            <div className="ambient-daylight-body">
              <Sun size={39} strokeWidth={1.2} />
              <strong>
                {sky.sun.state === "always_up"
                  ? t("Hele døgnet", "All day")
                  : `${Math.floor(sky.sun.daylight_seconds / 3600)} ${t("t", "h")} ${Math.floor((sky.sun.daylight_seconds % 3600) / 60)} ${t("min", "min")}`}
              </strong>
              <span>
                {sky.sun.state === "always_up"
                  ? t("Midnattssol", "Midnight sun")
                  : sky.sun.state === "always_down"
                    ? t(
                        "Solen står ikke opp i dag",
                        "The sun does not rise today",
                      )
                    : t("Dagens lysperiode", "Today's daylight")}
              </span>
            </div>
            <div
              className="ambient-daylight-line"
              role="img"
              aria-label={t(
                "Dagens lysperiode; markøren viser tiden nå",
                "Today's daylight; the marker shows the current time",
              )}
            >
              {daylightSegments(sky.day, sky.sun).map(([start, end], i) => (
                <i
                  key={i}
                  style={{ left: `${start}%`, width: `${end - start}%` }}
                />
              ))}
              <b
                style={{
                  left: `${Math.max(0, Math.min(100, sky.day ? ((now - Date.parse(sky.day.start)) / (Date.parse(sky.day.end) - Date.parse(sky.day.start))) * 100 : 0))}%`,
                }}
              />
            </div>
            <div className="ambient-event-times">
              <span>
                <Sunrise size={17} />
                {t("Sol opp", "Sunrise")}
                <b>{skyTime(sky.sun.rise)}</b>
              </span>
              <span>
                <Sunset size={17} />
                {t("Sol ned", "Sunset")}
                <b>{skyTime(sky.sun.set)}</b>
              </span>
            </div>
            <small className="ambient-source-note">{foot}</small>
          </>
        )
      ) : (
        <div className="ambient-unavailable">
          <Icon size={46} strokeWidth={1} />
          <strong>
            {query.isPending
              ? t("Henter himmeldata…", "Loading sky data…")
              : query.isError
                ? t("Kan ikke hente himmeldata", "Sky data unavailable")
                : sky?.location_status === "unavailable"
                  ? t(
                      "Venter på hjemmeplasseringen",
                      "Waiting for the home location",
                    )
                  : t(
                      "Hjemmets plassering mangler",
                      "Home location is missing",
                    )}
          </strong>
          <p>
            {query.isPending
              ? t(
                  "Klokken og datoen fungerer med en gang.",
                  "Time and date are available immediately.",
                )
              : sky?.location_status === "unavailable"
                ? t(
                    "Plasseringen kan hentes når hjemmesentralen er tilkoblet.",
                    "The location can be retrieved when the home controller is connected.",
                  )
                : t(
                    "Sol- og måneplassering bruker hjemmets posisjon fra hjemmeinnstillingene.",
                    "Sun and moon positions use the location in your home settings.",
                  )}
          </p>
          {query.isError && (
            <button
              className="ambient-retry"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              {t("Prøv igjen", "Retry")}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
