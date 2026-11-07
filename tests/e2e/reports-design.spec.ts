import {
  test,
  expect,
  type Page,
  type Download,
} from "../../frontend/node_modules/@playwright/test";

test.use({ timezoneId: "Europe/Oslo" });
test.afterEach(async ({ page }) => page.unrouteAll({ behavior: "wait" }));
async function downloadText(download: Download) {
  const stream = await download.createReadStream();
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of stream!)
    text += decoder.decode(chunk, { stream: true });
  return text + decoder.decode();
}

const reading = (
  entity_id: string,
  name: string,
  unit: string,
  changes: Record<string, unknown> = {},
) => ({
  entity_id,
  name,
  unit,
  samples: 40,
  known_hours: 24,
  unknown_hours: 0,
  coverage: 1,
  active_hours: null,
  activations: 0,
  minimum: null,
  maximum: null,
  average: null,
  ...changes,
});
const group = (items: any[]) => ({
  items,
  total: items.length,
  limit: 24,
  unavailable: false,
});
function fixture() {
  return {
    statistics: {
      people: group([
        reading("person.alex", "Alex", "", {
          active_hours: 16,
          activations: 2,
        }),
      ]),
      lights: group([
        reading("light.living_pendant", "=SUM(1,1)", "", {
          active_hours: 7.5,
          activations: 2,
        }),
        reading("light.kitchen", "Kjøkken", "", { active_hours: 0 }),
      ]),
      temperatures: group([
        reading("sensor.zero", "Nullpunkt", "°C", {
          minimum: 0,
          maximum: 0,
          average: 0,
        }),
        reading("sensor.living", "Stue", "°C", {
          minimum: 18,
          maximum: 22,
          average: 20,
        }),
        reading("sensor.fahrenheit", "Annen måleenhet", "°F", {
          minimum: 68,
          maximum: 80,
          average: 72,
        }),
      ]),
      humidity: group([
        reading("sensor.dry", "Fuktighet null", "%", {
          minimum: 0,
          maximum: 0,
          average: 0,
        }),
      ]),
    },
    events: 1200,
    analyzed_events: 1000,
    truncated: true,
    active_entities: 6,
    alarm_events: 2,
    unavailable_events: 3,
    categories: { Lys: 600, Klima: 300, Sikkerhet: 100 },
    daily: { "2026-10-20": 500, "2026-10-21": 300, "2026-10-22": 200 },
    top_entities: [{ name: "Stuelampe", count: 400 }],
    temperatures: [],
    temperature_sensor_count: 3,
    climate_unavailable: false,
  };
}
function energyFixture() {
  return {
    configured: true,
    price_area: "NO2",
    history_estimated: false,
    previous: { kwh: 20, cost: 30 },
    meters: [
      {
        role: "grid",
        name: "Hjemmet",
        summary: { available_kwh: 4, complete: false, coverage: 0.75 },
        cost_total: null,
        available_cost: 10,
        monthly_fees: null,
        available_cost_note: "Registrert forbruk · uten faste beløp.",
        breakdown: { electricity: 10, grid: 3, support: -5, vat: 2 },
        points: [1, 0, null, 3].map((kwh, i) => ({
          start: `2026-10-20T0${i}:00:00Z`,
          end: `2026-10-20T0${i + 1}:00:00Z`,
          kwh,
          partial: i === 3,
          cost: { total: [-1, 0, null, 11][i] },
        })),
      },
      {
        role: "ev",
        name: "Lading",
        summary: { available_kwh: 2, complete: true, coverage: 1 },
        points: [],
        cost_total: null,
      },
    ],
    period_prices: [-0.2, 0, 0.5, 1].map((price, i) => ({
      time_start: `2026-10-20T0${i}:00:00Z`,
      time_end: `2026-10-20T0${i + 1}:00:00Z`,
      NOK_per_kWh: price,
    })),
    solar: {
      production: 0,
      export: 0,
      self_consumption: null,
      note: "Egenforbruk mangler.",
    },
  };
}
async function setup(page: Page, language = "nb") {
  const state = {
    house: fixture(),
    energy: energyFixture() as any,
    failHouse: false,
    failEnergy: false,
  };
  const urls: string[] = [],
    writes: string[] = [];
  await page.route("**/api/home/language", (route) =>
    route.fulfill({ json: { language } }),
  );
  await page.route("**/api/history/report?*", (route) =>
    state.failHouse
      ? route.fulfill({ status: 503, json: { detail: "unavailable" } })
      : route.fulfill({ json: state.house }),
  );
  await page.route("**/api/home/energy/platform/dashboard?*", (route) => {
    urls.push(route.request().url());
    return state.failEnergy
      ? route.fulfill({ status: 503, json: { detail: "unavailable" } })
      : route.fulfill({ json: state.energy });
  });
  await page.route("**/api/history/activity?*", (route) =>
    route.fulfill({ json: { entries: [], total: 0, truncated: false } }),
  );
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page
    .getByRole("button", {
      name: language === "en" ? "Reports and insights" : "Rapporter og innsikt",
      exact: true,
    })
    .click();
  page.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method())) writes.push(request.url());
  });
  return { state, urls, writes };
}
async function generateHome(page: Page) {
  await page.getByLabel("Fra", { exact: true }).fill("2026-10-20T10:00");
  await page.getByLabel("Til", { exact: true }).fill("2026-10-23T00:00");
  await page
    .getByRole("button", { name: "Generer hjemmerapport", exact: true })
    .click();
  const report = page.getByRole("article", {
    name: "Rapport for hele hjemmet",
    exact: true,
  });
  await expect(report).toBeVisible();
  return report;
}

test("home report has real findings, unit-safe ranges, zero readings and responsive visual summaries", async ({
  page,
}, info) => {
  const { urls, writes } = await setup(page);
  const report = await generateHome(page);
  expect(
    urls.some((url) => url.includes("start=2026-10-20&end=2026-10-23")),
  ).toBe(true);
  await expect(report.locator(".report-finding-grid")).toContainText(
    "7 t 30 min",
  );
  await expect(report.locator(".report-finding-grid")).toContainText("4 °C");
  await expect(
    report.getByRole("region", { name: "Temperaturstatistikk", exact: true }),
  ).toContainText("0 °C");
  await expect(
    report.getByRole("region", { name: "Luftfuktighet", exact: true }),
  ).toContainText("0 %");
  await expect(
    report.getByRole("region", { name: "Lysstatistikk", exact: true }),
  ).toContainText("0 t 0 min");
  const activity = report.getByRole("group", { name: "Daglig aktivitet" });
  await activity.getByRole("button").nth(1).click();
  await expect(report.locator(".report-day-chart [role=status]")).toContainText(
    "300",
  );
  for (const width of info.project.name === "desktop"
    ? [1440, 820]
    : [390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      expect(
        await report
          .locator(".ep-chart-scroll")
          .evaluate((chart) => chart.scrollWidth <= chart.clientWidth + 1),
      ).toBe(true);
      await report.locator(".er-document-head").scrollIntoViewIfNeeded();
      await page.screenshot({
        animations: "disabled",
        path: info.outputPath(`home-${width}-${theme}.png`),
      });
    }
  }
  expect(writes).toHaveLength(0);
});

test("reports export safe raw CSV and print the full document with calculation notes", async ({
  page,
}, info) => {
  const { writes } = await setup(page);
  const report = await generateHome(page);
  const download = page.waitForEvent("download");
  await report
    .getByRole("button", { name: "Last ned CSV", exact: true })
    .click();
  const csv = await downloadText(await download);
  expect(csv).toContain('"\'=SUM(1,1)","light.living_pendant"');
  expect(csv).toContain('"Nullpunkt"');
  expect(csv).not.toContain("NaN");
  const method = report.locator(".report-method");
  await expect(method).not.toHaveAttribute("open", "");
  await page.evaluate(() => {
    window.print = () => {
      (window as any).notesWereOpen = !!document.querySelector(
        ".report-method[open]",
      );
      window.dispatchEvent(new Event("afterprint"));
    };
  });
  await report
    .getByRole("button", { name: "Skriv ut / lagre PDF", exact: true })
    .click();
  expect(await page.evaluate(() => (window as any).notesWereOpen)).toBe(true);
  await expect(page.locator("body")).not.toHaveClass(/printing-energy-report/);
  await expect(method).not.toHaveAttribute("open", "");
  await page.evaluate(() => {
    document.body.classList.add("printing-energy-report");
    document
      .querySelectorAll<HTMLDetailsElement>(".er-document details")
      .forEach((d) => (d.open = true));
  });
  await page.emulateMedia({ media: "print" });
  await expect(
    page.getByRole("button", { name: "Generer hjemmerapport" }),
  ).toBeHidden();
  await expect(
    report.getByRole("region", { name: "Temperaturstatistikk" }),
  ).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: info.outputPath("home-print.png"),
    fullPage: true,
  });
  if (info.project.name === "desktop")
    await page.pdf({
      path: info.outputPath("home.pdf"),
      format: "A4",
      printBackground: true,
      margin: { top: "14mm", bottom: "14mm", left: "12mm", right: "12mm" },
    });
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() =>
    document.body.classList.remove("printing-energy-report"),
  );
  expect(writes).toHaveLength(0);
});

test("energy report switches between consumption and negative costs, preserves gaps, and exports the readings", async ({
  page,
}, info) => {
  const { writes } = await setup(page);
  await page.getByRole("tab", { name: "Energirapport", exact: true }).click();
  await page.getByLabel("Fra og med").fill("2026-10-20");
  await page.getByLabel("Til og med").fill("2026-10-22");
  await page
    .getByRole("button", { name: "Generer rapport", exact: true })
    .click();
  const report = page.getByRole("article", {
    name: "Energirapport",
    exact: true,
  });
  await expect(report).toContainText("75 % datadekning");
  await expect(report).toContainText("−20");
  await report.getByRole("button", { name: "Kostnad", exact: true }).click();
  const chart = report.getByRole("group", {
    name: "Kostnadsgraf",
    exact: true,
  });
  await chart.getByRole("button").first().click();
  await expect(report.locator(".ep-chart-detail")).toContainText("−1 kr");
  await chart.getByRole("button").first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(report.locator(".ep-chart-detail")).toContainText("0 kr");
  await chart.getByRole("button").nth(2).click();
  await expect(report.locator(".ep-chart-detail")).toContainText(
    "Kostnad mangler",
  );
  const download = page.waitForEvent("download");
  await report
    .getByRole("button", { name: "Last ned CSV", exact: true })
    .click();
  const csv = await downloadText(await download);
  expect(csv).toContain('"0","0"');
  expect(csv).toContain('"1","-1"');
  await report.getByRole("button", { name: "Forbruk", exact: true }).click();
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (theme) => (document.documentElement.dataset.theme = theme),
      theme,
    );
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath(`energy-${theme}.png`),
      fullPage: true,
    });
    await report.locator(".er-chart").screenshot({
      animations: "disabled",
      path: info.outputPath(`energy-chart-${theme}.png`),
    });
  }
  if (info.project.name === "desktop") {
    await page.evaluate(() =>
      document.body.classList.add("printing-energy-report"),
    );
    await page.emulateMedia({ media: "print" });
    await page.pdf({
      path: info.outputPath("energy.pdf"),
      format: "A4",
      printBackground: true,
      margin: { top: "14mm", bottom: "14mm", left: "12mm", right: "12mm" },
    });
    await page.emulateMedia({ media: "screen" });
    await page.evaluate(() =>
      document.body.classList.remove("printing-energy-report"),
    );
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  expect(writes).toHaveLength(0);
});

test("report failures can retry and absent energy or history stays empty rather than becoming zero", async ({
  page,
}) => {
  const { state, writes } = await setup(page);
  state.failHouse = true;
  await page
    .getByRole("button", { name: "Generer hjemmerapport", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Rapporten kunne ikke hentes",
  );
  state.failHouse = false;
  state.energy = { configured: false };
  state.house.statistics = {
    people: group([]),
    lights: group([]),
    temperatures: group([]),
    humidity: group([]),
  };
  await page.getByRole("button", { name: "Prøv igjen", exact: true }).click();
  const report = page.getByRole("article", {
    name: "Rapport for hele hjemmet",
    exact: true,
  });
  await expect(report).toContainText("Ingen kilder konfigurert");
  await expect(report.locator(".report-finding-grid")).not.toContainText("0 t");
  await page.getByRole("tab", { name: "Energirapport", exact: true }).click();
  await page
    .getByRole("button", { name: "Generer rapport", exact: true })
    .click();
  await expect(
    page.getByRole("article", { name: "Energirapport", exact: true }),
  ).toContainText("Ingen forbruksmålinger");
  expect(writes).toHaveLength(0);
});

test("English report navigation is keyboard accessible and invalid periods never request reports", async ({
  page,
}) => {
  const { urls, writes } = await setup(page, "en");
  const home = page.getByRole("tab", { name: "Home report", exact: true });
  await home.focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Energy report", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByLabel("From", { exact: true }).fill("2024-01-01");
  await expect(
    page.getByRole("button", { name: "Generate report", exact: true }),
  ).toBeDisabled();
  expect(urls).toHaveLength(0);
  await page.getByRole("button", { name: "Last 7 days", exact: true }).click();
  await page
    .getByRole("button", { name: "Generate report", exact: true })
    .click();
  await expect(
    page.getByRole("article", { name: "Energy report", exact: true }),
  ).toContainText("data coverage");
  await page.getByRole("tab", { name: "Energy report", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("heading", { name: "Activity", exact: true }),
  ).toBeVisible();
  expect(writes).toHaveLength(0);
});
