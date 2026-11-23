import { test, expect } from "../../frontend/node_modules/@playwright/test";
import { openDeviceOverview } from "./deviceNavigation";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/home/experience", (route) =>
    route.fulfill({ json: { mode: "advanced" } }),
  );
});

test("device history reads the full selected period up to thirty days", async ({
  page,
}) => {
  const end = new Date("2026-11-22T12:00:00Z");
  const day = 24 * 3600000;
  const startOf = (hours: number) => new Date(end.getTime() - hours * 3600000);
  const dateLabel = (date: Date) =>
    date.toLocaleDateString("nb-NO", { day: "numeric", month: "short" });
  await page.route(
    "**/api/controls/sensor.bedroom_temperature/history?*",
    (route) => {
      const hours = Number(
        new URL(route.request().url()).searchParams.get("hours"),
      );
      const start = startOf(hours);
      const first = hours === 720 ? new Date(start.getTime() + 4 * day) : start;
      const point = (time: Date, value: number) => ({
        time: time.toISOString(),
        state: String(value),
        value,
      });
      return route.fulfill({
        json: {
          start: start.toISOString(),
          end: end.toISOString(),
          coverage_start: first.toISOString(),
          source: hours === 720 ? "mixed" : "recorder",
          unit: "°C",
          samples: 3,
          minimum: 15,
          maximum: 21,
          points: [
            point(first, 15),
            point(new Date((first.getTime() + end.getTime()) / 2), 18),
            point(end, 21),
          ],
        },
      });
    },
  );
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Hovedmeny" })
    .getByRole("button", { name: "Enheter", exact: true })
    .click();
  await openDeviceOverview(page, "climate");
  await page
    .getByRole("button", { name: "Snittemperatur", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Åpne Temperatur", exact: true })
    .click();

  const history = page.getByRole("region", { name: "Enhetshistorikk" });
  const period = history.getByRole("combobox", { name: "Tidsrom" });
  const chart = history.getByRole("img", { name: /Målt spenn/ });
  const axis = history.locator(".measured-chart-times span");
  const reading = history.locator(".control-history-reading strong");

  for (const hours of [168, 720]) {
    const response = page.waitForResponse((response) =>
      response.url().includes(`/history?hours=${hours}`),
    );
    await period.selectOption(String(hours));
    expect((await response).ok()).toBe(true);
    await expect(axis.first()).toHaveText(dateLabel(startOf(hours)));
    await expect(axis.last()).toHaveText(dateLabel(end));
    await chart.focus();
    await page.keyboard.press("Home");
    await expect(reading).toHaveText("15 °C");
    await page.keyboard.press("End");
    await expect(reading).toHaveText("21 °C");
  }

  await expect(history).toContainText("Historikk tilgjengelig fra");
  await expect(history).toContainText(
    "Eldre målinger vises som timestatistikk.",
  );
  await chart.hover({ position: { x: 10, y: 15 } });
  await expect(reading).toHaveText("Måling mangler");
});

test("history sources, dates, chart inspection, house log and mobile logout", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  const navigation = page.getByRole("navigation", {
    name: "Hovedmeny",
    exact: true,
  });
  await expect(navigation).toBeVisible();
  const home = await (await page.request.get("/api/home")).json();
  const c = home.controls.find((c: any) => c.domain === "sensor");
  await page.route("**/api/history/states?*", (route) => {
    const p = new URL(route.request().url()).searchParams;
    return route.fulfill({
      json: {
        series: [
          {
            entity_id: c.entity_id,
            start: p.get("start"),
            end: p.get("end"),
            unit: "°C",
            minimum: 20,
            maximum: 22,
            samples: 2,
            truncated: false,
            points: [
              { time: p.get("start"), state: "20", value: 20 },
              { time: p.get("end"), state: "22", value: 22 },
            ],
          },
        ],
      },
    });
  });
  await page.route("**/api/history/activity?*", (route) =>
    route.fulfill({
      json: {
        entries: [
          {
            when: new Date().toISOString(),
            name: "Stuelampe",
            entity_id: "light.living_pendant",
            state: "on",
            message: "Slått på",
            context_name: "Kveldslys",
          },
        ],
        truncated: false,
      },
    }),
  );
  await expect(
    navigation.getByRole("button", { name: "Historikk", exact: true }),
  ).toHaveCount(0);
  await navigation
    .getByRole("button", { name: "Rapporter og innsikt", exact: true })
    .click();
  await expect(page.locator(".report-tabs").getByRole("tab")).toHaveCount(4);
  await page
    .getByRole("tab", { name: "Grafer og historikk", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Grafer og historikk",
      exact: true,
      level: 2,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Hva vil du se historikken til?" }),
  ).toBeVisible();
  if (!(await page.locator("#history-sources").isVisible()))
    await page.getByRole("button", { name: "Velg kilder" }).click();
  await page.getByRole("checkbox", { name: new RegExp(c.name) }).check();
  if (
    await page
      .getByRole("button", { name: "Vis resultat", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Vis resultat", exact: true })
      .click();
  await expect(page.locator(".history-series")).toHaveCount(1);
  await expect(page.locator(".history-series svg")).toBeVisible();
  await page.locator(".history-series svg").focus();
  await page.keyboard.press("Home");
  await expect(page.locator(".control-history-reading strong")).toContainText(
    "20",
  );
  await page.keyboard.press("End");
  await expect(page.locator(".control-history-reading strong")).toContainText(
    "22",
  );
  await page.getByRole("button", { name: "Forrige tidsrom" }).click();
  await expect(page.locator(".history-series")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `/tmp/smarti-history-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Huslogg", exact: true }).click();
  await expect(page.locator(".house-log")).toContainText("Kveldslys");
  await expect(page.locator(".house-log")).toContainText("Slått på");
  await page.screenshot({
    path: `/tmp/smarti-logbook-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Innstillinger", exact: true })
    .first()
    .click();
  await page
    .locator("main")
    .getByRole("button", { name: "Logg ut", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Logg inn", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Logg inn", exact: true }),
  ).toBeVisible();
});
