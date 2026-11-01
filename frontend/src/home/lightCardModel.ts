import type { CSSProperties } from "react";
import type { Control } from "../types";
import type { CardConfig } from "./homeGridModel";
import { usable } from "./homeModel";

const beige = [249, 235, 207];
const colorModes = new Set(["rgb", "rgbw", "rgbww", "hs", "xy"]);
function reportedColor(c: Control): number[] | null {
  const mode = c.attributes.color_mode;
  // HA supplies derived RGB for HS/XY lights too. Explicit white modes may retain
  // an old rgb_color value; that value is not the light's current color.
  if (mode != null && !colorModes.has(String(mode))) return null;
  const rgb = c.attributes.rgb_color;
  if (
    !Array.isArray(rgb) ||
    rgb.length !== 3 ||
    !rgb.every(
      (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 255,
    )
  )
    return null;
  if (Math.max(...rgb) - Math.min(...rgb) < 8) return null;
  return rgb.map(Math.round);
}
function luminance(rgb: number[]) {
  const [r, g, b] = rgb
    .map((v) => v / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Exact reported light color; read-only, and shared by preview/full view. */
export function lightCardStyle(
  card: { id: string; entityId?: string } | undefined,
  config: CardConfig | undefined,
  controls: Control[],
  connected = true,
): CSSProperties {
  const sources = config?.sources.length
    ? config.sources
    : card?.entityId
      ? [card.entityId]
      : [];
  const lights = controls.filter(
    (c) =>
      c.domain === "light" &&
      !c.diagnostic &&
      (sources.length
        ? sources.includes(c.entity_id)
        : card?.id === "lighting"),
  );
  const on = connected
    ? lights.filter((c) => usable(c) && c.state === "on")
    : [];
  const colors = on.map(reportedColor);
  // A group follows a shared real color. Different colors or white lights get
  // the beige category surface rather than an invented aggregate RGB value.
  const common = colors[0];
  const rgb =
    common && colors.every((c) => c && c.every((v, i) => v === common[i]))
      ? common
      : beige;
  const background = `rgb(${rgb.join(" ")})`,
    l = luminance(rgb);
  const lightInk = 1.05 / (l + 0.05) >= 4.5;
  const darkInk = luminance([8, 11, 16]);
  const ink = lightInk
    ? "#ffffff"
    : (l + 0.05) / (darkInk + 0.05) >= 4.5
      ? "#080b10"
      : "#000000";
  const inset = `color-mix(in srgb, ${background} 86%, ${lightInk ? "#000" : "#fff"})`;
  return {
    "--card-color": background,
    "--card-depth": rgb === beige ? "rgb(237 217 184)" : background,
    "--text": ink,
    "--muted": ink,
    "--accent": ink,
    "--on-accent": background,
    "--equipment-orange": ink,
    "--harmony-light": ink,
    "--equipment-muted-surface": inset,
    "--card-series-1": ink,
    colorScheme: lightInk ? "dark" : "light",
  } as CSSProperties;
}
