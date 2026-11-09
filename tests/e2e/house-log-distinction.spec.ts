import {
  test,
  expect,
  type Page,
} from "../../frontend/node_modules/@playwright/test";
import type { Control, Home } from "../../frontend/src/types";
import type { HouseLogEntry } from "../../frontend/src/houseLogModel";

async function openReports(page: Page) {
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  const nav = page.getByRole("navigation", { name: "Hovedmeny", exact: true });
  await expect(nav).toBeVisible();
  const home: Home = await (await page.request.get("/api/home")).json();
  const base = home.controls[0];
  const light: Control = {
    ...base,
    entity_id: "light.log_lamp",
    domain: "light",
    name: "Leselampe",
    area_id: home.areas[0].area_id,
    attributes: {},
    state: "on",
  };
  const door: Control = {
    ...base,
    entity_id: "binary_sensor.log_door",
    domain: "binary_sensor",
    name: "Entrédør",
    area_id: home.areas[1].area_id,
    attributes: { device_class: "door" },
    state: "off",
  };
  await page.route("**/api/history/entities", (route) =>
    route.fulfill({ json: [light, door] }),
  );
  await nav
    .getByRole("button", { name: "Rapporter og innsikt", exact: true })
    .click();
  return { home, light, door };
}

const event = (
  entity: Control,
  patch: Partial<HouseLogEntry> = {},
): HouseLogEntry => ({
  when: new Date(Date.now() - 3600000).toISOString(),
  entity_id: entity.entity_id,
  name: entity.name,
  state: "on",
  message: null,
  context_name: null,
  context_entity_id: null,
  ...patch,
});

test("activity searches recorded events; chart handoff keeps its device and time range", async ({
  page,
}, info) => {
  const { home, light, door } = await openReports(page);
  const rows = [
    event(door, { state: "off" }),
    event(light, {
      message: "Lysstyrke endret til 50 %",
      context_name: "Kveldslys",
      when: new Date(Date.now() - 1800000).toISOString(),
    }),
    event(light, {
      entity_id: "removed.entity",
      name: "Tidligere enhet",
      message: "Opprinnelig melding",
    }),
  ];
  let logParams = new URLSearchParams(),
    chartParams = new URLSearchParams();
  const writes: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() !== "GET" &&
      /\/api\/(history|controls\/.*\/commands)/.test(request.url())
    )
      writes.push(request.url());
  });
  await page.route("**/api/history/activity?*", (route) => {
    logParams = new URL(route.request().url()).searchParams;
    return route.fulfill({ json: { entries: rows, truncated: false } });
  });
  await page.route("**/api/history/states?*", (route) => {
    chartParams = new URL(route.request().url()).searchParams;
    return route.fulfill({
      json: {
        series: [
          {
            entity_id: light.entity_id,
            start: chartParams.get("start"),
            end: chartParams.get("end"),
            unit: null,
            minimum: null,
            maximum: null,
            samples: 2,
            truncated: false,
            points: [
              { time: chartParams.get("start"), state: "off", value: null },
              { time: chartParams.get("end"), state: "on", value: null },
            ],
          },
        ],
      },
    });
  });
  await page.getByRole("tab", { name: "Huslogg", exact: true }).click();
  await expect(page.locator(".house-log li")).toHaveCount(3);
  await expect(page.locator("#history-sources")).toHaveCount(0);
  await expect(page.locator(".house-log li").first()).toContainText(
    "Kveldslys",
  );
  await expect(
    page.locator(".house-log li").filter({ hasText: "Entrédør" }),
  ).toContainText("Lukket");
  await expect(
    page
      .locator(".house-log li")
      .filter({ hasText: "Tidligere enhet" })
      .getByRole("button"),
  ).toHaveCount(0);
  expect(chartParams.toString()).toBe("");
  const filters = page.getByRole("search", { name: "Søk i husloggen" });
  await filters
    .getByLabel("Rom", { exact: true })
    .selectOption(home.areas[1].area_id);
  await expect(page.locator(".house-log li")).toHaveCount(1);
  await filters.getByRole("button", { name: "Nullstill filtre" }).click();
  await filters.getByLabel("Hendelsestype").selectOption("security");
  await expect(page.locator(".house-log li")).toHaveCount(1);
  await filters.getByRole("button", { name: "Nullstill filtre" }).click();
  await filters.getByLabel("Søk i hendelser").fill("kveldslys");
  await expect(page.locator(".house-log li")).toHaveCount(1);
  await expect(page.locator(".house-log-count")).toContainText("1 av 1");
  await filters.getByLabel("Søk i hendelser").fill("finnes ikke");
  await expect(
    page.getByRole("heading", { name: "Ingen treff i de hentede hendelsene" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Vis alle hendelser i utvalget" })
    .click();
  await expect(page.locator(".house-log li")).toHaveCount(3);
  await page.screenshot({
    path: `/private/tmp/smarti-133-log-${info.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Vis historikk for Leselampe", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Grafer og historikk", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("tab", { name: "Grafer og historikk", exact: true }),
  ).toBeFocused();
  await expect(page.locator(".history-series")).toHaveCount(1);
  await expect(page.locator(".history-series svg")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Last ned CSV" }),
  ).toBeVisible();
  expect(chartParams.get("entity_ids")).toBe(light.entity_id);
  expect(chartParams.get("start")).toBe(logParams.get("start"));
  expect(chartParams.get("end")).toBe(logParams.get("end"));
  expect(writes).toEqual([]);
  await expect(page.locator(".house-log-view")).toHaveCount(0);
  await page.screenshot({
    path: `/private/tmp/smarti-133-chart-${info.project.name}.png`,
    fullPage: true,
  });
  await page.addStyleTag({
    content:
      "*, *::before, *::after { transition: none !important; animation: none !important; }",
  });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await page.getByRole("tab", { name: "Huslogg", exact: true }).click();
  await expect(page.locator(".house-log li")).toHaveCount(3);
  await page.screenshot({
    path: `/private/tmp/smarti-133-timeline-dark-${info.project.name}.png`,
    fullPage: true,
  });
});

test("activity paginates locally, retains truncation notice and fits narrow screens in both themes", async ({
  page,
}, info) => {
  const { light } = await openReports(page);
  const entries = Array.from({ length: 65 }, (_, index) =>
    event(light, {
      message: `Hendelse ${index + 1}`,
      when: new Date(Date.now() - index * 60000).toISOString(),
    }),
  );
  let fetches = 0;
  await page.route("**/api/history/activity?*", (route) => {
    fetches++;
    return route.fulfill({ json: { entries, truncated: true } });
  });
  await page.getByRole("tab", { name: "Huslogg", exact: true }).click();
  await expect(page.locator(".house-log li")).toHaveCount(50);
  await expect(
    page.getByText("Viser de 1 000 nyeste hendelsene.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Vis flere hendelser" }).click();
  await expect(page.locator(".house-log li")).toHaveCount(65);
  await expect(
    page.getByRole("button", { name: "Vis flere hendelser" }),
  ).toHaveCount(0);
  await page.getByLabel("Søk i hendelser").fill("Hendelse 65");
  await expect(page.locator(".house-log li")).toHaveCount(1);
  await page.getByRole("button", { name: "Nullstill filtre" }).click();
  await expect(page.locator(".house-log li")).toHaveCount(50);
  expect(fetches).toBe(1);
  await page.locator(".house-log-dates summary").click();
  await expect(page.getByLabel("Fra", { exact: true })).toBeVisible();
  await page.getByLabel("Fra", { exact: true }).fill("2024-01-01T12:00");
  await page
    .locator(".history-period")
    .getByRole("button", { name: "Vis", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("31 dager");
  expect(fetches).toBe(1);
  await page.locator(".house-log-dates summary").click();
  if (info.project.name === "mobile")
    await page.setViewportSize({ width: 320, height: 800 });
  await page.addStyleTag({
    content:
      "*, *::before, *::after { transition: none !important; animation: none !important; }",
  });
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (value) => (document.documentElement.dataset.theme = value),
      theme,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `/private/tmp/smarti-133-log-${theme}-${info.project.name}.png`,
    });
  }
});
