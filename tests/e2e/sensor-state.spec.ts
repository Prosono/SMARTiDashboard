import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("Zigbee contact detail displays semantic open/closed and unknown states", async ({
  page,
}) => {
  let state = "off";
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { name: "tester", role: "admin", csrf: "fixture" } }),
  );
  await page.route("**/api/home", (r) =>
    r.fulfill({
      json: {
        home_name: "Test",
        mode: "live",
        connected: true,
        areas: [],
        devices: [],
        controls: [],
        favorites: [],
        revision: 1,
      },
    }),
  );
  await page.route("**/api/events", (r) =>
    r.fulfill({
      contentType: "text/event-stream",
      body: 'data: {"revision":1}\n\n',
    }),
  );
  await page.route("**/api/devices/zigbee2mqtt", (r) =>
    r.fulfill({
      json: {
        status: "ready",
        devices: [{ id: "door", name: "Dørsensor", status: "online" }],
      },
    }),
  );
  await page.route("**/api/devices/zigbee2mqtt/detail?*", (r) =>
    r.fulfill({
      json: {
        id: "door",
        name: "Dørsensor",
        status: "online",
        network_status: "ready",
        controls: [
          {
            id: "contact",
            entity_id: "binary_sensor.door",
            name: "Dørkontakt",
            domain: "binary_sensor",
            state,
            attributes: { device_class: "door" },
            capabilities: [],
            availability: "available",
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Enheter", exact: true })
    .click();
  await page.getByRole("button", { name: "Zigbee", exact: true }).click();
  await page.locator(".protocol-row").getByRole("button").first().click();
  const status = page.locator(".device-detail-control");
  await expect(status).toContainText("Lukket");
  state = "on";
  await expect(status).toContainText("Åpen", { timeout: 8000 });
  state = "unknown";
  await expect(status).toContainText("Ukjent", { timeout: 8000 });
  await expect(status).not.toContainText("Lukket");
});
