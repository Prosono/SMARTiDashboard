import {
  test,
  expect,
  type Page,
  type Locator,
} from "../../frontend/node_modules/@playwright/test";

// This suite exercises the existing 3D view after the separate setup wizard.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/home/energy/platform/setup", (route) =>
    route.fulfill({
      json: {
        config: {
          country: "NO",
          area: "NO1",
          company: "elvia",
          meters: [],
          cloud_history: false,
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
});

// Let React, ResizeObserver and WebGL finish pending frames before checking motion.
const settleRendering = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let frames = 0;
        function nextFrame() {
          if (++frames === 8) resolve();
          else requestAnimationFrame(nextFrame);
        }
        requestAnimationFrame(nextFrame);
      }),
  );

async function expectStillCanvas(page: Page, canvas: Locator, reason: string) {
  await canvas.scrollIntoViewIfNeeded();
  await settleRendering(page);
  const before = await canvas.screenshot();
  await settleRendering(page);
  const after = await canvas.screenshot();
  if (!after.equals(before)) {
    await test.info().attach(`${reason}-before`, {
      body: before,
      contentType: "image/png",
    });
    await test.info().attach(`${reason}-after`, {
      body: after,
      contentType: "image/png",
    });
  }
  expect(after.equals(before), reason).toBe(true);
}

test("3D hotspots configure live measurements and preserve directions, freshness and persistence", async ({
  page,
}) => {
  test.setTimeout(180000);
  const renderingErrors: string[] = [];
  page.on("pageerror", (error) => renderingErrors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /WebGL|shader|THREE\./i.test(message.text())
    )
      renderingErrors.push(message.text());
  });
  let pref: any = {
    solar: {
      visible: true,
      source: null,
      return_source: null,
      positive: "supply",
    },
    home: {
      visible: true,
      source: null,
      return_source: null,
      positive: "supply",
    },
    ev: {
      visible: true,
      source: null,
      return_source: null,
      positive: "supply",
    },
    battery: {
      visible: true,
      source: null,
      return_source: null,
      positive: "consume",
    },
    grid: {
      visible: true,
      source: null,
      return_source: null,
      positive: "supply",
    },
    battery_level: null,
    max_age: 300,
    animation: true,
  };
  let online = true;
  let solarStale = false;
  let zeroPower = false;
  await page.route("**/api/home/energy-flow/preferences", (r) => {
    if (r.request().method() === "PUT") pref = r.request().postDataJSON();
    return r.fulfill({ json: pref });
  });
  await page.route("**/api/home/energy-flow/live", (r) =>
    r.fulfill({
      json: {
        connected: online,
        sampled_at: new Date().toISOString(),
        battery_level: 74,
        battery_status: "ok",
        flows: Object.fromEntries(
          ["solar", "home", "ev", "battery", "grid"].map((role) => [
            role,
            {
              watts:
                !online || (role === "solar" && solarStale)
                  ? null
                  : pref[role].source
                    ? zeroPower
                      ? 0
                      : (
                          {
                            solar: 4300,
                            home: 1700,
                            ev: 3200,
                            battery: -900,
                            grid: -500,
                          } as any
                        )[role]
                    : null,
              status: !online
                ? "unavailable"
                : role === "solar" && solarStale
                  ? "stale"
                  : pref[role].source
                    ? "ok"
                    : "unconfigured",
              visible: pref[role].visible,
              measured_at: new Date().toISOString(),
            },
          ]),
        ),
      },
    }),
  );
  await page.route("**/api/home/energy-flow/history?*", (r) => {
    const period =
      new URL(r.request().url()).searchParams.get("period") || "24h";
    const count = period === "7d" ? 168 : 24;
    return r.fulfill({
      json: {
        period,
        series: Object.fromEntries(
          ["solar", "home", "ev", "battery", "grid"]
            .filter((role) => pref[role].source && pref[role].visible)
            .map((role) => [
              role,
              Array.from({ length: count }, (_, i) => ({
                time: new Date(
                  Date.now() - (count - i) * 3600000,
                ).toISOString(),
                value:
                  i === 5
                    ? null
                    : (role === "battery" ? -1 : 1) *
                      (900 +
                        i * 15 +
                        (i === 0 || i === count - 1
                          ? 0
                          : Math.round(Math.sin((i % 24) / 2) * 220))),
              })),
            ]),
        ),
      },
    });
  });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(page.locator(".home-welcome")).toBeVisible();
  const base = await (await page.request.get("/api/home")).json();
  const sensor = {
    ...base.controls.find((c: any) => c.domain === "sensor"),
    id: "sensor.test_power",
    entity_id: "sensor.test_power",
    name: "Effektmåler",
    state: "4300",
    domain: "sensor",
    attributes: { unit_of_measurement: "W", device_class: "power" },
    availability: "available",
  };
  // Explicit weather fixture verifies that the cinematic header uses real payload data.
  const weather = {
    ...sensor,
    id: "weather.energy_fixture",
    entity_id: "weather.energy_fixture",
    name: "Kristiansand",
    domain: "weather",
    state: "sunny",
    attributes: { temperature: 12, temperature_unit: "°C" },
  };
  await page.route("**/api/home", (r) =>
    r.fulfill({
      json: {
        ...base,
        connected: online,
        controls: [
          ...base.controls.filter((c: any) => c.domain !== "weather"),
          sensor,
          weather,
        ],
      },
    }),
  );
  await page.route("**/api/home/weather/weather.energy_fixture", (r) =>
    r.fulfill({
      json: {
        days: {},
        temperature_unit: "°C",
        precipitation_unit: "mm",
        wind_speed_unit: "km/h",
      },
    }),
  );
  // The whole-page visual fixture also populates the separate energy overview.
  await page.route("**/api/home/energy/preferences", (r) =>
    r.fulfill({
      json: { meters: [sensor.id], hidden: [], period: "24h", chart: "bar" },
    }),
  );
  await page.route("**/api/home/energy/statistics?*", (r) => {
    const values = [
      620, 540, 530, 580, 700, 1150, 2260, 3090, 1910, 1320, 1280, 1690, 1890,
      2100, 2500, 2980, 3540, 4300, 3850, 3100, 2620, 1980, 1310, 880,
    ];
    const points = values.map((value, i) => ({
      time: new Date(Date.now() - (24 - i) * 3600000).toISOString(),
      value,
    }));
    const average =
      values.reduce((sum, value) => sum + value, 0) / values.length;
    return r.fulfill({
      json: {
        start: points[0].time,
        end: new Date().toISOString(),
        previous_start: new Date(Date.now() - 48 * 3600000).toISOString(),
        period: "24h",
        demo: true,
        series: [
          {
            id: sensor.id,
            name: sensor.name,
            kind: "power",
            unit: "W",
            current: {
              value: average,
              complete: true,
              coverage: 100,
              peak: 4300,
              points,
            },
            previous: {
              value: average * 1.12,
              complete: true,
              coverage: 100,
              peak: 4816,
              points: points.map((point) => ({
                ...point,
                value: point.value * 1.12,
              })),
            },
            change_percent: -10.7,
          },
        ],
      },
    });
  });
  await page.reload();
  await page.getByRole("tab", { name: "Energi", exact: true }).click();
  const flow = page.getByRole("region", { name: "Energiflyt", exact: true });
  await expect(flow).toContainText("Gjør huset til ditt");
  await expect(flow.locator(".flow-current-weather")).toContainText("12°C");
  await expect(flow.locator(".flow-current-weather")).toContainText(
    "Klar himmel",
  );
  await expect(flow.locator(".flow-current-weather")).toContainText(
    "Kristiansand",
  );
  const solar = flow.locator('.flow-measurement[data-role="solar"]');
  const grid = flow.locator('.flow-measurement[data-role="grid"]');
  const battery = flow.locator('.flow-measurement[data-role="battery"]');
  const solarHotspot = flow.locator('[data-hotspot="solar"]');
  const canvas = flow.locator("canvas");
  await expect(solar.locator("strong")).toHaveText("—");
  await expect(solarHotspot).toContainText("—", { timeout: 20000 });
  await expectStillCanvas(
    page,
    canvas,
    "Unconfigured sensors must not animate energy",
  );
  await solarHotspot.click();
  await expect(
    flow.getByLabel("Effektmåler · Solceller", { exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("dialog", { name: "Måling · Solceller" }),
  ).toBeVisible();
  await expect(flow.locator(".flow-binding")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(solarHotspot).toBeFocused();
  const evHotspot = flow.locator('[data-hotspot="ev"]');
  await evHotspot.click();
  const evSettings = page.getByRole("dialog", { name: "Måling · Elbil" });
  await expect(evSettings).toBeVisible();
  await expect(evSettings.locator(".flow-binding")).toHaveCount(1);
  await evSettings
    .getByLabel("Effektmåler · Elbil", { exact: true })
    .selectOption("sensor.test_power");
  await evSettings.screenshot({
    path: `../artifacts/${test.info().project.name}-energy-settings.png`,
  });
  await evSettings.getByRole("button", { name: "Avbryt", exact: true }).click();
  expect(pref.ev.source).toBeNull();
  await expect(evHotspot).toBeFocused();
  await flow
    .getByRole("button", { name: "Konfigurer energiflyt", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Konfigurer energiflyt" }),
  ).toBeVisible();
  for (const label of ["Solceller", "Hjemmet", "Elbil", "Batteri", "Strømnett"])
    await flow
      .getByLabel("Effektmåler · " + label, { exact: true })
      .selectOption("sensor.test_power");
  await flow
    .getByRole("button", { name: "Lagre energiflyt", exact: true })
    .click();
  await expect(grid).toContainText("Til nettet");
  await expect(battery).toContainText("Lader batteriet");
  await expect(solar).toContainText("4,3 kW");
  await expect(solarHotspot).toContainText("4,3 kW", { timeout: 20000 });
  // True hourly history is carried into the floating instrument card, including gaps.
  await expect(
    solarHotspot.locator(".energy-hotspot-sparkline svg"),
  ).toHaveCount(1);
  await expect
    .poll(() =>
      solarHotspot.locator(".energy-hotspot-sparkline path[stroke]").count(),
    )
    .toBeGreaterThan(1);
  await expect(flow.locator("canvas")).toBeVisible();
  // Native WebGL renderer must have allocated a non-empty drawing buffer.
  await expect
    .poll(() =>
      flow
        .locator("canvas")
        .evaluate((c: HTMLCanvasElement) => c.width * c.height),
    )
    .toBeGreaterThan(10000);
  await flow.locator("canvas").scrollIntoViewIfNeeded();
  const moving = await flow.locator("canvas").screenshot();
  await expect
    .poll(
      async () => (await flow.locator("canvas").screenshot()).equals(moving),
      { timeout: 15000 },
    )
    .toBe(false);
  await flow.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(
    flow.getByRole("button", { name: "Vis flyt", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expectStillCanvas(
    page,
    canvas,
    "Paused energy paths must remain fixed",
  );
  // The operating-system motion preference overrides the animation toggle.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await flow.getByRole("button", { name: "Vis flyt", exact: true }).click();
  await expect(
    flow.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await expectStillCanvas(
    page,
    canvas,
    "Reduced motion must suppress active flow animation",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const reducedFrame = await canvas.screenshot();
  await expect
    .poll(async () => (await canvas.screenshot()).equals(reducedFrame), {
      timeout: 15000,
    })
    .toBe(false);
  await flow.getByRole("button", { name: "Pause", exact: true }).click();
  await settleRendering(page);
  await flow
    .getByRole("button", { name: "Drei huset mot høyre", exact: true })
    .click();
  const overlaps = await flow.locator("[data-hotspot]").evaluateAll((nodes) => {
    const boxes = nodes.map((node) => ({
      role: node.getAttribute("data-hotspot"),
      bounds: node.getBoundingClientRect(),
    }));
    return boxes.flatMap((a, i) =>
      boxes.slice(i + 1).flatMap((b) => {
        const horizontal =
          Math.min(a.bounds.right, b.bounds.right) -
          Math.max(a.bounds.left, b.bounds.left);
        const vertical =
          Math.min(a.bounds.bottom, b.bounds.bottom) -
          Math.max(a.bounds.top, b.bounds.top);
        return horizontal > 1 && vertical > 1 ? [`${a.role}/${b.role}`] : [];
      }),
    );
  });
  expect(
    overlaps,
    "Measurement buttons must not overlap after rotation",
  ).toEqual([]);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
    "The energy view must fit the viewport without horizontal page scrolling",
  ).toBeLessThanOrEqual(1);
  // Projected buttons must remain clickable and open the matching sensor after rotation.
  await flow.locator('[data-hotspot="battery"]').click();
  const historyPanel = flow.getByRole("region", {
    name: "Effekthistorikk",
    exact: true,
  });
  await expect(historyPanel.locator(".flow-history-svg")).toBeVisible();
  await expect(historyPanel.locator(".flow-chart-readout strong")).toHaveText(
    /[-−]/,
  );
  await historyPanel
    .getByRole("button", { name: "Siste uke", exact: true })
    .click();
  await expect(
    historyPanel.getByRole("button", { name: "Siste uke", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const bottomPeriod = flow.getByLabel("Historikkperiode", { exact: true });
  await expect(bottomPeriod).toHaveValue("7d");
  await bottomPeriod.selectOption("24h");
  await expect(
    historyPanel.getByRole("button", { name: "Siste døgn", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(historyPanel.locator(".flow-chart-readout strong")).toHaveText(
    /[-−]1,25 kW/,
  );
  await bottomPeriod.selectOption("7d");
  await expect(
    historyPanel.getByRole("button", { name: "Siste uke", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await historyPanel.locator(".flow-history-svg").focus();
  await page.keyboard.press("Home");
  await expect(historyPanel.locator(".flow-chart-readout strong")).toHaveText(
    /[-−]0,9 kW/,
  );
  await flow.getByRole("button", { name: "Endre måler", exact: true }).click();
  await expect(
    flow.getByLabel("Effektmåler · Batteri", { exact: true }),
  ).toBeFocused();
  await expect(
    flow.getByLabel("Effektmåler · Batteri", { exact: true }),
  ).toHaveValue("sensor.test_power");
  await flow.getByRole("button", { name: "Avbryt", exact: true }).click();
  await flow.locator(".energy-scene-stage").screenshot({
    animations: "disabled",
    // Isolate the model for visual review; fixed mobile navigation otherwise overlays the crop.
    style: ".sidebar { visibility: hidden !important; }",
    path: `../artifacts/${test.info().project.name}-energy-stage.png`,
  });
  await flow.screenshot({
    animations: "disabled",
    path: `../artifacts/${test.info().project.name}-energy-flow.png`,
  });
  await page
    .getByRole("tab", { name: "Historikk og strømpriser", exact: true })
    .click();
  await page.getByText("Detaljert målerhistorikk", { exact: true }).click();
  await expect(
    page.locator(".energy-workspace .energy-large-chart"),
  ).toBeVisible();
  await page.locator(".home-overview").screenshot({
    animations: "disabled",
    path: `../artifacts/${test.info().project.name}-energy-overview.png`,
  });
  await page.getByRole("tab", { name: "3D-oversikt", exact: true }).click();
  if (test.info().project.name === "desktop") {
    const originalViewport = page.viewportSize()!;
    await page.setViewportSize({ width: 1920, height: 1200 });
    await flow
      .getByLabel("Historikkperiode", { exact: true })
      .selectOption("24h");
    await flow.locator(".flow-nav-overview").click();
    await expect(historyPanel).toHaveCount(0);
    await flow
      .getByRole("button", { name: "Drei huset mot venstre", exact: true })
      .click();
    await settleRendering(page);
    await flow.screenshot({
      animations: "disabled",
      path: "../artifacts/wide-energy-reference.png",
    });
    await flow.locator('[data-hotspot="battery"]').click();
    await flow
      .getByRole("button", { name: "Drei huset mot høyre", exact: true })
      .click();
    await page.setViewportSize({ width: 820, height: 1180 });
    await settleRendering(page);
    const clippedHotspots = await flow
      .locator("[data-hotspot]")
      .evaluateAll((nodes) => {
        return nodes
          .filter((node) => {
            const bounds = node.getBoundingClientRect();
            const stage = node
              .closest(".energy-scene-stage")!
              .getBoundingClientRect();
            return (
              bounds.left < stage.left - 1 || bounds.right > stage.right + 1
            );
          })
          .map((node) => node.getAttribute("data-hotspot"));
      });
    expect(
      clippedHotspots,
      "Tablet measurement controls must fit the stage",
    ).toEqual([]);
    await page.locator(".home-overview").screenshot({
      animations: "disabled",
      path: "../artifacts/tablet-energy-overview.png",
    });
    await page.setViewportSize(originalViewport);
    await settleRendering(page);
  }
  await page
    .getByRole("button", { name: "Innstillinger", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Tema og utseende", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Utseende", exact: true })
    .selectOption("dark");
  await page.getByRole("button", { name: "Hjem", exact: true }).click();
  await page.getByRole("tab", { name: "Energi", exact: true }).click();
  await flow.locator(".energy-scene-stage").screenshot({
    animations: "disabled",
    style: ".sidebar { visibility: hidden !important; }",
    path: `../artifacts/${test.info().project.name}-energy-stage-dark.png`,
  });
  await flow.screenshot({
    animations: "disabled",
    path: `../artifacts/${test.info().project.name}-energy-flow-dark.png`,
  });
  await page.locator(".home-overview").screenshot({
    animations: "disabled",
    path: `../artifacts/${test.info().project.name}-energy-overview-dark.png`,
  });
  await solar.click();
  await expect(flow.locator(".flow-reading-detail")).toContainText("Sist målt");
  await flow
    .getByRole("button", { name: "Rediger 3D-modell", exact: true })
    .click();
  await flow.getByRole("checkbox", { name: "Elbil", exact: true }).uncheck();
  await flow
    .getByRole("button", { name: "Lagre energiflyt", exact: true })
    .click();
  await expect(flow.locator('.flow-measurement[data-role="ev"]')).toHaveCount(
    0,
  );
  await expect(flow.locator('[data-hotspot="ev"]')).toHaveCount(0);
  await page.reload();
  await page.getByRole("tab", { name: "Energi", exact: true }).click();
  await expect(flow.locator('.flow-measurement[data-role="ev"]')).toHaveCount(
    0,
  );
  await expect(flow.locator('[data-hotspot="ev"]')).toHaveCount(0);
  await expect(solarHotspot).toContainText("4,3 kW", { timeout: 20000 });
  await solarHotspot.click();
  await flow.getByRole("button", { name: "Endre måler", exact: true }).click();
  await expect(
    flow.getByLabel("Effektmåler · Solceller", { exact: true }),
  ).toHaveValue("sensor.test_power");
  await flow.getByRole("button", { name: "Avbryt", exact: true }).click();
  zeroPower = true;
  await expect(solar.locator("strong")).toHaveText("0 W", { timeout: 10000 });
  await expectStillCanvas(
    page,
    canvas,
    "Zero measured power must not animate energy",
  );
  zeroPower = false;
  await expect(solarHotspot).toContainText("4,3 kW", { timeout: 10000 });
  const resumed = await canvas.screenshot();
  await expect
    .poll(async () => (await canvas.screenshot()).equals(resumed))
    .toBe(false);
  solarStale = true;
  await expect(solar).toContainText("Gammel måling", { timeout: 10000 });
  await expect(solar.locator("strong")).toHaveText("—");
  await expect(solarHotspot).toContainText("—");
  await expect(solarHotspot).not.toContainText("4,3 kW");
  online = false;
  await expect(grid).toContainText("Utilgjengelig", { timeout: 10000 });
  await expect(grid.locator("strong")).toHaveText("—");
  await expect(flow.locator('[data-hotspot="grid"]')).toContainText("—");
  await expect(battery).not.toContainText("74%");
  await expect(flow.locator('[data-hotspot="battery"]')).not.toContainText(
    "74%",
  );
  await expectStillCanvas(
    page,
    canvas,
    "Offline sensors must stop every energy flow",
  );
  await page.reload();
  await page.getByRole("tab", { name: "Energi", exact: true }).click();
  await expect(flow.locator(".flow-current-weather")).toHaveCount(0);

  await flow
    .getByRole("button", { name: "Rediger 3D-modell", exact: true })
    .click();
  await flow
    .getByRole("checkbox", { name: "Solceller", exact: true })
    .uncheck();
  await flow.getByRole("checkbox", { name: "Batteri", exact: true }).uncheck();
  await flow
    .getByRole("button", { name: "Lagre energiflyt", exact: true })
    .click();
  await expect(
    flow.locator('[data-hotspot="solar"], [data-hotspot="battery"]'),
  ).toHaveCount(0);
  await page.reload();
  await page.getByRole("tab", { name: "Energi", exact: true }).click();
  await expect(
    flow.locator(
      '[data-hotspot="solar"], [data-hotspot="battery"], [data-hotspot="ev"]',
    ),
  ).toHaveCount(0);
  expect(renderingErrors, "No JavaScript or WebGL shader errors").toEqual([]);
});
test("3D renderer failure preserves live UI and configuration", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      type: any,
      ...args: any[]
    ) {
      if (String(type).startsWith("webgl")) return null;
      return (original as any).call(this, type, ...args);
    } as any;
  });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page.getByRole("tab", { name: "Energi", exact: true }).click();
  const flow = page.getByRole("region", { name: "Energiflyt", exact: true });
  await expect(flow).toContainText("3D-visningen er ikke tilgjengelig");
  await flow.locator('.flow-measurement[data-role="ev"]').click();
  const evDialog = page.getByRole("dialog", { name: "Måling · Elbil" });
  await expect(evDialog).toBeVisible();
  await expect(evDialog.locator(".flow-binding")).toHaveCount(1);
  await evDialog.screenshot({
    path: `../artifacts/${test.info().project.name}-energy-settings.png`,
  });
  await evDialog.getByRole("button", { name: "Avbryt", exact: true }).click();
  await flow
    .getByRole("button", { name: "Konfigurer energiflyt", exact: true })
    .click();
  await expect(
    flow.getByRole("button", { name: "Lagre energiflyt", exact: true }),
  ).toBeVisible();
  const dialog = page.getByRole("dialog", { name: "Konfigurer energiflyt" });
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/home/energy-flow/preferences", async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    await pending;
    await route.fulfill({ status: 500, json: { detail: "Test save failure" } });
  });
  await dialog
    .getByRole("button", { name: "Lagre energiflyt", exact: true })
    .click();
  await expect(dialog).toHaveAttribute("aria-busy", "true");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Lukk innstillinger" }),
  ).toBeDisabled();
  release();
  await expect(dialog.getByRole("alert")).toContainText("Kunne ikke lagre");
  await expect(dialog).toHaveAttribute("aria-busy", "false");
  const close = dialog.getByRole("button", { name: "Lukk innstillinger" });
  await close.focus();
  await page.keyboard.press("Shift+Tab");
  expect(
    await dialog.evaluate((el) => el.contains(document.activeElement)),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    flow.getByRole("button", { name: "Konfigurer energiflyt", exact: true }),
  ).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
    "hidden",
  );
});
