import {
  createContext,
  useContext,
  type ElementType,
  type ReactNode,
} from "react";
import {
  Activity,
  Battery,
  Blinds,
  CalendarDays,
  Camera,
  ChartNoAxesCombined,
  Fan,
  House,
  Lightbulb,
  LockKeyhole,
  Music2,
  Plug,
  ShieldCheck,
  Sofa,
  Sparkles,
  Thermometer,
  Users,
  Zap,
  Droplets,
  Clock3,
  Sun,
  Moon,
} from "lucide-react";
import type { CardConfig } from "./homeGridModel";
import { equipmentImageChoices } from "./equipmentAssets";

export const CardPresentation = createContext<Partial<CardConfig>>({});
export const cardIcons = [
  { id: "auto", Icon: Sparkles, nb: "Automatisk", en: "Automatic" },
  { id: "light", Icon: Lightbulb, nb: "Lys", en: "Light" },
  { id: "energy", Icon: Zap, nb: "Energi", en: "Energy" },
  { id: "temperature", Icon: Thermometer, nb: "Temperatur", en: "Temperature" },
  { id: "humidity", Icon: Droplets, nb: "Luftfuktighet", en: "Humidity" },
  { id: "security", Icon: ShieldCheck, nb: "Sikkerhet", en: "Security" },
  { id: "lock", Icon: LockKeyhole, nb: "Lås", en: "Lock" },
  { id: "camera", Icon: Camera, nb: "Kamera", en: "Camera" },
  { id: "media", Icon: Music2, nb: "Media", en: "Media" },
  { id: "plug", Icon: Plug, nb: "Stikkontakt", en: "Socket" },
  { id: "blinds", Icon: Blinds, nb: "Solskjerming", en: "Shades" },
  { id: "home", Icon: House, nb: "Hjem", en: "Home" },
  { id: "room", Icon: Sofa, nb: "Rom", en: "Room" },
  { id: "calendar", Icon: CalendarDays, nb: "Kalender", en: "Calendar" },
  { id: "people", Icon: Users, nb: "Personer", en: "People" },
  { id: "routine", Icon: Sparkles, nb: "Rutine", en: "Routine" },
  { id: "graph", Icon: ChartNoAxesCombined, nb: "Graf", en: "Graph" },
  { id: "battery", Icon: Battery, nb: "Batteri", en: "Battery" },
  { id: "fan", Icon: Fan, nb: "Vifte", en: "Fan" },
  { id: "sensor", Icon: Activity, nb: "Sensor", en: "Sensor" },
  { id: "clock", Icon: Clock3, nb: "Klokke", en: "Clock" },
  { id: "sun", Icon: Sun, nb: "Sol", en: "Sun" },
  { id: "moon", Icon: Moon, nb: "Måne", en: "Moon" },
];
export const cardImages = [
  { id: "auto", nb: "Automatisk", en: "Automatic", path: null },
  { id: "none", nb: "Uten bilde", en: "No image", path: null },
  {
    id: "living",
    nb: "Stue",
    en: "Living room",
    path: "home/home-living.webp",
  },
  {
    id: "kitchen",
    nb: "Kjøkken",
    en: "Kitchen",
    path: "home/home-kitchen.webp",
  },
  {
    id: "bedroom",
    nb: "Soverom",
    en: "Bedroom",
    path: "home/home-bedroom.webp",
  },
  {
    id: "outdoor",
    nb: "Utendørs",
    en: "Outdoors",
    path: "home/home-outdoor.webp",
  },
  { id: "office", nb: "Kontor", en: "Office", path: "home/home-office.webp" },
  {
    id: "pendant",
    nb: "Pendel",
    en: "Pendant",
    path: "home/equipment/pendant.webp",
  },
  {
    id: "plug",
    nb: "Smartkontakt",
    en: "Smart socket",
    path: "home/equipment/plug.webp",
  },
  {
    id: "lock",
    nb: "Dørlås",
    en: "Door lock",
    path: "home/equipment/lock.webp",
  },
  {
    id: "contact",
    nb: "Dørsensor",
    en: "Door sensor",
    path: "home/equipment/contact.webp",
  },
  ...equipmentImageChoices,
];
export const cardImageURL = (image: string) => {
  const path = cardImages.find((option) => option.id === image)?.path;
  return path ? new URL(path, document.baseURI).href : undefined;
};
export const photoImages = new Set([
  "living",
  "kitchen",
  "bedroom",
  "outdoor",
  "office",
]);

export function CardIcon({
  fallback: Fallback,
  optional = false,
  ...props
}: {
  fallback: ElementType;
  optional?: boolean;
  size?: number;
  className?: string;
  strokeWidth?: number;
  "aria-hidden"?: boolean;
}) {
  const { icon } = useContext(CardPresentation);
  if (optional && (!icon || icon === "auto")) return null;
  const Icon =
    cardIcons.find((option) => option.id === icon && icon !== "auto")?.Icon ||
    Fallback;
  return <Icon {...props} />;
}
export function CardTitle({ children }: { children: ReactNode }) {
  return <>{useContext(CardPresentation).title || children}</>;
}
