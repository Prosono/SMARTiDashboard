import { useEffect, useState } from "react";
import {
  Cloud,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
  Wind,
} from "lucide-react";
import type { Home } from "../types";
import { usable } from "./homeModel";

/** A compact current-weather reading; forecasts remain on the Home overview. */
export function EnergyWelcome({
  home,
  offline,
  lang,
}: {
  home: Home;
  offline: boolean;
  lang: string;
}) {
  const en = lang === "en",
    t = (nb: string, english: string) => (en ? english : nb);
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const clock = window.setInterval(
      () => setHour(new Date().getHours()),
      60000,
    );
    return () => window.clearInterval(clock);
  }, []);
  const greeting =
    hour < 5
      ? t("God natt", "Good night")
      : hour < 10
        ? t("God morgen", "Good morning")
        : hour < 18
          ? t("God dag", "Good afternoon")
          : t("God kveld", "Good evening");
  const weather = offline
    ? undefined
    : home.controls.find((c) => c.domain === "weather" && usable(c));
  const temperature = weather?.attributes.temperature;
  const conditions: Record<string, string> = {
    sunny: t("Klar himmel", "Clear sky"),
    cloudy: t("Skyet", "Cloudy"),
    partlycloudy: t("Delvis skyet", "Partly cloudy"),
    rainy: t("Regn", "Rain"),
    pouring: t("Kraftig regn", "Heavy rain"),
    snowy: t("Snø", "Snow"),
    "snowy-rainy": t("Sludd", "Sleet"),
    "clear-night": t("Klar natt", "Clear night"),
    fog: t("Tåke", "Fog"),
    windy: t("Vind", "Wind"),
    lightning: t("Torden", "Thunder"),
    "lightning-rainy": t("Tordenbyger", "Thunderstorms"),
    hail: t("Hagl", "Hail"),
    "windy-variant": t("Vind og skyer", "Wind and clouds"),
    exceptional: t("Ekstremvær", "Exceptional weather"),
  };
  const state = weather ? weather.state : "";
  const Icon =
    state === "sunny"
      ? Sun
      : state === "clear-night"
        ? Moon
        : state.includes("snowy")
          ? CloudSnow
          : ["rainy", "pouring", "lightning-rainy"].includes(state)
            ? CloudRain
            : state === "partlycloudy"
              ? CloudSun
              : state.startsWith("windy")
                ? Wind
                : Cloud;
  return (
    <>
      <div className="flow-welcome">
        <h1>
          {greeting} <span aria-hidden="true">👋</span>
        </h1>
        <p>
          {t(
            "Her er energistatusen for hjemmet ditt",
            "Here is your home's energy status",
          )}
        </p>
      </div>
      {weather &&
        typeof temperature === "number" &&
        Number.isFinite(temperature) && (
          <div
            className="flow-current-weather"
            aria-label={t("Været nå", "Current weather")}
          >
            <Icon size={34} aria-hidden="true" />
            <div>
              <strong>
                {temperature.toLocaleString(en ? "en-GB" : "nb-NO", {
                  maximumFractionDigits: 1,
                })}
                {String(weather.attributes.temperature_unit || "°")}
              </strong>
              <span>
                {conditions[state] ||
                  t("Værstatus ukjent", "Unknown conditions")}
              </span>
              <small>{weather.name}</small>
            </div>
          </div>
        )}
    </>
  );
}
