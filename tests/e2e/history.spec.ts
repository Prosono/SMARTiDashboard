import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("history sources, dates, chart inspection, house log and mobile logout", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(page.locator(".home-welcome")).toBeVisible();
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
  await page.getByRole("button", { name: "Historikk", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Hva vil du se historikken til?" }),
  ).toBeVisible();
  if (!(await page.locator("#history-sources").isVisible()))
    await page.getByRole("button", { name: "Velg kilder" }).click();
  await page.getByRole("checkbox", { name: new RegExp(c.name) }).check();
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
  await page
    .getByRole("button", { name: "Rapporter og innsikt", exact: true })
    .click();
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
