import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera, X } from "lucide-react";
import { api } from "../api";
import type { Control } from "../types";
import { reading, usable } from "./homeModel";
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
  useEffect(() => {
    if (offline || !usable(c)) {
      show(false);
      dialog.current?.close();
    }
  }, [offline, c.availability]);
  const source = url(`camera/${encodeURIComponent(c.id)}?snapshot=${stamp}`);
  return (
    <article className="home-camera">
      <button
        className="camera-preview"
        disabled={offline || !usable(c)}
        onClick={() => {
          if (!shown) {
            show(true);
            fail(false);
            refresh(Date.now());
          } else {
            expand(true);
            dialog.current?.showModal();
          }
        }}
        aria-label={`${t(shown ? "Forstørr" : "Vis bilde", shown ? "Enlarge" : "Show image")}: ${c.name}`}
      >
        {shown && !failed ? (
          <img src={source} alt={c.name} onError={() => fail(true)} />
        ) : (
          <>
            <Camera size={30} />
            <span>
              {failed
                ? t("Bildet kunne ikke lastes", "Image unavailable")
                : t("Vis stillbilde", "Show still image")}
            </span>
          </>
        )}
      </button>
      <strong>{c.name}</strong>
      <small>
        {offline || !usable(c)
          ? t("Utilgjengelig", "Unavailable")
          : shown
            ? t(
                "Stillbilde · oppdater ved behov",
                "Still image · refresh on demand",
              )
            : t("Ingen strøm startet", "No stream started")}
      </small>
      {shown && (
        <button
          className="text-button"
          disabled={offline}
          onClick={() => {
            fail(false);
            refresh(Date.now());
          }}
        >
          {t("Oppdater bilde", "Refresh image")}
        </button>
      )}
      <dialog ref={dialog} className="home-photo-dialog" aria-label={c.name}>
        <button
          autoFocus
          aria-label={t("Lukk", "Close")}
          onClick={() => dialog.current?.close()}
        >
          <X />
        </button>
        {expanded && shown && !failed && <img src={source} alt={c.name} />}
        <p>
          {c.name} · {t("Stillbilde", "Still image")}
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
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
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
    (p) => p.value !== null && Number.isFinite(Date.parse(p.time)),
  );
  const values = valid.map((p) => p.value!);
  const min = Math.min(...values),
    max = Math.max(...values);
  const start = valid.length ? Date.parse(valid[0].time) : 0,
    end = valid.length ? Date.parse(valid[valid.length - 1].time) : 0;
  let path = "",
    connected = false;
  for (const p of pts) {
    if (p.value === null || !Number.isFinite(Date.parse(p.time))) {
      connected = false;
      continue;
    }
    const x =
      12 + ((Date.parse(p.time) - start) / Math.max(1, end - start)) * 476;
    const y = 128 - ((p.value - min) / Math.max(1, max - min)) * 108;
    path += `${connected ? " L" : " M"}${x} ${y}`;
    connected = true;
  }
  return (
    <section className="home-panel home-energy">
      <header>
        <div>
          <span className="eyebrow">
            {t("Energi & innsikt", "Energy & insight")}
          </span>
          <h2>{t("Følg med på energien", "Keep an eye on energy")}</h2>
        </div>
      </header>
      <label>
        {t("Måler", "Meter")}
        <select value={c.id} onChange={(e) => onSelect(e.target.value)}>
          {meters.map((v) => (
            <option value={v.id} key={v.id}>
              {v.name} · {String(v.attributes.unit_of_measurement)}
            </option>
          ))}
        </select>
      </label>
      <div className="energy-reading">
        <strong>{offline ? "—" : reading(c, lang)}</strong>
        <span>
          {["W", "kW"].includes(String(c.attributes.unit_of_measurement))
            ? t("Effekt akkurat nå", "Power right now")
            : t(
                "Målerstand · ikke beregnet dagsforbruk",
                "Meter reading · not calculated daily consumption",
              )}
        </span>
      </div>
      {valid.length > 1 && !offline ? (
        <>
          <svg
            viewBox="0 0 500 150"
            role="img"
            aria-label={t(
              "Målerhistorikk siste 24 timer",
              "Meter history over the last 24 hours",
            )}
          >
            <path d="M12 128H488" className="chart-axis" />
            <path d={path} className="energy-line" />
          </svg>
          <div className="chart-labels">
            <span>
              {new Date(start).toLocaleTimeString(lang, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span>
              {min.toFixed(1)}–{max.toFixed(1)} {history.data?.unit}
            </span>
            <span>
              {new Date(end).toLocaleTimeString(lang, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        </>
      ) : (
        <p className="muted">
          {history.isLoading
            ? t("Henter historikk…", "Loading history…")
            : t(
                "Historikk er ikke tilgjengelig nå.",
                "History is not available right now.",
              )}
        </p>
      )}
      <small>
        {t(
          "Én måler om gangen. Forbruk, produksjon og delmålere summeres ikke.",
          "One meter at a time. Consumption, production and submeters are not added together.",
        )}
      </small>
    </section>
  );
}
