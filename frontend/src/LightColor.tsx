import { useState } from "react";
import { Palette, Sun } from "lucide-react";
import type { Control } from "./types";
import { SettingsDialog } from "./home/SettingsDialog";
import "./lightColor.css";

export function LightColor({
  c,
  lang,
  disabled,
  change,
}: {
  c: Control;
  lang: string;
  disabled: boolean;
  change: (action: string, value: number | number[]) => void;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const rgb = c.capabilities.some((v) => v.actions.includes("set_rgb_color"));
  const white = c.capabilities.find((v) =>
    v.actions.includes("set_color_temp"),
  );
  const values = c.attributes.rgb_color;
  const color =
    Array.isArray(values) &&
    values.length === 3 &&
    values.every((v) => typeof v === "number" && v >= 0 && v <= 255)
      ? "#" +
        values.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")
      : "#ffffff";
  const [open, setOpen] = useState(false),
    [hex, setHex] = useState(color),
    [mode, setMode] = useState(rgb ? "color" : "white");
  const [kelvin, setKelvin] = useState(
    Number(c.attributes.color_temp_kelvin) || white?.minimum || 2700,
  );
  if (!rgb && !white) return null;
  return (
    <div className="light-color-control">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setHex(color);
          setKelvin(
            Number(c.attributes.color_temp_kelvin) || white?.minimum || 2700,
          );
          setOpen(true);
        }}
      >
        <span
          className="light-color-swatch"
          style={{
            background:
              c.attributes.color_mode === "color_temp"
                ? "linear-gradient(120deg,#ffd197,#fffef9)"
                : color,
          }}
        />
        <Palette size={16} />
        {t("Farge og hvitt lys", "Color & white light")}
      </button>
      {open && (
        <SettingsDialog
          title={c.name}
          lang={lang}
          onClose={() => setOpen(false)}
          compact
        >
          <div className="light-color-editor">
            <div className="light-color-modes">
              {rgb && (
                <button
                  type="button"
                  aria-pressed={mode === "color"}
                  onClick={() => setMode("color")}
                >
                  <Palette size={18} />
                  {t("Farge", "Color")}
                </button>
              )}
              {white && (
                <button
                  type="button"
                  aria-pressed={mode === "white"}
                  onClick={() => setMode("white")}
                >
                  <Sun size={18} />
                  {t("Hvitt lys", "White light")}
                </button>
              )}
            </div>
            {mode === "color" && rgb ? (
              <>
                <label>
                  {t("Velg lysfarge", "Choose light color")}
                  <input
                    aria-label={t("Velg lysfarge", "Choose light color")}
                    type="color"
                    value={hex}
                    onChange={(e) => setHex(e.target.value)}
                  />
                </label>
                <div className="light-color-presets">
                  {[
                    "#ffb566",
                    "#ff5757",
                    "#ff75d8",
                    "#ab85ff",
                    "#6ba9ff",
                    "#68e2c0",
                  ].map((v) => (
                    <button
                      type="button"
                      key={v}
                      style={{ background: v }}
                      aria-label={v}
                      aria-pressed={hex === v}
                      onClick={() => setHex(v)}
                    />
                  ))}
                </div>
              </>
            ) : (
              white && (
                <label>
                  {t("Hvittemperatur", "White temperature")} · {kelvin} K
                  <input
                    aria-label={t("Hvittemperatur", "White temperature")}
                    type="range"
                    min={white.minimum!}
                    max={white.maximum!}
                    step={white.step || 1}
                    value={kelvin}
                    onChange={(e) => setKelvin(Number(e.target.value))}
                  />
                  <span>{t("Varmt → kjølig", "Warm → cool")}</span>
                </label>
              )
            )}
            <button
              type="button"
              className="primary"
              disabled={disabled}
              onClick={() => {
                change(
                  mode === "color" ? "set_rgb_color" : "set_color_temp",
                  mode === "color"
                    ? [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
                    : kelvin,
                );
                setOpen(false);
              }}
            >
              {t("Bruk innstillingen", "Apply setting")}
            </button>
          </div>
        </SettingsDialog>
      )}
    </div>
  );
}
