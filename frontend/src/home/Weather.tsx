import { useQuery } from "@tanstack/react-query";
import {
  CloudSun,
  Sun,
  Moon,
  CloudRain,
  CloudSnow,
  Cloud,
  Wind,
  Droplets,
} from "lucide-react";
import { api } from "../api";
import type { Control } from "../types";
import "./extras.css";
import { TemperatureValue } from "./TemperatureValue";
type Day = {
  date: string;
  condition: string;
  temperature: number | null;
  templow: number | null;
  precipitation: number | null;
  precipitation_probability: number | null;
  wind_speed: number | null;
};
export function Weather({
  c,
  lang,
  compact = false,
  polished = false,
}: {
  c: Control;
  lang: string;
  compact?: boolean;
  polished?: boolean;
}) {
  const en = lang === "en",
    t = (nb: string, eng: string) => (en ? eng : nb);
  const q = useQuery({
    queryKey: ["weather-forecast", c.id],
    queryFn: () =>
      api<{
        days: { today?: Day; tomorrow?: Day };
        temperature_unit: string;
        precipitation_unit: string;
        wind_speed_unit: string;
      }>(`home/weather/${encodeURIComponent(c.id)}`),
    staleTime: 300000,
    refetchInterval: 600000,
    retry: false,
  });
  const label = (state: string) =>
    ({
      sunny: t("Sol", "Sunny"),
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
    })[state] || t("Ukjent", "Unknown");
  const icon = (state: string) =>
    state === "sunny"
      ? Sun
      : state === "clear-night"
        ? Moon
        : ["rainy", "pouring", "lightning-rainy"].includes(state)
          ? CloudRain
          : state.includes("snowy")
            ? CloudSnow
            : state === "partlycloudy"
              ? CloudSun
              : Cloud;
  const now =
      typeof c.attributes.temperature === "number"
        ? c.attributes.temperature
        : null,
    unit = String(c.attributes.temperature_unit || "°");
  const tomorrow = q.data?.days.tomorrow,
    Now = icon(c.state),
    Tomorrow = icon(tomorrow?.condition || "");
  const number = (v: unknown) =>
    typeof v === "number"
      ? v.toLocaleString(en ? "en-GB" : "nb-NO", { maximumFractionDigits: 1 })
      : "—";
  if (compact) {
    const usable = c.availability === "available";
    const today = q.data?.days.today;
    const current = usable && now !== null && Number.isFinite(now) ? now : null;
    const cloud = usable && ["cloudy", "partlycloudy"].includes(c.state);
    return (
      <section
        className="simple-weather"
        data-condition={usable ? c.state : "unavailable"}
        data-polished={polished || undefined}
        aria-label={t("Værmelding", "Weather forecast")}
      >
        <div className="simple-weather-heading">
          <strong>{c.name}</strong>
          <span>
            {usable ? label(c.state) : t("Utilgjengelig", "Unavailable")}
          </span>
        </div>
        <div className="simple-weather-current">
          <strong>
            {polished ? (
              <TemperatureValue value={current} unit={unit} lang={lang} />
            ) : (
              <>
                {number(current)}
                {current !== null ? unit : ""}
              </>
            )}
          </strong>
          {cloud ? (
            <img
              src={new URL("home/simple-cloud.webp", document.baseURI).href}
              alt=""
            />
          ) : (
            <Now aria-hidden="true" size={76} />
          )}
        </div>
        {usable &&
          today &&
          (today.temperature !== null || today.templow !== null) && (
            <div className="simple-weather-range">
              {today.temperature !== null && (
                <span>
                  ↑ {number(today.temperature)}
                  {q.data?.temperature_unit || unit}
                </span>
              )}
              {today.templow !== null && (
                <span>
                  ↓ {number(today.templow)}
                  {q.data?.temperature_unit || unit}
                </span>
              )}
            </div>
          )}
        <div className="simple-weather-details">
          {usable && typeof c.attributes.wind_speed === "number" && (
            <span>
              <Wind size={16} />
              {number(c.attributes.wind_speed)}{" "}
              {String(c.attributes.wind_speed_unit || "")}
            </span>
          )}
          {usable && typeof c.attributes.humidity === "number" && (
            <span>
              <Droplets size={16} />
              {number(c.attributes.humidity)} %
            </span>
          )}
          {usable && today?.precipitation != null && (
            <span>
              <CloudRain size={16} />
              {number(today.precipitation)} {q.data?.precipitation_unit || "mm"}
            </span>
          )}
        </div>
      </section>
    );
  }
  return (
    <section
      className="home-weather weather-expanded"
      aria-label={t("Værmelding", "Weather forecast")}
    >
      <div className="weather-location">{c.name}</div>
      <div className="weather-days">
        <div>
          <span>{t("Nå", "Now")}</span>
          <Now size={29} />
          <strong>
            {number(now)}
            {unit}
          </strong>
          <p>{label(c.state)}</p>
          {typeof c.attributes.wind_speed === "number" && (
            <small>
              <Wind size={13} />
              {number(c.attributes.wind_speed)}{" "}
              {String(c.attributes.wind_speed_unit || "")}
            </small>
          )}
        </div>
        <div>
          <span>{t("I morgen", "Tomorrow")}</span>
          {tomorrow ? (
            <>
              <Tomorrow size={29} />
              <strong>
                {number(tomorrow.temperature)}
                {q.data?.temperature_unit || unit}
              </strong>
              <p>{label(tomorrow.condition)}</p>
              {tomorrow.templow !== null && (
                <small>
                  {t("Laveste", "Low")} {number(tomorrow.templow)}
                  {q.data?.temperature_unit || unit}
                </small>
              )}
              {tomorrow.precipitation !== null && (
                <small>
                  <Droplets size={13} />
                  {number(tomorrow.precipitation)}{" "}
                  {q.data?.precipitation_unit || ""}
                </small>
              )}
            </>
          ) : (
            <p className="weather-missing">
              {q.isPending
                ? t("Henter prognose…", "Loading forecast…")
                : t("Døgnprognose mangler", "Daily forecast unavailable")}
              {q.isError && (
                <button onClick={() => q.refetch()}>
                  {t("Prøv igjen", "Retry")}
                </button>
              )}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
