import type { Home } from "./types";
const features = [
  "lights",
  "climate",
  "media",
  "security",
  "cameras",
  "energy",
  "people",
  "calendar",
  "other",
  "scenes",
];
const controls = ["lights", "climate", "media", "security", "other", "scenes"];
export const canView = (home: Home, feature: string) =>
  !home.permissions || home.permissions.includes(feature + ".view");
export const allViews = (home: Home) => features.every((f) => canView(home, f));
export const allControls = (home: Home) =>
  allViews(home) &&
  (!home.permissions ||
    controls.every((f) => home.permissions!.includes(f + ".control")));
