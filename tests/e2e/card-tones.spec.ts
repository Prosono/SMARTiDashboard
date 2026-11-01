import {
  test,
  expect,
  type Page,
} from "../../frontend/node_modules/@playwright/test";

const extra = (
  domain: string,
  key: string,
  attributes = {},
  actions: string[] = [],
) => ({
  id: `${domain}.tone_${key}`,
  entity_id: `${domain}.tone_${key}`,
  domain,
  attributes,
  name: key,
  state:
    domain === "weather"
      ? "partlycloudy"
      : domain === "vacuum"
        ? "docked"
        : "21",
  device_id: null,
  area_id: "living",
  updated_at: null,
  integration: null,
  availability: "available",
  diagnostic: false,
  capabilities: actions.length ? [{ kind: domain, actions }] : [],
});
const config = (type: string, title: string, sources: string[] = []) => ({
  type,
  title,
  sources,
  icon: "auto",
  image: "auto",
  period: "24",
});
async function navigate(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Hovedmeny" })
    .getByRole("button", { name, exact: true })
    .click();
}
async function appearance(page: Page) {
  await navigate(page, "Innstillinger");
  await page
    .getByRole("button", { name: "Tema og utseende", exact: true })
    .click();
}
async function setup(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("smarti-home-style", "harmony");
    localStorage.setItem("smarti-theme", "light");
    localStorage.setItem("smarti-palette", "smarti");
  });
  const controls = [
    extra("weather", "weather", { temperature: 12, temperature_unit: "°C" }),
    extra("sensor", "power", {
      device_class: "power",
      unit_of_measurement: "W",
    }),
    extra("sensor", "temperature", {
      device_class: "temperature",
      unit_of_measurement: "°C",
    }),
    extra("sensor", "humidity", {
      device_class: "humidity",
      unit_of_measurement: "%",
    }),
    extra("media_player", "media", { volume_level: 0.3 }, [
      "media_play",
      "media_pause",
    ]),
    extra("vacuum", "vacuum", { battery_level: 88 }, [
      "start",
      "return_to_base",
    ]),
    extra("switch", "plug", {}, ["turn_on", "turn_off"]),
    extra("lock", "door", {}, ["lock", "unlock"]),
    {
      ...extra("light", "rgb", { rgb_color: [255, 0, 0], color_mode: "rgb" }, [
        "turn_on",
        "turn_off",
        "set_rgb_color",
      ]),
      state: "on",
    },
    {
      ...extra(
        "light",
        "white",
        { rgb_color: [255, 0, 0], color_mode: "color_temp" },
        ["turn_on", "turn_off"],
      ),
      state: "on",
    },
  ];
  await page.route("**/api/home", async (route) => {
    const response = await route.fetch(),
      home = await response.json();
    await route.fulfill({
      json: { ...home, controls: [...home.controls, ...controls] },
    });
  });
  await page.route("**/api/controls/sensor.tone_*/history**", (route) => {
    const humidity = route.request().url().includes("humidity"),
      now = Date.now();
    return route.fulfill({
      json: {
        points: [0, 1, 2].map((index) => ({
          time: new Date(now - (2 - index) * 3600000).toISOString(),
          value: (humidity ? 45 : 20) + index,
        })),
        unit: humidity ? "%" : "°C",
      },
    });
  });
  const definitions: [string, string, any?][] = [
    ["weather", "cool"],
    ["routines", "plum"],
    ["people", "fresh"],
    ["calendar", "calendar"],
    ["lighting", "lighting"],
    ["climate", "warm"],
    ["metric:energy", "energy"],
    ["metric:temperature", "temperature"],
    ["metric:humidity", "humidity"],
    ["device:media_player.tone_media", "media"],
    ["device:vacuum.tone_vacuum", "fresh"],
    ["custom:tone_clock", "clock", config("clock", "Klokke hjemme")],
    ["custom:tone_moon", "plum", config("moon", "Månen")],
    ["summary:connection", "misc"],
    ["device:switch.tone_plug", "misc"],
    ["device:lock.tone_door", "cool"],
  ];
  let saved = {
    revision: 0,
    items: definitions
      .map(([id, , settings], i) => ({
        id,
        x: i % 3,
        y: Math.floor(i / 3) * 2,
        w: 1,
        h: 2,
        ...(settings ? { config: settings } : {}),
      }))
      .concat([
        {
          id: "custom:tone_graph",
          x: 0,
          y: 12,
          w: 2,
          h: 3,
          config: config("graph", "Temperaturgraf", [
            "sensor.tone_temperature",
          ]),
        },
      ]),
  };
  await page.route("**/api/home/layout/overview", (route) => {
    if (route.request().method() !== "GET")
      saved = {
        ...route.request().postDataJSON(),
        revision: saved.revision + 1,
      };
    return route.fulfill({ json: saved });
  });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "Hovedmeny" }),
  ).toBeVisible();
  if (
    (await (await page.request.get("/api/home/experience")).json()).mode !==
    "advanced"
  ) {
    await navigate(page, "Innstillinger");
    await page
      .locator('.experience-picker button[data-mode="advanced"]')
      .click();
    await navigate(page, "Hjem");
  }
  return { definitions, controls, saved: () => saved };
}

test("weather illustrations follow actual conditions, day/night and availability without sending commands", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  const { controls } = await setup(page),
    weather = controls.find((c) => c.domain === "weather")!;
  const commands: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/commands")) commands.push(request.url());
  });
  const card = page.locator('[data-card="weather"]');
  for (const condition of [
    "sunny",
    "clear-night",
    "cloudy",
    "partlycloudy",
    "rainy",
    "pouring",
    "snowy",
    "snowy-rainy",
    "hail",
    "fog",
    "windy",
    "windy-variant",
    "lightning",
    "lightning-rainy",
    "exceptional",
    "unknown",
  ]) {
    weather.state = condition;
    await page.reload();
    await expect(card.locator(".weather-art")).toHaveAttribute(
      "data-weather-art",
      condition,
    );
    if (["sunny", "clear-night", "rainy", "snowy"].includes(condition))
      await card.screenshot({
        path: `/private/tmp/smarti-83-weather-${condition}-${info.project.name}.png`,
        animations: "disabled",
      });
  }
  weather.state = "partlycloudy";
  for (const daytime of [true, false]) {
    Object.assign(weather.attributes, { is_daytime: daytime });
    await page.reload();
    await expect(card.locator(".weather-art")).toHaveAttribute(
      "data-night",
      String(!daytime),
    );
    await expect(card.locator(".weather-art image")).toHaveCount(1);
  }
  weather.availability = "unavailable";
  await page.reload();
  await expect(card.locator(".weather-art")).toHaveAttribute(
    "data-weather-art",
    "unknown",
  );
  await expect(card.locator(".simple-weather-current > strong")).toHaveText(
    "—",
  );
  expect(commands).toEqual([]);
});

test("card types have visibly distinct color families with readable text across all palettes and themes", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const state = await setup(page),
    original = structuredClone(state.saved());
  const canvas = page.locator(".home-canvas");
  await expect(canvas.locator(".home-canvas-cell")).toHaveCount(17);
  for (const [id, tone] of state.definitions)
    await expect(
      canvas.locator(`[data-card="${id}"] > .home-canvas-surface`),
    ).toHaveAttribute("data-card-tone", tone);
  for (const theme of ["light", "dark"]) {
    await appearance(page);
    await page
      .getByRole("combobox", { name: "Utseende", exact: true })
      .selectOption(theme);
    for (const palette of [
      "SMARTi",
      "SMARTi Sort",
      "Midnatt",
      "Kobber",
      "Grafitt",
      "Fjord",
      "Skog",
      "Sand",
      "Plomme",
    ]) {
      await page
        .getByRole("button", { name: `Palett: ${palette}`, exact: true })
        .click();
      await navigate(page, "Hjem");
      const result = await canvas.evaluate((node) => {
        const colors = new Map<string, string>();
        const ctx = document.createElement("canvas").getContext("2d")!;
        const linearRGB = (color: string) => {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 1, 1);
          return [...ctx.getImageData(0, 0, 1, 1).data]
            .slice(0, 3)
            .map((n) => n / 255)
            .map((n) =>
              n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4,
            );
        };
        const luminance = (color: string) => {
          const rgb = linearRGB(color);
          return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
        };
        const oklab = (color: string) => {
          const [r, g, b] = linearRGB(color),
            l = Math.cbrt(
              0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b,
            ),
            m = Math.cbrt(
              0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b,
            ),
            s = Math.cbrt(
              0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b,
            );
          return [
            0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
          ];
        };
        const ratios: number[] = [],
          chartRatios: number[] = [];
        let weakest = { ratio: Infinity, text: "", color: "", background: "" };
        for (const surface of node.querySelectorAll<HTMLElement>(
          ".home-canvas-surface[data-card-tone]",
        )) {
          const tone = surface.dataset.cardTone!,
            metric = surface.querySelector(
              ".home-metric-card[data-metric-level]",
            ),
            style = getComputedStyle(metric || surface),
            background = style.backgroundColor,
            stops = [background, style.getPropertyValue("--card-color")];
          if (surface.querySelector(".simple-weather")) continue;
          if (!metric) colors.set(tone, style.getPropertyValue("--card-color"));
          for (const text of surface.querySelectorAll(
            ".home-grid-routines h2, .people-heading h2, .home-metric-head strong, .home-metric-source, .home-metric-period, .ambient-heading strong, .ambient-source-note, .ambient-clock-date, .personal-graph-legend span, .personal-graph-legend strong",
          )) {
            for (const stop of stops) {
              const color = getComputedStyle(text).color,
                a = luminance(stop),
                b = luminance(color),
                ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
              ratios.push(ratio);
              if (ratio < weakest.ratio)
                weakest = {
                  ratio,
                  text: text.textContent || "",
                  color,
                  background: stop,
                };
            }
          }
          for (const line of surface.querySelectorAll(".measured-chart-line"))
            for (const stop of stops) {
              const a = luminance(stop),
                b = luminance(getComputedStyle(line).stroke);
              chartRatios.push(
                (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
              );
            }
        }
        const families = [...colors.values()].map(oklab),
          separation = families.flatMap((a, i) =>
            families
              .slice(i + 1)
              .map((b) => Math.hypot(...a.map((n, j) => n - b[j]))),
          );
        return {
          colors: [...colors.values()],
          ratios,
          chartRatios,
          separation,
          weakest,
        };
      });
      expect(new Set(result.colors).size).toBe(10);
      // The new reference uses related dark materials; compare their primary
      // tones while allowing its deliberately restrained charcoal/blue palette.
      expect(
        Math.min(...result.separation),
        `${theme}, ${palette}`,
      ).toBeGreaterThanOrEqual(0.03);
      expect(result.ratios.length).toBeGreaterThan(10);
      expect(result.chartRatios.length).toBeGreaterThan(0);
      expect(
        Math.min(...result.chartRatios),
        `${theme}, ${palette}: chart strokes`,
      ).toBeGreaterThanOrEqual(3);
      expect(
        Math.min(...result.ratios),
        `${theme}, ${palette}: ${JSON.stringify(result.weakest)}`,
      ).toBeGreaterThanOrEqual(4.5);
      if (palette === "SMARTi")
        await canvas.screenshot({
          path: `/private/tmp/smarti-card-tones-${theme}-${info.project.name}.png`,
          animations: "disabled",
        });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      await appearance(page);
    }
  }
  expect(state.saved()).toEqual(original);
});

test("type color follows editing, previews and the full-card view while custom pictures remain visible", async ({
  page,
}) => {
  await setup(page);
  const canvas = page.locator(".home-canvas");
  await canvas
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
  await canvas
    .getByRole("button", { name: "Rediger kort: Klokke hjemme", exact: true })
    .click();
  const editor = page.getByRole("dialog", {
    name: "Rediger kort",
    exact: true,
  });
  await expect(
    editor.locator(".card-builder-preview [data-card-tone]"),
  ).toHaveAttribute("data-card-tone", "clock");
  await editor.getByRole("button", { name: "Dagslys", exact: true }).click();
  await expect(
    editor.locator(".card-builder-preview [data-card-tone]"),
  ).toHaveAttribute("data-card-tone", "warm");
  await editor.locator(".card-appearance-options > summary").click();
  await editor
    .locator(".card-image-options")
    .getByRole("button", { name: "Utendørs", exact: true })
    .click();
  await expect(editor.locator(".personal-card-backdrop")).toBeVisible();
  await editor
    .getByRole("button", { name: "Bruk endringer", exact: true })
    .click();
  await canvas.getByRole("button", { name: "Lagre", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-editing", "false");
  await expect(
    canvas.locator('[data-card="custom:tone_clock"] .home-canvas-surface'),
  ).toHaveAttribute("data-card-tone", "warm");
  await expect(
    canvas.locator('[data-card="custom:tone_clock"] .personal-card-backdrop'),
  ).toBeVisible();
  await page.reload();
  await canvas
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
  const graph = canvas.locator('[data-card="custom:tone_graph"]');
  await graph
    .getByRole("combobox", { name: "Temperaturgraf: høyde", exact: true })
    .selectOption("1");
  await canvas.getByRole("button", { name: "Lagre", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-editing", "false");
  await graph
    .getByRole("button", {
      name: "Vis hele kortet: Temperaturgraf",
      exact: true,
    })
    .click();
  await expect(page.locator(".home-canvas-expanded")).toHaveAttribute(
    "data-card-tone",
    "temperature",
  );
  await page
    .getByRole("dialog", { name: "Temperaturgraf", exact: true })
    .getByRole("button", { name: "Lukk innstillinger", exact: true })
    .click();
});

test("light surfaces follow confirmed RGB changes, keep white lights beige and retain their color in preview and full view", async ({
  page,
}) => {
  test.setTimeout(45000);
  const state = await setup(page),
    rgb = state.controls.find((c) => c.entity_id === "light.tone_rgb")!,
    attrs = rgb.attributes as Record<string, unknown>;
  const item = {
    id: "custom:live_rgb",
    x: 0,
    y: 16,
    w: 1,
    h: 3,
    config: config("auto", "Fargelyset", [rgb.entity_id]),
  };
  state.saved().items.push(item, {
    id: "custom:white_light",
    x: 1,
    y: 16,
    w: 1,
    h: 3,
    config: config("auto", "Hvitt lys", ["light.tone_white"]),
  });
  let sent = 0;
  await page.route("**/api/controls/light.tone_rgb/commands", (route) => {
    const body = route.request().postDataJSON();
    expect(body.action).toBe("set_rgb_color");
    attrs.rgb_color = body.value;
    attrs.color_mode = "rgb";
    sent++;
    return route.fulfill({ json: { status: "confirmed" } });
  });
  await page.reload();
  const card = page.locator('[data-card="custom:live_rgb"]'),
    surface = card.locator(".home-canvas-surface");
  await expect(surface).toHaveCSS("background-color", "rgb(255, 0, 0)");
  await expect(
    page.locator('[data-card="custom:white_light"] .home-canvas-surface'),
  ).toHaveCSS("background-color", "rgb(237, 217, 184)");
  await card.getByRole("button", { name: "rgb: Grønn", exact: true }).click();
  await expect(surface).toHaveCSS("background-color", "rgb(46, 215, 105)");
  expect(sent).toBe(1);
  for (const theme of ["light", "dark"])
    for (const color of [
      [255, 0, 0],
      [0, 0, 255],
      [255, 255, 0],
      [33, 171, 211],
    ]) {
      attrs.rgb_color = color;
      await page.reload();
      await page.evaluate(
        ({ theme }) => {
          document.documentElement.dataset.theme = theme;
          document.documentElement.dataset.palette = "skog";
        },
        { theme },
      );
      await expect(surface).toHaveCSS(
        "background-color",
        `rgb(${color.join(", ")})`,
      );
    }
  rgb.state = "off";
  await page.reload();
  await expect(surface).toHaveCSS("background-color", "rgb(237, 217, 184)");
  rgb.state = "on";
  attrs.rgb_color = [0, 0, 255];
  await page.reload();
  const canvas = page.locator(".home-canvas");
  await canvas
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
  await card
    .getByRole("combobox", { name: "Fargelyset: høyde", exact: true })
    .selectOption("1");
  await canvas.getByRole("button", { name: "Lagre", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-editing", "false");
  await card
    .getByRole("button", { name: "Vis hele kortet: Fargelyset", exact: true })
    .click();
  await expect(page.locator(".home-canvas-expanded")).toHaveCSS(
    "background-color",
    "rgb(0, 0, 255)",
  );
  await page
    .getByRole("dialog", { name: "Fargelyset", exact: true })
    .getByRole("button", { name: "Lukk innstillinger", exact: true })
    .click();
  await page
    .locator(".home-canvas")
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Rediger kort: Fargelyset", exact: true })
    .click();
  await expect(
    page.locator(".card-builder-preview [data-card-tone]"),
  ).toHaveCSS("background-color", "rgb(0, 0, 255)");
});
