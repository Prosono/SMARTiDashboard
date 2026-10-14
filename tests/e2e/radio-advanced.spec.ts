import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("advanced radio panel embeds the discovered ingress UI and closes back to devices", async ({
  page,
}) => {
  await page.route("**/api/devices/zigbee2mqtt", (r) =>
    r.fulfill({ json: { status: "ready", devices: [] } }),
  );
  await page.route("**/api/manage/apps/radio-ui/zigbee2mqtt", (r) =>
    r.fulfill({
      json: [
        {
          slug: "proxy",
          name: "Zigbee2MQTT Proxy",
          available: true,
          url: "/api/hassio_ingress/radio",
          state: "started",
        },
      ],
    }),
  );
  await page.route("**/api/hassio_ingress/radio/", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: "<h1>Zigbee control panel</h1>",
    }),
  );
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Enheter", exact: true })
    .click();
  await page.evaluate(() =>
    history.replaceState(null, "", "/api/hassio_ingress/smarti/"),
  );
  await page.getByRole("button", { name: "Zigbee", exact: true }).click();
  await page
    .getByRole("button", { name: "Avansert modus", exact: true })
    .click();
  await expect(
    page
      .frameLocator('iframe[title="Zigbee2MQTT Proxy"]')
      .getByRole("heading", { name: "Zigbee control panel" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Lukk innstillinger", exact: true })
    .click();
  await expect(page.locator('iframe[title="Zigbee2MQTT Proxy"]')).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("heading", { name: "Zigbee", exact: true }),
  ).toBeVisible();
});
