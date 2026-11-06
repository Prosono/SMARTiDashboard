import {
  test,
  expect,
  type Page,
} from "../../frontend/node_modules/@playwright/test";

async function fixture(page: Page, initialMode = "normal") {
  let mode = initialMode;
  let appReads = 0;
  const writes: Record<string, unknown>[] = [];
  const app = {
    slug: "core_mqtt",
    name: "MQTT broker",
    description: "Tilkobling mellom enhetene.",
    installed: true,
    version: "1",
    version_latest: "2",
    update_available: true,
    state: "started",
    available: true,
  };
  const state = { operations: [] as Record<string, unknown>[] };
  await page.route("**/api/home/experience", (route) => {
    if (route.request().method() === "PUT")
      mode = route.request().postDataJSON().mode;
    return route.fulfill({ json: { mode } });
  });
  await page.route("**/api/manage/apps/self-update/check", (route) =>
    route.fulfill({
      json: {
        slug: "abc_smarti",
        version: "1.36.117",
        version_latest: "1.36.118",
        update_available: true,
      },
    }),
  );
  const update = (id: string, name: string, category: string) => ({
    entity_id: id,
    name,
    category,
    smarti: true,
    installed_version: "1",
    latest_version: "2",
    state: "on",
    can_install: true,
    can_backup: true,
    in_progress: false,
  });
  await page.route("**/api/manage/updates", (route) =>
    route.fulfill({
      json: [
        update("update.core", "SMARTi Core", "smarti"),
        update("update.voice", "SMARTi Voice firmware", "extensions"),
        update("update.own", "SMARTi duplikat", "apps"),
        update("update.mqtt", "Generisk MQTT-oppdatering", "apps"),
      ],
    }),
  );
  await page.route("**/api/manage/apps", (route) => {
    appReads++;
    return route.fulfill({
      json: [
        app,
        {
          ...app,
          slug: "core_current",
          name: "Allerede oppdatert",
          version: "2",
          update_available: false,
        },
      ],
    });
  });
  await page.route("**/api/manage/apps/operations", (route) =>
    route.fulfill({ json: state.operations }),
  );
  await page.route("**/api/manage/apps/core_mqtt/actions", (route) => {
    const body = route.request().postDataJSON();
    writes.push(body);
    app.version = "2";
    app.update_available = false;
    state.operations = [
      {
        request_id: body.request_id,
        slug: app.slug,
        name: app.name,
        action: "update",
        status: "completed",
        created: Date.now() / 1000,
      },
      {
        request_id: "own",
        slug: "abc_smarti",
        name: "SMARTi duplikat",
        action: "update",
        status: "completed",
        created: Date.now() / 1000,
      },
      {
        request_id: "restart",
        slug: app.slug,
        name: "Omstart",
        action: "restart",
        status: "completed",
        created: Date.now() / 1000,
      },
    ];
    return route.fulfill({ json: { status: "completed" } });
  });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  const nav = page.getByRole("navigation", { name: "Hovedmeny", exact: true });
  const open = () =>
    nav.getByRole("button", { name: "Oppdateringer", exact: true }).click();
  const settings = () =>
    nav.getByRole("button", { name: "Innstillinger", exact: true }).click();
  return { nav, open, settings, writes, appReads: () => appReads };
}

test("updates have dedicated SMARTi, extension and advanced-only app tabs and are absent from settings", async ({
  page,
}, info) => {
  const data = await fixture(page);
  await data.open();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Oppdateringer",
  );
  const smarti = page.getByRole("tabpanel", { name: "SMARTi", exact: true });
  await expect(
    smarti.getByRole("button", { name: "Oppdater SMARTi", exact: true }),
  ).toBeVisible();
  await expect(smarti).toContainText("SMARTi Core");
  await expect(smarti).not.toContainText("SMARTi duplikat");
  await expect(smarti).not.toContainText("SMARTi Voice firmware");
  await expect(
    page.getByRole("tab", { name: "Apper", exact: true }),
  ).toHaveCount(0);
  expect(data.appReads()).toBe(0);
  await page.getByRole("tab", { name: "Utvidelser", exact: true }).click();
  const extensions = page.getByRole("tabpanel", {
    name: "Utvidelser",
    exact: true,
  });
  await expect(extensions).toContainText("SMARTi Voice firmware");
  await expect(extensions).not.toContainText("SMARTi Core");
  await expect(extensions).not.toContainText("MQTT");
  await data.settings();
  await expect(
    page.getByRole("navigation", { name: "Innstillingskategorier" }),
  ).not.toContainText("oppdateringer");
  await expect(
    page.getByRole("heading", { name: "SMARTi-appen", exact: true }),
  ).toHaveCount(0);
  await page
    .locator(".experience-picker")
    .getByRole("button", { name: /^Enkel/ })
    .click();
  await data.open();
  await expect(
    page.getByRole("tab", { name: "SMARTi", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Apper", exact: true }),
  ).toHaveCount(0);
  await expect(
    smarti.getByRole("button", { name: "Oppdater SMARTi", exact: true }),
  ).toBeVisible();
  expect(data.appReads()).toBe(0);
  await data.settings();
  await page
    .locator(".experience-picker")
    .getByRole("button", { name: /^Avansert/ })
    .click();
  await data.open();
  const appsTab = page.getByRole("tab", { name: "Apper", exact: true });
  await expect(appsTab).toBeVisible();
  expect(data.appReads()).toBe(0);
  await page.getByRole("tab", { name: "SMARTi", exact: true }).focus();
  await page.keyboard.press("End");
  await expect(appsTab).toBeFocused();
  const apps = page.getByRole("tabpanel", { name: "Apper", exact: true });
  await expect(apps.locator(".app-card")).toHaveCount(1);
  await expect(apps).toContainText("MQTT broker");
  await expect(apps).not.toContainText("Allerede oppdatert");
  await expect(apps).not.toContainText("SMARTi duplikat");
  await expect(
    apps.getByRole("button", { name: "Appbibliotek", exact: true }),
  ).toHaveCount(0);
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    for (const width of [320, 390, 834, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page
          .locator("body")
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      for (const tab of await page
        .getByRole("tablist", { name: "Oppdateringstyper" })
        .getByRole("tab")
        .all()) {
        const bounds = await tab.boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      }
      if ([390, 1440].includes(width))
        await page.screenshot({
          path: `/private/tmp/smarti-118-tabs-${theme}-${width}-${info.project.name}.png`,
          fullPage: true,
          animations: "disabled",
        });
    }
  }
  expect(data.writes).toHaveLength(0);
});

test("app updates use the protected app action once after confirmation and show completion without unrelated activity", async ({
  page,
}) => {
  const data = await fixture(page, "advanced");
  await data.open();
  await page.getByRole("tab", { name: "Apper", exact: true }).click();
  const apps = page.getByRole("tabpanel", { name: "Apper", exact: true });
  await apps.locator(".app-card").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("checkbox")).toBeChecked();
  expect(data.writes).toHaveLength(0);
  await dialog.getByRole("checkbox").uncheck();
  await dialog
    .getByRole("button", { name: "Bekreft oppdater", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(apps.locator(".app-activity")).toContainText("Fullført");
  await expect(apps.locator(".app-activity")).not.toContainText(
    "SMARTi duplikat",
  );
  await expect(apps.locator(".app-activity")).not.toContainText("Omstart");
  await expect(apps.locator(".app-card")).toHaveCount(0);
  expect(data.writes).toEqual([
    {
      action: "update",
      confirm_slug: "core_mqtt",
      backup: false,
      request_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    },
  ]);
  await page.getByRole("tab", { name: "SMARTi", exact: true }).click();
  await page.getByRole("tab", { name: "Apper", exact: true }).click();
  await expect(apps.locator(".app-activity")).toContainText("Fullført");
  expect(data.writes).toHaveLength(1);
});
