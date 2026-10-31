import { createContext, type MutableRefObject } from "react";

export const HomeGridGuard = createContext<MutableRefObject<
  (() => boolean) | null
> | null>(null);
