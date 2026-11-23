/// <reference types="vite/client" />

export type EnergySceneDesign = "classic" | "harmoni";

// A rebuild with the classic design restores the previous scene and its layout.
export const energySceneDesign: EnergySceneDesign =
  import.meta.env.VITE_ENERGY_SCENE_DESIGN === "classic"
    ? "classic"
    : "harmoni";
