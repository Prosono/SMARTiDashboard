import { expect, it } from "vitest";
import {
  availableUpdate,
  canStartUpdate,
  runUpdateBatch,
  updateCount,
  type Update,
  type InstallStatus,
  type InstallAttempt,
} from "./updateModel";

const update = (
  entity_id = "update.one",
  patch: Partial<Update> = {},
): Update => ({
  entity_id,
  name: entity_id,
  category: "extensions",
  smarti: false,
  installed_version: "1",
  latest_version: "2",
  state: "on",
  in_progress: false,
  percentage: null,
  pending: false,
  can_install: true,
  can_backup: true,
  summary: "",
  ...patch,
});
function harness(items: Update[]) {
  const state = { rows: structuredClone(items), clock: 0 };
  const controller = new AbortController();
  const writes: string[] = [],
    results: [string, InstallAttempt["status"]][] = [];
  const options = {
    signal: controller.signal,
    load: async () => structuredClone(state.rows),
    install: async (u: Update): Promise<InstallStatus> => {
      writes.push(u.entity_id);
      return "completed";
    },
    progress: () => {},
    result: (u: Update, status: InstallAttempt["status"]) => {
      results.push([u.entity_id, status]);
    },
    wait: async () => {
      state.clock += 1;
    },
    now: () => state.clock,
    timeout: 3,
  };
  return { state, controller, writes, results, options };
}
it("counts actionable updates without duplicate entities, own-app mirrors, running or blocked installations", () => {
  const rows = [
    update(),
    update(),
    update("update.system", { category: "smarti" }),
    update("update.app", { category: "apps" }),
    update("update.pending", { pending: true }),
    update("update.running", { in_progress: true }),
    update("update.denied", { can_install: false }),
    update("update.off", { state: "off" }),
  ];
  const self = {
    slug: "own",
    version: "1",
    version_latest: "2",
    update_available: true,
  };
  const app = {
    slug: "mqtt",
    version: "1",
    version_latest: "2",
    update_available: true,
    installed: true,
  };
  expect(updateCount(rows, self)).toBe(3);
  expect(
    updateCount(rows, self, [
      app,
      app,
      { ...app, slug: "own" },
      { ...app, slug: "new", installed: false },
    ]),
  ).toBe(4);
  expect(updateCount([], { ...self, update_available: false }, [])).toBe(0);
  expect(availableUpdate(update("x", { installed_version: "2" }))).toBe(false);
  expect(availableUpdate(update("x", { latest_version: null }))).toBe(false);
  expect(
    canStartUpdate(update(), {
      name: "x",
      version: "2",
      status: "unconfirmed",
    }),
  ).toBe(false);
  expect(
    canStartUpdate(update(), { name: "x", version: "2", status: "completed" }),
  ).toBe(false);
});
it("only installs consenting extensions once, never includes newly discovered updates", async () => {
  const first = update(),
    second = update("update.two");
  const h = harness([first, second, update("update.new")]);
  expect(
    await runUpdateBatch(
      [
        first,
        first,
        update("update.system", { category: "smarti" }),
        update("update.app", { category: "apps" }),
        second,
      ],
      h.options,
    ),
  ).toBe("done");
  expect(h.writes).toEqual([first.entity_id, second.entity_id]);
});
it("rechecks exact consented versions, eligibility and categories before each write", async () => {
  const items = [
    update(),
    update("update.two"),
    update("update.three"),
    update("update.four"),
  ];
  const h = harness(items);
  h.state.rows[0].latest_version = "3";
  h.state.rows[1].pending = true;
  h.state.rows[2].category = "smarti";
  h.state.rows.splice(3, 1);
  expect(await runUpdateBatch(items, h.options)).toBe("done");
  expect(h.writes).toEqual([]);
  expect(h.results.map(([, status]) => status)).toEqual([
    "skipped",
    "skipped",
    "skipped",
    "skipped",
  ]);
});
it("waits for observed completion after a lost reply without resending, then starts the next item", async () => {
  const items = [update(), update("update.two")],
    h = harness(items);
  h.options.install = async (u) => {
    h.writes.push(u.entity_id);
    return u.entity_id === items[0].entity_id ? "unconfirmed" : "completed";
  };
  h.options.wait = async () => {
    expect(h.writes).toEqual([items[0].entity_id]);
    h.state.clock++;
    h.state.rows[0].installed_version = "2";
  };
  expect(await runUpdateBatch(items, h.options)).toBe("done");
  expect(h.writes).toEqual(items.map((u) => u.entity_id));
  expect(h.results).toContainEqual([items[0].entity_id, "completed"]);
});
it("stops the remaining queue on rejection, unavailable status, read failure or timeout", async () => {
  for (const mode of ["failed", "timeout", "read-error", "unknown"]) {
    const items = [update(), update("update.two")],
      h = harness(items);
    h.options.install = async (u) => {
      h.writes.push(u.entity_id);
      return mode === "failed" ? "failed" : "accepted";
    };
    if (mode === "read-error")
      h.options.wait = async () => {
        throw Error("disconnected");
      };
    if (mode === "unknown")
      h.options.wait = async () => {
        h.state.clock++;
        h.state.rows[0].installed_version = "2";
        h.state.rows[0].state = "unavailable";
      };
    expect(await runUpdateBatch(items, h.options)).toBe(
      mode === "failed" ? "failed" : "unconfirmed",
    );
    expect(h.writes).toEqual([items[0].entity_id]);
  }
});
it("does not start remaining items when stopped during a request, wait or fresh read", async () => {
  for (const phase of ["install", "wait", "load"]) {
    const items = [update(), update("update.two")],
      h = harness(items);
    h.options.install = async (u) => {
      h.writes.push(u.entity_id);
      if (phase === "install") h.controller.abort();
      return "accepted";
    };
    if (phase === "wait")
      h.options.wait = async () => {
        h.controller.abort();
      };
    if (phase === "load")
      h.options.load = async () => {
        h.controller.abort();
        return h.state.rows;
      };
    expect(await runUpdateBatch(items, h.options)).toBe("stopped");
    expect(h.writes).toHaveLength(phase === "load" ? 0 : 1);
  }
});
