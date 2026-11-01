import {
  test,
  expect,
  type Page,
} from "../../frontend/node_modules/@playwright/test";
async function setup(page: Page, counter = false) {
  await page.addInitScript(() => {
    localStorage.setItem("smarti-home-style", "harmony");
    localStorage.setItem("smarti-theme", "light");
  });
  const sensor = (name: string, state: string, unit: string, kind: string) => ({
    id: name === "power" ? "opaque_power" : `sensor.metric_${name}`,
    entity_id: `sensor.metric_${name}`,
    name: `Måler ${name}`,
    domain: "sensor",
    state,
    attributes: { unit_of_measurement: unit, device_class: kind },
    capabilities: [],
    availability: "available",
    diagnostic: false,
    device_id: null,
    area_id: "living",
    updated_at: null,
    integration: null,
  });
  const power = sensor(
      "power",
      counter ? "123456" : "7500",
      counter ? "Wh" : "W",
      counter ? "energy" : "power",
    ),
    temp = sensor("temperature", "77", "°F", "temperature"),
    humidity = sensor("humidity", "53", "%", "humidity");
  const state = {
    raw: "ok",
    stats: "ok",
    connected: true,
    rawCalls: 0,
    statsCalls: 0,
  };
  await page.route("**/api/home", async (route) => {
    const response = await route.fetch(),
      home = await response.json();
    await route.fulfill({
      json: {
        ...home,
        connected: state.connected,
        controls: [
          ...home.controls.filter(
            (c: { domain: string }) =>
              !["sensor", "climate"].includes(c.domain),
          ),
          power,
          temp,
          humidity,
        ],
      },
    });
  });
  await page.route("**/api/home/energy-flow/preferences", (route) =>
    route.fulfill({ json: { home: { source: power.entity_id } } }),
  );
  await page.route("**/api/home/layout/overview", (route) =>
    route.fulfill({
      json: {
        revision: 0,
        items: ["energy", "temperature", "humidity"].map((kind, x) => ({
          id: `metric:${kind}`,
          x,
          y: 0,
          w: 1,
          h: 2,
        })),
      },
    }),
  );
  const history = (unit: string, values: (number | null)[]) => {
    const end = Date.now(),
      start = end - 24 * 3600000;
    return {
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      unit,
      points: values.map((value, i) => ({
        time: new Date(start + i * 3600000).toISOString(),
        value,
      })),
    };
  };
  await page.route("**/api/controls/sensor.metric_*/history?*", (route) => {
    const url = route.request().url();
    if (url.includes("power")) {
      state.rawCalls++;
      if (state.raw === "error")
        return route.fulfill({
          status: 503,
          json: { detail: "history_unavailable" },
        });
      const values = Array.from({ length: 24 }, (_, i) =>
        i === 8
          ? null
          : counter
            ? 100000 + i * 1000
            : 1000 + Math.floor(i / 6) * 1000,
      );
      return route.fulfill({
        json: history(
          counter ? "Wh" : "W",
          state.raw === "empty" ? [] : values,
        ),
      });
    }
    return route.fulfill({
      json: history(url.includes("humidity") ? "%" : "°F", [
        40,
        45,
        null,
        48,
        50,
        53,
      ]),
    });
  });
  await page.route("**/api/home/energy/statistics?*", (route) => {
    state.statsCalls++;
    expect(new URL(route.request().url()).searchParams.get("ids")).toBe(
      "opaque_power",
    );
    const values = Array.from({ length: 24 }, (_, i) =>
      i === 8 ? null : i === 23 ? 1.2 : 1 + Math.floor(i / 6),
    );
    const data = history(
      counter ? "kWh" : "kW",
      state.stats === "empty" ? [] : values,
    );
    return route.fulfill({
      json: {
        start: data.start,
        end: data.end,
        series: [
          {
            id: "opaque_power",
            unit: data.unit,
            current: { points: data.points },
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
  if (
    (await (await page.request.get("/api/home/experience")).json()).mode !==
    "advanced"
  ) {
    const nav = page.getByRole("navigation", { name: "Hovedmeny" });
    await nav
      .getByRole("button", { name: "Innstillinger", exact: true })
      .click();
    await page
      .locator('.experience-picker button[data-mode="advanced"]')
      .click();
    await nav.getByRole("button", { name: "Hjem", exact: true }).click();
  }
  await expect(page.locator(".home-canvas")).toBeVisible();
  return { state, power, temp, humidity };
}
const metric = (page: Page, kind: string) =>
  page.locator(`[data-card="metric:${kind}"] .home-metric-card`);
test("power cards use recorder history, compare their own day, retain gaps and distinguish unknown/export", async ({
  page,
}, info) => {
  const { state, power } = await setup(page),
    energy = metric(page, "energy");
  await expect(energy).toHaveAttribute("data-metric-level", "high");
  await expect(energy.locator(".measured-chart-line")).toHaveCount(2);
  expect(state.statsCalls).toBe(0);
  for (const [value, level] of [
    ["500", "low"],
    ["2500", "medium"],
    ["-1000", "export"],
  ]) {
    power.state = value;
    await page.reload();
    await expect(energy).toHaveAttribute("data-metric-level", level);
  }
  state.raw = "empty";
  state.stats = "empty";
  power.state = "7500";
  await page.reload();
  await expect(energy).toHaveAttribute("data-metric-level", "unknown");
  await expect(energy.locator(".home-metric-reading")).toContainText("500");
  await expect(energy.locator(".home-metric-empty")).toContainText("Historikk");
  state.raw = "ok";
  await page.reload();
  await expect(energy).toHaveAttribute("data-metric-level", "high");
  await page.locator(".home-canvas").screenshot({
    path: `/private/tmp/smarti-metric-levels-${info.project.name}.png`,
    animations: "disabled",
  });
});
test("energy history fallback keeps W/kW units and cumulative counters separate from hourly consumption", async ({
  page,
}) => {
  const { state } = await setup(page),
    energy = metric(page, "energy");
  state.raw = "error";
  await page.reload();
  await expect(energy.locator(".measured-chart-line")).toHaveCount(2);
  const plot = energy.locator(".measured-chart svg");
  await plot.focus();
  await page.keyboard.press("Home");
  await expect(energy.locator(".measured-chart-tooltip")).toContainText(
    /1.?000 W/,
  );
  expect(state.statsCalls).toBeGreaterThan(0);
});
test("energy counters show a completed hour or an explicit neutral meter total", async ({
  page,
}) => {
  const { state } = await setup(page, true),
    energy = metric(page, "energy");
  await expect(energy.locator(".home-metric-reading")).toContainText("1,2 kWh");
  await expect(energy.locator(".home-metric-source")).toContainText(
    "Siste hele time",
  );
  expect(state.rawCalls).toBe(0);
  state.stats = "empty";
  await page.reload();
  await expect(energy).toHaveAttribute("data-metric-level", "unknown");
  await expect(energy.locator(".home-metric-reading")).toContainText("456 Wh");
  await expect(energy.locator(".home-metric-source")).toContainText(
    "Totalmåler",
  );
  await expect(energy.locator(".measured-chart-line")).toHaveCount(2);
});
test("temperature normalizes Fahrenheit, humidity runs white to blue, and header pills keep navigation and fit", async ({
  page,
}, info) => {
  const { temp, humidity, state } = await setup(page),
    temperature = metric(page, "temperature"),
    air = metric(page, "humidity");
  for (const [value, level] of [
    ["32", "cold"],
    ["68", "normal"],
    ["77", "warm"],
    ["86", "high"],
  ]) {
    temp.state = value;
    await page.reload();
    await expect(temperature).toHaveAttribute("data-metric-level", level);
  }
  const colors = new Set<string>();
  for (const value of [0, 25, 50, 75, 100]) {
    humidity.state = String(value);
    await page.reload();
    await expect(air).toHaveAttribute("data-metric-level", "humidity");
    colors.add(await air.evaluate((n) => getComputedStyle(n).backgroundColor));
    if (value === 0)
      await expect(air.locator(".home-metric-reading")).toHaveText("0 %");
  }
  expect(colors.size).toBe(5);
  humidity.state = "101";
  await page.reload();
  await expect(air).toHaveAttribute("data-metric-level", "unknown");
  humidity.state = "53";
  await page.reload();
  await page.locator(".home-hero-stage").screenshot({
    path: `/private/tmp/smarti-header-pills-${info.project.name}.png`,
  });
  await page.locator(".home-status.status-climate").click();
  await expect(
    page.getByRole("tab", { name: "Klima", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.getByRole("tab", { name: "Oversikt", exact: true }).click();
  await page.clock.install();
  state.connected = false;
  await page.reload();
  await expect(page.locator(".home-welcome")).toBeVisible();
  await page.clock.fastForward(31000);
  await expect(metric(page, "energy")).toHaveAttribute(
    "data-metric-level",
    "unknown",
  );
});
