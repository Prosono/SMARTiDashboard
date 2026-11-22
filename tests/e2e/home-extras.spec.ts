import { test, expect } from "../../frontend/node_modules/@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "Hovedmeny", exact: true }),
  ).toBeVisible();
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
  const dialog = page.getByRole("dialog", { name: "Personer hjemme" });
  await dialog.getByRole("checkbox", { name: "Ola", exact: true }).uncheck();
  await expect(people.locator("li")).toHaveCount(1);
  await dialog
    .getByLabel("Profilbilde: Ada", { exact: true })
    .setInputFiles({ name: "ada.png", mimeType: "image/png", buffer: png });
  await expect(
    dialog.getByRole("button", { name: "Bruk systembildet", exact: true }),
  ).toBeVisible();
  await dialog
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
  await page.route("**/api/home/experience", (route) =>
    route.fulfill({ json: { mode: "advanced" } }),
  );
  await page.reload();
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
  const requestedHours: string[] = [];
  await page.route("**/api/manage/device/device-one/history?**", (r) => {
    const query = new URL(r.request().url()).searchParams;
    const hours = query.get("hours") || "24";
    requestedHours.push(hours);
    const end = Date.parse("2026-10-14T12:00:00Z");
    const start = end - Number(hours) * 3_600_000;
    return r.fulfill({
      json: {
        unit: "°C",
        minimum: 20,
        maximum: 23,
        samples: 3,
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        points: [
          { time: new Date(start).toISOString(), value: 20, state: "20" },
          {
            time: new Date((start + end) / 2).toISOString(),
            value: null,
            state: "unknown",
          },
          { time: new Date(end).toISOString(), value: 23, state: "23" },
        ],
      },
    });
  });
  await page
    .getByRole("navigation", { name: "Hovedmeny", exact: true })
    .getByRole("button", { name: "Utvidelser", exact: true })
    .click();
  await page.getByRole("button", { name: "Utvid", exact: true }).click();
  await page
    .getByRole("button", { name: "Åpne enhet: Multisensor", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Multisensor", exact: true });
  await expect(dialog).toContainText("Testprodusent");
  await dialog.getByRole("button", { name: "Statistikk", exact: true }).click();
  await expect(dialog.locator(".history-extremes")).toContainText("23 °C");
  await expect(dialog.locator(".measured-chart-line")).toHaveCount(2);
  const chart = dialog.locator(".measured-chart-stage > svg");
  const readout = dialog.locator(".control-history-reading");
  await chart.scrollIntoViewIfNeeded();
  const bounds = (await chart.boundingBox())!;
  const endOfChart = { x: (472 / 480) * bounds.width, y: bounds.height / 2 };
  if (test.info().project.name === "mobile") {
    await chart.tap({ position: endOfChart });
  } else {
    await chart.hover({ position: endOfChart });
  }
  await expect(readout).toContainText("23 °C");
  await chart.focus();
  await chart.press("Home");
  await expect(readout).toContainText("20 °C");
  await chart.press("ArrowRight");
  await expect(readout).toContainText("Måling mangler");
  await chart.press("End");
  await expect(readout).toContainText("23 °C");
  const period = dialog.getByLabel("Periode", { exact: true });
  await period.selectOption("168");
  await expect.poll(() => requestedHours.at(-1)).toBe("168");
  await expect(chart).toHaveAttribute("aria-label", /7\. okt.*14\. okt/);
  await period.selectOption("720");
  await expect.poll(() => requestedHours.at(-1)).toBe("720");
  await expect(chart).toHaveAttribute("aria-label", /14\. sep.*14\. okt/);
  await chart.press("Home");
  await expect(readout).toContainText("20 °C");
  await dialog.getByText("Se registrerte verdier", { exact: false }).click();
  await expect(
    dialog.getByRole("cell", { name: "Ukjent", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `../artifacts/${test.info().project.name}-integration-history.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("welcome contains presence and alerts in every experience mode", async ({
  page,
}) => {
  const base = await (await page.request.get("/api/home")).json();
  await page.route("**/api/home", (r) =>
    r.fulfill({
      json: {
        ...base,
        controls: [
          ...base.controls,
          {
            id: "binary_sensor.test_smoke",
            entity_id: "binary_sensor.test_smoke",
            name: "Røykvarsler test",
            domain: "binary_sensor",
            state: "on",
            availability: "available",
            attributes: { device_class: "smoke" },
            capabilities: [],
            diagnostic: false,
          },
          {
            id: "person.test",
            entity_id: "person.test",
            name: "Ada",
            domain: "person",
            state: "home",
            availability: "available",
            attributes: {},
            capabilities: [],
            diagnostic: false,
          },
        ],
      },
    }),
  );
  await page.route("**/api/home/people", (r) =>
    r.fulfill({ json: { people: null, only_home: false, photos: {} } }),
  );
  await page.reload();
  for (const mode of ["Enkel", "Normal", "Avansert"]) {
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Innstillinger", exact: true })
      .click();
    await page
      .locator(".experience-picker")
      .getByRole("button", { name: new RegExp("^" + mode) })
      .click();
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Hjem", exact: true })
      .click();
    await expect(
      page.locator(
        ".home-welcome .home-presence, .simple-welcome .home-presence",
      ),
    ).toBeVisible();
    await expect(page.locator(".home-presence")).toHaveCount(1);
    await expect(
      page.locator(
        ".home-welcome .home-alert-banner, .simple-welcome .simple-warning-button",
      ),
    ).toBeVisible();
    await expect(
      page.locator(".home-alert-banner, .simple-warning-button"),
    ).toHaveCount(1);
    expect(
      await page
        .locator("body")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
  }
  await page.locator(".home-welcome").screenshot({
    path: `/tmp/smarti-welcome-${test.info().project.name}.png`,
  });

  await page
    .getByRole("button", { name: "Velg personer", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Personer hjemme" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ferdig", exact: true }).click();
  await page.locator(".home-alert-banner").click();
  await expect(page.locator(".home-welcome")).toHaveCount(0);
});
