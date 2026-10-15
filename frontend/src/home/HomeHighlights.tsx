import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Music2,
  Thermometer,
  ArrowUpRight,
  Zap, SkipBack, SkipForward,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Control } from "../types";
import { Weather } from "./Weather";
import { CameraCard } from "./HomeMedia";
import { reading, usable } from "./homeModel";
import "./homeHighlights.css";

type Slide = {
  id: string;
  kind: "weather" | "camera" | "media" | "climate" | "energy";
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
  open: (tab: "media" | "climate" | "energy") => void;
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
  const energy = controls.find(c => c.domain === "sensor" && !c.diagnostic && usable(c) && c.attributes.device_class === "power") || controls.find(c => c.domain === "sensor" && !c.diagnostic && usable(c) && c.attributes.device_class === "energy");
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
    ...(energy ? [{ id: `energy:${energy.id}`, kind: "energy" as const, name: t("Energi", "Energy"), c: energy }] : []),
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
          <div className="highlight-label">
            <span>
              {slide.kind === "weather"
                ? t("Ute hos deg", "Outside your home")
                : slide.kind === "camera"
                  ? t("Et blikk hjem", "A look home")
                  : slide.kind === "media"
                    ? t("Lyd & bilde", "Sound & vision")
                    : slide.kind === "energy" ? t("Hjemmets energi", "Home energy") : t("Inneklima", "Indoor climate")}
            </span>
            <small>
              {index + 1} / {slides.length}
            </small>
          </div>
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
            <Weather c={slide.c} lang={lang} />
          ) : slide.kind === "camera" ? (
            <CameraCard c={slide.c} offline={offline} lang={lang} />
          ) : slide.kind === "media" ? (
            <HighlightPlayer c={slide.c} lang={lang} open={() => open("media")} />
          ) : slide.kind === "energy" ? (
            <HighlightEnergy c={slide.c} lang={lang} open={() => open("energy")} />
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


function HighlightPlayer({c, lang, open}: {c: Control; lang: string; open: () => void}) {
  const en = lang === "en", qc = useQueryClient();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const actions = c.capabilities.flatMap(cap => cap.actions);
  async function command(action: string) {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const result = await api<{status: string}>(`controls/${encodeURIComponent(c.entity_id)}/commands`, "POST", {action});
      setMessage(result.status === "state_updated" ? (en ? "Updated" : "Oppdatert") : (en ? "Sent to player" : "Sendt til spilleren"));
      await qc.invalidateQueries({queryKey: ["home"]});
    } catch { setMessage(en ? "Could not reach player" : "Kunne ikke nå spilleren"); }
    finally { setBusy(false); }
  }
  const transport = [
    ["media_previous_track", en ? "Previous" : "Forrige", SkipBack],
    [c.state === "playing" ? "media_pause" : "media_play", c.state === "playing" ? "Pause" : (en ? "Play" : "Spill av"), c.state === "playing" ? Pause : Play],
    ["media_next_track", en ? "Next" : "Neste", SkipForward],
  ] as const;
  return <div className="highlight-summary highlight-player">
    <div className="highlight-track-head"><div className="highlight-disc"><Music2 size={34}/></div><span>{c.name}<small>{c.state === "playing" ? (en ? "Now playing" : "Spiller nå") : c.state === "paused" ? (en ? "Paused" : "På pause") : (en ? "Ready" : "Klar")}</small></span></div>
    <h2>{String(c.attributes.media_title || c.name)}</h2>
    <p>{String(c.attributes.media_artist || c.attributes.app_name || "")}</p>
    <div className="highlight-transport">{transport.filter(([action]) => actions.includes(action)).map(([action,label,Icon]) => <button key={action} aria-label={label} disabled={busy || c.state === "off"} onClick={() => void command(action)}><Icon size={24}/></button>)}</div>
    <small role="status">{message}</small>
    <button onClick={open}>{en ? "Open Multimedia" : "Åpne Multimedia"}<ArrowUpRight size={16}/></button>
  </div>;
}

function HighlightEnergy({c, lang, open}: {c: Control; lang: string; open: () => void}) {
  const en = lang === "en";
  const q = useQuery({
    queryKey: ["highlight-energy", c.id],
    queryFn: () => api<{series: {id: string; current: {points: {time: string; value: number | null}[]}}[]}>(`home/energy/statistics?${new URLSearchParams({period: "24h", ids: c.id})}`),
    staleTime: 60000, refetchInterval: 300000, retry: false,
  });
  const points = q.data?.series.find(s => s.id === c.id)?.current.points || [];
  const values = points.filter(p => p.value !== null);
  const max = Math.max(1, ...values.map(p => Math.abs(p.value!)));
  return <div className="highlight-summary highlight-energy-body">
    <div className="highlight-track-head"><Zap size={30}/><span>{c.name}<small>{en ? "Latest reading" : "Siste måling"}</small></span></div>
    <strong>{reading(c, lang)}</strong>
    <div className="highlight-energy-chart" role="img" aria-label={en ? "Measurements over the last 24 hours" : "Målinger siste 24 timer"}>
      {values.length ? <svg viewBox="0 0 300 90" preserveAspectRatio="none">{points.map((p,i) => p.value === null ? null : <rect key={p.time} x={i*300/points.length} y={88-Math.abs(p.value)/max*80} width={Math.max(1,300/points.length-2)} height={Math.max(1,Math.abs(p.value)/max*80)} rx="2"><title>{new Date(p.time).toLocaleString(en ? "en-GB" : "nb-NO")}: {p.value}</title></rect>)}</svg> : <p>{q.isPending ? (en ? "Loading history…" : "Henter historikk…") : (en ? "History unavailable" : "Historikk er ikke tilgjengelig")}</p>}
    </div>
    <small>{en ? "Last 24 hours" : "Siste 24 timer"}</small>
    <button onClick={open}>{en ? "Explore energy" : "Se energi og innsikt"}<ArrowUpRight size={16}/></button>
  </div>;
}
