import { createContext } from "react";

// Hidden/inert canvas previews must not compete with the open card's live feed.
export const CardLivePreview = createContext(true);
