import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("energy setup is usable on mobile and desktop, and missing readings are explicit", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let config: any = null;
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
          { entity: "sensor.grid", name: "Strømmåler · forbruk", unit: "kWh" },
          { entity: "sensor.power", name: "Strømmåler · effekt", unit: "W" },
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
    .getByRole("combobox", { name: "Kjøpt strøm fra nettet", exact: true })
    .selectOption("sensor.grid");
  await dialog
    .getByRole("combobox", { name: "Effekt fra strømnettet", exact: true })
    .selectOption("sensor.power");
  await expect(dialog.getByText("Elhub kommer senere")).toBeVisible();
  await page.screenshot({
    path: `/tmp/smarti-energy-wizard-${info.project.name}.png`,
  });
  await dialog.getByRole("button", { name: "Fortsett" }).click();
  await dialog.getByRole("button", { name: "Åpne energioversikten" }).click();
  await expect(dialog).not.toBeVisible();
  expect(config.cloud_history).toBe(true);
  expect(config.scheme).toBe("norgespris");
  expect(config.meters[0].entity).toBe("sensor.grid");
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
