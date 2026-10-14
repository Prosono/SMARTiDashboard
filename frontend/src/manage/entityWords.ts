import type { Home } from "../types";
import { controlState } from "../controlState";
export function entityState(
  id: string,
  state: unknown,
  home: Home,
  lang: string,
): string {
  return controlState(
    home.controls.find((c) => c.entity_id === id),
    state,
    lang,
  );
}
