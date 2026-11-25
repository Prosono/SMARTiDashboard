import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("integrations and apps share one responsive destination, with apps only in advanced mode", async ({
  page,
}, info) => {
  const mobile = info.project.name === "mobile";
  let mode = "advanced",
    appReads = 0;
  const ingressPath = "/api/hassio_ingress/app-test/panel/";
  let panelLoads = 0;
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
  await page.route("**/api/manage/marketplace", (route) =>
    route.fulfill({
      json: [
        {
          full_name: "vendor/air-sensors",
          name: "Air Sensors",
          description: "Inneklima",
          topics: ["co2"],
          installed: true,
          installed_version: "1.2",
        },
        {
          full_name: "vendor/solar-monitor",
          name: "Solar Monitor",
          description: "Solcelleproduksjon",
          installed: false,
        },
      ],
    }),
  );
  await page.route("**/api/manage/apps/core_mqtt/interface", (route) =>
    route.fulfill({
      json: {
        kind: "ingress",
        state: "started",
        address: null,
        ingress_path: ingressPath,
      },
    }),
  );
  await page.route(`**${ingressPath}`, (route) => {
    panelLoads++;
    return route.fulfill({
      contentType: "text/html",
      body: `<h1>MQTT test panel</h1><p>Connection ${panelLoads}</p><button onclick="this.textContent='Connected'">Connect</button>`,
    });
  });
  await page.route("**/app/core_mqtt", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Home Assistant app panel</h1>",
    }),
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
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Utvidelser",
  );
  const integrationTab = page.getByRole("tab", {
    name: "Integrasjoner",
    exact: true,
  });
  const appsTab = page.getByRole("tab", { name: "Apper", exact: true });
  const marketplaceTab = page.getByRole("tab", {
    name: "Markedsplass",
    exact: true,
  });
  await expect(integrationTab).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".integration-card")).toContainText("Philips Hue");
  if (mobile) {
    const search = page.getByRole("textbox", { name: "Søk i integrasjoner" });
    await page
      .getByRole("button", { name: "Søk i integrasjoner", exact: true })
      .click();
    await expect(search).toBeFocused();
    await search.fill("MQTT");
    await expect(page.locator(".integration-card")).toHaveCount(0);
    await search.clear();
    await expect(page.locator(".integration-card")).toHaveCount(1);
  }
  // The advanced administrator menu checks the shared inventory for updates.
  await expect.poll(() => appReads).toBeGreaterThan(0);
  await integrationTab.focus();
  await integrationTab.press("ArrowRight");
  await expect(marketplaceTab).toBeFocused();
  await expect(marketplaceTab).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("link", { name: "Air Sensors på GitHub" }),
  ).toHaveAttribute("href", "https://github.com/vendor/air-sensors");
  const search = page.getByRole("searchbox", { name: "Søk i markedsplassen" });
  if (mobile) {
    await page
      .getByRole("button", { name: "Søk i markedsplassen", exact: true })
      .click();
    await expect(search).toBeFocused();
  }
  await search.fill("co2 inneklima");
  await expect(
    page.getByRole("link", { name: "Air Sensors på GitHub" }),
  ).toContainText("Installert · 1.2");
  await expect(
    page.getByRole("link", { name: "Solar Monitor på GitHub" }),
  ).toHaveCount(0);
  await search.fill("ingen-kamp");
  await expect(page.getByText("Ingen treff.", { exact: false })).toBeVisible();
  await search.clear();
  await page.screenshot({
    path: `/tmp/smarti-marketplace-${info.project.name}.png`,
    animations: "disabled",
  });
  await marketplaceTab.focus();
  await marketplaceTab.press("End");
  await expect(appsTab).toBeFocused();
  await expect(appsTab).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".app-card")).toContainText("MQTT broker");
  if (mobile) {
    const appSearch = page.getByRole("textbox", { name: "Søk etter apper" });
    await page
      .getByRole("button", { name: "Søk etter apper", exact: true })
      .click();
    await expect(appSearch).toBeFocused();
    await appSearch.fill("Philips");
    await expect(page.locator(".app-card")).toHaveCount(0);
    await appSearch.clear();
    await expect(page.locator(".app-card")).toHaveCount(1);
  }
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Utvidelser",
  );
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
  // The test server is standalone; keep its API root while representing an HA ingress page.
  await page.evaluate(() => {
    const base = document.createElement("base");
    base.href = window.location.origin + "/";
    document.head.prepend(base);
    history.replaceState(null, "", "/api/hassio_ingress/test/");
  });
  await page.setViewportSize(
    mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  );
  const card = page.locator(".app-card").filter({ hasText: "MQTT broker" });
  await card.click();
  await page.getByRole("button", { name: "Åpne appgrensesnitt" }).click();
  const viewer = page.getByRole("region", { name: "MQTT broker" });
  await expect(
    viewer.getByRole("heading", { name: "MQTT broker" }),
  ).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(nav).toBeVisible();
  await expect(appsTab).toHaveAttribute("aria-selected", "true");
  await expect(viewer.locator("iframe")).toHaveAttribute("src", ingressPath);
  const frame = viewer.frameLocator("iframe");
  await frame.getByRole("button", { name: "Connect" }).click();
  await expect(frame.getByRole("button", { name: "Connected" })).toBeVisible();
  const size = await viewer.locator("iframe").boundingBox();
  expect(size?.width).toBeGreaterThan(mobile ? 350 : 1000);
  expect(size?.height).toBeGreaterThan(500);
  await page.screenshot({
    path: `/tmp/smarti-inline-app-${info.project.name}.png`,
    animations: "disabled",
  });
  await viewer.getByRole("button", { name: "Last inn på nytt" }).click();
  await expect(frame.getByText("Connection 2")).toBeVisible();
  await viewer.getByRole("button", { name: "Vis via Home Assistant" }).click();
  await expect(
    frame.getByRole("heading", { name: "Home Assistant app panel" }),
  ).toBeVisible();
  await viewer.getByRole("button", { name: "Tilbake til apper" }).click();
  await expect(card).toBeFocused();
  await page.evaluate(() => history.replaceState(null, "", "/"));
  await appsTab.press("Home");
  await expect(integrationTab).toBeFocused();
  await expect(page.locator(".integration-card")).toBeVisible();
  const beforeNormal = appReads;
  await nav.getByRole("button", { name: "Innstillinger", exact: true }).click();
  await page
    .getByRole("button", { name: "Tema og utseende", exact: true })
    .click();
  await page
    .locator(".experience-picker")
    .getByRole("button", { name: /^Normal/ })
    .click();
  await nav.getByRole("button", { name: "Utvidelser", exact: true }).click();
  await expect(page.locator(".integration-card")).toBeVisible();
  await expect(appsTab).toHaveCount(0);
  await expect(marketplaceTab).toBeVisible();
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
    .getByRole("button", { name: "Tema og utseende", exact: true })
    .click();
  await page
    .locator(".experience-picker")
    .getByRole("button", { name: /^Enkel/ })
    .click();
  await expect(
    nav.getByRole("button", { name: "Utvidelser", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".apps-page")).toHaveCount(0);
});
