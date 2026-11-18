import { useEffect, useState, type CSSProperties } from "react";
import { History, Info, ChevronRight, Settings2 } from "lucide-react";
import type { Control, Home } from "./types";
import { LightAppearance } from "./LightAppearance";
import { LightColor } from "./LightColor";
import { HideControl } from "./ControlVisibility";
import { ControlHistory } from "./ControlHistory";
import { DeviceDetailOverview } from "./DeviceDetailOverview";
import "./lightDetail.css";

export function LightDetail({
  c,
  home,
  lang,
  room,
  offline,
  admin,
  busy,
  message,
  failed,
  command,
  favorite,
}: {
  c: Control;
  home: Home;
  lang: string;
  room: string;
  offline: boolean;
  admin: boolean;
  busy: boolean;
  message: string;
  failed: boolean;
  command: (action: string, value?: number | number[]) => Promise<void>;
  favorite: () => Promise<void>;
}) {
  const en = lang === "en",
    t = (nb: string, english: string) => (en ? english : nb);
  const [level, setLevel] = useState(
    Math.round((Number(c.attributes.brightness || 0) / 255) * 100),
  );
  const [history, setHistory] = useState(false),
    [technical, setTechnical] = useState(false);
  const available = !offline && c.availability === "available",
    disabled = !available || busy;
  const dim = c.capabilities.some((v) => v.kind === "brightness");
  const power = c.capabilities.some((v) => v.kind === "power");
  const color = c.capabilities.some((v) =>
    v.actions.some((a) => ["set_rgb_color", "set_color_temp"].includes(a)),
  );
  useEffect(
    () =>
      setLevel(Math.round((Number(c.attributes.brightness || 0) / 255) * 100)),
    [c.attributes.brightness],
  );
  const sendLevel = (value: number) => {
    setLevel(value);
    void command("set_brightness", value);
  };
  return (
    <article className="light-detail" data-state={c.state}>
      <DeviceDetailOverview
        control={c}
        room={room}
        offline={offline}
        lang={lang}
        favorite={home.favorites.includes(c.entity_id)}
        onFavorite={favorite}
      />
      <section
        className="light-detail-primary"
        aria-label={t("Lysstyring", "Light controls")}
      >
        <div className="light-detail-power">
          <strong>
            <i data-on={available && c.state === "on"} />
            {!available
              ? t("Utilgjengelig", "Unavailable")
              : c.state === "on"
                ? t("På", "On")
                : t("Av", "Off")}
          </strong>
          {power && (
            <button
              className="light-detail-switch"
              role="switch"
              aria-label={c.name}
              aria-checked={c.state === "on"}
              disabled={disabled}
              onClick={() =>
                void command(c.state === "on" ? "turn_off" : "turn_on")
              }
            >
              <span />
            </button>
          )}
        </div>
        {dim && (
          <div className="light-detail-dimmer">
            <label htmlFor={`light-level-${c.id}`}>
              {t("Lysstyrke", "Brightness")}
            </label>
            <output>{available ? `${level}%` : "—"}</output>
            <input
              id={`light-level-${c.id}`}
              aria-label={`${c.name}: ${t("Lysstyrke", "Brightness")}`}
              type="range"
              min="0"
              max="100"
              step="1"
              value={level}
              disabled={disabled}
              style={{ "--level": `${level}%` } as CSSProperties}
              onChange={(e) => setLevel(Number(e.target.value))}
              onPointerUp={(e) => sendLevel(Number(e.currentTarget.value))}
              onKeyUp={(e) => {
                if (
                  [
                    "ArrowLeft",
                    "ArrowRight",
                    "ArrowUp",
                    "ArrowDown",
                    "Home",
                    "End",
                    "PageUp",
                    "PageDown",
                  ].includes(e.key)
                )
                  sendLevel(Number(e.currentTarget.value));
              }}
            />
            <div className="light-detail-presets">
              {[25, 50, 75, 100].map((v) => (
                <button
                  key={v}
                  disabled={disabled}
                  aria-pressed={available && level === v}
                  onClick={() => sendLevel(v)}
                >
                  {v}%
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
      {(busy || message) && (
        <p
          className={failed ? "form-error" : "light-detail-feedback"}
          role="status"
        >
          {busy ? t("Oppdaterer…", "Updating…") : message}
        </p>
      )}
      {color && (
        <div className="light-detail-color">
          <LightColor
            c={c}
            lang={lang}
            disabled={disabled}
            change={(a, v) => void command(a, v)}
          />
        </div>
      )}
      <button
        className="control-history-toggle"
        aria-expanded={history}
        onClick={() => setHistory(!history)}
      >
        <History size={18} aria-hidden="true" />
        {t("Historikk", "History")}
        <ChevronRight size={16} aria-hidden="true" />
      </button>
      {history && <ControlHistory control={c} home={home} lang={lang} />}
      {admin && (
        <details className="device-options">
          <summary className="control-history-toggle">
            <Settings2 size={18} aria-hidden="true" />
            {t("Enhetsinnstillinger", "Device settings")}
            <ChevronRight size={16} aria-hidden="true" />
          </summary>
          <LightAppearance c={c} lang={lang} disabled={offline} />
          <HideControl c={c} lang={lang} disabled={offline} />
        </details>
      )}
      <div className="light-detail-secondary">
        <button
          className="control-history-toggle"
          aria-expanded={technical}
          onClick={() => setTechnical(!technical)}
        >
          <Info size={23} />
          {t("Tekniske detaljer", "Technical details")}
          <ChevronRight size={18} />
        </button>
        {technical && (
          <dl>
            <dt>{t("Enhets-ID", "Entity ID")}</dt>
            <dd>{c.entity_id}</dd>
            <dt>{t("Integrasjon", "Integration")}</dt>
            <dd>{c.integration || "—"}</dd>
            <dt>{t("Enhet", "Device")}</dt>
            <dd>{c.device_id || "—"}</dd>
          </dl>
        )}
      </div>
    </article>
  );
}
