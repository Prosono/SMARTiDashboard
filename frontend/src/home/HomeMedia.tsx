import { useContext, useEffect, useRef, useState } from "react";
import { Camera, Maximize, Play, Square, RefreshCw } from "lucide-react";
import type { Control } from "../types";
import { usable } from "./homeModel";
import { CardIcon, CardTitle } from "./CardPresentation";
import "./homeMedia.css";
import { CardLivePreview } from "./CardLivePreview";
import {
  cameraPlayback,
  type CameraIssue,
  type CameraState,
} from "./cameraPlayback";

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
  const previewEnabled = useContext(CardLivePreview);
  const [issue, setIssue] = useState<CameraIssue>("unavailable");
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const container = useRef<HTMLElement>(null),
    video = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false),
    [foreground, setForeground] = useState(!document.hidden);
  const [paused, setPaused] = useState(false),
    [attempt, retry] = useState(0);
  const [status, setStatus] = useState<CameraState>("idle");
  const available = !offline && usable(c),
    active = available && visible && foreground && !paused && previewEnabled;
  useEffect(() => {
    let leaveTimer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(
      ([e]) => {
        clearTimeout(leaveTimer);
        if (e.isIntersecting) setVisible(true);
        else leaveTimer = setTimeout(() => setVisible(false), 1500);
      },
      { threshold: 0.1 },
    );
    if (container.current) observer.observe(container.current);
    const onVisibility = () => setForeground(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(leaveTimer);
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
    return cameraPlayback(element, c.id, setStatus, setIssue);
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
                  issue === "limit"
                    ? "For mange kameraer er åpne. Lukk et annet kamera og prøv igjen."
                    : issue === "unsupported"
                      ? "Videotypen kan ikke spilles av her. Prøv kameraets H.264-strøm."
                      : issue === "timeout"
                        ? "Kameraet svarte ikke i tide. Prøv igjen."
                        : "Kameraet svarte ikke. Kontroller forbindelsen og prøv igjen.",
                  issue === "limit"
                    ? "Too many cameras are open. Close another camera and retry."
                    : issue === "unsupported"
                      ? "This video format cannot play here. Try the camera’s H.264 stream."
                      : issue === "timeout"
                        ? "The camera did not respond in time. Please retry."
                        : "The camera did not respond. Check the connection and retry.",
                )}
              </small>
            )}
            {status === "blocked" && (
              <button
                onClick={() =>
                  void video.current?.play().catch(() => retry((v) => v + 1))
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
          <strong>
            <CardIcon optional fallback={Camera} size={20} />
            <CardTitle>{c.name}</CardTitle>
          </strong>
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
