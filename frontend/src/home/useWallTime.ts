import { useSyncExternalStore } from "react";

// One aligned timer for all visible clock cards; hidden pages stop ticking entirely.
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
const second = () => Math.floor(Date.now() / 1000) * 1000;
const minute = () => Math.floor(Date.now() / 60000) * 60000;
function tick() {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  for (const listener of listeners) listener();
  if (listeners.size && !document.hidden)
    timer = setTimeout(tick, 1008 - (Date.now() % 1000));
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    document.addEventListener("visibilitychange", tick);
    tick();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      document.removeEventListener("visibilitychange", tick);
    }
  };
}
export const useWallTime = (seconds = false) =>
  useSyncExternalStore(
    subscribe,
    seconds ? second : minute,
    seconds ? second : minute,
  );
