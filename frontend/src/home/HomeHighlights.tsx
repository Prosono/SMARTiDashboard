import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  AudioLines,
  CloudSun,
  Camera,
  MapPin,
  Thermometer,
  Zap,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { Control } from "../types";
import { HighlightWeather } from "./HighlightWeather";
import { HighlightPlayer } from "./HighlightPlayer";
import { HighlightEnergy } from "./HighlightEnergy";
import { HighlightClimate } from "./HighlightClimate";
import { CameraCard } from "./HomeMedia";
import { usable } from "./homeModel";
import "./homeHighlights.css";

type Slide = {
  id: string;
  kind: "weather" | "camera" | "media" | "climate" | "energy";
  name: string;
  c: Control;
};
type HighlightProps = {
  weather?: Control;
  cameras: Control[];
  controls: Control[];
  offline: boolean;
  lang: string;
  open: (tab: "media" | "climate" | "energy") => void;
};

// Do not mount streams, polling or rotation timers on phone-sized screens.
export function HomeHighlights(props: HighlightProps) {
  const [visible, setVisible] = useState(
    () => matchMedia("(min-width: 768px)").matches,
  );
  useEffect(() => {
    const viewport = matchMedia("(min-width: 768px)");
    const update = () => setVisible(viewport.matches);
    update();
    viewport.addEventListener("change", update);
    return () => viewport.removeEventListener("change", update);
  }, []);
  return visible ? <HighlightCarousel {...props} /> : null;
}

function HighlightCarousel({
  weather,
  cameras,
  controls,
  offline,
  lang,
  open,
}: HighlightProps) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const [selected, setSelected] = useState("");
  const [paused, setPaused] = useState(false),
    [hover, setHover] = useState(false),
    [focused, setFocused] = useState(false),
    [hidden, setHidden] = useState(document.hidden),
    [reduced, setReduced] = useState(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const motion = () => setReduced(mq.matches),
      visibility = () => setHidden(document.hidden);
    mq.addEventListener("change", motion);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      mq.removeEventListener("change", motion);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  const players = controls
    .filter((c) => c.domain === "media_player" && !c.diagnostic && usable(c))
    .sort(
      (a, b) => Number(b.state === "playing") - Number(a.state === "playing"),
    )
    .slice(0, 2);
  const climate =
    controls.find(
      (c) => c.domain === "climate" && !c.diagnostic && usable(c),
    ) ||
    controls.find(
      (c) =>
        c.domain === "sensor" &&
        !c.diagnostic &&
        c.attributes.device_class === "temperature" &&
        usable(c),
    );
  const energyPrefs = useQuery({
    queryKey: ["energy-preferences"],
    queryFn: () => api<{ meters: string[] }>("home/energy/preferences"),
    enabled: !offline,
  });
  const energyMeters = controls.filter(
    (c) =>
      c.domain === "sensor" &&
      !c.diagnostic &&
      usable(c) &&
      ["W", "kW", "Wh", "kWh"].includes(
        String(c.attributes.unit_of_measurement),
      ),
  );
  const energy =
    energyMeters.find((c) => c.id === energyPrefs.data?.meters[0]) ||
    energyMeters.find((c) => c.attributes.device_class === "energy") ||
    energyMeters[0];
  const slides: Slide[] = [
    ...(weather && usable(weather)
      ? [
          {
            id: `weather:${weather.id}`,
            kind: "weather" as const,
            name: t("Vær", "Weather"),
            c: weather,
          },
        ]
      : []),
    ...cameras.slice(0, 3).map((c) => ({
      id: `camera:${c.id}`,
      kind: "camera" as const,
      name: c.name,
      c,
    })),
    ...players.map((c) => ({
      id: `media:${c.id}`,
      kind: "media" as const,
      name: c.name,
      c,
    })),
    ...(energy
      ? [
          {
            id: `energy:${energy.id}`,
            kind: "energy" as const,
            name: t("Energi", "Energy"),
            c: energy,
          },
        ]
      : []),
    ...(climate
      ? [
          {
            id: `climate:${climate.id}`,
            kind: "climate" as const,
            name: climate.name,
            c: climate,
          },
        ]
      : []),
  ];
  const index = Math.max(
    0,
    slides.findIndex((s) => s.id === selected),
  );
  const slide = slides[index];
  const signature = slides.map((s) => s.id).join("|");
  const auto = !paused && !hover && !focused && !hidden && !reduced && !offline;
  useEffect(() => {
    if (!auto || slides.length < 2) return;
    const timer = setTimeout(
      () => setSelected(slides[(index + 1) % slides.length].id),
      12000,
    );
    return () => clearTimeout(timer);
  }, [auto, index, signature]);
  function choose(next: number) {
    setPaused(true);
    setSelected(slides[(next + slides.length) % slides.length].id);
  }
  if (!slide) return null;
  return (
    <section
      className="home-highlights"
      aria-roledescription={t("Karusell", "Carousel")}
      aria-label={t("Glimt fra hjemmet", "Home highlights")}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
    >
      <div className="highlight-stack" data-stacked={slides.length > 1}>
        <div
          className={`highlight-card highlight-${slide.kind}`}
          key={slide.id}
          role="group"
          aria-roledescription={t("Kort", "Slide")}
          aria-label={`${index + 1} / ${slides.length}: ${slide.name}`}
        >
          <header className="highlight-label">
            <span>
              {slide.kind === "weather" ? (
                <CloudSun />
              ) : slide.kind === "camera" ? (
                <Camera />
              ) : slide.kind === "media" ? (
                <AudioLines />
              ) : slide.kind === "energy" ? (
                <Zap />
              ) : (
                <Thermometer />
              )}
              {slide.kind === "weather"
                ? t("Vær", "Weather")
                : slide.kind === "camera"
                  ? t("Kamera", "Camera")
                  : slide.kind === "media"
                    ? t("Musikk & media", "Music & media")
                    : slide.kind === "energy"
                      ? t("Energi", "Energy")
                      : t("Inneklima", "Indoor climate")}
            </span>
            <small title={slide.c.name}>
              {slide.kind === "weather" && <MapPin size={14} />}
              {slide.kind === "energy"
                ? t("Siste 24 t", "Last 24 h")
                : slide.c.name}
            </small>
          </header>
          <div className="highlight-content">
            {offline ? (
              <div className="highlight-summary">
                <h2>{slide.name}</h2>
                <p>
                  {t(
                    "Venter på ferske data fra hjemmet.",
                    "Waiting for fresh home data.",
                  )}
                </p>
              </div>
            ) : slide.kind === "weather" ? (
              <HighlightWeather c={slide.c} lang={lang} />
            ) : slide.kind === "camera" ? (
              <CameraCard c={slide.c} offline={offline} lang={lang} compact />
            ) : slide.kind === "media" ? (
              <HighlightPlayer
                c={slide.c}
                lang={lang}
                open={() => open("media")}
              />
            ) : slide.kind === "energy" ? (
              <HighlightEnergy
                c={slide.c}
                lang={lang}
                open={() => open("energy")}
              />
            ) : (
              <HighlightClimate
                c={slide.c}
                lang={lang}
                open={() => open("climate")}
              />
            )}
          </div>
        </div>
      </div>
      {slides.length > 1 && (
        <nav
          className="highlight-navigation"
          aria-label={t("Velg hjemmekort", "Choose home highlight")}
        >
          <button
            aria-label={t("Forrige kort", "Previous slide")}
            onClick={() => choose(index - 1)}
          >
            <ChevronLeft size={17} />
          </button>
          <div>
            {slides.map((s, i) => (
              <button
                key={s.id}
                className="highlight-dot"
                aria-label={`${t("Vis", "Show")} ${s.name}`}
                aria-current={index === i ? "true" : undefined}
                onClick={() => choose(i)}
              >
                <span />
              </button>
            ))}
          </div>
          <button
            aria-label={t("Neste kort", "Next slide")}
            onClick={() => choose(index + 1)}
          >
            <ChevronRight size={17} />
          </button>
          {!reduced && (
            <button
              aria-label={
                paused
                  ? t("Start automatisk bytte", "Start automatic rotation")
                  : t("Pause automatisk bytte", "Pause automatic rotation")
              }
              aria-pressed={paused}
              onClick={() => setPaused(!paused)}
            >
              {paused ? <Play size={15} /> : <Pause size={15} />}
            </button>
          )}
        </nav>
      )}
    </section>
  );
}
