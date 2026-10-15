import { useQuery } from "@tanstack/react-query";
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Droplets,
  Leaf,
  Moon,
  Sun,
  Wind,
} from "lucide-react";
import { api } from "../api";
import type { Control } from "../types";

type ForecastDay = {
  date: string;
  condition: string;
  temperature: number | null;
  templow: number | null;
  precipitation: number | null;
};
type Forecast = {
  days: { today?: ForecastDay; tomorrow?: ForecastDay };
  forecast?: ForecastDay[];
  timezone?: string;
  temperature_unit?: string;
  precipitation_unit?: string;
};

function WeatherSymbol({ condition }: { condition: string }) {
  const cloudSun = condition === "partlycloudy";
  const Icon =
    condition === "sunny"
      ? Sun
      : condition === "clear-night"
        ? Moon
        : ["rainy", "pouring"].includes(condition)
          ? CloudRain
          : ["lightning", "lightning-rainy"].includes(condition)
            ? CloudLightning
            : ["snowy", "snowy-rainy", "hail"].includes(condition)
              ? CloudSnow
              : condition === "fog"
                ? CloudFog
                : condition === "windy"
                  ? Wind
                  : Cloud;
  return (
    <span
      className={`hw-symbol${cloudSun ? " hw-symbol-partly" : ""}${condition === "sunny" ? " hw-symbol-sun" : ""}`}
      aria-hidden="true"
    >
      {cloudSun ? (
        <>
          <Sun className="hw-symbol-rays" />
          <Cloud className="hw-symbol-cloud" />
        </>
      ) : (
        <Icon />
      )}
    </span>
  );
}

const numeric = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export function HighlightWeather({ c, lang }: { c: Control; lang: string }) {
  const en = lang === "en",
    locale = en ? "en-GB" : "nb-NO";
  const t = (nb: string, english: string) => (en ? english : nb);
  const q = useQuery({
    queryKey: ["weather-forecast", c.id],
    queryFn: () => api<Forecast>(`home/weather/${encodeURIComponent(c.id)}`),
    staleTime: 300000,
    refetchInterval: 600000,
    retry: false,
  });
  const number = (value: unknown) =>
    numeric(value)
      ? value.toLocaleString(locale, { maximumFractionDigits: 1 })
      : "—";
  const conditions: Record<string, string> = {
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
  };
  const label = (condition: string) =>
    conditions[condition] || t("Værdata mangler", "Weather unavailable");
  const a = c.attributes,
    unit = String(a.temperature_unit || q.data?.temperature_unit || "°");
  const today = q.data?.days.today;
  // Older servers still provide the two-day contract. Preserve their real forecasts.
  const forecast = (q.data?.forecast ?? Object.values(q.data?.days || {}))
    .filter(
      (day): day is ForecastDay =>
        !!day && /^\d{4}-\d{2}-\d{2}$/.test(day.date),
    )
    .slice(0, 5);
  const dayLabel = (day: ForecastDay) => {
    if (day.date === today?.date) return t("I dag", "Today");
    return new Intl.DateTimeFormat(locale, {
      weekday: "short",
      timeZone: "UTC",
    })
      .format(new Date(`${day.date}T12:00:00Z`))
      .replace(/\.$/, "");
  };
  const precipitation = numeric(a.precipitation)
    ? a.precipitation
    : today?.precipitation;
  const details = [
    ...(numeric(a.apparent_temperature)
      ? [
          {
            key: "feels",
            icon: null,
            value: `${t("Føles som", "Feels like")} ${number(a.apparent_temperature)}${unit}`,
            title: t("Opplevd temperatur", "Apparent temperature"),
          },
        ]
      : []),
    ...(numeric(precipitation)
      ? [
          {
            key: "rain",
            icon: Droplets,
            value:
              `${number(precipitation)} ${String(a.precipitation_unit || q.data?.precipitation_unit || "")}`.trim(),
            title: numeric(a.precipitation)
              ? t("Nedbør", "Precipitation")
              : t("Ventet nedbør i dag", "Today's forecast precipitation"),
          },
        ]
      : []),
    ...(numeric(a.wind_speed)
      ? [
          {
            key: "wind",
            icon: Wind,
            value:
              `${number(a.wind_speed)} ${String(a.wind_speed_unit || "")}`.trim(),
            title: t("Vind", "Wind"),
          },
        ]
      : []),
    ...(numeric(a.uv_index)
      ? [
          {
            key: "uv",
            icon: Leaf,
            value: `UV ${number(a.uv_index)}`,
            title: t("UV-indeks", "UV index"),
          },
        ]
      : []),
    ...(numeric(a.humidity)
      ? [
          {
            key: "humidity",
            icon: Droplets,
            value: `${number(a.humidity)} %`,
            title: t("Luftfuktighet", "Humidity"),
          },
        ]
      : []),
  ].slice(0, 4);
  return (
    <section
      className="hw-weather"
      aria-label={t("Værmelding", "Weather forecast")}
    >
      <div className="hw-now">
        <div className="hw-current">
          <WeatherSymbol condition={c.state} />
          <div>
            <strong className="hw-temperature">
              {number(a.temperature)}
              <span>{unit}</span>
            </strong>
            <p>{label(c.state)}</p>
          </div>
        </div>
        {!!details.length && (
          <dl className="hw-details">
            {details.map(({ key, icon: Icon, value, title }) => (
              <div key={key} title={title}>
                <dt className="hw-detail-label">{title}</dt>
                <dd>
                  {Icon && <Icon size={16} aria-hidden="true" />}
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <div
        className="hw-outlook"
        aria-label={t("De neste dagene", "Coming days")}
      >
        {forecast.length ? (
          <div
            className="hw-days"
            style={{
              gridTemplateColumns: `repeat(${forecast.length}, minmax(0, 1fr))`,
            }}
          >
            {forecast.map((day) => (
              <div
                className="hw-day"
                key={day.date}
                title={`${dayLabel(day)}: ${label(day.condition)}`}
              >
                <span className="hw-day-name">{dayLabel(day)}</span>
                <WeatherSymbol condition={day.condition} />
                <span
                  className="hw-day-range"
                  aria-label={`${t("Høyeste", "High")} ${number(day.temperature)}${unit}${numeric(day.templow) ? `, ${t("laveste", "low")} ${number(day.templow)}${unit}` : ""}`}
                >
                  {number(day.temperature)}°
                  {numeric(day.templow) && (
                    <>
                      <small> / </small>
                      {number(day.templow)}°
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="hw-empty">
            <Cloud size={24} aria-hidden="true" />
            <span>
              {q.isPending
                ? t("Henter værmeldingen…", "Loading forecast…")
                : t(
                    "Døgnprognosen er ikke tilgjengelig",
                    "Daily forecast unavailable",
                  )}
            </span>
            {q.isError && (
              <button onClick={() => q.refetch()}>
                {t("Prøv igjen", "Retry")}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
