import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("integrations and apps share one responsive destination, with apps only in advanced mode", async ({
  page,
}, info) => {
  let mode = "advanced",
    appReads = 0;
  await page.route("**/api/home/experience", (route) => {
    if (route.request().method() === "PUT")
      mode = route.request().postDataJSON().mode;
    return route.fulfill({ json: { mode } });
  });
  await page.route("**/api/manage/integrations", (route) =>
    route.fulfill({
      json: [
        {
          entry_id: "fixture",
          title: "Philips Hue",
          domain: "hue",
          state: "loaded",
          disabled_by: null,
          devices: 2,
          device_items: [],
        },
      ],
    }),
  );
  await page.route("**/api/manage/apps", (route) => {
    appReads++;
    return route.fulfill({
      json: [
        {
          slug: "core_mqtt",
          name: "MQTT broker",
          description: "Tilkobling mellom enhetene.",
          installed: true,
          version: "1",
          version_latest: "2",
          state: "started",
          update_available: true,
          available: true,
        },
      ],
    });
  });
  await page.route("**/api/manage/apps/operations", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/manage/apps/repositories", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  const nav = page.getByRole("navigation", { name: "Hovedmeny", exact: true });
  await expect(
    nav.getByRole("button", { name: "Apper", exact: true }),
  ).toHaveCount(0);
  await nav.getByRole("button", { name: "Utvidelser", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Utvidelser");
  const integrationTab = page.getByRole("tab", {
    name: "Integrasjoner",
    exact: true,
  });
  const appsTab = page.getByRole("tab", { name: "Apper", exact: true });
  await expect(integrationTab).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".integration-card")).toContainText("Philips Hue");
  expect(appReads).toBe(0);
  await integrationTab.focus();
  await integrationTab.press("End");
  await expect(appsTab).toBeFocused();
  await expect(appsTab).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".app-card")).toContainText("MQTT broker");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Utvidelser");
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    for (const width of [320, 390, 834, 1440]) {
      await page.setViewportSize({ width, height: 950 });
      expect(
        await page
          .locator("body")
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      if (width === 390 || width === 1440)
        await page.screenshot({
          path: `/private/tmp/smarti-116-apps-${theme}-${width}-${info.project.name}.png`,
          fullPage: true,
          animations: "disabled",
        });
    }
  }
  await page.getByRole("button", { name: "Appkilder", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Lukk innstillinger", exact: true })
    .click();
  await appsTab.press("Home");
  await expect(integrationTab).toBeFocused();
  await expect(page.locator(".integration-card")).toBeVisible();
  const beforeNormal = appReads;
  await nav.getByRole("button", { name: "Innstillinger", exact: true }).click();
  await page
    .locator(".experience-picker")
    .getByRole("button", { name: /^Normal/ })
    .click();
  await nav.getByRole("button", { name: "Utvidelser", exact: true }).click();
  await expect(page.locator(".integration-card")).toBeVisible();
  await expect(appsTab).toHaveCount(0);
  await expect(page.locator(".apps-page")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Appkilder", exact: true }),
  ).toHaveCount(0);
  expect(appReads).toBe(beforeNormal);
  await page.reload();
  await nav.getByRole("button", { name: "Utvidelser", exact: true }).click();
  await expect(appsTab).toHaveCount(0);
  await expect(page.locator(".integration-card")).toBeVisible();
  expect(appReads).toBe(beforeNormal);
  await nav.getByRole("button", { name: "Innstillinger", exact: true }).click();
  await page
    .locator(".experience-picker")
    .getByRole("button", { name: /^Enkel/ })
    .click();
  await expect(
    nav.getByRole("button", { name: "Utvidelser", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".apps-page")).toHaveCount(0);
});
