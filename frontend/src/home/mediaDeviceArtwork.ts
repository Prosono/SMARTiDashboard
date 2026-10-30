import type { Control } from "../types";

export type MediaArtworkKind = "tv" | "streamer" | "speaker" | "mini";

// Only infer a visual where the available name or device data gives a useful hint.
// A manually selected icon always wins over automatic detection.
export function mediaArtworkKind(control: Control): MediaArtworkKind | null {
  const icon = control.attributes.smarti_icon;
  if (icon && icon !== "auto") {
    if (icon === "tv") return "tv";
    if (icon === "homepod_mini") return "mini";
    if (icon === "speaker" || icon === "homepod") return "speaker";
    return null;
  }
  const info = [
    control.name,
    control.entity_id,
    control.device_name,
    control.integration,
    control.attributes.device_class,
    control.attributes.smarti_device_manufacturer,
    control.attributes.smarti_device_model,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase()
    .replace(/[_-]/g, " ");
  if (/home\s*pod\s*mini|nest\s*mini|echo\s*dot|smart[i ]+voice/.test(info))
    return "mini";
  if (/chromecast|google\s*cast/.test(info)) return "streamer";
  if (/\b(tv|television|televisor|fjernsyn)\b/.test(info)) return "tv";
  if (/home\s*pod|sonos|speaker|høyttaler|hoyttaler|airplay/.test(info))
    return "speaker";
  return null;
}

export function mediaDeviceArtwork(control: Control): string | null {
  const kind = mediaArtworkKind(control);
  return kind
    ? new URL(`home/media-devices/${kind}.webp`, document.baseURI).href
    : null;
}
