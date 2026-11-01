import {
  test,
  expect,
  type Page,
} from "../../frontend/node_modules/@playwright/test";
const fixed = new Date("2026-11-01T20:36:00Z");
async function setup(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("smarti-home-style", "harmony");
    localStorage.setItem("smarti-theme", "dark");
    localStorage.setItem("smarti-palette", "smarti");
  });
  await page.clock.setFixedTime(fixed);
  const control = (
    domain: string,
    key: string,
    name: string,
    state: string,
    attributes: Record<string, unknown> = {},
    actions: string[] = [],
  ) => ({
    id: `${domain}.${key}`,
    entity_id: `${domain}.${key}`,
    domain,
    name,
    state,
    attributes,
    availability: "available",
    capabilities: actions.length ? [{ kind: domain, actions }] : [],
    diagnostic: false,
    device_id: null,
    area_id: "living",
    integration: null,
    updated_at: fixed.toISOString(),
  });
  const weather = control(
    "weather",
    "reference",
    "Sjekteveien",
    "clear-night",
    {
      temperature: 8.8,
      temperature_unit: "°C",
      wind_speed: 12.6,
      wind_speed_unit: "km/t",
    },
  );
  const climate = control(
    "climate",
    "reference",
    "Vaskerom",
    "heat",
    {
      temperature: 20,
      current_temperature: 15.1,
      temperature_unit: "°C",
      hvac_action: "heating",
      hvac_modes: ["heat", "off"],
    },
    ["set_temperature", "set_hvac_mode"],
  );
  climate.capabilities[0] = Object.assign(climate.capabilities[0], {
    minimum: 5,
    maximum: 30,
    step: 0.5,
    unit: "°C",
  });
  const media = control(
    "media_player",
    "reference",
    "Chromecast",
    "idle",
    { volume_level: 0.2, model_name: "Chromecast", is_volume_muted: false },
    [
      "media_play",
      "media_pause",
      "media_next_track",
      "media_stop",
      "set_volume",
      "set_mute",
    ],
  );
  const vacuum = control(
    "vacuum",
    "reference",
    "Roborock",
    "docked",
    { battery_level: 100 },
    ["start", "return_to_base", "pause"],
  );
  const power = control("sensor", "reference_power", "Effekt nå", "8300", {
    device_class: "power",
    unit_of_measurement: "W",
  });
  const temperature = control(
    "sensor",
    "reference_temperature",
    "Temperatur ute",
    "-9",
    { device_class: "temperature", unit_of_measurement: "°C" },
  );
  const humidity = control(
    "sensor",
    "reference_humidity",
    "Luftfuktighet",
    "46",
    { device_class: "humidity", unit_of_measurement: "%" },
  );
  const people = [
    control("person", "reference_tina", "Tina", "home"),
    control("person", "reference_vetle", "Vetle", "unknown"),
  ];
  const routines = ["home", "away", "night", "holiday"].map((key) =>
    control("scene", `reference_${key}`, `Rutine ${key}`, "scening", {}, [
      "activate",
    ]),
  );
  const lights = Array.from({ length: 91 }, (_, i) =>
    control(
      "light",
      `reference_${i}`,
      `Lampe ${i}`,
      i < 20 ? "on" : "off",
      { brightness: 145, color_mode: "color_temp" },
      ["turn_on", "turn_off", "set_brightness"],
    ),
  );
  await page.route("**/api/home", async (route) => {
    const response = await route.fetch(),
      home = await response.json();
    await route.fulfill({
      json: {
        ...home,
        name: "Sjekteveien",
        controls: [
          weather,
          climate,
          media,
          vacuum,
          power,
          temperature,
          humidity,
          ...people,
          ...routines,
          ...lights,
        ],
        favorites: [],
        areas: [{ area_id: "living", name: "Stue" }],
        connected: true,
      },
    });
  });
  await page.route("**/api/home/preferences", async (route) => {
    const response = await route.fetch(),
      pref = await response.json();
    await route.fulfill({
      json: {
        ...pref,
        weather: weather.id,
        energy: power.id,
        modes: Object.fromEntries(
          routines.map((c, i) => [
            ["home", "away", "night", "holiday"][i],
            c.id,
          ]),
        ),
      },
    });
  });
  await page.route("**/api/home/energy-flow/preferences", (route) =>
    route.fulfill({ json: { home: { source: power.entity_id } } }),
  );
  await page.route("**/api/home/calendar", (route) =>
    route.fulfill({
      json: {
        today: "2026-11-01",
        timezone: "Europe/Oslo",
        calendars: ["calendar.reference"],
      },
    }),
  );
  await page.route("**/api/home/calendar/events?*", (route) =>
    route.fulfill({ json: { days: { "2026-11-01": [] }, failed: [] } }),
  );
  await page.route("**/api/home/people", (route) =>
    route.fulfill({ json: { people: null, only_home: false, photos: {} } }),
  );
  const ids = [
    "weather",
    "custom:reference_clock",
    "routines",
    "calendar",
    "people",
    "lighting",
    "media",
    "climate",
    "vacuum",
    "metric:energy",
    "metric:temperature",
    "metric:humidity",
  ];
  let saved = {
    revision: 0,
    items: ids.map((id, i) => ({
      id,
      x: i % 3,
      y: Math.floor(i / 3) * 2,
      w: 1,
      h: 2,
      ...(id.includes("clock")
        ? {
            config: {
              type: "clock",
              clock_style: "analog",
              title: "Klokke",
              icon: "auto",
              image: "auto",
              sources: [],
              period: "24",
              show_seconds: true,
              time_format: "24h",
            },
          }
        : {}),
    })),
  };
  await page.route("**/api/home/layout/overview", (route) => {
    if (route.request().method() !== "GET")
      saved = {
        ...route.request().postDataJSON(),
        revision: saved.revision + 1,
      };
    return route.fulfill({ json: saved });
  });
  await page.route("**/api/controls/sensor.reference_*/history?*", (route) => {
    const url = route.request().url(),
      kind = url.includes("humidity")
        ? "humidity"
        : url.includes("temperature")
          ? "temperature"
          : "power",
      unit = kind === "humidity" ? "%" : kind === "temperature" ? "°C" : "W";
    const values =
      kind === "power"
        ? [
            3800, 4200, 4900, 5200, 4700, 3900, 3400, 2700, 2500, 3200, 3700,
            4400, 5100, 5600, 5000, 4200, 4600, 5900, 7300, 6900, 6400, 7800,
            9800, 11200,
          ]
        : kind === "temperature"
          ? [
              -10, -9, -7, -6, -7, -7, -7, -6, -7, -4, -4, -3, -1, -1, 2, 1, 0,
              2, 1, -1, -3, -5, -7, -9,
            ]
          : [
              55, 54, 50, 49, 44, 40, 41, 42, 40, 41, 42, 45, 56, 60, 65, 61,
              58, 62, 64, 66, 57, 52, 50, 46,
            ];
    const end = Date.parse("2026-11-01T20:00:00Z"),
      start = end - 86400000;
    return route.fulfill({
      json: {
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        unit,
        points: values.map((value, i) => ({
          time: new Date(start + i * 3600000).toISOString(),
          value,
        })),
      },
    });
  });
  const calls: { id: string; action: string; value?: number }[] = [];
  const modeCalls: string[] = [];
  await page.route("**/api/controls/*/commands", (route) => {
    const body = route.request().postDataJSON(),
      id = decodeURIComponent(
        new URL(route.request().url()).pathname.split("/").at(-2)!,
      );
    calls.push({ id, ...body });
    if (id === climate.entity_id && body.action === "set_temperature")
      climate.attributes.temperature = body.value;
    if (id === media.entity_id && body.action === "media_play")
      media.state = "playing";
    if (id === vacuum.entity_id && body.action === "start")
      vacuum.state = "cleaning";
    return route.fulfill({ json: { status: "state_updated" } });
  });
  await page.route("**/api/home/modes/*/run", (route) => {
    modeCalls.push(route.request().url());
    return route.fulfill({ json: { status: "simulated" } });
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
  await expect(page.locator(".home-canvas-cell")).toHaveCount(12);
  return {
    weather,
    climate,
    media,
    vacuum,
    calls,
    modeCalls,
    saved: () => saved,
  };
}

test("reference card materials, illustrations, graphs and compact controls fit and retain real readings", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  if (info.project.name === "desktop")
    await page.setViewportSize({ width: 1555, height: 1200 });
  await setup(page);
  const canvas = page.locator(".home-canvas");
  await expect(
    canvas.locator('.simple-weather[data-scene="night"]'),
  ).toBeVisible();
  await expect(
    canvas.locator(".home-metric-card.metric-energy .home-metric-reading"),
  ).toHaveText("8,3 kW");
  await expect(canvas.locator(".thermostat-room-reading")).toContainText(
    "15,1",
  );
  await expect(canvas.locator(".thermostat-target")).toContainText("20");
  await expect(canvas.locator(".mode-run")).toHaveCount(4);
  await expect(canvas.locator(".energy-bar")).toHaveCount(24);
  await expect(canvas.locator(".energy-bars-y > span").first()).toHaveText(
    "12",
  );
  await expect(canvas.locator(".energy-bars-caption > span").last()).toHaveText(
    "kW",
  );
  for (const theme of ["dark", "light"]) {
    await page.evaluate(
      (theme) => (document.documentElement.dataset.theme = theme),
      theme,
    );
    await page.evaluate(() => document.fonts.ready);
    await canvas.locator(".home-canvas-grid").screenshot({
      path: `/private/tmp/smarti-reference-cards-${theme}-${info.project.name}.png`,
      animations: "disabled",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
  const overflow = await canvas
    .locator(".home-canvas-viewport")
    .evaluateAll((nodes) =>
      nodes
        .filter((n) => n.getAttribute("data-overflow") === "true")
        .map((n) => n.closest<HTMLElement>("[data-card]")!.dataset.card),
    );
  expect(overflow).toEqual([]);
});

test("reference controls preserve thermostat steps, media, robot actions, routine confirmation and unavailable states", async ({
  page,
}) => {
  const state = await setup(page),
    canvas = page.locator(".home-canvas");
  const plus = canvas.getByRole("button", {
    name: "Vaskerom: Ønsket temperatur +",
    exact: true,
  });
  await plus.click();
  await expect
    .poll(() => state.calls.find((c) => c.action === "set_temperature")?.value)
    .toBe(20.5);
  await expect(canvas.locator(".thermostat-target")).toContainText("20,5");
  await canvas
    .locator('[data-card="media"] [data-action="media_play"]')
    .click();
  await expect(canvas.locator(".media-player-card")).toHaveAttribute(
    "data-playing",
    "true",
  );
  await canvas
    .locator('[data-card="vacuum"]')
    .getByRole("button", { name: "Start rengjøring", exact: true })
    .click();
  await expect(canvas.locator(".vacuum-status strong")).toHaveText("Rengjør");
  const mode = canvas
    .locator(".home-grid-routines")
    .getByRole("button", { name: /^Hjemme/ });
  page.once("dialog", (dialog) => dialog.dismiss());
  await mode.click();
  expect(state.modeCalls).toHaveLength(0);
  page.once("dialog", (dialog) => dialog.accept());
  await mode.click();
  await expect.poll(() => state.modeCalls.length).toBe(1);
  state.climate.availability = "unavailable";
  state.media.availability = "unavailable";
  state.vacuum.availability = "unavailable";
  state.weather.availability = "unavailable";
  await page.reload();
  await expect(plus).toBeDisabled();
  await expect(
    canvas.locator('[data-card="media"] [data-action="media_play"]'),
  ).toBeDisabled();
  await expect(
    canvas.locator('[data-card="vacuum"] .vacuum-actions button').first(),
  ).toBeDisabled();
  await expect(canvas.locator(".thermostat-room-reading strong")).toContainText(
    "—",
  );
  await expect(canvas.locator(".simple-weather")).not.toHaveAttribute(
    "data-scene",
    /./,
  );
  await expect(canvas.locator(".simple-weather-current > strong")).toHaveText(
    "—",
  );
});

test("weather photo failure retains weather readings and falls back to the local illustration", async ({
  page,
}) => {
  await page.route("**/home/weather/*.webp", (route) => route.abort());
  await setup(page);
  const weather = page.locator('[data-card="weather"] .simple-weather');
  await expect(weather).not.toHaveAttribute("data-scene", /./);
  await expect(
    weather.locator(".simple-weather-current > strong"),
  ).toContainText("8,8");
  await expect(weather.locator(".weather-art")).toBeVisible();
});
