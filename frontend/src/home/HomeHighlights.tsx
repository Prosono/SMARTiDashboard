import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Music2,
  Thermometer,
  ArrowUpRight,
} from "lucide-react";
import type { Control } from "../types";
import { Weather } from "./Weather";
import { CameraCard } from "./HomeMedia";
import { reading, usable } from "./homeModel";
import "./homeHighlights.css";

type Slide = {
  id: string;
  kind: "weather" | "camera" | "media" | "climate";
  name: string;
  c: Control;
};
export function HomeHighlights({
  weather,
  cameras,
  controls,
  offline,
  lang,
  open,
}: {
  weather?: Control;
  cameras: Control[];
  controls: Control[];
  offline: boolean;
  lang: string;
  open: (tab: "media" | "climate") => void;
}) {
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
  const climate = controls.find(
    (c) =>
      c.domain === "sensor" &&
      c.attributes.device_class === "temperature" &&
      usable(c),
  );
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
    ...cameras
      .slice(0, 3)
      .map((c) => ({
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
          className="highlight-card"
          key={slide.id}
          role="group"
          aria-roledescription={t("Kort", "Slide")}
          aria-label={`${index + 1} / ${slides.length}: ${slide.name}`}
        >
          <div className="highlight-label">
            <span>
              {slide.kind === "weather"
                ? t("Ute hos deg", "Outside your home")
                : slide.kind === "camera"
                  ? t("Et blikk hjem", "A look home")
                  : slide.kind === "media"
                    ? t("Lyd & bilde", "Sound & vision")
                    : t("Inneklima", "Indoor climate")}
            </span>
            <small>
              {index + 1} / {slides.length}
            </small>
          </div>
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
            <Weather c={slide.c} lang={lang} />
          ) : slide.kind === "camera" ? (
            <CameraCard c={slide.c} offline={offline} lang={lang} />
          ) : slide.kind === "media" ? (
            <div className="highlight-summary">
              <div className="highlight-disc" aria-hidden="true">
                <Music2 size={34} />
              </div>
              <span>
                {slide.c.state === "playing"
                  ? t("Spiller nå", "Now playing")
                  : slide.c.state === "paused"
                    ? t("På pause", "Paused")
                    : t("Mediespiller", "Media player")}
              </span>
              <h2>{String(slide.c.attributes.media_title || slide.c.name)}</h2>
              <p>
                {String(
                  slide.c.attributes.media_artist ||
                    slide.c.attributes.app_name ||
                    slide.c.name,
                )}
              </p>
              <button onClick={() => open("media")}>
                {t("Åpne Multimedia", "Open Multimedia")}
                <ArrowUpRight size={16} />
              </button>
            </div>
          ) : (
            <div className="highlight-summary">
              <Thermometer size={35} />
              <span>{slide.c.name}</span>
              <strong>{reading(slide.c, lang)}</strong>
              <p>{t("Siste måling fra hjemmet", "Latest reading from home")}</p>
              <button onClick={() => open("climate")}>
                {t("Se inneklima", "View climate")}
                <ArrowUpRight size={16} />
              </button>
            </div>
          )}
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
