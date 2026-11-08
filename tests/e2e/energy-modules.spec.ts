import {
  test,
  expect,
  type Page,
} from "../../frontend/node_modules/@playwright/test";
import type { SummaryPrice } from "../../frontend/src/home/energySummaryModel";
import type { SavedGrid } from "../../frontend/src/home/homeGridModel";

const now = new Date("2026-11-02T12:00:00Z");
async function setup(
  page: Page,
  compact = false,
  chartsOnly = false,
  priceData?: { spot: SummaryPrice[]; tomorrow: SummaryPrice[] | null },
) {
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
    current: {
      at: now.toISOString(),
      company: { id: "elvia", name: "Elvia AS" },
      area: "NO1",
      contract: "spot",
      scheme: "stromstotte",
      tariff: {
        energy_ex_vat: 0.2,
        manual: false,
        revision: "fixture",
        valid_from: "2026-07-01",
        updated: "2026-07-01",
        stale: false,
      },
      capacity: {
        threshold: 2,
        next_threshold_kw: 5,
        peak_kw: 4.8,
        monthly: 250,
        manual: false,
        vat_included: true,
        method: "TRE_DØGNMAX_MND",
        days_recorded: 2,
        days_required: 3,
        peaks: [
          { day: "2026-11-01", kw: 4.8 },
          { day: "2026-11-02", kw: 4.8 },
        ],
        coverage: 0.6,
        estimated: false,
        provisional: true,
      },
    },
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
  if (chartsOnly) {
    const midnight = Date.parse("2026-11-01T23:00:00Z");
    const readings = Array.from({ length: 24 }, (_, h) => {
      const kwh = h >= 13 || h === 6 ? null : h === 0 ? 0 : (h + 1) / 10;
      const electricity = kwh === null ? 0 : kwh * 0.8;
      const grid = kwh === null ? 0 : kwh * 0.25;
      const support = kwh === null ? 0 : -kwh * 0.1;
      const vat = (electricity + grid + support) * 0.25;
      return {
        start: new Date(midnight + h * 3600000).toISOString(),
        end: new Date(midnight + (h + 1) * 3600000).toISOString(),
        kwh,
        cost: {
          total: kwh === null ? null : electricity + grid + support + vat,
          parts: { electricity, grid, support, vat },
        },
      };
    });
    const kwh = readings.reduce((n, p) => n + (p.kwh ?? 0), 0);
    const cost = readings.reduce((n, p) => n + (p.cost.total ?? 0), 0);
    Object.assign(meter, {
      points: readings,
      cost_total: null,
      available_cost: cost,
      monthly_fees: null,
      summary: { available_kwh: kwh, complete: false, coverage: 12 / 24 },
    });
    Object.assign(dashboard.totals.today, {
      available_kwh: kwh,
      total_kwh: null,
      cost,
    });
    dashboard.spot = readings
      .filter((_, h) => h !== 2)
      .map((p, h) => ({
        time_start: p.start,
        time_end: p.end,
        NOK_per_kWh: h === 1 ? -0.25 : 0.2 + Math.sin(h / 3) ** 2,
      }));
  }
  if (priceData) Object.assign(dashboard, priceData);
  let historyRequests = 0;
  await page.route("**/api/home/energy/platform/dashboard?*", (route) => {
    historyRequests++;
    const request = new URL(route.request().url());
    const old =
      request.searchParams.get("start") !== "2026-11-02" ||
      request.searchParams.get("end") !== "2026-11-03";
    return route.fulfill({
      json: old
        ? {
            ...dashboard,
            meters: [
              {
                ...meter,
                summary: { ...meter.summary, available_kwh: 123 },
                points: meter.points.map((p) => ({
                  ...p,
                  kwh: p.kwh === null ? null : p.kwh * 2,
                })),
              },
            ],
          }
        : dashboard,
    });
  });
  const layouts: Record<string, SavedGrid> = {
    energy_control: {
      revision: 0,
      items: chartsOnly
        ? ["spot", "today", "today-cost"].map((id, x) => ({
            id: `energy:${id}`,
            x,
            y: 0,
            w: 1,
            h: 2,
          }))
        : null,
    },
  };
  await page.route("**/api/home", async (route) => {
    const response = await route.fetch(),
      home = await response.json();
    await route.fulfill({
      json: {
        ...home,
        connected: true,
        controls: [
          ...home.controls,
          {
            id: "sensor.power",
            entity_id: "sensor.power",
            domain: "sensor",
            name: "House power",
            state: "4200",
            attributes: { device_class: "power", unit_of_measurement: "W" },
            availability: "available",
            diagnostic: false,
            capabilities: [],
            area_id: null,
          },
        ],
      },
    });
  });
  await page.route("**/api/controls/sensor.power/history?hours=1", (route) =>
    route.fulfill({
      json: {
        start: "2026-11-02T11:00:00Z",
        end: "2026-11-02T12:00:00Z",
        unit: "W",
        points: [3000, 3100, null, 3500, 3900, 4200].map((value, i) => ({
          time: new Date(now.getTime() - 3600000 + i * 720000).toISOString(),
          value,
        })),
      },
    }),
  );
  let failSave = false;
  for (const key of Object.keys(layouts))
    await page.route(`**/api/home/layout/${key}*`, (route) => {
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
  await expect(
    page.locator('.home-canvas[data-page="energy_control"]'),
  ).toBeVisible();
  return {
    layouts,
    configWrites: () => configWrites,
    historyRequests: () => historyRequests,
    dashboard,
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
async function expectUnobstructedSceneControls(page: Page) {
  const overlaps = await page
    .locator(".energy-scene-tools button")
    .evaluateAll((buttons) => {
      const labels = [...document.querySelectorAll(".energy-hotspot")].map(
        (node) => node.getBoundingClientRect(),
      );
      return buttons.some((button) => {
        const b = button.getBoundingClientRect();
        return labels.some(
          (a) =>
            a.left < b.right &&
            a.right > b.left &&
            a.top < b.bottom &&
            a.bottom > b.top,
        );
      });
    });
  expect(overlaps, "Rotation buttons must not cover equipment readings").toBe(
    false,
  );
}

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "wait" });
});

test("one energy canvas contains 3D, monthly capacity, tariff, hourly extremes and detailed graphs", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await setup(page);
  const grid = page.locator('.home-canvas[data-page="energy_control"]');
  await expect(
    page.getByRole("tab", { name: "3D-oversikt", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("tab", { name: "Historikk og strømpriser", exact: true }),
  ).toHaveCount(0);
  await expect(grid.locator(".home-canvas-cell")).toHaveCount(10);
  const flow = grid.locator('[data-card="energy:flow"]');
  await expect(flow).toHaveCSS("grid-column-end", "span 2");
  await expect(flow.locator(".energy-scene")).toBeVisible({ timeout: 20000 });
  await expect(flow.locator(".energy-scene")).toHaveCSS("height", "390px");
  await expect(flow.locator(".home-canvas-viewport")).toHaveAttribute(
    "data-overflow",
    "false",
  );
  for (const name of ["capacity", "tariff", "price-hours"])
    await expect(
      grid.locator(`[data-card="energy:${name}"] .home-canvas-viewport`),
    ).toHaveAttribute("data-overflow", "false");
  await expect(grid.locator('[data-card="energy:capacity"]')).toContainText(
    "2–5 kW",
  );
  await expect(grid.locator('[data-card="energy:capacity"]')).toContainText(
    "250",
  );
  await expect(grid.locator('[data-card="energy:capacity"]')).toContainText(
    "2 av 3 måledøgn",
  );
  await expect(grid.locator('[data-card="energy:tariff"]')).toContainText(
    "Elvia AS",
  );
  await expect(grid.locator('[data-card="energy:tariff"]')).toContainText(
    "20 øre/kWh",
  );
  await expect(grid.locator('[data-card="energy:price-hours"]')).toContainText(
    "Billigste time",
  );
  await expect(grid.locator('[data-card="energy:price-hours"]')).toContainText(
    "Dyreste time",
  );
  await expect(
    grid.locator('[data-card="energy:history"] .ep-chart'),
  ).toBeVisible();
  await expect(grid.locator('[data-card="energy:prices"]')).toBeVisible();
  await flow.getByRole("button", { name: "Pause", exact: true }).click();
  await flow
    .getByRole("button", { name: "Drei huset mot venstre", exact: true })
    .click();
  await expectUnobstructedSceneControls(page);
  await page.screenshot({
    path: `/private/tmp/smarti-100-energy-dark-${info.project.name}.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
  await page.screenshot({
    path: `/private/tmp/smarti-100-energy-light-${info.project.name}.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 834, height: 1100 });
  await expect(flow.locator(".home-canvas-viewport")).toHaveAttribute(
    "data-overflow",
    "false",
  );
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
});

test("history filters do not change today's summaries or remount the energy house", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const state = await setup(page);
  const grid = page.locator('.home-canvas[data-page="energy_control"]');
  const canvas = grid.locator("canvas");
  await expect(canvas).toBeVisible({ timeout: 20000 });
  await canvas.evaluate((node) => (node.dataset.retained = "yes"));
  await page.getByRole("button", { name: "Uke", exact: true }).click();
  await expect(grid.locator('[data-card="energy:consumption"]')).toHaveCount(0);
  await expect(grid.locator('[data-card="energy:history"]')).toContainText(
    "42,3 kWh",
  );
  await expect(grid.locator('[data-card="energy:today"]')).toContainText(
    "18,4",
  );
  await expect(grid.locator('[data-card="energy:capacity"]')).toContainText(
    "2–5 kW",
  );
  await expect(canvas).toHaveAttribute("data-retained", "yes");
  await grid
    .locator('[data-card="energy:today"] .energy-summary-reading')
    .click();
  await expect(
    page.getByRole("button", { name: "Uke", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(canvas).toHaveAttribute("data-retained", "yes");
  expect(state.configWrites()).toBe(0);
  await page
    .getByRole("button", { name: "Energiinnstillinger", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("the unified layout saves sizes, removals and additions without changing energy setup", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const state = await setup(page);
  const grid = page.locator('.home-canvas[data-page="energy_control"]');
  await expect(grid.locator(".home-canvas-cell")).toHaveCount(10);
  await edit(page);
  const flow = grid.locator('[data-card="energy:flow"]');
  await flow.getByRole("combobox", { name: /bredde/ }).selectOption("3");
  await grid
    .getByRole("button", { name: "Fjern Nettleie nå", exact: true })
    .click();
  state.failSave(true);
  await grid.getByRole("button", { name: "Lagre", exact: true }).click();
  await expect(
    grid.getByRole("button", { name: "Lagre", exact: true }),
  ).toBeVisible();
  state.failSave(false);
  await grid.getByRole("button", { name: "Lagre", exact: true }).click();
  expect(
    state.layouts.energy_control.items?.find((i) => i.id === "energy:flow")?.w,
  ).toBe(3);
  await page.reload();
  await page.getByRole("tab", { name: "Energi", exact: true }).click();
  await expect(flow).toHaveCSS("grid-column-end", "span 3");
  await expect(grid.locator('[data-card="energy:tariff"]')).toHaveCount(0);
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
    .getByRole("button", { name: "Nettleie nå", exact: true })
    .click();
  await picker
    .getByRole("button", { name: "Legg til kort", exact: true })
    .click();
  await grid.getByRole("button", { name: "Lagre", exact: true }).click();
  await expect(grid.locator('[data-card="energy:tariff"]')).toBeVisible();
  expect(state.configWrites()).toBe(0);
});

test("summary charts preserve negative prices, missing consumption and signed cost parts", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await setup(page, false, true);
  const grid = page.locator('.home-canvas[data-page="energy_control"]');
  const spot = grid.locator('[data-card="energy:spot"]');
  const energy = grid.locator('[data-card="energy:today"]');
  const cost = grid.locator('[data-card="energy:today-cost"]');
  await expect(grid.locator(".energy-summary")).toHaveCount(3);
  for (const card of [spot, energy, cost])
    await expect(card.locator(".home-canvas-viewport")).toHaveAttribute(
      "data-overflow",
      "false",
    );
  await expect(spot.locator(".energy-summary-chart")).toHaveAttribute(
    "tabindex",
    "0",
  );
  await spot.locator(".energy-summary-chart").scrollIntoViewIfNeeded();
  await spot.locator(".energy-summary-chart").focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await expect(spot.getByRole("status")).toContainText(/[-−]25 øre\/kWh/);
  await energy.locator(".energy-summary-chart").focus();
  await page.keyboard.press("Home");
  await expect(energy.getByRole("status")).toContainText("0 kWh");
  for (let n = 0; n < 6; n++) await page.keyboard.press("ArrowRight");
  await expect(energy.getByRole("status")).toContainText("Ingen måling");
  await cost.locator(".energy-summary-chart").focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await expect(cost.getByRole("status")).toContainText(
    /Strøm.*Nettleie.*Avgifter.*Støtte/,
  );
  await grid.screenshot({
    path: `/private/tmp/smarti-100-summary-${info.project.name}.png`,
  });
});

test("compact phone tiles show KPIs and only mount the opened house or graph", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, true);
  const grid = page.locator('.home-canvas[data-page="energy_control"]');
  await expect(grid.locator(".home-canvas-cell")).toHaveCount(5);
  await expect(grid.locator(".phone-energy-power")).toBeVisible();
  await expect(
    grid.locator(".phone-power-history .measured-chart svg"),
  ).toBeVisible();
  await page.screenshot({
    path: `/private/tmp/smarti-102-energy-${info.project.name}.png`,
    fullPage: true,
    animations: "disabled",
  });
  await expect(
    grid.locator(".phone-energy-consumption .energy-summary-chart"),
  ).toBeVisible();
  await expect(grid.locator('[data-card="energy:capacity"]')).toContainText(
    "2–5 kW",
  );
  await expect(page.locator(".energy-scene")).toHaveCount(0);
  await expect(page.locator(".ep-chart")).toHaveCount(0);
  await grid.getByRole("button", { name: "Energiflyt", exact: true }).click();
  await expect(page.locator(".energy-scene")).toBeVisible({ timeout: 20000 });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Lukk innstillinger", exact: true })
    .click();
  await expect(page.locator(".energy-scene")).toHaveCount(0);
  await grid.getByRole("button", { name: /Flere energikort/ }).click();
  await grid
    .locator('[data-card="energy:price-hours"] .mobile-card-tile')
    .click();
  await expect(page.getByRole("dialog")).toContainText("Billigste time");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Lukk innstillinger", exact: true })
    .click();
  await grid
    .getByRole("button", { name: "Åpne forbruksdetaljer", exact: true })
    .click();
  await expect(page.getByRole("dialog").locator(".ep-chart")).toBeVisible();
  expect(
    await page
      .getByRole("dialog")
      .evaluate((node) => node.scrollWidth - node.clientWidth),
  ).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: `/private/tmp/smarti-100-phone-${info.project.name}.png`,
  });
});

const priceRows = (values: number[], dayOffset = 0): SummaryPrice[] =>
  Array.from({ length: 24 }, (_, hour) => ({
    time_start: new Date(
      Date.UTC(2026, 10, 1 + dayOffset, 23 + hour),
    ).toISOString(),
    time_end: new Date(
      Date.UTC(2026, 10, 1 + dayOffset, 24 + hour),
    ).toISOString(),
    NOK_per_kWh: values[hour % values.length],
  }));

async function openPriceChart(page: Page) {
  const grid = page.locator('.home-canvas[data-page="energy_control"]');
  await expect(grid.locator(".home-canvas-cell").first()).toBeVisible();
  const more = grid.getByRole("button", { name: /Flere energikort/ });
  if (
    (await more.isVisible()) &&
    (await grid.locator('[data-card="energy:prices"]').count()) === 0
  )
    await more.click();
  const card = grid.locator('[data-card="energy:prices"]');
  await card.scrollIntoViewIfNeeded();
  const tile = card.locator(".mobile-card-tile");
  if (await tile.isVisible()) await tile.click();
  else {
    const expand = card.locator(".home-canvas-expand");
    if (await expand.isVisible()) await expand.click();
  }
  return (await page.getByRole("dialog").isVisible())
    ? page.getByRole("dialog").locator(".ep-spot-chart")
    : card.locator(".ep-spot-chart");
}

test("price columns show relative cost levels consistently across both days and themes", async ({
  page,
}, info) => {
  if (info.project.name === "desktop")
    await page.setViewportSize({ width: 1440, height: 1000 });
  const state = await setup(page, false, false, {
    spot: priceRows([-0.2, 0, 0.4, 0.9, 1.4, 2]),
    tomorrow: priceRows([0.4, 0.9, 1.4, 2], 1),
  });
  let panel = await openPriceChart(page);
  await panel.scrollIntoViewIfNeeded();
  const bars = panel.locator(".ep-price-column");
  await expect(bars).toHaveCount(24);
  expect(
    new Set(
      await bars.evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute("data-price-level")),
      ),
    ),
  ).toEqual(new Set(["low", "medium", "high", "peak"]));
  await expect(bars.nth(0)).toHaveAttribute("data-price-level", "low");
  await expect(bars.nth(1)).toHaveAttribute("data-price-level", "low");
  await expect(panel.locator(".ep-price-legend")).toContainText(
    "Samme skala for i dag og i morgen",
  );
  const samePriceLevel = await bars.nth(3).getAttribute("data-price-level");
  await panel.locator(".ep-chart-hit").first().focus();
  await expect(panel.locator(".ep-chart-detail")).toContainText(
    "Negativ spotpris",
  );
  await panel.locator(".ep-chart-hit").nth(5).focus();
  await expect(panel.locator(".ep-chart-detail")).toContainText("Høyest pris");
  await expect(panel.locator(".ep-chart-hit").nth(5)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(panel.locator(".ep-now-marker")).toHaveCount(1);
  await panel.getByRole("button", { name: "I morgen", exact: true }).click();
  await expect(bars.nth(1)).toHaveAttribute(
    "data-price-level",
    samePriceLevel!,
  );
  await expect(panel.locator(".ep-now-marker")).toHaveCount(0);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (t) => (document.documentElement.dataset.theme = t),
      theme,
    );
    await page.waitForTimeout(250);
    expect(
      new Set(
        await panel
          .locator(".ep-price-bar")
          .evaluateAll((nodes) => nodes.map((n) => getComputedStyle(n).fill)),
      ).size,
    ).toBe(4);
    await panel.scrollIntoViewIfNeeded();
    await panel.screenshot({
      path: info.outputPath(`price-colors-${theme}.png`),
      animations: "disabled",
    });
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  expect(state.configWrites()).toBe(0);
});

test("flat positive prices stay neutral and an all-negative day stays green", async ({
  page,
}) => {
  const state = await setup(page, false, false, {
    spot: priceRows([1.5]),
    tomorrow: priceRows([1.5], 1),
  });
  let panel = await openPriceChart(page);
  await expect(
    panel.locator('.ep-price-column[data-price-level="steady"]'),
  ).toHaveCount(24);
  await expect(panel.locator(".ep-price-legend")).toContainText("Jevn pris");
  Object.assign(state.dashboard, {
    spot: priceRows([-0.3, -0.2, -0.1]),
    tomorrow: null,
  });
  await page.reload();
  await page.getByRole("tab", { name: "Energi", exact: true }).click();
  panel = await openPriceChart(page);
  await expect(
    panel.locator('.ep-price-column[data-price-level="low"]'),
  ).toHaveCount(24);
  await panel.scrollIntoViewIfNeeded();
  await panel.locator(".ep-chart-hit").first().focus();
  await expect(panel.locator(".ep-chart-detail")).toContainText(
    "Negativ spotpris",
  );
  expect(state.configWrites()).toBe(0);
});
