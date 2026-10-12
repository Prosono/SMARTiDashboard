import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Camera,
  ChartNoAxesCombined,
  Image,
  RefreshCw,
  X,
  Zap,
} from "lucide-react";
import { api } from "../api";
import type { Control } from "../types";
import { reading, usable } from "./homeModel";
import "./homeMedia.css";

const url = (p: string) => new URL(`api/home/${p}`, document.baseURI).href;

export function CameraCard({
  c,
  offline,
  lang,
}: {
  c: Control;
  offline: boolean;
  lang: string;
}) {
  const [shown, show] = useState(false),
    [failed, fail] = useState(false),
    [stamp, refresh] = useState(0);
  const [expanded, expand] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const available = !offline && usable(c);
  useEffect(() => {
    if (!available) {
      show(false);
      dialog.current?.close();
    }
  }, [available]);
  const source = url(`camera/${encodeURIComponent(c.id)}?snapshot=${stamp}`);
  const load = () => {
    show(true);
    fail(false);
    refresh(Date.now());
  };
  return (
    <article
      className={`home-camera home-media-camera${shown && !failed ? " has-image" : ""}`}
    >
      <button
        className="camera-preview"
        disabled={!available}
        onClick={() => {
          if (!shown || failed) load();
          else {
            expand(true);
            dialog.current?.showModal();
          }
        }}
        aria-label={`${t(shown && !failed ? "Forstørr" : "Vis bilde", shown && !failed ? "Enlarge" : "Show image")}: ${c.name}`}
      >
        {shown && !failed ? (
          <img src={source} alt={c.name} onError={() => fail(true)} />
        ) : (
          <span className="camera-preview-prompt">
            <span className="camera-lens">
              <Camera size={25} strokeWidth={1.4} />
            </span>
            <span>
              {failed
                ? t("Bildet kunne ikke lastes", "Image unavailable")
                : t("Vis stillbilde", "Show still image")}
            </span>
            <small>
              {failed
                ? t("Trykk for å prøve igjen", "Tap to try again")
                : t("Hentes kun når du åpner", "Loaded only when you open")}
            </small>
          </span>
        )}
        <span className="camera-state">
          <i
            className={available ? "available" : "unavailable"}
            aria-hidden="true"
          />
          {available
            ? t("Tilgjengelig", "Available")
            : t("Utilgjengelig", "Unavailable")}
        </span>
        {shown && !failed && (
          <span className="camera-expand" aria-hidden="true">
            <ArrowUpRight size={17} />
          </span>
        )}
      </button>
      <div className="camera-caption">
        <div>
          <strong>{c.name}</strong>
          <small>
            {!available
              ? t("Utilgjengelig", "Unavailable")
              : shown
                ? t(
                    "Stillbilde · oppdater ved behov",
                    "Still image · refresh on demand",
                  )
                : t("Ingen strøm startet", "No stream started")}
          </small>
        </div>
        {shown && (
          <button
            className="camera-refresh"
            disabled={!available}
            onClick={load}
            aria-label={t("Oppdater bilde", "Refresh image")}
            title={t("Oppdater bilde", "Refresh image")}
          >
            <RefreshCw size={17} />
          </button>
        )}
      </div>
      <dialog
        ref={dialog}
        className="home-photo-dialog"
        aria-label={c.name}
        onClose={() => expand(false)}
      >
        <button
          autoFocus
          aria-label={t("Lukk", "Close")}
          onClick={() => dialog.current?.close()}
        >
          <X />
        </button>
        {expanded && shown && !failed && <img src={source} alt={c.name} />}
        <p>
          <Image size={15} aria-hidden="true" /> {c.name} ·{" "}
          {t("Stillbilde", "Still image")}
        </p>
      </dialog>
    </article>
  );
}

export function Energy({
  meters,
  selected,
  onSelect,
  offline,
  lang,
}: {
  meters: Control[];
  selected: string | null;
  onSelect: (id: string) => void;
  offline: boolean;
  lang: string;
}) {
  const c = meters.find((c) => c.id === selected) || meters[0];
  const gradientId = useId().replaceAll(":", "");
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const locale = lang === "en" ? "en-GB" : "nb-NO";
  const number = (value: number) =>
    value.toLocaleString(locale, { maximumFractionDigits: 1 });
  const time = (value: number) =>
    new Date(value).toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
    });
  const history = useQuery({
    queryKey: ["home-history", c.id],
    queryFn: () =>
      api<{ points: { time: string; value: number | null }[]; unit: string }>(
        `home/history/${encodeURIComponent(c.id)}`,
      ),
    enabled: !offline,
    staleTime: 300000,
    retry: false,
  });
  const pts = history.data?.points || [];
  const valid = pts.filter(
    (p) =>
      p.value !== null &&
      Number.isFinite(p.value) &&
      Number.isFinite(Date.parse(p.time)),
  );
  const values = valid.map((p) => p.value!);
  const min = Math.min(...values),
    max = Math.max(...values);
  const start = valid.length ? Date.parse(valid[0].time) : 0,
    end = valid.length ? Date.parse(valid[valid.length - 1].time) : 0;
  const segments: { x: number; y: number }[][] = [];
  let connected = false;
  for (const p of pts) {
    if (
      p.value === null ||
      !Number.isFinite(p.value) ||
      !Number.isFinite(Date.parse(p.time))
    ) {
      connected = false;
      continue;
    }
    const x =
      12 + ((Date.parse(p.time) - start) / Math.max(1, end - start)) * 476;
    const y = max === min ? 82 : 144 - ((p.value - min) / (max - min)) * 124;
    if (!connected) segments.push([]);
    segments[segments.length - 1].push({ x, y });
    connected = true;
  }
  const last = segments.at(-1)?.at(-1);
  const paths = segments.map((segment) =>
    segment.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" "),
  );
  const power = ["W", "kW"].includes(String(c.attributes.unit_of_measurement));
  const hasChart = valid.length > 1 && !offline;
  return (
    <section className="home-panel home-energy home-media-energy">
      <header className="energy-header">
        <div className="energy-title">
          <span className="energy-symbol">
            <Zap size={21} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <div>
            <span className="eyebrow">
              {t("Energi & innsikt", "Energy & insight")}
            </span>
            <h2>{t("Følg med på energien", "Keep an eye on energy")}</h2>
          </div>
        </div>
        <span className="energy-period">{t("Siste 24 t", "Last 24 h")}</span>
      </header>
      <div className="energy-reading">
        <strong>{offline ? "—" : reading(c, lang)}</strong>
        <span>
          {power
            ? t("Effekt akkurat nå", "Power right now")
            : t(
                "Målerstand · ikke beregnet dagsforbruk",
                "Meter reading · not calculated daily consumption",
              )}
        </span>
      </div>
      <label className="energy-meter">
        <span>{t("Måler", "Meter")}</span>
        <select value={c.id} onChange={(e) => onSelect(e.target.value)}>
          {meters.map((v) => (
            <option value={v.id} key={v.id}>
              {v.name} · {String(v.attributes.unit_of_measurement)}
            </option>
          ))}
        </select>
      </label>
      {hasChart ? (
        <div className="energy-visual">
          <div className="energy-chart-scale">
            <span>
              {number(max)} {history.data?.unit}
            </span>
            <span>{t("Målt historikk", "Recorded history")}</span>
          </div>
          <svg
            className="energy-chart"
            viewBox="0 0 500 160"
            role="img"
            aria-label={t(
              "Målerhistorikk siste 24 timer",
              "Meter history over the last 24 hours",
            )}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity=".24" />
                <stop
                  offset="100%"
                  stopColor="currentColor"
                  stopOpacity=".015"
                />
              </linearGradient>
            </defs>
            {[20, 82, 144].map((y) => (
              <path key={y} d={`M12 ${y}H488`} className="chart-axis" />
            ))}
            {segments.map((segment, i) => (
              <g key={i}>
                {segment.length > 1 && (
                  <path
                    d={`${paths[i]} L${segment[segment.length - 1].x} 144 L${segment[0].x} 144 Z`}
                    fill={`url(#${gradientId})`}
                  />
                )}
                <path d={paths[i]} className="energy-line" />
                {segment.length === 1 && (
                  <circle
                    cx={segment[0].x}
                    cy={segment[0].y}
                    r="2.5"
                    fill="currentColor"
                  />
                )}
              </g>
            ))}
            {last && (
              <circle className="energy-latest" cx={last.x} cy={last.y} r="4" />
            )}
          </svg>
          <div className="chart-labels">
            <span>{time(start)}</span>
            <span>{time(end)}</span>
          </div>
          <div className="energy-range">
            <span>
              {t("Laveste", "Lowest")}{" "}
              <strong>
                {number(min)} {history.data?.unit}
              </strong>
            </span>
            <span>
              {t("Høyeste", "Highest")}{" "}
              <strong>
                {number(max)} {history.data?.unit}
              </strong>
            </span>
          </div>
        </div>
      ) : (
        <div className="energy-empty">
          <ChartNoAxesCombined
            size={27}
            strokeWidth={1.35}
            aria-hidden="true"
          />
          <p>
            {!offline && history.isLoading
              ? t("Henter historikk…", "Loading history…")
              : t(
                  "Historikk er ikke tilgjengelig nå.",
                  "History is not available right now.",
                )}
          </p>
        </div>
      )}
      <small className="energy-note">
        {t(
          "Én måler om gangen. Forbruk, produksjon og delmålere summeres ikke.",
          "One meter at a time. Consumption, production and submeters are not added together.",
        )}
      </small>
    </section>
  );
}
