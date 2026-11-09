import {
  test,
  expect,
  type Page,
} from "../../frontend/node_modules/@playwright/test";
import type { Update } from "../../frontend/src/manage/updateModel";

const item = (
  entity_id: string,
  name: string,
  patch: Partial<Update> = {},
): Update => ({
  entity_id,
  name,
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
async function fixture(page: Page, mode = "normal") {
  const state = {
    mode,
    appReads: 0,
    selfAvailable: true,
    updates: [
      item("update.one", "Lamper"),
      item("update.two", "Sensorer", { can_backup: false }),
      item("update.system", "SMARTi Core", {
        category: "smarti",
        smarti: true,
      }),
      item("update.app_mirror", "MQTT speil", { category: "apps" }),
      item("update.busy", "Pågående", { in_progress: true }),
      item("update.denied", "Sperret", { can_install: false }),
    ],
  };
  const app = {
    slug: "mqtt",
    installed: true,
    version: "1",
    version_latest: "2",
    update_available: true,
  };
  const writes: { id: string; body: Record<string, unknown> }[] = [];
  await page.route("**/api/home/experience", (route) => {
    if (route.request().method() === "PUT")
      state.mode = route.request().postDataJSON().mode;
    return route.fulfill({ json: { mode: state.mode } });
  });
  for (const path of ["self-update", "self-update/check"])
    await page.route(`**/api/manage/apps/${path}`, (route) =>
      route.fulfill({
        json: {
          slug: "own_smarti",
          version: "1",
          version_latest: "2",
          update_available: state.selfAvailable,
        },
      }),
    );
  await page.route("**/api/manage/updates", (route) =>
    route.fulfill({ json: state.updates }),
  );
  await page.route("**/api/manage/apps", (route) => {
    state.appReads++;
    return route.fulfill({
      json: [
        app,
        { ...app, slug: "own_smarti" },
        { ...app, slug: "uninstalled", installed: false },
      ],
    });
  });
  await page.route("**/api/manage/updates/*/install", async (route) => {
    const id = decodeURIComponent(
      new URL(route.request().url()).pathname.split("/").at(-2)!,
    );
    writes.push({ id, body: route.request().postDataJSON() });
    const row = state.updates.find((u) => u.entity_id === id)!;
    row.installed_version = row.latest_version;
    row.state = "off";
    return route.fulfill({ json: { status: "completed" } });
  });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  const nav = page.getByRole("navigation", { name: "Hovedmeny", exact: true });
  await expect(nav).toBeVisible();
  const updates = nav.getByRole("button", {
    name: "Oppdateringer",
    exact: true,
  });
  const open = async () => {
    await updates.click();
    await page.getByRole("tab", { name: "Utvidelser", exact: true }).click();
  };
  return { state, writes, open, updates, nav, app };
}

test("update badge counts only visible categories; update all confirms exact extensions and respects backup support", async ({
  page,
}, info) => {
  const f = await fixture(page);
  await expect(f.updates.locator(".nav-discovery-count")).toHaveText("4");
  expect(f.state.appReads).toBe(0);
  await f.open();
  await page.addStyleTag({
    content:
      "*, *::before, *::after { transition: none !important; animation: none !important; }",
  });
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (value) => (document.documentElement.dataset.theme = value),
      theme,
    );
    await expect(f.updates.locator(".nav-discovery-count")).toBeVisible();
    await page.screenshot({
      path: `/private/tmp/smarti-134-menu-${theme}-${info.project.name}.png`,
    });
  }
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  if (info.project.name === "desktop") {
    await page
      .getByRole("button", { name: "Trekk sammen sidemenyen", exact: true })
      .click();
    await expect(f.updates.locator(".nav-discovery-count")).toBeVisible();
    await page.screenshot({
      path: "/private/tmp/smarti-134-menu-collapsed.png",
    });
    await page
      .getByRole("button", { name: "Utvid sidemenyen", exact: true })
      .click();
  }
  const all = page.getByRole("button", { name: "Oppdater alle", exact: true });
  await all.click();
  const dialog = page.getByRole("dialog", {
    name: "Oppdater alle utvidelsene?",
  });
  await expect(dialog.locator("li")).toHaveCount(2);
  await expect(dialog).toContainText("Lamper");
  await expect(dialog).not.toContainText("SMARTi Core");
  await expect(dialog.getByRole("checkbox")).toBeChecked();
  expect(f.writes).toEqual([]);
  await dialog.getByRole("button", { name: "Avbryt", exact: true }).click();
  await expect(all).toBeFocused();
  expect(f.writes).toEqual([]);
  await all.click();
  if (info.project.name === "mobile")
    await page.setViewportSize({ width: 320, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `/private/tmp/smarti-134-bulk-${info.project.name}.png`,
    fullPage: true,
  });
  await dialog
    .getByRole("button", { name: "Bekreft oppdatering av alle", exact: true })
    .click();
  await expect(page.locator(".update-batch-status")).toContainText(
    "Køen er ferdig behandlet",
  );
  expect(f.writes).toEqual([
    { id: "update.one", body: { version: "2", backup: true } },
    { id: "update.two", body: { version: "2", backup: false } },
  ]);
  await expect(
    page.locator(".update-install-result[data-status=completed]"),
  ).toHaveCount(2);
  await expect(f.updates.locator(".nav-discovery-count")).toHaveText("2");
  await expect(all).toBeDisabled();
  await f.nav
    .getByRole("button", { name: "Innstillinger", exact: true })
    .click();
  await page
    .locator(".experience-picker")
    .getByRole("button", { name: /^Avansert/ })
    .click();
  await expect(f.updates.locator(".nav-discovery-count")).toHaveText("3");
  expect(f.state.appReads).toBeGreaterThan(0);
  f.state.selfAvailable = false;
  f.app.update_available = false;
  f.state.updates = [];
  await page.reload();
  await expect(f.updates.locator(".nav-discovery-count")).toHaveCount(0);
});

test("bulk update waits for state after a lost reply and stopping prevents later writes", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.route("**/api/manage/updates/update.one/install", (route) => {
    f.writes.push({ id: "update.one", body: route.request().postDataJSON() });
    f.state.updates[0].pending = true;
    return route.fulfill({ status: 503, json: { detail: "lost_reply" } });
  });
  await f.open();
  await page
    .getByRole("button", { name: "Oppdater alle", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Bekreft oppdatering av alle", exact: true })
    .click();
  await expect(
    page.locator(".update-install-result[data-status=unconfirmed]"),
  ).toHaveCount(1);
  expect(f.writes.map((w) => w.id)).toEqual(["update.one"]);
  await page.getByRole("button", { name: "Stopp køen", exact: true }).click();
  await expect(page.locator(".update-batch-status")).toContainText(
    "Køen er stoppet",
  );
  await expect(
    page.getByRole("button", { name: "Stopp køen", exact: true }),
  ).toHaveCount(0);
  expect(f.writes.map((w) => w.id)).toEqual(["update.one"]);
  const row = page.locator(".system-row").filter({ hasText: "Lamper" });
  await expect(
    row.getByRole("button", { name: "Installer", exact: true }),
  ).toBeDisabled();
});

test("changed confirmation versions are skipped, and leaving the page prevents the remaining queue", async ({
  page,
}) => {
  const f = await fixture(page);
  f.state.updates.push(item("update.three", "Flere sensorer"));
  await f.open();
  await page
    .getByRole("button", { name: "Oppdater alle", exact: true })
    .click();
  await expect(page.getByRole("dialog").locator("li")).toHaveCount(3);
  f.state.updates[0].latest_version = "3";
  await page.route("**/api/manage/updates/update.two/install", (route) => {
    f.writes.push({ id: "update.two", body: route.request().postDataJSON() });
    f.state.updates[1].pending = true;
    return route.fulfill({ json: { status: "accepted" } });
  });
  await page
    .getByRole("button", { name: "Bekreft oppdatering av alle", exact: true })
    .click();
  await expect(
    page.locator(".update-install-result[data-status=skipped]"),
  ).toContainText("Lamper");
  await expect(
    page.locator(".update-install-result[data-status=accepted]"),
  ).toContainText("Sensorer");
  expect(f.writes.map((w) => w.id)).toEqual(["update.two"]);
  await f.nav.getByRole("button", { name: "Rom", exact: true }).click();
  await f.open();
  await expect(page.locator(".update-batch-status")).toHaveCount(0);
  expect(f.writes.map((w) => w.id)).toEqual(["update.two"]);
});

test("normal residents never request update inventories or see the administrator badge", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.route("**/api/session", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...(await response.json()), role: "user" } });
  });
  let adminReads = 0;
  page.on("request", (r) => {
    if (
      r.method() === "GET" &&
      /\/api\/manage\/(updates|apps)(\/self-update)?$/.test(
        new URL(r.url()).pathname,
      )
    )
      adminReads++;
  });
  await page.reload();
  await expect(
    f.nav.getByRole("button", { name: "Rom", exact: true }),
  ).toBeVisible();
  await expect(f.updates).toHaveCount(0);
  expect(adminReads).toBe(0);
});

test("bulk update waits for observed completion before dispatching the next extension", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.route("**/api/manage/updates/update.one/install", (route) => {
    f.writes.push({ id: "update.one", body: route.request().postDataJSON() });
    f.state.updates[0].in_progress = true;
    return route.fulfill({ json: { status: "accepted" } });
  });
  await f.open();
  await page
    .getByRole("button", { name: "Oppdater alle", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Bekreft oppdatering av alle", exact: true })
    .click();
  await expect(
    page.locator(".update-install-result[data-status=accepted]"),
  ).toHaveCount(1);
  expect(f.writes.map((w) => w.id)).toEqual(["update.one"]);
  Object.assign(f.state.updates[0], {
    installed_version: "2",
    state: "off",
    in_progress: false,
  });
  await expect(page.locator(".update-batch-status")).toContainText(
    "Køen er ferdig behandlet",
    { timeout: 7000 },
  );
  expect(f.writes.map((w) => w.id)).toEqual(["update.one", "update.two"]);
});

test("a completed state received before a lost installation reply still confirms single-update success", async ({
  page,
}) => {
  const f = await fixture(page);
  let release = () => {};
  const reply = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    "**/api/manage/updates/update.one/install",
    async (route) => {
      f.writes.push({ id: "update.one", body: route.request().postDataJSON() });
      Object.assign(f.state.updates[0], {
        installed_version: "2",
        state: "off",
      });
      await reply;
      await route.fulfill({ status: 503, json: { detail: "late_lost_reply" } });
    },
  );
  await f.open();
  const row = page.locator(".system-row").filter({ hasText: "Lamper" });
  await row.getByRole("button", { name: "Installer", exact: true }).click();
  await row
    .getByRole("button", { name: "Bekreft installasjon", exact: true })
    .click();
  await expect(row).toHaveCount(0, { timeout: 7000 });
  release();
  await expect(
    page.locator(".update-install-result[data-status=completed]"),
  ).toContainText("Lamper");
  expect(f.writes.map((w) => w.id)).toEqual(["update.one"]);
});
