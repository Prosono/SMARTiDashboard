import {
  AudioLines,
  Tv,
  Speaker,
  Radio,
  Projector,
  RectangleEllipsis,
  Smartphone,
  Headphones,
  MonitorPlay,
  Usb,
} from "lucide-react";
import type { Control } from "./types";
function HomePod({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <ellipse cx="24" cy="10" rx="13" ry="5" />
      <path d="M11 10v25c0 8 26 8 26 0V10M16 19v15m6-14v16m6-16v16m5-17v15" />
      <path d="M21 10h6m-3-2v4" />
    </svg>
  );
}
function HomePodMini({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <ellipse cx="24" cy="12" rx="10" ry="4" />
      <path d="M14 11C3 18 7 37 18 39h12c11-2 15-21 4-28M15 20v10m6-11v15m6-15v15m6-14v10" />
      <path d="M21 12h6m-3-2v4" />
    </svg>
  );
}
export const mediaIcons = [
  { id: "auto", nb: "Standard", en: "Default", Icon: AudioLines },
  { id: "tv", nb: "TV", en: "TV", Icon: Tv },
  { id: "speaker", nb: "Høyttaler", en: "Speaker", Icon: Speaker },
  {
    id: "speaker_white",
    nb: "Hvit høyttaler",
    en: "White speaker",
    Icon: Speaker,
  },
  { id: "phone", nb: "Telefon", en: "Phone", Icon: Smartphone },
  { id: "headphones", nb: "Hodetelefoner", en: "Headphones", Icon: Headphones },
  {
    id: "streaming_box",
    nb: "Medieboks",
    en: "Streaming box",
    Icon: MonitorPlay,
  },
  {
    id: "streaming_stick",
    nb: "Strømmeenhet",
    en: "Streaming stick",
    Icon: Usb,
  },
  { id: "homepod", nb: "Apple HomePod", en: "Apple HomePod", Icon: HomePod },
  {
    id: "homepod_mini",
    nb: "HomePod mini",
    en: "HomePod mini",
    Icon: HomePodMini,
  },
  { id: "soundbar", nb: "Lydplanke", en: "Soundbar", Icon: RectangleEllipsis },
  { id: "radio", nb: "Radio", en: "Radio", Icon: Radio },
  { id: "projector", nb: "Projektor", en: "Projector", Icon: Projector },
];
export function mediaIcon(c: Control) {
  const custom = mediaIcons.find(
    (i) => i.id === c.attributes.smarti_icon && i.id !== "auto",
  );
  return (
    custom?.Icon ||
    (c.attributes.device_class === "tv"
      ? Tv
      : c.attributes.device_class === "projector"
        ? Projector
        : Speaker)
  );
}
