import {
  Layers,
  Clapperboard,
  Moon,
  Sun,
  Utensils,
  Sofa,
  Lightbulb,
  PartyPopper,
  House,
  Thermometer,
  Blinds,
  Music2,
  Plug,
  BedDouble,
} from "lucide-react";
export const collectionIcons = {
  "mdi:group": Layers,
  "mdi:movie-open": Clapperboard,
  "mdi:weather-night": Moon,
  "mdi:white-balance-sunny": Sun,
  "mdi:food": Utensils,
  "mdi:sofa": Sofa,
  "mdi:lightbulb-group": Lightbulb,
  "mdi:party-popper": PartyPopper,
  "mdi:home": House,
  "mdi:thermometer": Thermometer,
  "mdi:blinds": Blinds,
  "mdi:music": Music2,
  "mdi:power-plug": Plug,
  "mdi:bed": BedDouble,
};
const labels = [
  ["Gruppe", "Group"],
  ["Filmkveld", "Movie night"],
  ["Natt", "Night"],
  ["Morgen", "Morning"],
  ["Middag", "Dinner"],
  ["Avslapping", "Relax"],
  ["Lys", "Lights"],
  ["Feiring", "Celebration"],
  ["Hjem", "Home"],
  ["Klima", "Climate"],
  ["Persienner", "Blinds"],
  ["Musikk", "Music"],
  ["Strøm", "Power"],
  ["Soverom", "Bedroom"],
];
export const collectionIconName = (i: number, lang: string) =>
  labels[i][lang === "en" ? 1 : 0];
export const domainIcons: Record<string, typeof Layers> = {
  light: Lightbulb,
  switch: Plug,
  climate: Thermometer,
  cover: Blinds,
  media_player: Music2,
};
export function domainName(domain: string, lang: string) {
  const names: Record<string, string[]> = {
    light: ["Lys", "Lights"],
    switch: ["Brytere", "Switches"],
    climate: ["Klima", "Climate"],
    cover: ["Persienner", "Blinds"],
    media_player: ["Media", "Media"],
  };
  return names[domain]?.[lang === "en" ? 1 : 0] || domain;
}
