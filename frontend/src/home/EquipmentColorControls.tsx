import type { Control } from "../types";
import { LightColor } from "../LightColor";

const presets = [
  { color: [255, 193, 65], nb: "Varm gul", en: "Warm yellow" },
  { color: [255, 128, 77], nb: "Korall", en: "Coral" },
  { color: [236, 67, 200], nb: "Rosa", en: "Pink" },
  { color: [151, 61, 238], nb: "Lilla", en: "Purple" },
  { color: [21, 162, 239], nb: "Blå", en: "Blue" },
  { color: [46, 215, 105], nb: "Grønn", en: "Green" },
];
export function EquipmentColorControls({
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
  const rgb = c.capabilities.some((cap) =>
    cap.actions.includes("set_rgb_color"),
  );
  const white = c.capabilities.some((cap) =>
    cap.actions.includes("set_color_temp"),
  );
  if (!rgb && !white) return null;
  return (
    <div className="equipment-color-controls">
      {rgb && c.attributes.color_mode !== "color_temp" && (
        <div
          className="equipment-color-presets"
          role="group"
          aria-label={`${c.name}: ${lang === "en" ? "light color" : "lysfarge"}`}
        >
          {presets.map((preset) => (
            <button
              key={preset.nb}
              type="button"
              aria-label={`${c.name}: ${lang === "en" ? preset.en : preset.nb}`}
              aria-pressed={
                c.attributes.color_mode !== "color_temp" &&
                Array.isArray(c.attributes.rgb_color) &&
                preset.color.every(
                  (value, index) =>
                    Math.abs(
                      value -
                        Number((c.attributes.rgb_color as number[])[index]),
                    ) <= 4,
                )
              }
              style={{ background: `rgb(${preset.color.join(" ")})` }}
              disabled={disabled}
              onClick={() => change("set_rgb_color", preset.color)}
            />
          ))}
        </div>
      )}
      <LightColor
        c={c}
        lang={lang}
        disabled={disabled}
        change={change}
        compact
      />
    </div>
  );
}
