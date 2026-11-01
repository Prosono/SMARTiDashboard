import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { Control } from "../types";
import type { Sky } from "./ambientModel";
import "./weatherArtwork.css";

export function useWeatherNight(c: Control) {
  const explicit = c.attributes.is_daytime;
  const sky = useQuery({
    queryKey: ["home-sky"],
    queryFn: () => api<Sky>("home/sky"),
    enabled:
      c.availability === "available" &&
      c.state === "partlycloudy" &&
      typeof explicit !== "boolean",
    staleTime: 30000,
    refetchInterval: 60000,
    retry: false,
  });
  return typeof explicit === "boolean"
    ? !explicit
    : sky.data?.available && Number.isFinite(sky.data.sun?.altitude)
      ? sky.data.sun!.altitude < 0
      : undefined;
}

/** Decorative, state-driven illustration. The adjacent text supplies the label. */
export function WeatherArtwork({
  condition,
  night,
  className = "",
}: {
  condition: string;
  night?: boolean;
  className?: string;
}) {
  const id = useId().replaceAll(":", "");
  const known = [
    "sunny",
    "clear-night",
    "cloudy",
    "partlycloudy",
    "rainy",
    "pouring",
    "snowy",
    "snowy-rainy",
    "hail",
    "fog",
    "windy",
    "windy-variant",
    "lightning",
    "lightning-rainy",
    "exceptional",
  ].includes(condition);
  const cloudy =
    known && !["sunny", "clear-night", "windy"].includes(condition);
  const sun =
    condition === "sunny" || (condition === "partlycloudy" && night === false);
  const moon =
    condition === "clear-night" ||
    (condition === "partlycloudy" && night === true);
  const rain = ["rainy", "pouring", "lightning-rainy", "snowy-rainy"].includes(
    condition,
  );
  const snow = ["snowy", "snowy-rainy", "hail"].includes(condition);
  const storm = [
    "lightning",
    "lightning-rainy",
    "pouring",
    "exceptional",
  ].includes(condition);
  const wind = ["windy", "windy-variant"].includes(condition);
  const url = (name: string) => `url(#${id}-${name})`;
  return (
    <svg
      className={`weather-art ${className}`}
      data-weather-art={known ? condition : "unknown"}
      data-night={night}
      viewBox="0 0 160 120"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id={`${id}-sun`} cx="34%" cy="28%">
          <stop stopColor="#fffbd6" />
          <stop offset=".55" stopColor="#ffe36a" />
          <stop offset="1" stopColor="#f9a51a" />
        </radialGradient>
        <radialGradient id={`${id}-halo`}>
          <stop stopColor="#ffd45a" stopOpacity=".65" />
          <stop offset="1" stopColor="#ffd45a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-moon`} cx="32%" cy="25%">
          <stop stopColor="#fffef1" />
          <stop offset=".65" stopColor="#d8dee6" />
          <stop offset="1" stopColor="#8b9aaf" />
        </radialGradient>
        <linearGradient id={`${id}-rain`} x2=".8" y2="1">
          <stop stopColor="#b5e8ff" />
          <stop offset="1" stopColor="#279ad8" />
        </linearGradient>
        <filter
          id={`${id}-shadow`}
          x="-50%"
          y="-50%"
          width="200%"
          height="200%"
        >
          <feDropShadow
            dx="0"
            dy="3"
            stdDeviation="3"
            floodColor="#061327"
            floodOpacity=".22"
          />
        </filter>
      </defs>
      {sun && (
        <g>
          <circle
            cx={cloudy ? 108 : 80}
            cy={cloudy ? 40 : 55}
            r="48"
            fill={url("halo")}
          />
          <g transform={`translate(${cloudy ? 108 : 80} ${cloudy ? 40 : 55})`}>
            {Array.from({ length: 12 }, (_, i) => (
              <path
                key={i}
                d="M0 -33v-5"
                transform={`rotate(${i * 30})`}
                stroke="#ffe58f"
                strokeWidth="2"
                strokeLinecap="round"
                opacity=".7"
              />
            ))}
            <circle r="27" fill={url("sun")} filter={url("shadow")} />
          </g>
        </g>
      )}
      {moon && (
        <g transform={`translate(${cloudy ? 108 : 80} ${cloudy ? 39 : 55})`}>
          <circle r="30" fill={url("moon")} filter={url("shadow")} />
          {[
            [-12, -8, 6],
            [8, 12, 8],
            [13, -14, 4],
            [-13, 16, 3],
          ].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill="#697b94" opacity=".17" />
          ))}
          <circle cx="-9" cy="-11" r="2" fill="#fff" opacity=".4" />
        </g>
      )}
      {cloudy && (
        <image
          href={new URL("home/simple-cloud.webp", document.baseURI).href}
          x="9"
          y={rain || snow ? 12 : 29}
          width="142"
          height="78"
          className={storm ? "weather-art-storm" : undefined}
        />
      )}
      {rain &&
        (condition === "pouring" ? [35, 57, 79, 101, 123] : [47, 77, 107]).map(
          (x, i) => (
            <path
              key={x}
              d={`M${x} ${79 + (i % 2) * 5}q-9 12 -2 15q9 2 2 -15`}
              fill={url("rain")}
              stroke="#a5dfff"
              strokeWidth=".5"
            />
          ),
        )}
      {snow &&
        [45, 80, 115].map((x, i) =>
          condition === "hail" ? (
            <circle
              key={x}
              cx={x}
              cy={91 + (i % 2) * 9}
              r="4"
              fill={url("moon")}
            />
          ) : (
            <path
              key={x}
              d="M0 -5v10M-4 -2.5l8 5M-4 2.5l8 -5"
              transform={`translate(${x} ${99 + (i % 2) * 8})`}
              stroke="#d2f1ff"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          ),
        )}
      {storm && (
        <path
          d="M84 68 70 91h12l-6 20 23-30H86l8-13Z"
          fill="#ffd365"
          stroke="#fff0b0"
          strokeWidth=".7"
        />
      )}
      {condition === "fog" && (
        <g stroke="#dae5ed" strokeWidth="5" strokeLinecap="round" opacity=".7">
          <path d="M24 77h96M42 89h94M29 101h78" />
        </g>
      )}
      {wind && (
        <g stroke="#d6ecf9" fill="none" strokeWidth="3.5" strokeLinecap="round">
          <path d="M27 52h81q21 0 15-15q-5-10-15-4M17 68h111M39 84h63q17 0 10 13" />
        </g>
      )}
      {!known && (
        <g stroke="#b9c9d8" strokeWidth="3" fill="none">
          <circle cx="80" cy="56" r="26" opacity=".55" />
          <path
            d="M73 47c0-10 18-10 18 0 0 6-11 6-11 14M80 68v2"
            strokeLinecap="round"
          />
        </g>
      )}
    </svg>
  );
}
