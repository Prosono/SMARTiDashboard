import type { CardConfig } from "./homeGridModel";
import { defaultCardConfig } from "./cardConfigModel";

export type AmbientType = "clock" | "horizon" | "daylight" | "moon" | "date";
export const isAmbientType = (type: string): type is AmbientType =>
  ["clock", "horizon", "daylight", "moon", "date"].includes(type);
export const ambientChoices = [
  {
    id: "digital",
    type: "clock",
    style: "digital",
    nb: "Digital klokke",
    en: "Digital clock",
    description: [
      "Store sifre og rolig typografi",
      "Large digits and calm typography",
    ],
  },
  {
    id: "analog",
    type: "clock",
    style: "analog",
    nb: "Analog klokke",
    en: "Analog clock",
    description: [
      "En ren skive med presise visere",
      "A clean dial with precise hands",
    ],
  },
  {
    id: "orbital",
    type: "clock",
    style: "orbital",
    nb: "Orbital klokke",
    en: "Orbital clock",
    description: [
      "Futuristiske ringer som følger tiden",
      "Futuristic rings that follow time",
    ],
  },
  {
    id: "horizon",
    type: "horizon",
    nb: "Horisont",
    en: "Horizon",
    description: [
      "Sol og måne på himmelen akkurat nå",
      "The sun and moon in the sky right now",
    ],
  },
  {
    id: "daylight",
    type: "daylight",
    nb: "Dagslys",
    en: "Daylight",
    description: [
      "Soloppgang, solnedgang og dagens lys",
      "Sunrise, sunset and today's daylight",
    ],
  },
  {
    id: "moon",
    type: "moon",
    nb: "Månefase",
    en: "Moon phase",
    description: [
      "Månens fase og når den står opp",
      "The moon's phase and rise/set times",
    ],
  },
  {
    id: "date",
    type: "date",
    nb: "Dato og uke",
    en: "Date and week",
    description: [
      "Dagen, uken og året i et blikk",
      "The day, week and year at a glance",
    ],
  },
] as const;
export function ambientTitle(config: CardConfig, lang: string) {
  const choice = ambientChoices.find((choice) =>
    config.type === "clock"
      ? choice.id === (config.clock_style || "digital")
      : choice.type === config.type,
  );
  return choice ? (lang === "en" ? choice.en : choice.nb) : "";
}
export function ambientConfig(id: string): CardConfig {
  const choice = ambientChoices.find((choice) => choice.id === id)!;
  return {
    ...defaultCardConfig(),
    type: choice.type,
    ...(choice.type === "clock"
      ? { clock_style: choice.style, show_seconds: true, time_format: "24h" }
      : {}),
  };
}
export const ambientSize = (config: CardConfig) =>
  config.type === "horizon" ? { w: 2, h: 3 } : { w: 1, h: 2 };

export type SkyPosition = { azimuth: number; altitude: number };
export type Sky = {
  generated_at: string;
  timezone: string | null;
  demo: boolean;
  available: boolean;
  location_status: "demo" | "configured" | "cached" | "missing" | "unavailable";
  day: { date: string; start: string; end: string } | null;
  sun:
    | (SkyPosition & {
        rise: string | null;
        set: string | null;
        noon: string | null;
        state: string;
        daylight_seconds: number;
      })
    | null;
  moon: Partial<SkyPosition> & {
    rise?: string | null;
    set?: string | null;
    state?: string;
    phase: number;
    fraction: number;
  };
  path: { time: string; sun: SkyPosition; moon: SkyPosition }[];
};
export function clockZone(value?: string | null) {
  if (value)
    try {
      new Intl.DateTimeFormat("en", { timeZone: value }).format();
      return { zone: value, home: true };
    } catch {
      /* Use the panel's real timezone if home metadata is unavailable. */
    }
  return {
    zone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    home: false,
  };
}
export function clockDetails(
  now: number,
  zone: string,
  lang: string,
  format: "24h" | "12h" = "24h",
) {
  const date = new Date(now),
    locale = lang === "en" ? "en-GB" : "nb-NO";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const p = (key: string) => parts.find((part) => part.type === key)!.value;
  const year = Number(p("year")),
    month = Number(p("month")),
    day = Number(p("day"));
  const localDate = Date.UTC(year, month - 1, day);
  const thursday = new Date(localDate);
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const week = Math.ceil(
    ((thursday.getTime() - Date.UTC(thursday.getUTCFullYear(), 0, 1)) /
      86400000 +
      1) /
      7,
  );
  const dayOfYear =
    Math.floor((localDate - Date.UTC(year, 0, 1)) / 86400000) + 1;
  const daysInYear =
    (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000;
  const timeParts = new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    ...(format === "12h" ? { hour12: true } : { hourCycle: "h23" as const }),
  }).formatToParts(date);
  const time = timeParts
    .filter((part) => part.type !== "dayPeriod")
    .map((part) => part.value)
    .join("")
    .trim();
  return {
    time,
    seconds: p("second"),
    period: timeParts.find((part) => part.type === "dayPeriod")?.value || "",
    hour: Number(p("hour")),
    minute: Number(p("minute")),
    second: Number(p("second")),
    year,
    month,
    day,
    week,
    dayOfYear,
    daysInYear,
    weekday: new Intl.DateTimeFormat(locale, {
      timeZone: zone,
      weekday: "long",
    }).format(date),
    date: new Intl.DateTimeFormat(locale, {
      timeZone: zone,
      day: "numeric",
      month: "long",
    }).format(date),
    monthName: new Intl.DateTimeFormat(locale, {
      timeZone: zone,
      month: "long",
    }).format(date),
    zoneName:
      new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: "short" })
        .formatToParts(date)
        .find((part) => part.type === "timeZoneName")?.value || zone,
    full: new Intl.DateTimeFormat(locale, {
      timeZone: zone,
      dateStyle: "full",
      timeStyle: "long",
    }).format(date),
  };
}
export function compass(azimuth: number, lang: string) {
  return (
    lang === "en"
      ? ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
      : ["N", "NØ", "Ø", "SØ", "S", "SV", "V", "NV"]
  )[Math.round((((azimuth % 360) + 360) % 360) / 45) % 8];
}
export const skyX = (azimuth: number, width = 600) =>
  34 + (azimuth / 360) * (width - 68);
export const skyY = (altitude: number, height = 220) =>
  32 + ((height - 60) / 2) * (1 - altitude / 90);
export function skyPath(points: SkyPosition[], width = 600, height = 220) {
  let path = "",
    previous: number | null = null;
  for (const point of points) {
    if (!Number.isFinite(point.azimuth) || !Number.isFinite(point.altitude)) {
      previous = null;
      continue;
    }
    path += `${previous === null || Math.abs(previous - point.azimuth) > 180 ? "M" : "L"}${skyX(point.azimuth, width).toFixed(2)},${skyY(point.altitude, height).toFixed(2)} `;
    previous = point.azimuth;
  }
  return path;
}
export function daylightSegments(day: Sky["day"], sun: Sky["sun"]) {
  if (!day || !sun || sun.state === "always_down") return [];
  if (sun.state === "always_up") return [[0, 100]];
  const start = Date.parse(day.start),
    duration = Date.parse(day.end) - start;
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const percent = (event: string) =>
    Math.max(0, Math.min(100, ((Date.parse(event) - start) / duration) * 100));
  const rise = sun.rise ? percent(sun.rise) : null,
    set = sun.set ? percent(sun.set) : null;
  if (rise !== null && set !== null)
    return rise <= set
      ? [[rise, set]]
      : [
          [0, set],
          [rise, 100],
        ];
  if (rise !== null) return [[rise, 100]];
  if (set !== null) return [[0, set]];
  return [];
}
export function moonShape(phase: number, radius = 40) {
  const p = ((phase % 1) + 1) % 1,
    c = Math.cos(p * Math.PI * 2);
  const edge = Array.from({ length: 65 }, (_, i) => {
    const y = -radius + (i / 64) * radius * 2,
      x = Math.sqrt(Math.max(0, radius * radius - y * y));
    return { x, y };
  });
  return (
    [
      ...edge.map(({ x, y }) => `${p <= 0.5 ? x : -x},${y}`),
      ...edge.reverse().map(({ x, y }) => `${p <= 0.5 ? c * x : -c * x},${y}`),
    ]
      .map((point, i) => `${i ? "L" : "M"}${point}`)
      .join(" ") + " Z"
  );
}
