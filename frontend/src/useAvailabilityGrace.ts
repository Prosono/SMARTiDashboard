import { useEffect, useRef, useState } from "react";
import type { Home } from "./types";
import { AvailabilityGrace } from "./availabilityGrace";

export function useAvailabilityGrace(
  home: Home | undefined,
  disconnected: boolean,
) {
  const grace = useRef(new AvailabilityGrace());
  const [, tick] = useState(0);
  const display = grace.current.update(
    home?.controls || [],
    disconnected,
    performance.now(),
  );
  // Only tick during the grace period; normal dashboard updates stay event-driven.
  useEffect(() => {
    if (!display.pending) return;
    const timer = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [display.pending]);
  return {
    offline: display.offline,
    home: home
      ? { ...home, connected: !display.offline, controls: display.controls }
      : undefined,
  };
}
