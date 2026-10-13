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
type Day = {
  date: string;
  condition: string;
  temperature: number | null;
  templow: number | null;
  precipitation: number | null;
  precipitation_probability: number | null;
  wind_speed: number | null;
};
export function Weather({ c, lang }: { c: Control; lang: string }) {
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
