import { test, expect } from "../../frontend/node_modules/@playwright/test";
test.use({ storageState: { cookies: [], origins: [] } });

test("discovered devices have readable names and a separate setup row on phones", async ({
  page,
}, info) => {
  const devices = [
    {
      id: "gateway",
      domain: "unifi",
      name: "Cloud-Gateway-Ultra",
      source: "zeroconf",
    },
    {
      id: "long",
      domain: "unifi",
      name: "AReallyLongUnbrokenDiscoveredDeviceNameWithSeveralComponents",
      source: "usb",
    },
  ];
  let claims = 0;
  await page.route("**/api/home/experience", (r) =>
    r.fulfill({ json: { mode: "advanced" } }),
  );
  await page.route("**/api/manage/integration-setup/**", (r) => {
    const url = r.request().url();
    if (url.endsWith("/discoveries")) return r.fulfill({ json: devices });
    if (url.endsWith("/attention") || url.includes("/catalog"))
      return r.fulfill({ json: [] });
    if (url.endsWith("/claim")) claims++;
    return r.fulfill({
      json: {
        type: "form",
        flow_id: "discovered",
        domain: "unifi",
        step_id: "user",
        translations: {},
        data_schema: [],
        errors: {},
      },
    });
  });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Hovedmeny" })
    .getByRole("button", { name: "Enheter", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "Oppdagede enheter" });
  for (const width of [320, 390, 430, 600, 834, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      for (const article of await panel.locator("article").all()) {
        const layout = await article.evaluate((article) => {
          const title = article.querySelector("h3")!.getBoundingClientRect();
          const label = article
            .querySelector(".discovery-label")!
            .getBoundingClientRect();
          const button = article
            .querySelector("button")!
            .getBoundingClientRect();
          const box = article.getBoundingClientRect();
          return {
            titleWidth: title.width,
            labelBottom: label.bottom,
            buttonTop: button.top,
            buttonWidth: button.width,
            inside:
              button.left >= box.left &&
              button.right <= box.right &&
              title.left >= box.left &&
              title.right <= box.right,
          };
        });
        expect(layout.inside).toBe(true);
        expect(layout.titleWidth).toBeGreaterThan(width <= 600 ? 95 : 80);
        if (width <= 600) {
          expect(layout.buttonTop).toBeGreaterThanOrEqual(layout.labelBottom);
          expect(layout.buttonWidth).toBeGreaterThan(layout.titleWidth);
        }
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      if (width === 390)
        await panel.screenshot({
          path: `/private/tmp/smarti-121-discovery-${info.project.name}-${theme}.png`,
          animations: "disabled",
        });
    }
  }
  expect(claims).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await panel
    .locator("article")
    .first()
    .getByRole("button", { name: "Sett opp", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(claims).toBe(1);
});
