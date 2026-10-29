import type { Control } from "./types";

export const AVAILABILITY_GRACE_MS = 30_000;

// Keep the last known reading during short outages. Never invent a reading for
// a device that has not been available in this browser session.
export class AvailabilityGrace {
  private controls = new Map<string, { last: Control; lostAt?: number }>();
  private connectedOnce = false;
  private lostAt?: number;

  update(controls: Control[], disconnected: boolean, now: number) {
    if (!disconnected) {
      this.connectedOnce = true;
      this.lostAt = undefined;
    } else {
      this.lostAt ??= now;
    }
    const offline =
      disconnected &&
      (!this.connectedOnce || now - this.lostAt! >= AVAILABILITY_GRACE_MS);
    const ids = new Set(controls.map((c) => c.id));
    for (const id of this.controls.keys())
      if (!ids.has(id)) this.controls.delete(id);
    let pending = disconnected && !offline;
    const displayed = controls.map((c) => {
      const previous = this.controls.get(c.id);
      if (c.availability === "available") {
        this.controls.set(c.id, { last: c });
        return c;
      }
      if (!previous) return c;
      previous.lostAt ??= now;
      if (now - previous.lostAt >= AVAILABILITY_GRACE_MS) return c;
      pending = true;
      return {
        ...c,
        state: previous.last.state,
        attributes: previous.last.attributes,
        availability: previous.last.availability,
      };
    });
    return { controls: displayed, offline, pending };
  }
}
