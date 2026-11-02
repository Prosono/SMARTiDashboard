import {
  test,
  expect,
  type Page,
} from "../../frontend/node_modules/@playwright/test";
import type { SavedGrid } from "../../frontend/src/home/homeGridModel";

const now = new Date("2026-11-02T12:00:00Z");
async function setup(page: Page, compact = false) {
  await page.addInitScript((compact) => {
    localStorage.setItem("smarti-home-style", "harmony");
    localStorage.setItem("smarti-theme", "dark");
    localStorage.setItem(
      "smarti-home-mobile-layout",
      compact ? "compact" : "detailed",
    );
  }, compact);
  await page.clock.setFixedTime(now);
  const config = {
    country: "NO",
    area: "NO1",
    company: "elvia",
    segment: "husholdning",
    contract: "spot",
    fixed_price: 0,
    markup: 0,
    monthly_fee: 0,
    scheme: "stromstotte",
    cloud_history: false,
    equipment: { solar: true, ev: false, battery: false },
    meters: [
      { role: "grid", entity: "sensor.grid", name: "Hovedmåler" },
      { role: "solar", entity: "sensor.solar", name: "Solceller" },
    ],
    power_entity: "sensor.power",
  };
  let configWrites = 0;
  await page.route("**/api/home/energy/platform/setup", (route) => {
    if (route.request().method() !== "GET") configWrites++;
    return route.fulfill({
      json: {
        config,
        can_edit: true,
        country: "NO",
        companies: [],
        sensors: [],
        tariff_source: {
          url: "https://example.com/tariff",
          updated: "2026-11-02",
        },
      },
    });
  });
  const points = Array.from({ length: 24 }, (_, i) => ({
    start: new Date(Date.UTC(2026, 10, 2, i)).toISOString(),
    end: new Date(Date.UTC(2026, 10, 2, i + 1)).toISOString(),
    kwh: i === 6 ? null : 0.4 + i / 20,
    cost: { total: i === 6 ? null : 0.5 + i / 20 },
  }));
  const spot = points.map((p, i) => ({
    time_start: p.start,
    time_end: p.end,
    NOK_per_kWh: 0.4 + i / 20,
  }));
  const meter = {
    role: "grid",
    name: "Hovedmåler",
    summary: { available_kwh: 18.4, complete: false, coverage: 23 / 24 },
    points,
    cost_total: 24.6,
    available_cost: 24.6,
    monthly_fees: 2.4,
    breakdown: { electricity: 14, grid: 6, vat: 2.2 },
    capacity: { peak_kw: 4.8, monthly_ex_vat: 150, next_threshold_kw: 5 },
  };
  const dashboard = {
    configured: true,
    power_kw: 4.2,
    meters: [meter],
    spot,
    tomorrow: null,
    cost_note: "Foreløpig beregning",
    cloud: "local",
    cloud_at: "",
    collected_at: now.toISOString(),
    totals: {
      today: {
        available_kwh: 18.4,
        total_kwh: 18.4,
        cost: 24.6,
        complete: false,
      },
      month: { available_kwh: 36.8, cost: 49.2, complete: false },
    },
    solar: {
      production: 8.2,
      export: 2,
      self_consumption: 6.2,
      export_spot_value: 1.8,
      note: "Ferdige timer",
    },
    forecast: { value: 800, method: "Basert på forbruk hittil." },
    previous: { kwh: 16, cost: 20 },
    comparisons: [
      { scheme: "none", cost: 30 },
      { scheme: "stromstotte", cost: 24.6 },
    ],
    power_consumers: [
      {
        entity: "sensor.heater",
        name: "Varmtvann",
        watts: 450,
        status: "available",
      },
    ],
  };
  let historyRequests = 0;
  await page.route("**/api/home/energy/platform/dashboard?*", (route) => {
    historyRequests++;
    return route.fulfill({ json: dashboard });
  });
  const layouts: Record<string, SavedGrid> = {
    energy: { revision: 0, items: null },
    energy_history: { revision: 0, items: null },
  };
  let failSave = false;
  for (const key of Object.keys(layouts))
    await page.route(`**/api/home/layout/${key}`, (route) => {
      if (route.request().method() === "PUT") {
        if (failSave)
          return route.fulfill({
            status: 503,
            json: { detail: "unavailable" },
          });
        const body = route.request().postDataJSON();
        if (body.revision !== layouts[key].revision)
          return route.fulfill({
            status: 409,
            json: { detail: "layout_changed" },
          });
        layouts[key] = { ...body, revision: body.revision + 1 };
      }
      return route.fulfill({ json: layouts[key] });
    });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page.getByRole("tab", { name: "Energi", exact: true }).click();
  await expect(page.locator('.home-canvas[data-page="energy"]')).toBeVisible();
  return {
    layouts,
    configWrites: () => configWrites,
    historyRequests: () => historyRequests,
    failSave: (value: boolean) => {
      failSave = value;
    },
  };
}
const edit = (page: Page) =>
  page
    .locator(".home-toolbar")
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
const history = (page: Page) =>
  page
    .getByRole("tab", { name: "Historikk og strømpriser", exact: true })
    .click();
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "wait" });
});

test("energy defaults are independent cards; both layouts resize, save, reload and restore removed modules", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  const state = await setup(page);
  const overview = page.locator('.home-canvas[data-page="energy"]');
  await expect(overview.locator(".home-canvas-cell")).toHaveCount(5);
  await expect(overview.locator('[data-card="energy:today"]')).toContainText(
    "18,4",
  );
  await expect(overview.locator(".home-canvas-toolbar")).toHaveCount(0);
  await expect(overview.locator(".home-canvas-grid")).toHaveCSS(
    "--canvas-columns",
    "3",
  );
  const flow = overview.locator('[data-card="energy:flow"]');
  await expect(flow.locator(".energy-scene")).toBeVisible();
  await expect(flow.locator(".home-canvas-viewport")).toHaveAttribute(
    "data-overflow",
    "false",
  );
  await flow.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(
    flow.getByRole("button", { name: "Vis flyt", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `/private/tmp/smarti-energy-module-overview-${info.project.name}.png`,
  });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
  await edit(page);
  await flow.getByRole("combobox", { name: /bredde/ }).selectOption("2");
  await flow.getByRole("combobox", { name: /høyde/ }).selectOption("3");
  await overview
    .getByRole("button", { name: "Fjern Spotpris nå", exact: true })
    .click();
  await overview.getByRole("button", { name: "Lagre", exact: true }).click();
  expect(
    state.layouts.energy.items?.find((c) => c.id === "energy:flow"),
  ).toMatchObject({ w: 2, h: 3 });
  expect(state.layouts.energy.items?.some((c) => c.id === "energy:spot")).toBe(
    false,
  );
  await page.reload();
  await page.getByRole("tab", { name: "Energi", exact: true }).click();
  await expect(flow).toHaveCSS("grid-column-end", "span 2");
  await history(page);
  const grid = page.locator('.home-canvas[data-page="energy_history"]');
  await expect(overview).toHaveCount(0);
  await expect(grid.locator('[data-card="energy:history"]')).toBeVisible();
  await expect(grid.locator('[data-card="energy:power"]')).toContainText("4,2");
  await expect(grid.locator('[data-card="energy:solar"]')).toContainText("8,2");
  await edit(page);
  await grid
    .getByRole("button", { name: "Fjern Strømpriser", exact: true })
    .click();
  await grid.getByRole("button", { name: "Lagre", exact: true }).click();
  expect(
    state.layouts.energy_history.items?.some((c) => c.id === "energy:prices"),
  ).toBe(false);
  await edit(page);
  await grid
    .getByRole("button", { name: "Legg til kort", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: "Legg til kort",
    exact: true,
  });
  await picker
    .getByRole("button", { name: "Oversiktskort", exact: true })
    .click();
  await picker
    .getByRole("button", { name: "Strømpriser", exact: true })
    .click();
  await picker
    .getByRole("button", { name: "Legg til kort", exact: true })
    .click();
  await grid.getByRole("button", { name: "Lagre", exact: true }).click();
  await expect(grid.locator('[data-card="energy:prices"]')).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Grupper etter rom", exact: true }),
  ).toHaveCount(0);
  expect(state.configWrites()).toBe(0);
  await page.screenshot({
    path: `/private/tmp/smarti-energy-modules-${info.project.name}.png`,
    fullPage: true,
  });
});

test("unsaved energy edits guard subviews; failed saves retain the draft and leave tariff settings untouched", async ({
  page,
}) => {
  const state = await setup(page);
  const overview = page.locator('.home-canvas[data-page="energy"]');
  await edit(page);
  const dismissed = page
    .waitForEvent("dialog")
    .then((dialog) => dialog.dismiss());
  await history(page);
  await dismissed;
  await expect(overview).toHaveAttribute("data-editing", "true");
  const accepted = page
    .waitForEvent("dialog")
    .then((dialog) => dialog.accept());
  await history(page);
  await accepted;
  const grid = page.locator('.home-canvas[data-page="energy_history"]');
  await edit(page);
  await grid
    .getByRole("button", { name: "Fjern Spotpris akkurat nå", exact: true })
    .click();
  state.failSave(true);
  await grid.getByRole("button", { name: "Lagre", exact: true }).click();
  await expect(grid).toContainText("Kunne ikke lagre");
  await expect(grid).toHaveAttribute("data-editing", "true");
  await expect(grid.locator('[data-card="energy:spot"]')).toHaveCount(0);
  state.failSave(false);
  await grid.getByRole("button", { name: "Lagre", exact: true }).click();
  await expect(grid).toHaveAttribute("data-editing", "false");
  await page
    .getByRole("button", { name: "Energiinnstillinger", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Energiinnstillinger", exact: true }),
  ).toBeVisible();
  expect(state.configWrites()).toBe(0);
});

test("history modules keep period controls, price days, genuine gaps and missing data", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await setup(page);
  await history(page);
  const grid = page.locator('.home-canvas[data-page="energy_history"]');
  const historyCard = grid.locator('[data-card="energy:history"]');
  await expect(historyCard.locator(".ep-chart")).toBeVisible();
  await expect(
    historyCard.getByRole("button", { name: /ufullstendig|kWh/ }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Uke", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Uke", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const prices = grid.locator('[data-card="energy:prices"]');
  const expand = prices.getByRole("button", { name: /Vis hele kortet/ });
  const expanded = (await expand.count()) > 0;
  if (expanded) await expand.click();
  const chart = expanded
    ? page.getByRole("dialog").locator(".ep-spot-chart")
    : prices.locator(".ep-spot-chart");
  await chart.getByRole("button", { name: "I morgen", exact: true }).click();
  await expect(chart).toContainText(/ikke.*publisert|venter|Ingen/i);
  await page.keyboard.press("Escape");
  await page.route("**/api/home/energy/platform/dashboard?*", (route) =>
    route.fulfill({ status: 503, json: { detail: "unavailable" } }),
  );
  await page.reload();
  await page.getByRole("tab", { name: "Energi", exact: true }).click();
  await history(page);
  await expect(page.locator(".ep").getByRole("alert")).toContainText(
    "Kunne ikke hente energihistorikken",
  );
  await expect(grid.locator('[data-card="energy:history"]')).toContainText(
    "Her kommer forbruket ditt",
  );
  await expect(grid.locator('[data-card="energy:power"]')).toContainText("—");
});

test("phone energy tiles show real summaries and mount the full module only on demand", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, true);
  const grid = page.locator('.home-canvas[data-page="energy"]');
  await expect(grid).toHaveAttribute("data-mobile-layout", "compact");
  const flow = grid.locator('[data-card="energy:flow"] .mobile-card-tile');
  await expect(flow).toContainText("4,2 kW");
  await expect(page.locator(".energy-scene")).toHaveCount(0);
  await flow.click();
  await expect(page.getByRole("dialog")).toContainText("Energiflyt");
  await expect(page.locator(".energy-scene")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(flow).toBeFocused();
  await expect(page.locator(".energy-scene")).toHaveCount(0);
  await history(page);
  const historical = page.locator('.home-canvas[data-page="energy_history"]');
  await expect(
    historical.locator('[data-card="energy:power"] .mobile-card-tile'),
  ).toContainText("4,2 kW");
  await expect(
    historical.locator('[data-card="energy:solar"] .mobile-card-tile'),
  ).toContainText("8,2 kWh");
  await expect(
    historical.locator('[data-card="energy:forecast"] .mobile-card-tile'),
  ).toContainText("800 kr");
  await expect(page.locator(".ep-chart")).toHaveCount(0);
  await historical
    .locator('[data-card="energy:history"] .mobile-card-tile')
    .click();
  await expect(page.getByRole("dialog").locator(".ep-chart")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: `/private/tmp/smarti-energy-module-tiles-${info.project.name}.png`,
    fullPage: true,
  });
});
