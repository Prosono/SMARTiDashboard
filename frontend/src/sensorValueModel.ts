import type { Control } from "./types";
import { controlState } from "./controlState";
import { numeric, measurementParts } from "./home/homeModel";
import { monetarySensor } from "./home/sensorDeviceArtwork";

/** Format display only; the original state stays available and is never rewritten. */
export function sensorDisplayValue(c: Control, lang: string) {
  const locale = lang === "en" ? "en-GB" : "nb-NO";
  const raw = String(c.state);
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const instant =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      raw,
    );
  if (c.availability === "available" && (dateOnly || instant)) {
    const date = dateOnly
      ? new Date(
          Number(dateOnly[1]),
          Number(dateOnly[2]) - 1,
          Number(dateOnly[3]),
          12,
        )
      : new Date(raw);
    if (
      Number.isFinite(date.getTime()) &&
      (!dateOnly || date.getDate() === Number(dateOnly[3]))
    )
      return {
        kind: "timestamp",
        value: date.toLocaleDateString(locale, {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }),
        secondary: dateOnly
          ? undefined
          : date.toLocaleTimeString(locale, {
              hour: "2-digit",
              minute: "2-digit",
            }),
        unit: "",
      };
  }
  const parts = measurementParts(c, lang),
    value = numeric(c);
  if (parts && value !== null)
    return {
      kind: "reading",
      value: monetarySensor(c)
        ? value.toLocaleString(locale, { maximumFractionDigits: 2 })
        : parts.value,
      unit: parts.unit,
      secondary: undefined,
    };
  return {
    kind: "text",
    value: controlState(
      c,
      c.availability === "available" ? raw : c.availability,
      lang,
    ),
    unit: "",
    secondary: undefined,
  };
}
