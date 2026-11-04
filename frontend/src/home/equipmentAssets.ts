/** Local transparent product portraits. IDs are distinct from room-photo IDs. */
export const equipmentAssets = [
  { kind: "leak", nb: "Vanndetektor", en: "Water leak detector" },
  {
    kind: "motion",
    nb: "Svart PIR / bevegelsesdetektor",
    en: "Black PIR motion detector",
  },
  { kind: "movement", nb: "Bevegelse", en: "Movement" },
  { kind: "presence", nb: "Tilstedeværelse", en: "Presence" },
  { kind: "window-closed", nb: "Vindu · lukket", en: "Window · closed" },
  { kind: "window-open", nb: "Vindu · åpent", en: "Window · open" },
  { kind: "calendar", nb: "Kalender", en: "Calendar" },
  { kind: "charger", nb: "Elbillader", en: "EV charger" },
  { kind: "switch", nb: "Lysbryter", en: "Light switch" },
  { kind: "strip", nb: "LED-list", en: "LED strip" },
  { kind: "outdoor", nb: "Utelys", en: "Outdoor light" },
  { kind: "spot", nb: "Spot / downlight", en: "Spot / downlight" },
  { kind: "track", nb: "Lysskinne", en: "Track lighting" },
  { kind: "ceiling", nb: "Taklampe", en: "Ceiling lamp" },
  { kind: "smoke", nb: "Røykdetektor", en: "Smoke detector" },
  { kind: "bulb", nb: "Lyspære", en: "Light bulb" },
  { kind: "floor", nb: "Gulvlampe", en: "Floor lamp" },
  { kind: "desk", nb: "Bordlampe", en: "Desk lamp" },
] as const;
export const equipmentPortraitKinds = new Set<string>([
  "pendant",
  "plug",
  "lock",
  "contact",
  ...equipmentAssets.map((asset) => asset.kind),
]);
export const equipmentImageChoices = equipmentAssets.map(
  ({ kind, nb, en }) => ({
    id: `equipment-${kind}`,
    nb,
    en,
    path: `home/equipment/${kind}.webp`,
  }),
);
