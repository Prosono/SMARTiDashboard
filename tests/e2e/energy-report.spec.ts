import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("energy report validates dates, preserves missing data and prints on desktop and mobile", async ({
  page,
}, info) => {
  await page.clock.setFixedTime(new Date("2026-10-24T12:00:00Z"));
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
        companies: [],
        sensors: [],
      },
    }),
  );
  let empty = false;
  const urls: string[] = [];
  await page.route("**/api/home/energy/platform/dashboard?*", (r) => {
    urls.push(r.request().url());
    return r.fulfill({
      json: {
        configured: true,
        price_area: "NO2",
        meters: [
          {
            role: "grid",
            name: "Hjemmet",
            summary: {
              available_kwh: empty ? null : 24,
              complete: false,
              coverage: 0.75,
            },
            cost_total: null,
            available_cost: empty ? null : 32.4,
            available_cost_note:
              "Registrert forbruk uten faste beløp. Månedshistorikken er ufullstendig.",
            points: empty
              ? []
              : [12, 0, null, 12].map((kwh, i) => ({
                  start: `2026-10-20T0${i}:00:00Z`,
                  end: `2026-10-20T0${i + 1}:00:00Z`,
                  kwh,
                  cost: { total: kwh === null ? null : kwh },
                })),
          },
        ],
        previous: { kwh: 20 },
        period_prices: [
          {
            time_start: "2026-10-20T00:00:00Z",
            time_end: "2026-10-20T01:00:00Z",
            NOK_per_kWh: -0.1,
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
  await page.getByRole("tab", { name: "Energi", exact: true }).click();
  await page.getByRole("tab", { name: "Rapporter og innsikt" }).click();
  await expect(
    page.getByRole("heading", { name: "Ditt hjem. Dine tall." }),
  ).toBeVisible();
  await page.getByLabel("Fra og med").fill("2026-10-20");
  await page.getByLabel("Til og med").fill("2026-10-22");
  await page.getByRole("button", { name: "Generer rapport" }).click();
  const report = page.getByRole("article", { name: "Energirapport" });
  await expect(report).toBeVisible();
  expect(
    urls.some((u) => u.includes("start=2026-10-20&end=2026-10-23&report=true")),
  ).toBe(true);
  await expect(report).toContainText("75 % datadekning");
  await expect(report).toContainText("32,4");
  await expect(report).toContainText(
    "Krever komplette målinger i begge perioder",
  );
  await expect(report).toContainText("−10");
  const chart = report.getByRole("group", { name: "Forbruksgraf" });
  await chart.getByRole("button").nth(1).click();
  await expect(report.locator(".ep-chart-detail")).toContainText("0 kWh");
  await expect(chart.getByRole("button").nth(2)).toHaveAccessibleName(
    /Måling mangler/,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `/tmp/smarti-report-${info.project.name}.png`,
    fullPage: true,
  });
  await page.evaluate(() =>
    document.body.classList.add("printing-energy-report"),
  );
  await page.emulateMedia({ media: "print" });
  await expect(
    page.getByRole("button", { name: "Generer rapport" }),
  ).not.toBeVisible();
  await expect(
    report.getByRole("heading", { name: "Forbruk gjennom perioden" }),
  ).toBeVisible();
  await page.screenshot({
    path: `/tmp/smarti-report-print-${info.project.name}.png`,
    fullPage: true,
  });
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() =>
    document.body.classList.remove("printing-energy-report"),
  );
  await page.evaluate(() => {
    window.print = () => {
      window.dispatchEvent(new Event("afterprint"));
    };
  });
  await report.getByRole("button", { name: "Skriv ut / lagre PDF" }).click();
  await expect(page.locator("body")).not.toHaveClass(/printing-energy-report/);
  await page.getByLabel("Fra og med").fill("2024-01-01");
  await expect(
    page.getByRole("button", { name: "Generer rapport" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Siste 7 dager" }).click();
  empty = true;
  await page.getByRole("button", { name: "Generer rapport" }).click();
  await expect(
    report.getByRole("heading", { name: "Ingen forbruksmålinger i perioden" }),
  ).toBeVisible();
});
