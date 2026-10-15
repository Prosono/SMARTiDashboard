import { test, expect } from "../../frontend/node_modules/@playwright/test";

// Widgets are tablet/desktop only; exercise touch layout at tablet width.
test.beforeEach(async ({ page }, info) => {
  if (info.project.name === "mobile")
    await page.setViewportSize({ width: 768, height: 1024 });
});

test("rich home widgets keep their dimensions and use real device capabilities", async ({
  page,
}) => {
  let playerState = "playing";
  let volume = 0.35;
  let cameraAttempts = 0;
  const commands: { action: string; value?: number }[] = [];
  const energyId = "sensor.widget_energy";
  const control = (
    id: string,
    name: string,
    domain: string,
    state: string,
    attributes: Record<string, unknown>,
  ) => ({
    id,
    entity_id: id,
    device_id: id,
    area_id: "living",
    name,
    domain,
    state,
    attributes,
    capabilities: [],
    availability: "available",
    diagnostic: false,
  });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/home", async (route) => {
    const response = await route.fetch();
    const home = await response.json();
    await route.fulfill({
      json: {
        ...home,
        controls: [
          ...home.controls.filter(
            (c: { domain: string }) => c.domain === "light",
          ),
          control("weather.widget", "Sjekteveien", "weather", "partlycloudy", {
            temperature: 14,
            temperature_unit: "°C",
            apparent_temperature: 13,
            precipitation: 0,
            precipitation_unit: "mm",
            wind_speed: 2.6,
            wind_speed_unit: "m/s",
            uv_index: 2,
          }),
          control("camera.widget", "Inngangsparti", "camera", "idle", {}),
          {
            ...control(
              "media_player.widget",
              "Stuehøyttaler",
              "media_player",
              playerState,
              {
                media_title: "Kveldsro",
                media_artist: "Min spilleliste",
                media_duration: 236,
                media_position: 84,
                media_position_updated_at: new Date().toISOString(),
                volume_level: volume,
                is_volume_muted: false,
              },
            ),
            capabilities: [
              {
                kind: "media",
                actions: [
                  "media_play",
                  "media_pause",
                  "media_previous_track",
                  "media_next_track",
                ],
              },
              {
                kind: "volume",
                actions: ["set_volume"],
                minimum: 0,
                maximum: 100,
                step: 1,
              },
              { kind: "mute", actions: ["set_mute"] },
            ],
          },
          control(energyId, "Strømforbruk", "sensor", "1264.2", {
            device_class: "energy",
            unit_of_measurement: "kWh",
          }),
          control(
            "sensor.widget_temperature",
            "Temperatur i stuen",
            "sensor",
            "21.5",
            { device_class: "temperature", unit_of_measurement: "°C" },
          ),
        ],
      },
    });
  });
  const forecast = [
    "partlycloudy",
    "sunny",
    "partlycloudy",
    "cloudy",
    "rainy",
  ].map((condition, index) => ({
    date: `2026-10-${15 + index}`,
    condition,
    temperature: [14, 16, 15, 13, 12][index],
    templow: [8, 9, 8, 7, 6][index],
    precipitation: index === 4 ? 2 : 0,
  }));
  await page.route("**/api/home/weather/*", (route) =>
    route.fulfill({
      json: {
        days: { today: forecast[0], tomorrow: forecast[1] },
        forecast,
        temperature_unit: "°C",
        precipitation_unit: "mm",
        timezone: "Europe/Oslo",
      },
    }),
  );
  await page.route("**/api/home/energy/preferences", (route) =>
    route.fulfill({
      json: {
        meters: [energyId],
        period: "24h",
        sections: ["flow", "chart", "devices"],
      },
    }),
  );
  await page.route("**/api/home/energy/statistics?*", (route) => {
    const url = new URL(route.request().url());
    const id = url.searchParams.get("ids") || energyId;
    const values = [
      0.12, 0.16, 0.13, 0.08, 0.11, 0.15, 0.28, 0.36, 0.25, 0.18, 0.14, 0.21,
      0.32, 0.41, 0.33, 0.18, 0.14, 0.11, 0.24, 0.32, 0.26, 0.18, 0.12, 0.1,
    ];
    return route.fulfill({
      json: {
        series: [
          {
            id,
            unit: "kWh",
            kind: "energy",
            change_percent: -12,
            current: {
              value: values.reduce((sum, value) => sum + value, 0),
              complete: true,
              points: values.map((value, index) => ({
                time: new Date(Date.UTC(2026, 9, 15, index)).toISOString(),
                value,
              })),
            },
          },
        ],
      },
    });
  });
  await page.route("**/api/home/camera/*/live", (route) => {
    cameraAttempts++;
    return route.fulfill({
      status: 503,
      json: { detail: "stream_unavailable" },
    });
  });
  await page.route(
    "**/api/controls/media_player.widget/commands",
    async (route) => {
      const body = route.request().postDataJSON();
      commands.push(body);
      if (body.action === "media_pause") playerState = "paused";
      if (body.action === "set_volume") volume = body.value / 100;
      await route.fulfill({ json: { status: "state_updated" } });
    },
  );

  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  const highlights = page.getByRole("region", { name: "Glimt fra hjemmet" });
  const card = highlights.locator(".highlight-card");
  const nav = highlights.locator(".highlight-navigation");
  await expect(card.locator(".hw-day")).toHaveCount(5);
  expect(
    await card.evaluate((element) => getComputedStyle(element).backgroundImage),
  ).toContain("widget-fjord");
  const heroHeight = await page
    .locator(".home-welcome")
    .evaluate((element) => element.getBoundingClientRect().height);
  const initialBox = (await card.boundingBox())!;
  const navOffset = (await nav.boundingBox())!.y - initialBox.y;
  expect(initialBox.height).toBe(380);

  for (const [type, label] of [
    ["weather", "Vær"],
    ["camera", "Inngangsparti"],
    ["media", "Stuehøyttaler"],
    ["energy", "Energi"],
    ["climate", "Temperatur i stuen"],
  ]) {
    await highlights
      .getByRole("button", { name: `Vis ${label}`, exact: true })
      .click();
    await expect(card).toHaveClass(new RegExp(`highlight-${type}`));
    if (type === "camera") {
      await expect(
        card.getByText("Strømmen kunne ikke startes", { exact: true }),
      ).toBeVisible();
      expect(cameraAttempts).toBeGreaterThan(0);
      await expect(card.locator(".camera-state")).toHaveText(
        "Livevideo ikke tilgjengelig",
      );
      await expect(card.locator(".camera-state .available")).toHaveCount(0);
      await expect(
        card.getByRole("button", {
          name: "Fullskjerm: Inngangsparti",
          exact: true,
        }),
      ).toBeDisabled();
      await expect(
        card.getByRole("button", { name: /Snakk|Ta opptak/ }),
      ).toHaveCount(0);
    }
    if (type === "media") {
      await expect(card).toContainText("Kveldsro");
      await expect(card).toContainText("Min spilleliste");
      await expect(
        card.getByRole("progressbar", { name: "Avspillingsposisjon" }),
      ).toHaveAttribute("max", "236");
      await card.getByRole("button", { name: "Pause", exact: true }).click();
      await expect(
        card.getByRole("button", { name: "Spill av", exact: true }),
      ).toBeEnabled();
      expect(commands[0]).toEqual({ action: "media_pause" });
      const volumeSlider = card.getByRole("slider", {
        name: "Volum",
        exact: true,
      });
      await volumeSlider.focus();
      await volumeSlider.press("ArrowRight");
      await expect
        .poll(() => commands.find((command) => command.action === "set_volume"))
        .toEqual({ action: "set_volume", value: 36 });
      await expect(volumeSlider).toBeEnabled();
    }
    if (type === "energy") {
      const chart = card.getByRole("slider", {
        name: "Energihistorikk, bruk piltastene",
      });
      await expect(chart).toBeVisible();
      await expect(card.locator(".he-chart rect")).toHaveCount(24);
      await chart.focus();
      await chart.press("Home");
      await chart.press("ArrowRight");
      await expect(card.locator(".he-tooltip")).toContainText("0,16 kWh");
      await expect(chart).toHaveAttribute("aria-valuenow", "2");
      await expect(chart).toHaveAttribute("aria-valuetext", /0,16 kWh/);
    }
    if (type === "climate") {
      await expect(
        card.getByRole("button", { name: /ønsket temperatur/ }),
      ).toHaveCount(0);
    }
    expect((await card.boundingBox())!.height).toBe(380);
    expect(
      await page
        .locator(".home-welcome")
        .evaluate((element) => element.getBoundingClientRect().height),
    ).toBe(heroHeight);
    expect((await nav.boundingBox())!.y - (await card.boundingBox())!.y).toBe(
      navOffset,
    );
    expect(
      await card.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    expect
      .soft(
        await card
          .locator(".highlight-content")
          .evaluate((element) => element.scrollWidth <= element.clientWidth),
        `${type}: widget body must not scroll horizontally`,
      )
      .toBe(true);
    await highlights.screenshot({
      path: `../artifacts/${test.info().project.name}-widget-${type}.png`,
      animations: "disabled",
    });
  }
  expect(
    await page
      .locator("body")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
});

test("climate widget changes the supported target and respects its limits", async ({
  page,
}) => {
  let target = 22.5;
  const commands: { action: string; value: number }[] = [];
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/home", async (route) => {
    const response = await route.fetch();
    const home = await response.json();
    await route.fulfill({
      json: {
        ...home,
        controls: [
          {
            id: "climate.widget",
            entity_id: "climate.widget",
            device_id: "thermostat",
            area_id: "living",
            name: "Stuevarme",
            domain: "climate",
            state: "heat",
            availability: "available",
            diagnostic: false,
            attributes: {
              current_temperature: 21.5,
              temperature: target,
              current_humidity: 42,
              temperature_unit: "°C",
              hvac_action: "heating",
            },
            capabilities: [
              {
                kind: "temperature",
                actions: ["set_temperature"],
                unit: "°C",
                minimum: 10,
                maximum: 23,
                step: 0.5,
              },
            ],
          },
        ],
      },
    });
  });
  await page.route("**/api/controls/climate.widget/commands", async (route) => {
    const command = route.request().postDataJSON();
    commands.push(command);
    target = command.value;
    await route.fulfill({ json: { status: "state_updated" } });
  });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  const card = page
    .getByRole("region", { name: "Glimt fra hjemmet" })
    .locator(".highlight-card");
  await expect(card).toContainText("Varmer opp");
  await expect(card.locator(".hc-target")).toContainText("22,5°C");
  const plus = card.getByRole("button", {
    name: "Stuevarme: Øk ønsket temperatur",
  });
  await plus.click();
  await expect(card.locator(".hc-target")).toContainText("23°C");
  await expect(plus).toBeDisabled();
  expect(commands).toEqual([{ action: "set_temperature", value: 23 }]);
  await expect(card.getByRole("status")).toContainText(
    "Temperaturen er oppdatert",
  );
  expect((await card.boundingBox())!.height).toBe(380);
  expect(
    await card
      .locator(".highlight-content")
      .evaluate((element) => element.scrollHeight <= element.clientHeight),
    "Thermostat controls and caption must fit without scrolling",
  ).toBe(true);
  await card.screenshot({
    path: `../artifacts/${test.info().project.name}-widget-thermostat.png`,
    animations: "disabled",
  });
});
