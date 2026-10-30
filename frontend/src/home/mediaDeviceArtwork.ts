import type { Control } from "../types";

export type MediaArtworkKind =
  | "tv"
  | "streamer"
  | "speaker"
  | "mini"
  | "phone"
  | "soundbar"
  | "projector"
  | "speaker-white"
  | "box"
  | "headphones"
  | "tablet"
  | "sonos"
  | "home-cinema";

// Only use the hints available to SMARTi; a manually chosen type takes precedence.
export function mediaArtworkKind(control: Control): MediaArtworkKind | null {
  const icon = control.attributes.smarti_icon;
  if (typeof icon === "string" && icon !== "auto") {
    const selected: Record<string, MediaArtworkKind> = {
      tv: "tv",
      homepod_mini: "mini",
      speaker: "speaker",
      homepod: "speaker",
      speaker_white: "speaker-white",
      phone: "phone",
      headphones: "headphones",
      streaming_box: "box",
      streaming_stick: "streamer",
      soundbar: "soundbar",
      projector: "projector",
    };
    return selected[icon] ?? null;
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
  if (/\b(ipad|tablet|nettbrett)\b/.test(info)) return "tablet";
  if (/home cinema|home theatre|home theater|hjemmekino|av receiver/.test(info))
    return "home-cinema";
  if (/headphones|headset|hodetelefon|airpods/.test(info)) return "headphones";
  if (/iphone|smartphone|mobiltelefon|telefon|\bphone\b/.test(info))
    return "phone";
  if (/sound\s*bar|lydplanke|sonos (arc|beam|ray)/.test(info))
    return "soundbar";
  if (/projector|projektor/.test(info)) return "projector";
  if (/home\s*pod\s*mini|nest\s*mini|echo\s*dot|smart[i ]+voice/.test(info))
    return "mini";
  if (/chromecast|google\s*cast/.test(info)) return "streamer";
  if (/apple\s*tv|nvidia\s*shield|\broku\b|set\s*top|tv\s*boks/.test(info))
    return "box";
  if (/\b(tv|television|televisor|fjernsyn)\b/.test(info)) return "tv";
  if (
    /(sonos|speaker|høyttaler|hoyttaler|home\s*pod).*(white|hvit)|(white|hvit).*(sonos|speaker|høyttaler|hoyttaler|home\s*pod)/.test(
      info,
    )
  )
    return "speaker-white";
  if (/sonos/.test(info)) return "sonos";
  if (/home\s*pod|speaker|høyttaler|hoyttaler|airplay/.test(info))
    return "speaker";
  return null;
}

export function mediaDeviceArtwork(control: Control): string | null {
  const selected = control.attributes.smarti_media_image;
  const kind =
    typeof selected === "string" && selected !== "auto"
      ? selected
      : mediaArtworkKind(control);
  return kind
    ? new URL(`home/media-devices/${kind}.webp`, document.baseURI).href
    : null;
}
