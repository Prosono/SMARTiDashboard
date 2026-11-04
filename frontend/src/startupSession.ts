import { api } from "./api";
import type { Session } from "./types";

export class HomeLaunchError extends Error {}

/** Capture once per document, before React effects or any session requests run. */
export function prepareStartupSession(
  location: Pick<Location, "pathname" | "hash"> = window.location,
  history: Pick<History, "replaceState"> = window.history,
) {
  const launch = location.pathname.endsWith("/_account");
  let ticket = launch ? location.hash.slice(1) : "";
  if (launch) {
    // A launch ticket must never survive in the address, history or asset URLs.
    history.replaceState(
      null,
      "",
      location.pathname.slice(0, -"_account".length),
    );
  }
  let redemption: Promise<unknown> | undefined;
  return async () => {
    if (launch) {
      if (!redemption) {
        const token = ticket;
        ticket = "";
        // One-time redemption is shared by StrictMode effects and session retries.
        // A failed/ambiguous redemption requires a fresh link, never a replay.
        redemption = token
          ? api(
              "customer-access/redeem",
              "POST",
              { token },
              AbortSignal.timeout(15000),
            )
          : Promise.reject(new HomeLaunchError());
      }
      try {
        await redemption;
      } catch {
        throw new HomeLaunchError();
      }
    }
    return api<Session>("session");
  };
}
