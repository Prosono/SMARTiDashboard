import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("screensaver previews today's agenda, follows idle time, and saves the choices", async ({
  page,
}, info) => {
  await page.clock.install({ time: new Date("2026-11-16T12:00:00Z") });
  await page.route("**/api/home", async (route) => {
    const response = await route.fetch();
    const home = await response.json();
    await route.fulfill({
      response,
      json: {
        ...home,
        controls: [
          ...home.controls,
          {
            id: "weather.demo",
            entity_id: "weather.demo",
            name: "Testværet",
            domain: "weather",
            state: "cloudy",
            availability: "available",
            attributes: { temperature: 7.5, temperature_unit: "°C" },
            area_id: null,
            device_id: null,
            capabilities: [],
          },
        ],
      },
    });
  });
  await page.route("**/api/home/calendar", (route) =>
    route.fulfill({
      json: {
        today: "2026-11-16",
        timezone: "Europe/Oslo",
        calendars: ["calendar.demo"],
        sources: [],
      },
    }),
  );
  await page.route("**/api/home/calendar/events?start=*", (route) =>
    route.fulfill({
      json: {
        days: {
          "2026-11-16": [
            {
              start: "2026-11-16T17:00:00+01:00",
              end: "2026-11-16T18:00:00+01:00",
              summary: "Testavtale",
              all_day: false,
            },
          ],
        },
        failed: [],
      },
    }),
  );
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page
    .getByRole("button", { name: "Innstillinger", exact: true })
    .first()
    .click();
  const openSettings = page.getByRole("button", {
    name: "Skjermsparer",
    exact: true,
  });
  await expect(openSettings).toBeInViewport();
  await openSettings.click();
  const panel = page.locator(".screensaver-settings");
  const screensaver = page.getByRole("dialog", { name: "Skjermsparer" });
  await expect(panel.getByLabel("Start etter")).toHaveValue("0");
  await panel.getByRole("button", { name: "Forhåndsvis" }).click();
  await expect(screensaver).toBeVisible();
  await expect(screensaver.locator("time")).toBeVisible();
  await expect(screensaver).toContainText("16. november");
  await expect(screensaver.locator(".screensaver-weather")).toContainText(
    "Skyet",
  );
  await expect(
    screensaver.getByRole("region", { name: "Dagens kalender" }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(screensaver).toHaveCount(0);
  await expect(
    panel.getByRole("button", { name: "Forhåndsvis" }),
  ).toBeFocused();

  await panel.getByLabel("Dagens kalender", { exact: true }).check();
  await panel.getByLabel("Vær", { exact: true }).uncheck();
  await panel.getByLabel("Start etter").selectOption("1");
  await page.clock.fastForward(40_000);
  await expect(screensaver).toHaveCount(0);
  await panel.getByLabel("Start etter").focus();
  await page.keyboard.press("Tab");
  await page.clock.fastForward(40_000);
  await expect(screensaver).toHaveCount(0);
  await page.clock.fastForward(25_000);
  await expect(screensaver).toBeVisible();
  await expect(
    screensaver.getByRole("region", { name: "Dagens kalender" }),
  ).toContainText("Testavtale");
  await expect(screensaver.locator(".screensaver-weather")).toHaveCount(0);
  await screensaver.locator("time").click();
  await expect(screensaver).toHaveCount(0);

  await page.reload();
  const saved = await page.evaluate(() => [
    localStorage.getItem("smarti-screensaver-delay"),
    localStorage.getItem("smarti-screensaver-weather"),
    localStorage.getItem("smarti-screensaver-calendar"),
  ]);
  expect(saved).toEqual(["1", "off", "on"]);
  await page
    .getByRole("button", { name: "Innstillinger", exact: true })
    .first()
    .click();
  await openSettings.click();
  await panel.getByLabel("Vær", { exact: true }).check();
  await panel.getByRole("button", { name: "Forhåndsvis" }).click();
  await expect(screensaver.locator(".screensaver-weather")).toContainText(
    "Skyet",
  );
  await expect(screensaver).toContainText("Testavtale");
  await page.screenshot({
    path: `/tmp/smarti-screensaver-${info.project.name}.png`,
  });
});
