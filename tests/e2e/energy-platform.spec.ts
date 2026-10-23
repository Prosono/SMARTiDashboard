import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("energy setup is usable on mobile and desktop, and missing readings are explicit", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let config: any = null;
  let powerReading = "845";
  await page.route("**/api/home/energy/platform/setup", async (route) => {
    if (route.request().method() === "PUT") {
      config = route.request().postDataJSON();
      await route.fulfill({ json: { saved: true } });
      return;
    }
    await route.fulfill({
      json: {
        config,
        can_edit: true,
        country: "NO",
        companies: [
          { id: "elvia", name: "Elvia AS" },
          { id: "bkk", name: "BKK AS" },
        ],
        sensors: [
          {
            entity: "sensor.heater",
            name: "Varmtvannsbereder",
            unit: "kWh",
            state: "15.2",
          },
          {
            entity: "sensor.heatpump",
            name: "Varmepumpe",
            unit: "kWh",
            state: "42",
          },
          {
            entity: "sensor.grid",
            name: "Strømmåler · forbruk",
            unit: "kWh",
            state: "123.45",
          },
          {
            entity: "sensor.power",
            name: "Strømmåler · effekt",
            unit: "W",
            state: powerReading,
          },
        ],
        tariff_source: {
          url: "https://github.com/kraftsystemet/fri-nettleie",
          updated: "2026-10-22",
        },
      },
    });
  });
  await page.route("**/api/home/energy/platform/refresh", (r) =>
    r.fulfill({ json: { refreshed: true } }),
  );
  let dashboardReady = false;
  await page.route("**/api/home/energy/platform/dashboard?*", (r) =>
    r.fulfill({
      json: dashboardReady
        ? {
            configured: true,
            meters: [],
            power_kw: null,
            cloud: "pending",
            cloud_at: "",
            collected_at: "",
            spot: null,
            tomorrow: null,
            cost_note: "",
          }
        : { configured: false },
    }),
  );
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page.getByRole("tab", { name: "Energi", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Energien i hjemmet ditt" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Fortsett" })).toBeDisabled();
  await dialog.getByLabel("Søk etter nettselskap").fill("Elvia");
  await dialog.getByRole("button", { name: "Elvia AS" }).click();
  await dialog.getByRole("button", { name: "Fortsett" }).click();
  await dialog.getByLabel("Støtteordning").selectOption("norgespris");
  await dialog.getByRole("button", { name: "Fortsett" }).click();
  await dialog
    .getByRole("button", { name: "Kjøpt strøm fra nettet", exact: true })
    .click();
  let picker = page.getByRole("dialog", {
    name: "Kjøpt strøm fra nettet",
    exact: true,
  });
  await picker.getByLabel("Søk etter måler").fill("Strømmåler");
  await picker.getByRole("button", { name: /Strømmåler · forbruk/ }).click();
  await dialog
    .getByRole("button", { name: "Effekt fra strømnettet", exact: true })
    .click();
  picker = page.getByRole("dialog", {
    name: "Effekt fra strømnettet",
    exact: true,
  });
  await expect(
    picker.getByRole("button", { name: /Strømmåler · effekt/ }),
  ).toContainText("845 W");
  powerReading = "0";
  await expect(
    picker.getByRole("button", { name: /Strømmåler · effekt/ }),
  ).toContainText("0 W", { timeout: 10000 });
  await picker.getByRole("button", { name: /Strømmåler · effekt/ }).click();
  powerReading = "unavailable";
  await expect(
    dialog.getByRole("button", { name: "Effekt fra strømnettet", exact: true }),
  ).toContainText("Utilgjengelig", { timeout: 10000 });
  const consumerLabel = "Varmepumpe, varmtvann og andre forbrukere";
  await dialog
    .getByRole("button", { name: consumerLabel, exact: true })
    .click();
  const consumers = page.getByRole("dialog", {
    name: consumerLabel,
    exact: true,
  });
  await consumers
    .getByRole("checkbox", { name: "Varmtvannsbereder", exact: true })
    .check();
  await consumers
    .getByRole("checkbox", { name: "Varmepumpe", exact: true })
    .check();
  await consumers
    .getByRole("checkbox", { name: "Strømmåler · effekt", exact: true })
    .check();
  await expect(
    consumers.getByText("Effekt · akkurat nå", { exact: true }),
  ).toBeVisible();
  await expect(consumers.getByRole("status")).toHaveText("3 valgt");
  await expect(consumers.locator(".energy-picker-option").first()).toHaveCSS(
    "flex-direction",
    "row",
  );
  await expect(
    consumers.getByRole("button", { name: "Bruk valgte", exact: true }),
  ).toBeInViewport();
  await page.screenshot({
    path: `/tmp/smarti-sensor-picker-${info.project.name}.png`,
  });
  await consumers
    .getByRole("button", { name: "Bruk valgte", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: consumerLabel, exact: true }),
  ).toContainText("3 målinger valgt");
  await dialog
    .getByRole("button", { name: consumerLabel, exact: true })
    .click();
  await consumers
    .getByRole("checkbox", { name: "Varmepumpe", exact: true })
    .uncheck();
  await consumers.getByRole("button", { name: "Avbryt", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: consumerLabel, exact: true }),
  ).toContainText("3 målinger valgt");
  const battery = dialog.getByRole("group", { name: "Har du hjemmebatteri?" });
  await expect(
    dialog.getByText("Strøm inn på batteriet", { exact: true }),
  ).toHaveCount(0);
  await battery.getByRole("button", { name: "Ja", exact: true }).click();
  await expect(
    dialog.getByText("Strøm inn på batteriet", { exact: true }),
  ).toBeVisible();
  await battery.getByRole("button", { name: "Nei", exact: true }).click();
  await expect(
    dialog.getByText("Strøm inn på batteriet", { exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByRole("group", { name: "Har du solceller?" })
    .getByRole("button", { name: "Ja", exact: true })
    .click();
  await expect(dialog.getByText("Elhub kommer senere")).toHaveCount(0);
  await page.screenshot({
    path: `/tmp/smarti-energy-wizard-${info.project.name}.png`,
  });
  await dialog.getByRole("button", { name: "Fortsett" }).click();
  await dialog.getByRole("button", { name: "Åpne energioversikten" }).click();
  await expect(dialog).not.toBeVisible();
  expect(
    config.meters
      .filter((m: any) => m.role === "consumer")
      .map((m: any) => m.entity),
  ).toEqual(["sensor.heater", "sensor.heatpump", "sensor.power"]);
  expect(config.cloud_history).toBe(true);
  expect(config.scheme).toBe("norgespris");
  expect(config.meters[0].entity).toBe("sensor.grid");
  expect(config.equipment).toEqual({ solar: true, ev: false, battery: false });
  await expect(
    page.getByRole("tab", { name: "3D-oversikt", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("tabpanel", {
      name: "Historikk og strømpriser",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("tab", { name: "Historikk og strømpriser", exact: true })
    .click();
  await expect(page.getByText("Ingen fersk effektmåling")).toBeVisible();
  expect(errors).toEqual([]);
  dashboardReady = true;
  await page
    .getByRole("button", { name: "Måned", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Her kommer forbruket ditt" }),
  ).toBeVisible();
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  );
  expect(fits).toBe(true);
  await page.screenshot({
    path: `/tmp/smarti-energy-dashboard-${info.project.name}.png`,
    fullPage: true,
  });
  // Existing homes edit one section directly, preserving the other settings.
  const saved = structuredClone(config);
  await page
    .getByRole("button", { name: "Energiinnstillinger", exact: true })
    .click();
  const editor = page.getByRole("dialog", {
    name: "Energiinnstillinger",
    exact: true,
  });
  await editor
    .getByRole("button", { name: "Utstyr og målere", exact: true })
    .click();
  await editor
    .getByRole("group", { name: "Har du hjemmebatteri?" })
    .getByRole("button", { name: "Ja", exact: true })
    .click();
  await expect(
    editor.getByRole("button", { name: "Fortsett", exact: true }),
  ).toHaveCount(0);
  await editor.screenshot({
    path: `/tmp/smarti-energy-edit-${info.project.name}.png`,
  });
  await editor
    .getByRole("button", { name: "Lagre endringer", exact: true })
    .click();
  await expect(editor).not.toBeVisible();
  expect(config.equipment.battery).toBe(true);
  expect(config.company).toBe(saved.company);
  expect(config.scheme).toBe(saved.scheme);
  expect(config.meters).toEqual(saved.meters);
  expect(config.cloud_history).toBe(saved.cloud_history);
  await expect(
    page.getByRole("tab", { name: "Historikk og strømpriser", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("button", { name: "Energiinnstillinger", exact: true })
    .click();
  await editor
    .getByRole("button", { name: "Utstyr og målere", exact: true })
    .click();
  await editor
    .getByRole("group", { name: "Har du hjemmebatteri?" })
    .getByRole("button", { name: "Nei", exact: true })
    .click();
  await editor.getByRole("button", { name: "Avbryt", exact: true }).click();
  expect(config.equipment.battery).toBe(true);
  expect(errors).toEqual([]);
});

test("energy chart distinguishes zero from missing readings and supports keyboard selection", async ({
  page,
}) => {
  await page.route("**/api/home/energy/platform/setup", (r) =>
    r.fulfill({
      json: {
        config: {
          country: "NO",
          company: "elvia",
          meters: [],
          cloud_history: true,
        },
        can_edit: true,
        country: "NO",
        companies: [],
        sensors: [],
        tariff_source: {
          url: "https://github.com/kraftsystemet/fri-nettleie",
          updated: "2026-10-22",
        },
      },
    }),
  );
  await page.route("**/api/home/energy/platform/dashboard?*", (r) =>
    r.fulfill({
      json: {
        configured: true,
        power_kw: 1.2,
        cloud: "synced",
        spot: null,
        meters: [
          {
            role: "grid",
            name: "Strømmåler",
            summary: { available_kwh: 2, complete: false, coverage: 2 / 3 },
            cost_total: null,
            breakdown: {},
            capacity: null,
            monthly_fees: null,
            points: [2, 0, null].map((kwh, hour) => ({
              start: `2026-10-22T0${hour}:00:00+02:00`,
              end: `2026-10-22T0${hour + 1}:00:00+02:00`,
              kwh,
              cost: { total: kwh === null ? null : kwh * 1.5 },
            })),
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page.getByRole("tab", { name: "Energi", exact: true }).click();
  await page
    .getByRole("tab", { name: "Historikk og strømpriser", exact: true })
    .click();
  const chart = page.getByRole("group", { name: "Forbruksgraf" });
  await expect(chart.getByRole("button")).toHaveCount(3);
  await chart.getByRole("button").nth(1).focus();
  await expect(chart.getByRole("button").nth(1)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".ep-chart-detail")).toContainText("0 kWh");
  await page.keyboard.press("Tab");
  await expect(chart.getByRole("button").nth(2)).toHaveAttribute(
    "data-missing",
    "true",
  );
  await expect(page.locator(".ep-chart-detail")).toContainText(
    "kostnad ikke tilgjengelig",
  );
  await expect(
    page.getByText("Målehistorikken er synkronisert til SMARTi-skyen."),
  ).toBeVisible();
});
