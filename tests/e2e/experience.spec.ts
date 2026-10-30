import { test, expect } from "../../frontend/node_modules/@playwright/test";
test("personal experience modes simplify navigation and survive reload", async ({
  page,
}) => {
  await page.route("**/api/home/calendar", async (route) =>
    route.fulfill({
      json: {
        today: "2026-10-30",
        timezone: "Europe/Oslo",
        calendars: ["calendar.family"],
        sources: [{ id: "calendar.family", name: "Familie" }],
      },
    }),
  );
  await page.route("**/api/home/calendar/events?*", async (route) =>
    route.fulfill({
      json: {
        days: {
          "2026-10-30": [
            {
              start: "2026-10-30T15:00:00+01:00",
              end: "2026-10-30T16:00:00+01:00",
              calendar: "calendar.family",
              location: "",
              description: "",
              summary: "Familiebesøk",
              all_day: false,
            },
          ],
        },
        failed: [],
        timezone: "Europe/Oslo",
      },
    }),
  );
  await page.route("**/api/home/weather/**", async (route) =>
    route.fulfill({
      json: {
        days: { today: { temperature: 13, templow: 7, precipitation: 2 } },
        temperature_unit: "°C",
        precipitation_unit: "mm",
      },
    }),
  );
  await page.route("**/api/home", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({
      json: {
        ...data,
        controls: [
          ...data.controls,
          ...[
            {
              domain: "weather",
              name: "Været hjemme",
              state: "partlycloudy",
              attributes: {
                temperature: 10,
                temperature_unit: "°C",
                humidity: 78,
                wind_speed: 3,
                wind_speed_unit: "m/s",
              },
            },
            {
              domain: "media_player",
              name: "Høyttaler",
              state: "paused",
              attributes: {
                media_title: "Testspor",
                media_artist: "Testartist",
                volume_level: 0.3,
              },
            },
            {
              domain: "vacuum",
              name: "Robotstøvsuger",
              state: "docked",
              attributes: { battery_level: 100 },
            },
          ].map((c) => ({
            ...c,
            id: c.domain + ".preview",
            entity_id: c.domain + ".preview",
            area_id: "living",
            device_id: null,
            availability: "available",
            capabilities: [],
            diagnostic: false,
          })),
          {
            id: "smoke-test",
            entity_id: "binary_sensor.smoke_test",
            name: "Røyk i kjøkken",
            domain: "binary_sensor",
            area_id: "kitchen",
            device_id: null,
            state: "on",
            availability: "available",
            attributes: { device_class: "smoke" },
            capabilities: [],
            diagnostic: false,
          },
        ],
      },
    });
  });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  const settings = () =>
    page
      .getByRole("navigation")
      .getByRole("button", { name: "Innstillinger", exact: true });
  const home = () =>
    page
      .getByRole("navigation")
      .getByRole("button", { name: "Hjem", exact: true });
  await settings().click();
  await page.locator(".experience-picker").screenshot({
    path: `../artifacts/experience-picker-${test.info().project.name}.png`,
  });
  await page
    .locator(".experience-picker")
    .getByRole("button", { name: /^Enkel/ })
    .click();
  await expect(page.locator(".shell")).toHaveAttribute(
    "data-experience",
    "simple",
  );
  await expect(
    page
      .getByRole("navigation")
      .getByRole("button", { name: "Integrasjoner", exact: true }),
  ).toHaveCount(0);
  await home().click();
  const alertButton = page
    .locator(".simple-welcome")
    .getByRole("button", { name: /Trenger din oppmerksomhet/ });
  await alertButton.click();
  await expect(page.getByRole("dialog")).toContainText("Røyk i kjøkken");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(alertButton).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "Hva vil du gjøre hjemme?" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Hva vil du gjøre hjemme?", { exact: true }),
  ).toBeVisible();
  expect(
    await page.locator(".simple-home .device").count(),
  ).toBeLessThanOrEqual(8);
  await expect(page.locator(".simple-dashboard-grid")).toBeVisible();
  await expect(page.locator(".simple-weather")).toContainText("10°C");
  await expect(page.locator(".simple-weather")).toContainText("78 %");
  await expect(page.locator(".simple-weather img")).toHaveJSProperty(
    "naturalWidth",
    720,
  );
  await expect(page.locator(".simple-dashboard-date")).toContainText(
    "Familiebesøk",
  );
  await expect(page.locator(".simple-dashboard-vacuum img")).toHaveJSProperty(
    "naturalWidth",
    720,
  );
  await expect(page.locator(".simple-dashboard-vacuum")).toContainText("100%");

  await page.locator(".simple-dashboard-lights").click();
  const lights = page.getByRole("dialog", {
    name: "Lys i hjemmet",
    exact: true,
  });
  await expect(lights).toBeVisible();
  await lights.getByRole("button", { name: /Pendellampe/ }).click();
  const light = page.getByRole("dialog", { name: "Pendellampe", exact: true });
  await expect(light.getByRole("switch")).toBeVisible();
  await light
    .getByRole("button", { name: "Lukk innstillinger", exact: true })
    .click();
  await lights
    .getByRole("button", { name: "Lukk innstillinger", exact: true })
    .click();
  const plus = page
    .locator(".simple-dashboard-climate")
    .getByRole("button", { name: /Ønsket temperatur.*\+/ });
  await expect(plus).toBeEnabled();
  await page.getByText("Rom og alle enheter", { exact: true }).click();
  await page.getByLabel("Finn en enhet").fill("finnesikkexyz");
  await expect(
    page.getByText("Ingen enheter her.", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".shell")).toHaveAttribute(
    "data-experience",
    "simple",
  );
  await page.screenshot({
    path: `/tmp/experience-simple-${test.info().project.name}.png`,
    fullPage: true,
  });
  await settings().click();
  await page
    .locator(".experience-picker")
    .getByRole("button", { name: /^Normal/ })
    .click();
  await expect(page.locator(".shell")).toHaveAttribute(
    "data-experience",
    "normal",
  );
  await expect(
    page.getByRole("button", { name: "Administrasjon", exact: true }),
  ).toHaveCount(0);
  await home().click();
  await expect(
    page.getByRole("button", { name: "Vis mer informasjon", exact: true }),
  ).toHaveCount(0);
  await settings().click();
  await page
    .locator(".experience-picker")
    .getByRole("button", { name: /^Avansert/ })
    .click();
  await expect(page.locator(".shell")).toHaveAttribute(
    "data-experience",
    "advanced",
  );
  await expect(
    page
      .getByRole("navigation")
      .getByRole("button", { name: "Integrasjoner", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Tema og utseende", exact: true })
    .click();
  await page.getByLabel("Ditt språk", { exact: true }).selectOption("en");
  await expect(page.getByLabel("Your language", { exact: true })).toHaveValue(
    "en",
  );
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Theme and appearance", exact: true })
    .click();
  await expect(page.getByLabel("Your language", { exact: true })).toHaveValue(
    "en",
  );
  await page.getByLabel("Your language", { exact: true }).selectOption("nb");
  await expect(page.getByLabel("Ditt språk", { exact: true })).toHaveValue(
    "nb",
  );
});
