import type { Control } from "../types";
import type { GridItem } from "./homeGridModel";
import { usable } from "./homeModel";
import { securityAttention } from "./equipmentModel";

export const phoneQuery =
  "(max-width: 650px), (max-height: 500px) and (pointer: coarse)";
export const phonePages = new Set(["lights", "security", "energy_control"]);
export const phoneEnergyPrimary = new Set([
  "energy:flow",
  "energy:spot",
  "energy:tariff",
  "energy:history",
  "energy:capacity",
]);
export type PhoneSize = { w: number; h: number; order?: number };

export function phoneDeviceSize(c?: Control): PhoneSize {
  if (!c) return { w: 1, h: 2 };
  if (c.domain === "camera") return { w: 2, h: 2, order: 1 };
  if (c.domain !== "light" && (!usable(c) || securityAttention(c)))
    return { w: 2, h: 1, order: 0 };
  return { w: 1, h: 2, order: 2 };
}

/** Display geometry only: never persist phone dimensions into the desktop canvas. */
export function phoneItems(
  items: GridItem[],
  size: (item: GridItem) => PhoneSize,
  ordered = false,
) {
  const result = items.map((item) => ({ ...item, ...size(item) }));
  return ordered
    ? result
        .sort(
          (a, b) =>
            (a.order ?? 100) - (b.order ?? 100) || a.y - b.y || a.x - b.x,
        )
        .map((item, y) => ({ ...item, x: 0, y }))
    : result;
}
