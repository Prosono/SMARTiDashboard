import { useEffect, useRef, useState } from "react";
import { Camera, Maximize, Play, Square, RefreshCw } from "lucide-react";
import type Hls from "hls.js";
import { api } from "../api";
import type { Control } from "../types";
import { usable } from "./homeModel";
import "./homeMedia.css";

export function CameraCard({
  c,
  offline,
  lang,
  compact = false,
}: {
  c: Control;
  offline: boolean;
  lang: string;
  compact?: boolean;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const container = useRef<HTMLElement>(null),
    video = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false),
    [foreground, setForeground] = useState(!document.hidden);
  const [paused, setPaused] = useState(false),
    [attempt, retry] = useState(0);
  const [status, setStatus] = useState<
    "idle" | "loading" | "playing" | "buffering" | "error" | "blocked"
  >("idle");
  const available = !offline && usable(c),
    active = available && visible && foreground && !paused;
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([e]) => setVisible(e.isIntersecting),
      { threshold: 0.1 },
    );
    if (container.current) observer.observe(container.current);
    const onVisibility = () => setForeground(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  useEffect(() => {
    const element = video.current;
    if (!active || !element) {
      setStatus("idle");
      return;
    }
    let cancelled = false,
      player: Hls | undefined,
      session: string | undefined;
    const stop = () => {
      if (session)
        void api(`home/camera-stream/${session}`, "DELETE").catch(() => {});
      session = undefined;
    };
    setStatus("loading");
    const fail = () => {
      if (!cancelled) {
        setStatus("error");
        player?.destroy();
        element.removeAttribute("src");
        element.load();
        stop();
      }
    };
    void (async () => {
      try {
        const stream = await api<{ id: string; path: string }>(
          `home/camera/${encodeURIComponent(c.id)}/live`,
          "POST",
        );
        session = stream.id;
        if (cancelled) {
          stop();
          return;
        }
        const src = new URL(`api/${stream.path}`, document.baseURI).href;
        const play = () => {
          void element.play().catch(() => {
            if (!cancelled) setStatus("blocked");
          });
        };
        if (element.canPlayType("application/vnd.apple.mpegurl")) {
          element.src = src;
          play();
        } else {
          const { default: Hls } = await import("hls.js");
          if (cancelled) {
            stop();
            return;
          }
          if (!Hls.isSupported()) throw new Error("hls_unsupported");
          player = new Hls({
            enableWorker: false,
            lowLatencyMode: true,
            backBufferLength: 15,
            maxBufferLength: 20,
          });
          player.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) fail();
          });
          player.on(Hls.Events.MANIFEST_PARSED, play);
          player.loadSource(src);
          player.attachMedia(element);
        }
      } catch {
        fail();
      }
    })();
    const onError = () => fail();
    element.addEventListener("error", onError);
    element.addEventListener("ended", onError);
    return () => {
      cancelled = true;
      element.removeEventListener("error", onError);
      element.removeEventListener("ended", onError);
      player?.destroy();
      element.pause();
      element.removeAttribute("src");
      element.load();
      stop();
    };
  }, [active, c.id, attempt]);
  const label = !available
    ? t("Utilgjengelig", "Unavailable")
    : status === "playing"
      ? "LIVE"
      : status === "loading" || status === "buffering"
        ? t("Kobler til…", "Connecting…")
        : status === "error"
          ? t("Livevideo ikke tilgjengelig", "Live video unavailable")
          : t("Pauset", "Paused");
  return (
    <article
      ref={container}
      className={`home-camera home-media-camera camera-live-card ${compact ? "camera-compact" : ""}`}
    >
      <div className="camera-live-preview">
        <video
          ref={video}
          muted
          playsInline
          autoPlay
          controls={active}
          aria-label={`${t("Livekamera", "Live camera")}: ${c.name}`}
          onPlaying={() => setStatus("playing")}
          onWaiting={() => setStatus("buffering")}
          onStalled={() => setStatus("buffering")}
          onPause={() => setStatus((s) => (s === "playing" ? "blocked" : s))}
        />
        <span className="camera-state">
          <i className={status === "playing" ? "available" : ""} />
          {label}
        </span>
        {status !== "playing" && status !== "buffering" && (
          <div className="camera-live-overlay">
            <Camera size={26} />
            <strong>
              {status === "error"
                ? t("Strømmen kunne ikke startes", "Stream could not start")
                : status === "loading"
                  ? t("Åpner livevideo…", "Opening live video…")
                  : t("Live fra hjemmet", "Live from home")}
            </strong>
            {status === "error" && (
              <small>
                {t(
                  "SMARTi kunne ikke hente eller spille av direktestrømmen. Prøv igjen.",
                  "SMARTi could not fetch or play the live stream. Please retry.",
                )}
              </small>
            )}
            {status === "blocked" && (
              <button
                onClick={() =>
                  void video.current?.play().catch(() => setStatus("error"))
                }
              >
                <Play size={16} />
                {t("Spill av", "Play")}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="camera-caption">
        <div>
          <strong>{c.name}</strong>
          <small>
            {t("Livevideo · noe forsinkelse", "Live video · some delay")}
          </small>
        </div>
        <div className="camera-live-actions">
          <button
            className="camera-refresh"
            disabled={!available}
            aria-label={`${paused ? t("Start live", "Start live") : status === "error" ? t("Prøv live igjen", "Retry live") : t("Stopp live", "Stop live")}: ${c.name}`}
            onClick={() => {
              if (status === "error") {
                retry((v) => v + 1);
                setPaused(false);
              } else setPaused(!paused);
            }}
          >
            {paused ? (
              <Play size={17} />
            ) : status === "error" ? (
              <RefreshCw size={17} />
            ) : (
              <Square size={15} />
            )}
            {compact && (
              <span>
                {paused
                  ? t("Start live", "Start live")
                  : status === "error"
                    ? t("Prøv igjen", "Retry")
                    : t("Stopp live", "Stop live")}
              </span>
            )}
          </button>
          <button
            className="camera-refresh"
            disabled={status !== "playing"}
            aria-label={`${t("Fullskjerm", "Fullscreen")}: ${c.name}`}
            onClick={() => {
              const el = video.current as
                | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
                | null;
              if (el?.requestFullscreen)
                void el.requestFullscreen().catch(() => {});
              else el?.webkitEnterFullscreen?.();
            }}
          >
            <Maximize size={17} />
            {compact && <span>{t("Fullskjerm", "Fullscreen")}</span>}
          </button>
        </div>
      </div>
    </article>
  );
}
