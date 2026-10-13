import { test, expect } from "../../frontend/node_modules/@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(page.locator(".home-welcome")).toBeVisible();
});
test("people filter and photos persist, tomorrow forecast is distinct", async ({
  page,
}) => {
  const base = await (await page.request.get("/api/home")).json();
  const person = (name: string, state: string) => ({
    id: `person.${name}`,
    entity_id: `person.${name}`,
    name,
    domain: "person",
    state,
    availability: "available",
    attributes: {},
    capabilities: [],
    area_id: null,
    device_id: null,
    diagnostic: false,
  });
  await page.route("**/api/home", (r) =>
    r.fulfill({
      json: {
        ...base,
        controls: [
          ...base.controls,
          person("Ada", "home"),
          person("Ola", "not_home"),
          {
            ...person("weather", "sunny"),
            id: "weather.home",
            entity_id: "weather.home",
            domain: "weather",
            name: "Kristiansand",
            attributes: {
              temperature: 14,
              temperature_unit: "°C",
              wind_speed: 4,
              wind_speed_unit: "m/s",
            },
          },
        ],
      },
    }),
  );
  let prefs: any = {
    people: null,
    only_home: false,
    photos: { "person.Ada": { available: true, custom: false } },
  };
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP436AARAwQCgAw7gZ9vw2nHQAAAABJRU5ErkJggg==",
    "base64",
  );
  await page.route("**/api/home/people", (r) => {
    if (r.request().method() === "PUT")
      prefs = { ...prefs, ...r.request().postDataJSON() };
    return r.fulfill({ json: prefs });
  });
  await page.route("**/api/home/people/person.Ada/photo**", (r) => {
    if (r.request().method() === "PUT") {
      prefs.photos["person.Ada"] = {
        available: true,
        custom: !!r.request().postDataJSON().data,
      };
      return r.fulfill({ json: { saved: true } });
    }
    return r.fulfill({ body: png, contentType: "image/png" });
  });
  await page.route("**/api/home/weather/**", (r) =>
    r.fulfill({
      json: {
        temperature_unit: "°C",
        precipitation_unit: "mm",
        days: {
          tomorrow: {
            date: "2026-10-14",
            condition: "rainy",
            temperature: 12,
            templow: 7,
            precipitation: 3,
          },
        },
      },
    }),
  );
  await page.reload();
  const people = page.getByRole("region", { name: "Hvem er hjemme" });
  await expect(
    people.locator("li").filter({ hasText: "Ada" }).locator("img"),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Værmelding" })).toContainText(
    "I morgen",
  );
  await expect(page.getByRole("region", { name: "Værmelding" })).toContainText(
    "12°C",
  );
  await people
    .getByRole("button", { name: "Velg personer", exact: true })
    .click();
  await people.getByRole("checkbox", { name: "Ola", exact: true }).uncheck();
  await expect(people.locator("li")).toHaveCount(1);
  await people
    .getByLabel("Profilbilde: Ada", { exact: true })
    .setInputFiles({ name: "ada.png", mimeType: "image/png", buffer: png });
  await expect(
    people.getByRole("button", { name: "Bruk systembildet", exact: true }),
  ).toBeVisible();
  await people
    .getByRole("checkbox", { name: "Vis bare de som er hjemme", exact: true })
    .check();
  await page.reload();
  await expect(people.locator("li")).toHaveCount(1);
  await page.screenshot({
    path: `../artifacts/${test.info().project.name}-people-weather.png`,
    fullPage: true,
    animations: "disabled",
  });
});
test("integration device opens details, statistics and gap-preserving history", async ({
  page,
}) => {
  const control = {
    id: "sensor.temp",
    entity_id: "sensor.temp",
    device_id: "device-one",
    name: "Romtemperatur",
    domain: "sensor",
    state: "21",
    attributes: { unit_of_measurement: "°C" },
    capabilities: [],
    availability: "available",
  };
  await page.route("**/api/manage/integrations", (r) =>
    r.fulfill({
      json: [
        {
          entry_id: "entry",
          domain: "mqtt",
          title: "MQTT",
          state: "loaded",
          disabled_by: null,
          device_items: [
            {
              id: "device-one",
              name: "Multisensor",
              model: "Test",
              area: "Stue",
            },
          ],
        },
      ],
    }),
  );
  await page.route("**/api/manage/device/device-one", (r) =>
    r.fulfill({
      json: {
        id: "device-one",
        name: "Multisensor",
        manufacturer: "Testprodusent",
        model: "Sensor 1",
        firmware: "1.2",
        area: "Stue",
        connected: true,
        controls: [control],
      },
    }),
  );
  await page.route("**/api/manage/device/device-one/history?**", (r) =>
    r.fulfill({
      json: {
        unit: "°C",
        minimum: 20,
        maximum: 23,
        samples: 3,
        start: "2026-10-13T00:00:00Z",
        end: "2026-10-14T00:00:00Z",
        points: [
          { time: "2026-10-13T01:00:00Z", value: 20, state: "20" },
          { time: "2026-10-13T02:00:00Z", value: null, state: "unknown" },
          { time: "2026-10-13T03:00:00Z", value: 23, state: "23" },
        ],
      },
    }),
  );
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Mer", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Integrasjoner", exact: true })
    .click();
  await page.getByRole("button", { name: "Utvid", exact: true }).click();
  await page
    .getByRole("button", { name: "Åpne enhet: Multisensor", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Multisensor", exact: true });
  await expect(dialog).toContainText("Testprodusent");
  await dialog.getByRole("button", { name: "Statistikk", exact: true }).click();
  await expect(dialog).toContainText("23 °C");
  await expect(dialog.locator("svg path").last()).toHaveAttribute("d", /M.*M/);
  await dialog.getByLabel("Periode", { exact: true }).selectOption("168");
  await dialog.getByText("Se registrerte verdier", { exact: false }).click();
  await expect(dialog.locator("table")).toContainText("unknown");
  await page.screenshot({
    path: `../artifacts/${test.info().project.name}-integration-history.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
