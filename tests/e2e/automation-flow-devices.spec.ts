import { test, expect } from "../../frontend/node_modules/@playwright/test";
test("device first flow uses names, attributes and available actions", async ({
  page,
}) => {
  const desktop = test.info().project.name === "desktop";
  if (desktop) await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  const nav = page.getByRole("navigation", { name: "Hovedmeny" });
  await expect(nav).toBeVisible();
  const session = await (await page.request.get("/api/session")).json();
  const title = `Enhetsflyt ${test.info().project.name}`;
  // Fixtures include sensors excluded from the usual dashboard and a registry-ID based device trigger.
  const data = await (await page.request.get("/api/manage/entities?details=true")).json();
  await page.route("**/api/manage/entities?details=true", async (route) => {
    await route.fulfill({
      json: [
        ...data,
        {
          id: "temperature-registry",
          entity_id: "sensor.fixture_temperature",
          device_id: "fixture-device",
          device_name: "Multienhet test",
          name: "Temperatur test",
          state: "21.4",
          domain: "sensor",
          attributes: { unit_of_measurement: "°C" },
          area_id: null,
        },
        {
          id: "climate-registry",
          entity_id: "climate.fixture",
          device_id: "fixture-device",
          device_name: "Multienhet test",
          name: "Varmepumpe test",
          state: "heat",
          domain: "climate",
          attributes: {
            current_temperature: 22.5,
            hvac_modes: ["heat", "off"],
          },
          area_id: null,
        },
        {
          id: "siren-registry",
          entity_id: "siren.fixture",
          device_id: "fixture-device",
          device_name: "Multienhet test",
          name: "Sirene test",
          state: "off",
          domain: "siren",
          attributes: {},
          area_id: null,
        },
      ],
    });
  });
  await page.route(
    "**/api/manage/automation-services?entity_id=siren.fixture",
    (route) =>
      route.fulfill({
        json: [
          {
            action: "siren.turn_on",
            name: "Start sirene",
            fields: {
              duration: {
                name: "Varighet",
                required: true,
                selector: { number: { min: 1, max: 60 } },
              },
            },
          },
        ],
      }),
  );
  const result = await page.request.post("/api/manage/automations", {
    headers: {
      "X-CSRF-Token": session.csrf,
      Origin: new URL(page.url()).origin,
    },
    data: {
      config: {
        alias: title,
        triggers: [
          {
            trigger: "device",
            domain: "sensor",
            device_id: "fixture-device",
            entity_id: "temperature-registry",
            type: "temperature",
            above: 25,
          },
        ],
        conditions: [],
        actions: [{ delay: 1 }],
      },
    },
  });
  expect(result.ok()).toBeTruthy();
  await nav.getByRole("button", { name: "Innstillinger", exact: true }).click();
  await page
    .locator(".experience-picker")
    .getByRole("button", { name: /^Avansert/ })
    .click();
  await nav.getByRole("button", { name: "Automasjoner", exact: true }).click();
  await page
    .locator(".automation-item")
    .filter({ hasText: title })
    .getByRole("button", { name: "Rediger", exact: true })
    .click();
  await expect(page.locator(".flow-board")).toContainText("Temperatur test");
  await expect(page.locator(".flow-board")).not.toContainText(
    "temperature-registry",
  );
  await page
    .getByRole("button", { name: "Fri arbeidsflate", exact: true })
    .click();
  await page
    .getByRole("group", { name: "Bibliotek" })
    .getByRole("button", { name: "Enheter", exact: true })
    .click();
  await page
    .getByLabel("Søk etter enhet", { exact: true })
    .fill("Multienhet test");
  const device = page
    .locator(".flow-device-list button")
    .filter({ hasText: "Multienhet test" });
  if (desktop) {
    const a = await device.boundingBox(),
      b = await page.locator(".canvas-viewport").boundingBox();
    await page.mouse.move(a!.x + a!.width / 2, a!.y + a!.height / 2);
    await page.mouse.down();
    await page.mouse.move(b!.x + 250, b!.y + 240, { steps: 15 });
    await page.mouse.up();
  } else await device.click();
  let dialog = page.getByRole("dialog", {
    name: "Multienhet test",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await dialog.screenshot({
    path: `/tmp/smarti-device-picker-${test.info().project.name}.png`,
  });
  await dialog.getByRole("button", { name: /Målt temperatur/ }).click();
  await expect(dialog).toContainText("22.5");
  await dialog.getByRole("button", { name: /^Og / }).click();
  const inspector = page.getByRole("dialog");
  await expect(inspector).toBeVisible();
  await inspector
    .getByRole("button", { name: "Ferdig med steget", exact: true })
    .click();
  await device.click();
  dialog = page.getByRole("dialog", { name: "Multienhet test", exact: true });
  await dialog.getByRole("button", { name: /Sirene test/ }).click();

  await dialog
    .getByRole("combobox", { name: "Handling", exact: true })
    .selectOption("siren.turn_on");
  await expect(
    dialog.getByRole("button", { name: "Legg til handling", exact: true }),
  ).toBeDisabled();
  await dialog.getByLabel("Varighet *", { exact: true }).fill("10");
  await dialog
    .getByRole("button", { name: "Legg til handling", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Ferdig med steget", exact: true })
    .click();
  await page.screenshot({
    path: `/tmp/smarti-device-flow-${test.info().project.name}.png`,
    fullPage: true,
  });
  const saved = page.waitForResponse(
    (r) =>
      r.request().method() === "PUT" &&
      r.url().includes("/manage/automations/"),
  );
  await page
    .getByRole("button", {
      name: desktop ? "Lagre flyten" : "Lagre automasjon",
      exact: true,
    })
    .click();
  const response = await saved;
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = response.request().postDataJSON();
  expect(body.config.triggers[0].entity_id).toBe("temperature-registry");
  expect(body.config.conditions).toContainEqual({
    entity_id: "climate.fixture",
    attribute: "current_temperature",
    condition: "numeric_state",
    above: 0,
  });
  expect(body.config.actions).toContainEqual({
    action: "siren.turn_on",
    target: { entity_id: "siren.fixture" },
    data: { duration: 10 },
  });
});
