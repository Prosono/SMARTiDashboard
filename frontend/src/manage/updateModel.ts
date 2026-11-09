export type Update = {
  category?: "smarti" | "extensions" | "apps";
  entity_id: string;
  name: string;
  smarti: boolean;
  installed_version: string | null;
  latest_version: string | null;
  state: string;
  in_progress: boolean;
  percentage: number | null;
  pending: boolean;
  can_install: boolean;
  can_backup: boolean;
  summary: string;
};
export type InstallStatus =
  "accepted" | "completed" | "unconfirmed" | "failed" | "simulated";
export type InstallAttempt = {
  name: string;
  version: string;
  status: InstallStatus | "skipped";
};
export type AppUpdate = {
  slug: string;
  installed?: boolean;
  update_available: boolean;
  version: string;
  version_latest: string;
};
export const updateCategory = (u: Update) =>
  u.category || (u.smarti ? "smarti" : "extensions");
export const availableUpdate = (u: Update) =>
  u.state === "on" &&
  u.can_install &&
  !!u.latest_version &&
  u.installed_version !== u.latest_version &&
  !u.in_progress &&
  !u.pending;
export function canStartUpdate(u: Update, attempt?: InstallAttempt) {
  return (
    availableUpdate(u) &&
    !(
      attempt &&
      (["accepted", "unconfirmed"].includes(attempt.status) ||
        (attempt.status === "completed" &&
          attempt.version === u.latest_version))
    )
  );
}
export function updateCount(
  updates: readonly Update[],
  self?: AppUpdate,
  apps: readonly AppUpdate[] = [],
) {
  const ids = new Set(
    updates
      .filter((u) => updateCategory(u) !== "apps" && availableUpdate(u))
      .map((u) => u.entity_id),
  );
  const slugs = new Set(
    apps
      .filter(
        (a) =>
          a.installed &&
          a.slug !== self?.slug &&
          a.update_available &&
          a.version_latest &&
          a.version !== a.version_latest,
      )
      .map((a) => a.slug),
  );
  return (
    ids.size +
    slugs.size +
    (self?.update_available &&
    self.version_latest &&
    self.version !== self.version_latest
      ? 1
      : 0)
  );
}
const completed = (u: Update | undefined, version: string) =>
  !!u &&
  !["unknown", "unavailable"].includes(u.state) &&
  u.installed_version === version &&
  !u.in_progress;
export type BatchResult = "done" | "stopped" | "failed" | "unconfirmed";

/** Frozen, version-specific consent; never resend an installation after a lost reply. */
export async function runUpdateBatch(
  items: readonly Update[],
  options: {
    signal: AbortSignal;
    load: () => Promise<Update[]>;
    install: (item: Update) => Promise<InstallStatus>;
    progress: (index: number, item: Update) => void;
    result: (item: Update, status: InstallAttempt["status"]) => void;
    wait: () => Promise<void>;
    now?: () => number;
    timeout?: number;
  },
): Promise<BatchResult> {
  const { signal, load, install, progress, result, wait } = options;
  const now = options.now || Date.now;
  const seen = new Set<string>();
  try {
    for (const [index, item] of items.entries()) {
      if (signal.aborted) return "stopped";
      if (
        updateCategory(item) !== "extensions" ||
        !availableUpdate(item) ||
        seen.has(item.entity_id)
      )
        continue;
      seen.add(item.entity_id);
      const current = (await load()).find(
        (u) => u.entity_id === item.entity_id,
      );
      if (signal.aborted) return "stopped";
      progress(index, item);
      if (completed(current, item.latest_version!)) {
        result(item, "completed");
        continue;
      }
      if (
        !current ||
        updateCategory(current) !== "extensions" ||
        !availableUpdate(current) ||
        current.latest_version !== item.latest_version
      ) {
        result(item, "skipped");
        continue;
      }
      let status: InstallStatus;
      try {
        status = await install(current);
      } catch {
        result(item, "unconfirmed");
        return signal.aborted ? "stopped" : "unconfirmed";
      }
      result(item, status);
      if (signal.aborted) return "stopped";
      if (status === "failed") return "failed";
      if (status === "completed" || status === "simulated") continue;
      const started = now();
      while (!signal.aborted) {
        if (now() - started >= (options.timeout ?? 10 * 60 * 1000)) {
          result(item, "unconfirmed");
          return "unconfirmed";
        }
        try {
          await wait();
          if (signal.aborted) return "stopped";
          const updated = (await load()).find(
            (u) => u.entity_id === item.entity_id,
          );
          if (completed(updated, item.latest_version!)) {
            result(item, "completed");
            break;
          }
        } catch {
          if (signal.aborted) return "stopped";
          result(item, "unconfirmed");
          return "unconfirmed";
        }
      }
    }
    return signal.aborted ? "stopped" : "done";
  } catch {
    return signal.aborted ? "stopped" : "unconfirmed";
  }
}
