import {
  test,
  expect,
  type Page,
} from "../../frontend/node_modules/@playwright/test";
import type { GridItem } from "../../frontend/src/home/homeGridModel";
import { defaultCardConfig } from "../../frontend/src/home/cardConfigModel";

// Verify the real fresh-install default, independent of detailed-mode legacy suites.
test.use({ storageState: { cookies: [], origins: [] } });
async function setup(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("smarti-home-style", "harmony");
    localStorage.setItem("smarti-theme", "dark");
  });
  const c = (
    domain: string,
    name: string,
    state: string,
    attributes: Record<string, unknown> = {},
    actions: string[] = [],
  ) => ({
    id: `${domain}.mobile`,
    entity_id: `${domain}.mobile`,
    domain,
    name,
    state,
    attributes,
    availability: "available",
    diagnostic: false,
    area_id: "living",
    device_id: null,
    integration: null,
    updated_at: null,
    capabilities: actions.length
      ? [
          {
            kind: domain,
            actions,
            unit: domain === "climate" ? "°C" : null,
            minimum: 5,
            maximum: 30,
            step: 0.5,
          },
        ]
      : [],
  });
  const climate = c(
    "climate",
    "Termostat med et langt navn",
    "heat",
    {
      temperature: 20,
      current_temperature: 16.5,
      temperature_unit: "°C",
      hvac_action: "heating",
      hvac_modes: ["heat", "cool", "off"],
    },
    ["set_temperature", "set_hvac_mode"],
  );
  const controls = [
    climate,
    c(
      "light",
      "Taklampe",
      "on",
      { brightness: 145, color_mode: "color_temp" },
      ["turn_on", "turn_off", "set_brightness"],
    ),
    c("weather", "Sjekteveien", "rainy", {
      temperature: 7.2,
      temperature_unit: "°C",
      wind_speed: 10,
      wind_speed_unit: "km/t",
    }),
    c(
      "media_player",
      "Musikk i stuen",
      "playing",
      {
        volume_level: 0.2,
        media_title: "Elegi",
        smarti_media_image: "streamer",
      },
      ["media_play", "media_pause", "set_volume"],
    ),
    c("vacuum", "Roborock", "docked", { battery_level: 100 }, [
      "start",
      "return_to_base",
    ]),
    c("sensor", "Effekt nå", "8300", {
      device_class: "power",
      unit_of_measurement: "W",
    }),
    {
      ...c("sensor", "Temperatur", "-9", {
        device_class: "temperature",
        unit_of_measurement: "°C",
      }),
      id: "sensor.mobile_temperature",
      entity_id: "sensor.mobile_temperature",
    },
    {
      ...c("sensor", "Fuktighet", "46", {
        device_class: "humidity",
        unit_of_measurement: "%",
      }),
      id: "sensor.mobile_humidity",
      entity_id: "sensor.mobile_humidity",
    },
    c("person", "Tina", "home"),
    c("lock", "Ytterdør", "locked", {}, ["lock", "unlock"]),
    c("switch", "Smart stikkontakt", "off", {}, ["turn_on", "turn_off"]),
  ];
  const areas = [{ area_id: "living", name: "Stue" }];
  const access = {
    permissions: undefined as string[] | undefined,
    connected: true,
  };
  await page.route("**/api/home", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      json: {
        ...(await response.json()),
        connected: access.connected,
        ...(access.permissions === undefined
          ? {}
          : { permissions: access.permissions }),
        controls,
        favorites: [],
        areas,
      },
    });
  });
  await page.route("**/api/home/preferences", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      json: {
        ...(await response.json()),
        weather: "weather.mobile",
        energy: "sensor.mobile",
      },
    });
  });
  await page.route("**/api/home/energy-flow/preferences", (route) =>
    route.fulfill({ json: { home: { source: "sensor.mobile" } } }),
  );
  await page.route("**/api/home/people", (route) =>
    route.fulfill({ json: { people: null, only_home: false, photos: {} } }),
  );
  const ids = [
    "weather",
    "custom:mobile_clock",
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
    items: ids.map<GridItem>((id, i) => ({
      id,
      x: i % 3,
      y: Math.floor(i / 3) * 2,
      w: 1,
      h: 2,
      ...(id.includes("clock")
        ? {
            config: {
              type: "clock",
              title: "Klokke",
              clock_style: "analog",
              sources: [],
              icon: "auto",
              image: "auto",
              period: "24",
              show_seconds: true,
              time_format: "24h",
            },
          }
        : {}),
    })),
  };
  let writes = 0,
    history = 0;
  await page.route("**/api/home/layout/*", (route) =>
    route.fulfill({ json: { revision: 0, items: null, group_by_room: true } }),
  );
  await page.route("**/api/home/layout/overview*", (route) => {
    if (route.request().method() !== "GET") {
      writes++;
      saved = {
        ...route.request().postDataJSON(),
        revision: saved.revision + 1,
      };
    }
    return route.fulfill({ json: saved });
  });
  await page.route("**/api/controls/*/history?*", (route) => {
    history++;
    return route.fulfill({
      json: {
        unit: "W",
        points: [],
        start: "2026-11-01T00:00:00Z",
        end: "2026-11-02T00:00:00Z",
      },
    });
  });
  const commands: { action: string; value?: number }[] = [];
  await page.route("**/api/controls/*/commands", (route) => {
    const body = route.request().postDataJSON();
    commands.push(body);
    if (body.action === "set_temperature")
      climate.attributes.temperature = body.value;
    return route.fulfill({ json: { status: "state_updated" } });
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
  await expect(
    page.locator('.home-canvas[data-page="overview"] .home-canvas-cell'),
  ).toHaveCount(12);
  return {
    commands,
    controls,
    areas,
    access,
    saved: () => saved,
    writes: () => writes,
    history: () => history,
  };
}
async function squares(page: Page, columns = 2) {
  const grid = page.locator(".home-canvas-grid");
  await expect(page.locator(".mobile-card-tile")).toHaveCount(12);
  await expect
    .poll(() =>
      grid.evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
      ),
    )
    .toBe(columns);
  // FLIP finishes after leaving edit mode; assess the final geometry.
  await expect
    .poll(async () =>
      grid.evaluate((el) =>
        [...el.querySelectorAll(".home-canvas-cell")].every(
          (e) =>
            Math.abs(
              e.getBoundingClientRect().width -
                e.getBoundingClientRect().height,
            ) < 2,
        ),
      ),
    )
    .toBe(true);
  const result = await grid.evaluate((el) => ({
    columns: getComputedStyle(el).gridTemplateColumns.split(" ").length,
    rects: [...el.querySelectorAll(".home-canvas-cell")].map((e) => {
      const r = e.getBoundingClientRect();
      return { w: r.width, h: r.height };
    }),
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
  }));
  expect(result.columns).toBe(columns);
  expect(result.overflow).toBe(false);
  for (const r of result.rects) {
    expect(Math.abs(r.w - r.h)).toBeLessThan(2);
    expect(r.w).toBeGreaterThan(100);
  }
}
test("fresh phones show square tiles with real readings, weather and no hidden chart requests", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const data = await setup(page);
  await squares(page);
  await expect(
    page.locator('[data-card="metric:energy"] .mobile-card-reading'),
  ).toHaveText("8,3 kW");
  await expect(
    page.locator('[data-card="weather"] .mobile-card-detail'),
  ).toHaveText("Regn");
  await expect(page.locator('[data-card="weather"] img')).toHaveAttribute(
    "src",
    /rain.webp$/,
  );
  expect(data.history()).toBe(0);
  expect(data.commands).toHaveLength(0);
  expect(data.writes()).toBe(0);
  await page.screenshot({
    path: "/private/tmp/smarti-1.36.90-mobile.png",
    fullPage: true,
  });
});
test("opening a tile mounts controls, restores focus and preserves command limits", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const data = await setup(page),
    tile = page.locator('[data-card="climate"] .mobile-card-tile');
  await tile.click();
  expect(data.commands).toHaveLength(0);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("combobox", { name: /Modus/ })).toBeVisible();
  const plus = dialog.getByRole("button", { name: /Ønsket temperatur \+/ });
  await plus.click();
  await expect.poll(() => data.commands.length).toBe(1);
  expect(data.commands[0]).toMatchObject({
    action: "set_temperature",
    value: 20.5,
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(tile).toBeFocused();
  await page.locator('[data-card="metric:energy"] .mobile-card-tile').click();
  await expect.poll(() => data.history()).toBeGreaterThan(0);
});
test("phone view choice persists and editing retains saved card data", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const data = await setup(page),
    before = structuredClone(data.saved().items);
  await page
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Valg for mobiloppsett", exact: true })
    .click();
  await page.getByRole("button", { name: "Detaljert", exact: true }).click();
  await page
    .getByRole("button", { name: "Lukk innstillinger", exact: true })
    .click();
  await page.getByRole("button", { name: "Avbryt", exact: true }).click();
  await expect(page.locator(".mobile-card-tile")).toHaveCount(0);
  await page.reload();
  await page
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Valg for mobiloppsett", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Detaljert", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Ruter", exact: true }).click();
  await page
    .getByRole("button", { name: "Lukk innstillinger", exact: true })
    .click();
  await expect(page.locator(".mobile-card-tile")).toHaveCount(0);
  await page.getByRole("button", { name: "Lagre", exact: true }).click();
  await squares(page);
  expect(data.saved().items).toEqual(before);
  expect(data.writes()).toBe(1);
});
test("tiles adapt at 320–430px, retain room grouping and return to full cards on tablets", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const data = await setup(page);
  for (const width of [320, 360, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await squares(page);
  }
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  await squares(page);
  await page.getByRole("tab", { name: "Lys", exact: true }).click();
  await expect(
    page.locator('.home-canvas[data-page="lights"]'),
  ).toHaveAttribute("data-grouped", "true");
  await expect(page.locator(".phone-room-bar")).toContainText("Stue");
  await expect(page.locator(".phone-light")).toBeVisible();
  for (const [label, key] of [
    ["Klima", "climate"],
    ["Sikkerhet", "security"],
    ["Multimedia", "media"],
    ["Mer", "misc"],
  ]) {
    await page.getByRole("tab", { name: label, exact: true }).click();
    await expect(
      page.locator(`.home-canvas[data-page="${key}"]`),
    ).toHaveAttribute(
      ["security", "media", "misc", "climate"].includes(key)
        ? "data-reference-phone"
        : "data-mobile-layout",
      ["security", "media", "misc", "climate"].includes(key)
        ? "true"
        : "compact",
    );
    await expect(
      page
        .locator(
          key === "security"
            ? ".phone-security"
            : key === "media"
              ? ".phone-media"
              : key === "misc"
                ? ".phone-misc-device"
                : ".phone-climate-device",
        )
        .first(),
    ).toBeVisible();
    await expect(page.locator(".category-heading")).toHaveCount(0);
    await expect(page.locator(".home-category-title")).toHaveCount(0);
    await expect(page.locator("[data-collapsible-toolbar]")).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Vis søk og filtre", exact: true }),
    ).toBeVisible();
  }
  await page.getByRole("tab", { name: "Oversikt", exact: true }).click();
  await page.setViewportSize({ width: 834, height: 1112 });
  await expect(page.locator(".mobile-card-tile")).toHaveCount(0);
  await expect(
    page.locator('.home-canvas[data-page="overview"]'),
  ).toHaveAttribute("data-mobile-layout", "detailed");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator(".home-canvas-cell")).toHaveCount(12);
  expect(data.writes()).toBe(0);
});
test("phone landscape uses three square columns and unavailable devices keep honest status", async ({
  page,
  isMobile,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const data = await setup(page);
  const climate = data.controls.find((c) => c.domain === "climate")!;
  climate.state = "cool";
  await page.reload();
  const tile = page.locator('[data-card="climate"] .mobile-card-tile');
  await expect(tile).toHaveAttribute("data-climate-tone", "cool");
  climate.availability = "unavailable";
  await page.reload();
  await expect(tile).toHaveAttribute("data-unavailable", "true");
  await expect(tile.locator(".mobile-card-reading")).toHaveText(
    "Utilgjengelig",
  );
  if (isMobile) {
    await page.setViewportSize({ width: 844, height: 390 });
    await squares(page, 3);
    await page.setViewportSize({ width: 390, height: 844 });
    await squares(page);
  }
  expect(data.commands).toHaveLength(0);
});
test("phone tiles retain the desktop product artwork on glass in both themes, without crowding readings", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const data = await setup(page);
  for (const theme of ["dark", "light"]) {
    await page.evaluate(
      (theme) => (document.documentElement.dataset.theme = theme),
      theme,
    );
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await squares(page);
      for (const [id, asset] of [
        ["lighting", "pendant"],
        ["media", "streamer"],
        ["vacuum", "vacuum-dock"],
      ]) {
        const tile = page.locator(`[data-card="${id}"] .mobile-card-tile`);
        const image = tile.locator(".mobile-card-product img");
        await image.scrollIntoViewIfNeeded();
        await expect(image).toHaveAttribute(
          "src",
          new RegExp(`${asset}\\.webp$`),
        );
        await expect
          .poll(() =>
            image.evaluate((img: HTMLImageElement) => img.naturalWidth),
          )
          .toBeGreaterThan(0);
        const bounds = await tile.evaluate((el) => {
          const box = (sel: string) =>
            el.querySelector(sel)!.getBoundingClientRect();
          const t = el.getBoundingClientRect(),
            product = box(".mobile-card-product"),
            title = box(".mobile-card-title"),
            reading = box(".mobile-card-reading"),
            detail = box(".mobile-card-detail");
          return {
            productBelowTitle: product.bottom > title.top + 1,
            titleBelowReading: title.bottom > reading.top + 1,
            readingBelowDetail: reading.bottom > detail.top + 1,
            clipped: detail.bottom > t.bottom,
            opacity: getComputedStyle(el).opacity,
          };
        });
        expect(bounds).toEqual({
          productBelowTitle: false,
          titleBelowReading: false,
          readingBelowDetail: false,
          clipped: false,
          opacity: "1",
        });
        const surface = page.locator(
          `[data-card="${id}"] .home-canvas-surface`,
        );
        await expect(surface).toHaveCSS("backdrop-filter", /blur\(5px\)/);
        await expect(surface).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      }
    }
    await page
      .locator(".home-canvas")
      .screenshot({ path: `/private/tmp/smarti-1.36.91-mobile-${theme}.png` });
  }
  const weather = page.locator('[data-card="weather"] .home-canvas-surface');
  expect(
    await weather.evaluate((e) =>
      getComputedStyle(e).getPropertyValue("--card-glass").trim(),
    ),
  ).toBe("");
  await page.getByRole("tab", { name: "Sikkerhet", exact: true }).click();
  await expect(
    page.locator(".mobile-card-product img").first(),
  ).toHaveAttribute("src", /lock.webp$/);
  await page.getByRole("tab", { name: "Mer", exact: true }).click();
  await expect(
    page.locator(".phone-misc-toggle .phone-misc-icon img"),
  ).toHaveAttribute("src", /plug\.webp$/);
  expect(data.history()).toBe(0);
  expect(data.commands).toHaveLength(0);
});
test("glass carries through detailed cards; photo choices, image failures and transparency preferences are respected", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const data = await setup(page);
  data.saved().items.find((i) => i.id === "vacuum")!.config = {
    type: "auto",
    title: "Robot",
    icon: "auto",
    image: "none",
    sources: [],
    period: "24",
  };
  data.saved().items.find((i) => i.id === "media")!.config = {
    type: "auto",
    title: "Musikk",
    icon: "auto",
    image: "living",
    sources: [],
    period: "24",
  };
  data.saved().items.find((i) => i.id === "climate")!.config = {
    type: "auto",
    title: "Termostat",
    icon: "auto",
    image: "plug",
    sources: [],
    period: "24",
  };
  await page.reload();
  await expect(
    page.locator('[data-card="climate"] .mobile-card-product img'),
  ).toHaveAttribute("src", /plug.webp$/);
  await expect(
    page.locator('[data-card="climate"] .home-canvas-surface'),
  ).toHaveCSS("backdrop-filter", /blur\(5px\)/);
  await expect(
    page.locator('[data-card="vacuum"] .mobile-card-product'),
  ).toHaveCount(0);
  await expect(
    page.locator('[data-card="media"] .mobile-card-photo'),
  ).toHaveAttribute("src", /home-living.webp$/);
  expect(
    await page
      .locator('[data-card="media"] .home-canvas-surface')
      .evaluate((e) =>
        getComputedStyle(e).getPropertyValue("--card-glass").trim(),
      ),
  ).toBe("");
  await page.route("**/home/equipment/pendant.webp", (route) => route.abort());
  await page.reload();
  await expect(
    page.locator('[data-card="lighting"] .mobile-card-product svg'),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Valg for mobiloppsett", exact: true })
    .click();
  await page.getByRole("button", { name: "Detaljert", exact: true }).click();
  await page
    .getByRole("button", { name: "Lukk innstillinger", exact: true })
    .click();
  await page.getByRole("button", { name: "Avbryt", exact: true }).click();
  for (const width of [390, 834, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const surface = page.locator('[data-card="lighting"] .home-canvas-surface');
    await expect(surface).toHaveCSS(
      "backdrop-filter",
      new RegExp(`blur\\(${width === 390 ? 5 : 8}px\\)`),
    );
    await expect(surface.locator(".grid-lighting-card")).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    await expect(
      page.locator('[data-card="climate"] .home-canvas-surface'),
    ).toHaveCSS(
      "backdrop-filter",
      new RegExp(`blur\\(${width === 390 ? 5 : 8}px\\)`),
    );
    await expect(
      page.locator('[data-card="weather"] .simple-weather'),
    ).toHaveAttribute("data-scene", "rain");
  }
  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
  });
  await expect(
    page.locator('[data-card="lighting"] .home-canvas-surface'),
  ).toHaveCSS("backdrop-filter", "none");
  expect(
    await page
      .locator('[data-card="lighting"] .home-canvas-surface')
      .evaluate((e) =>
        getComputedStyle(e).getPropertyValue("--glass-opacity").trim(),
      ),
  ).toBe("100%");
  await client.detach();
});
test("stronger glass keeps a light gray calendar, readable ink and fully opaque device images", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  const data = await setup(page);
  for (const theme of ["light", "dark"])
    for (const width of [390, 834, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      await expect(page.locator(".home-canvas")).toHaveAttribute(
        "data-mobile-layout",
        width === 390 ? "compact" : "detailed",
      );
      const material = await page
        .locator(".home-canvas")
        .evaluate((el, theme) => {
          const ctx = document.createElement("canvas").getContext("2d")!;
          const rgb = (color: string) => {
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, 1, 1);
            return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
          };
          const lum = (c: number[]) =>
            c.reduce(
              (sum, n, i) =>
                sum +
                (n / 255 <= 0.04045
                  ? n / 255 / 12.92
                  : ((n / 255 + 0.055) / 1.055) ** 2.4) *
                  [0.2126, 0.7152, 0.0722][i],
              0,
            );
          const background = theme === "light" ? [244, 246, 249] : [23, 28, 36];
          const results = [
            ...el.querySelectorAll<HTMLElement>(".home-canvas-surface"),
          ]
            .filter(
              (s) =>
                !s.querySelector("[data-photo], .simple-weather[data-scene]"),
            )
            .map((s) => {
              const css = getComputedStyle(s),
                readings = [
                  ...s.querySelectorAll<HTMLElement>(
                    ".mobile-card-reading,.mobile-card-detail,.harmony-device-reading,.home-metric-reading,.ambient-heading strong,.home-grid-routines header strong,.simple-date-day strong,.simple-date-day > span,.simple-agenda-empty,.simple-dashboard-date > small,.person-info strong",
                  ),
                ];
              const inks = (readings.length ? readings : [s]).map((node) =>
                lum(rgb(getComputedStyle(node).color)),
              );
              const alphas = [
                parseFloat(css.getPropertyValue("--glass-opacity")) / 100,
                parseFloat(css.getPropertyValue("--glass-depth-opacity")) / 100,
              ];
              const stops = [
                css.getPropertyValue("--card-color"),
                css.getPropertyValue("--card-depth"),
              ].map((color, i) =>
                rgb(color).map(
                  (n, j) => n * alphas[i] + background[j] * (1 - alphas[i]),
                ),
              );
              const ratios = inks.flatMap((inkL) =>
                stops.map((c) => {
                  const l = lum(c);
                  return (
                    (Math.max(l, inkL) + 0.05) / (Math.min(l, inkL) + 0.05)
                  );
                }),
              );
              return {
                id: s.closest("[data-card]")!.getAttribute("data-card"),
                tone: s.dataset.cardTone,
                opacity: alphas[0],
                color: rgb(css.getPropertyValue("--card-color")),
                contrast: Math.min(...ratios),
              };
            });
          return results;
        }, theme);
      const calendar = material.find((m) => m.id === "calendar")!;
      expect(Math.min(...calendar.color)).toBeGreaterThan(225);
      expect(
        Math.max(...calendar.color) - Math.min(...calendar.color),
      ).toBeLessThan(8);
      for (const card of material) {
        expect(
          card.contrast,
          `${theme}/${width}/${card.id}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
      expect(material.find((m) => m.id === "routines")!.opacity).toBeLessThan(
        0.86,
      );
      if (width === 1440)
        await page.locator(".home-canvas").screenshot({
          path: `/private/tmp/smarti-1.36.93-cards-${theme}.png`,
        });
    }
  data.saved().items.find((i) => i.id === "climate")!.config = {
    type: "auto",
    title: "Termostat",
    icon: "auto",
    image: "equipment-charger",
    sources: [],
    period: "24",
  };
  data.controls.find((c) => c.domain === "climate")!.availability =
    "unavailable";
  data.controls.find((c) => c.domain === "media_player")!.availability =
    "unavailable";
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.reload();
    for (const id of ["climate", "media"]) {
      const cell = page.locator(`[data-card="${id}"]`);
      await cell.scrollIntoViewIfNeeded();
      const product = cell.locator(
        width === 390
          ? ".mobile-card-product img"
          : id === "climate"
            ? ".personal-card-backdrop"
            : ".media-product-image",
      );
      await expect(product).toBeVisible();
      expect(
        await product.evaluate((img) => {
          let opacity = 1;
          for (
            let node: Element | null = img;
            node;
            node = node.parentElement
          ) {
            opacity *= Number(getComputedStyle(node).opacity);
            if (node.classList.contains("home-canvas-cell")) break;
          }
          return opacity;
        }),
      ).toBe(1);
    }
  }
  const photoCard = data.saved().items.find((i) => i.id === "climate")!;
  photoCard.config!.image = "living";
  photoCard.h = 1;
  await page.reload();
  const tiny = page.locator('[data-card="climate"]');
  await expect(tiny.locator(".personal-card-backdrop")).toHaveCSS(
    "opacity",
    "1",
  );
  await tiny.getByRole("button", { name: /Vis hele kortet/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Termostat", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Lukk innstillinger", exact: true })
    .click();
  expect(data.commands).toHaveLength(0);
});

test("phone lights have direct dimming and power controls, preserve rooms and block unavailable devices", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const data = await setup(page);
  const light = data.controls.find((c) => c.domain === "light")!;
  light.capabilities[0].minimum = 0;
  light.capabilities[0].maximum = 100;
  light.capabilities[0].step = 1;
  for (let i = 0; i < 5; i++)
    data.controls.push({
      ...structuredClone(light),
      id: `light.phone_${i}`,
      entity_id: `light.phone_${i}`,
      name: `Lys Stue ${i + 1}`,
      state: i === 4 ? "off" : "on",
      attributes: {
        brightness: 94,
        color_mode: "color_temp",
        smarti_light_type: i > 2 ? "desk" : "pendant",
      },
    });
  await page.reload();
  await page.getByRole("tab", { name: "Lys", exact: true }).click();
  const grid = page.locator('.home-canvas[data-page="lights"]');
  await expect(grid).toHaveAttribute("data-reference-phone", "true");
  await expect(
    grid.locator(".phone-light .mobile-card-product img").first(),
  ).toBeVisible();
  const range = grid.getByRole("slider", {
    name: "Taklampe: lysstyrke",
    exact: true,
  });
  await range.focus();
  await range.press("ArrowRight");
  await expect.poll(() => data.commands.length).toBe(1);
  expect(data.commands[0]).toMatchObject({
    action: "set_brightness",
    value: 58,
  });
  await grid
    .getByRole("button", { name: "Slå av: Taklampe", exact: true })
    .click();
  await expect.poll(() => data.commands.length).toBe(2);
  expect(data.commands[1]).toMatchObject({ action: "turn_off" });
  await grid.getByRole("button", { name: "Slå av alle", exact: true }).click();
  await expect.poll(() => data.commands.length).toBe(7);
  expect(
    data.commands.slice(2).every((command) => command.action === "turn_off"),
  ).toBe(true);
  expect(data.writes()).toBe(0);
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
    expect(
      await grid
        .locator(".home-canvas-grid")
        .evaluate(
          (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
        ),
    ).toBe(2);
  }
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  await page.screenshot({
    path: `/private/tmp/smarti-102-lights-${info.project.name}.png`,
    fullPage: true,
    animations: "disabled",
  });
  light.availability = "unavailable";
  await page.reload();
  await page.getByRole("tab", { name: "Lys", exact: true }).click();
  await expect(
    grid.locator('[data-card="device:light.mobile"] .phone-light'),
  ).toContainText("Utilgjengelig");
  await expect(
    grid.getByRole("slider", { name: "Taklampe: lysstyrke", exact: true }),
  ).toBeDisabled();
  await expect(
    grid.locator('[data-card="device:light.mobile"] .phone-light-power'),
  ).toBeDisabled();
  expect(data.commands).toHaveLength(7);
  await page.setViewportSize({ width: 834, height: 1112 });
  await expect(grid.locator(".phone-light")).toHaveCount(0);
});

test("phone security prioritises unavailable contacts, shows product portraits and opens cameras on demand", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const data = await setup(page);
  const template = data.controls.find((c) => c.domain === "lock")!;
  const add = (
    id: string,
    name: string,
    state: string,
    attributes: Record<string, unknown>,
    availability = "available",
  ) => ({
    ...template,
    id,
    entity_id: id,
    domain: id.split(".")[0],
    name,
    state,
    attributes,
    availability,
    capabilities: [],
  });
  data.controls.push(
    add(
      "binary_sensor.contact",
      "Åpne Lukke test",
      "unavailable",
      { device_class: "door" },
      "unavailable",
    ),
    add("binary_sensor.window", "Vindu Kontor", "off", {
      device_class: "window",
    }),
    add("binary_sensor.smoke", "Branndetektor Kontor", "off", {
      device_class: "smoke",
    }),
    add("camera.phone", "Vetles Kamera Fluent", "idle", {}),
  );
  let starts = 0;
  await page.reload();
  await page.route("**/api/home/camera/*/live", (route) => {
    starts++;
    return route.fulfill({
      status: 503,
      json: { detail: "fixture_unavailable" },
    });
  });
  await page.getByRole("tab", { name: "Sikkerhet", exact: true }).click();
  const grid = page.locator('.home-canvas[data-page="security"]');
  await expect(
    grid.locator(".phone-security[data-unavailable=true]"),
  ).toContainText("Utilgjengelig");
  await expect(
    grid.locator('[data-card="device:binary_sensor.contact"]'),
  ).toHaveCSS("grid-column-end", "span 2");
  await expect(grid.locator(".phone-camera")).toBeVisible();
  await expect(
    grid.locator('[data-card="device:binary_sensor.window"]'),
  ).toContainText("Lukket");
  await expect(
    grid.locator('[data-card="device:binary_sensor.smoke"]'),
  ).toContainText("Ingen røyk");
  expect(starts).toBe(0);
  expect(data.commands).toHaveLength(0);
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  await page.screenshot({
    path: `/private/tmp/smarti-102-security-${info.project.name}.png`,
    fullPage: true,
    animations: "disabled",
  });
  await grid
    .getByRole("button", {
      name: "Åpne kamera: Vetles Kamera Fluent",
      exact: true,
    })
    .click();
  await expect.poll(() => starts).toBe(1);
  await expect(page.getByRole("dialog")).toContainText("Vetles Kamera Fluent");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Lukk innstillinger", exact: true })
    .click();
  await expect(page.locator("video")).toHaveCount(0);
  expect(data.writes()).toBe(0);
});

test("phone multimedia matches wide TV and speaker cards, sends bounded volume commands and keeps rooms and desktop layouts", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const data = await setup(page);
  const tv = data.controls.find((c) => c.domain === "media_player")!;
  tv.name = "Samsung Q90 Series (75)";
  tv.state = "idle";
  tv.attributes = {
    volume_level: 0.2,
    device_class: "tv",
    smarti_media_image: "tv",
  };
  tv.capabilities = [
    {
      kind: "media",
      actions: [
        "media_play",
        "media_pause",
        "turn_on",
        "turn_off",
        "set_volume",
      ],
      unit: "%",
      minimum: 0,
      maximum: 100,
      step: 1,
    },
  ];
  const speaker = {
    ...structuredClone(tv),
    id: "media_player.voice",
    entity_id: "media_player.voice",
    name: "SMARTi Voice Stue",
    attributes: { volume_level: 0.98, smarti_media_image: "mini" },
  };
  const power = {
    ...structuredClone(tv),
    id: "media_player.power",
    entity_id: "media_player.power",
    name: "TV Stue",
    state: "on",
    capabilities: [{ ...tv.capabilities[0], actions: ["turn_on", "turn_off"] }],
  };
  data.controls.push(speaker, power, {
    ...structuredClone(speaker),
    id: "media_player.bedroom",
    entity_id: "media_player.bedroom",
    name: "Soveromsspiller",
    area_id: "bedroom",
  });
  data.areas.push({ area_id: "bedroom", name: "Soverom" });
  const sent: { entity: string; action: string; value?: number }[] = [];
  await page.route("**/api/controls/media_player.*/commands", async (route) => {
    const entity = decodeURIComponent(
      new URL(route.request().url()).pathname.split("/").at(-2)!,
    );
    const body = route.request().postDataJSON();
    sent.push({ entity, ...body });
    if (body.action === "set_volume")
      speaker.attributes.volume_level = body.value / 100;
    if (body.action === "turn_off") power.state = "off";
    return route.fulfill({ json: { status: "state_updated" } });
  });
  await page.reload();
  await page.getByRole("tab", { name: "Multimedia", exact: true }).click();
  const grid = page.locator('.home-canvas[data-page="media"]');
  await expect(grid).toHaveAttribute("data-reference-phone", "true");
  await expect(grid.locator(".phone-media")).toHaveCount(3);
  await expect(grid.getByLabel("Velg rom", { exact: true })).toHaveValue(
    "room:living",
  );
  const television = grid.locator('[data-card="device:media_player.mobile"]');
  const voice = grid.locator('[data-card="device:media_player.voice"]');
  await expect(television.locator(".mobile-card-product img")).toHaveJSProperty(
    "naturalWidth",
    600,
  );
  await expect(voice.locator(".mobile-card-product img")).toHaveJSProperty(
    "naturalWidth",
    600,
  );
  await voice
    .getByRole("button", {
      name: "SMARTi Voice Stue: Høyere volum",
      exact: true,
    })
    .click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toEqual({
    entity: speaker.entity_id,
    action: "set_volume",
    value: 100,
  });
  await expect(
    voice.getByRole("button", {
      name: "SMARTi Voice Stue: Høyere volum",
      exact: true,
    }),
  ).toBeDisabled();
  await voice
    .getByRole("button", {
      name: "SMARTi Voice Stue: Lavere volum",
      exact: true,
    })
    .click();
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1].value).toBe(95);
  await grid
    .getByRole("button", { name: "Slå av: TV Stue", exact: true })
    .click();
  await expect(
    grid.getByRole("button", { name: "Slå på: TV Stue", exact: true }),
  ).toBeVisible();
  await television
    .getByRole("button", { name: "Fjernkontroll", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").locator(".media-player-card"),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    television.getByRole("button", { name: "Fjernkontroll", exact: true }),
  ).toBeFocused();
  await grid
    .getByRole("button", { name: "Soverom 1 spiller", exact: true })
    .click();
  await expect(grid.locator(".phone-media")).toHaveCount(1);
  await expect(grid).toContainText("Soveromsspiller");
  await grid.getByLabel("Velg rom", { exact: true }).selectOption("all");
  await expect(grid.locator(".phone-media")).toHaveCount(4);
  await grid
    .getByLabel("Velg rom", { exact: true })
    .selectOption("room:living");
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      )
      .toBeLessThanOrEqual(1);
    for (const card of await grid.locator(".phone-media").all()) {
      expect(
        await card.evaluate((el) => el.scrollHeight - el.clientHeight),
      ).toBeLessThanOrEqual(1);
      const box = await card.boundingBox();
      expect(box!.width).toBeGreaterThan(width - 75);
      for (const image of await card.locator(".phone-media-art img").all()) {
        expect(
          await image.evaluate((el) => {
            const image = el.getBoundingClientRect();
            const frame = el
              .closest(".phone-media-art")!
              .getBoundingClientRect();
            return (
              image.top >= frame.top - 1 && image.bottom <= frame.bottom + 1
            );
          }),
        ).toBe(true);
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.locator(".home-tabs").evaluate((el) => {
        const r = el.getBoundingClientRect(),
          t = el
            .querySelector('[aria-selected="true"]')!
            .getBoundingClientRect();
        return t.left >= r.left - 1 && t.right <= r.right + 1;
      }),
    )
    .toBe(true);
  for (const theme of ["dark", "light"]) {
    await page.evaluate(
      (theme) => (document.documentElement.dataset.theme = theme),
      theme,
    );
    await page.screenshot({
      path: `/private/tmp/smarti-104-media-${theme}-${info.project.name}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  expect(data.writes()).toBe(0);
  await page
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
  await expect(grid).toHaveAttribute("data-editing", "true");
  await expect(grid.locator(".phone-media")).toHaveCount(0);
  await page.getByRole("button", { name: "Avbryt", exact: true }).click();
  await expect(grid.locator(".phone-media")).toHaveCount(3);
  await page.setViewportSize({ width: 834, height: 1112 });
  await expect(grid.locator(".phone-media")).toHaveCount(0);
  await expect(grid.locator(".media-player-card")).toHaveCount(4);
  expect(data.writes()).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  speaker.availability = "unavailable";
  await page.reload();
  await page.getByRole("tab", { name: "Multimedia", exact: true }).click();
  await expect(voice).toContainText("Utilgjengelig");
  await expect(
    voice.getByRole("button", {
      name: "SMARTi Voice Stue: Lavere volum",
      exact: true,
    }),
  ).toBeDisabled();
  speaker.availability = "available";
  data.access.permissions = ["home.view", "media.view"];
  await page.reload();
  await page.getByRole("tab", { name: "Multimedia", exact: true }).click();
  await expect(
    voice.getByRole("button", {
      name: "SMARTi Voice Stue: Lavere volum",
      exact: true,
    }),
  ).toBeDisabled();
  await voice
    .getByRole("button", { name: "Åpne spiller", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("slider", { name: "SMARTi Voice Stue: Volum", exact: true }),
  ).toBeDisabled();
  expect(sent).toHaveLength(3);
});

test("phone More groups blinds and switches by room, confirms movement and preserves honest command state", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const data = await setup(page);
  const base = structuredClone(
    data.controls.find((c) => c.domain === "switch")!,
  );
  data.controls.splice(
    data.controls.findIndex((c) => c.domain === "vacuum"),
    1,
  );
  const eco = data.controls.find((c) => c.domain === "switch")!;
  Object.assign(eco, { name: "Eco Level 1", state: "on", area_id: "" });
  const cover = Object.assign(structuredClone(base), {
    domain: "cover",
    id: "cover.bath",
    entity_id: "cover.bath",
    name: "Persienner",
    device_name: "Test group for covers",
    area_id: "bath",
    state: "closed",
    attributes: { device_class: "blind", current_position: 0 },
    capabilities: [
      {
        ...base.capabilities[0],
        actions: ["open_cover", "stop_cover", "close_cover"],
      },
    ],
  });
  const away = Object.assign(structuredClone(base), {
    domain: "input_boolean",
    id: "input_boolean.away",
    entity_id: "input_boolean.away",
    name: "Bortemodus",
    device_name: "Termostat_Bad",
    area_id: "bath",
    state: "off",
  });
  data.controls.push(
    cover,
    away,
    {
      ...structuredClone(base),
      id: "switch.load",
      entity_id: "switch.load",
      name: "SIMULERT SMARTi testlast",
      area_id: "",
    },
    {
      ...structuredClone(base),
      id: "switch.extra",
      entity_id: "switch.extra",
      name: "Ekstra bryter",
      area_id: "",
    },
  );
  data.areas.push({ area_id: "bath", name: "Bad" });
  let groupByRoom = true,
    writes = 0,
    status = "state_updated";
  let customItems: GridItem[] | null = null;
  await page.route("**/api/home/layout/misc*", (route) => {
    if (route.request().method() !== "GET") writes++;
    return route.fulfill({
      json: { revision: 0, items: customItems, group_by_room: groupByRoom },
    });
  });
  const sent: { entity: string; action: string; confirmed?: boolean }[] = [];
  await page.route("**/api/controls/*/commands", (route) => {
    const entity = decodeURIComponent(
      new URL(route.request().url()).pathname.split("/").at(-2)!,
    );
    const body = route.request().postDataJSON();
    sent.push({ entity, ...body });
    if (status === "state_updated") {
      const c = data.controls.find((c) => c.entity_id === entity)!;
      if (body.action === "turn_off") c.state = "off";
      if (body.action === "turn_on") c.state = "on";
      if (body.action === "open_cover") c.state = "opening";
    }
    return route.fulfill({ json: { status } });
  });
  await page.reload();
  await page.getByRole("tab", { name: "Mer", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Mer", exact: true, level: 1 }),
  ).toBeVisible();
  const grid = page.locator('.home-canvas[data-page="misc"]');
  await expect(grid).toHaveAttribute("data-reference-phone", "true");
  const bath = grid.getByRole("region", { name: "Bad", exact: true });
  const none = grid.getByRole("region", { name: "Uten rom", exact: true });
  const roomPicker = grid
    .locator(".phone-room-bar")
    .getByRole("combobox", { name: "Velg rom", exact: true });
  await expect(roomPicker).toBeVisible();
  await expect(roomPicker).toHaveValue("all");
  await roomPicker.selectOption("room:bath");
  await expect(grid.locator(".phone-misc-device")).toHaveCount(2);
  await expect(none).toHaveCount(0);
  await expect(bath.locator("h2")).toBeHidden();
  await roomPicker.selectOption("none");
  await expect(bath).toHaveCount(0);
  await expect(grid.locator(".phone-misc-toggle")).toHaveCount(2);
  await roomPicker.selectOption("all");
  expect(sent).toHaveLength(0);
  expect(writes).toBe(0);
  await expect(bath).toBeVisible();
  await expect(none.locator("h2")).toContainText("3 enheter");
  await expect(bath.locator(".phone-misc-cover")).toContainText("Lukket");
  await expect(bath.locator(".phone-misc-art svg")).toBeVisible();
  const coverBox = (await bath.locator(".phone-misc-cover").boundingBox())!;
  const awayBox = (await bath.locator(".phone-misc-toggle").boundingBox())!;
  expect(coverBox.y + coverBox.height).toBeLessThanOrEqual(awayBox.y);
  await expect(
    bath.getByRole("switch", { name: "Bortemodus: av/på", exact: true }),
  ).toBeChecked({ checked: false });
  await expect(none.locator(".phone-misc-toggle")).toHaveCount(2);
  await none
    .getByRole("button", { name: "Vis alle 3 enheter", exact: true })
    .click();
  await expect(none.locator(".phone-misc-toggle")).toHaveCount(3);
  await none.getByRole("button", { name: "Vis færre", exact: true }).click();
  await bath
    .getByRole("button", { name: "Åpne: Persienner", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Åpne Persienner?", exact: true }),
  ).toBeVisible();
  expect(sent).toHaveLength(0);
  await page.getByRole("button", { name: "Avbryt", exact: true }).click();
  expect(sent).toHaveLength(0);
  await bath
    .getByRole("button", { name: "Åpne: Persienner", exact: true })
    .click();
  await page.getByRole("button", { name: "Bekreft", exact: true }).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toEqual({
    entity: "cover.bath",
    action: "open_cover",
    confirmed: true,
  });
  await expect(bath.locator(".phone-misc-state")).toHaveText("Åpner");
  await bath
    .getByRole("button", { name: "Stopp: Persienner", exact: true })
    .click();
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1]).toEqual({ entity: "cover.bath", action: "stop_cover" });
  const ecoSwitch = none.getByRole("switch", {
    name: "Eco Level 1: av/på",
    exact: true,
  });
  await ecoSwitch.click();
  await expect(ecoSwitch).toBeChecked({ checked: false });
  expect(sent[2]).toEqual({ entity: eco.entity_id, action: "turn_off" });
  status = "accepted_unconfirmed";
  await ecoSwitch.click();
  await expect(none.getByRole("status")).toContainText("Venter på bekreftelse");
  await expect(ecoSwitch).toBeChecked({ checked: false });
  expect(sent).toHaveLength(4);
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      )
      .toBeLessThanOrEqual(1);
    for (const card of await grid.locator(".phone-misc-device").all()) {
      expect(
        await card.evaluate((el) => el.scrollHeight - el.clientHeight),
      ).toBeLessThanOrEqual(1);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const theme of ["dark", "light"]) {
    await page.evaluate(
      (theme) => (document.documentElement.dataset.theme = theme),
      theme,
    );
    await grid.screenshot({
      path: `/private/tmp/smarti-105-more-${theme}-${info.project.name}.png`,
      animations: "disabled",
    });
  }
  await page
    .getByRole("button", { name: "Vis søk og filtre", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Søk i diverse", exact: true })
    .fill("Persienner");
  await expect(grid.locator(".phone-misc-device")).toHaveCount(1);
  await page
    .getByRole("textbox", { name: "Søk i diverse", exact: true })
    .fill("");
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
  await expect(grid).toHaveAttribute("data-editing", "true");
  await expect(grid.locator(".phone-misc-board")).toHaveCount(0);
  await page.getByRole("button", { name: "Avbryt", exact: true }).click();
  await expect(grid.locator(".phone-misc-board")).toBeVisible();
  await page.setViewportSize({ width: 834, height: 1112 });
  await expect(
    page.getByRole("tab", { name: "Diverse", exact: true }),
  ).toBeVisible();
  await expect(grid.locator(".phone-misc-board")).toHaveCount(0);
  expect(writes).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  groupByRoom = false;
  eco.availability = "unavailable";
  data.access.permissions = ["other.view", "security.view"];
  await page.reload();
  await page.getByRole("tab", { name: "Mer", exact: true }).click();
  await expect(grid.locator(".phone-misc-room h2")).toHaveCount(0);
  await expect(
    grid.locator('[data-card="device:switch.mobile"]'),
  ).toContainText("Utilgjengelig");
  await expect(
    grid.getByRole("switch", { name: "Eco Level 1: av/på", exact: true }),
  ).toBeDisabled();
  await expect(
    grid.getByRole("button", { name: "Åpne: Persienner", exact: true }),
  ).toBeDisabled();
  await expect(
    grid.getByRole("switch", { name: "Bortemodus: av/på", exact: true }),
  ).toBeDisabled();
  expect(sent).toHaveLength(4);
  expect(writes).toBe(0);
  customItems = [
    {
      id: `device:${eco.entity_id}`,
      x: 0,
      y: 0,
      w: 2,
      h: 3,
      config: {
        ...defaultCardConfig([away.entity_id]),
        title: "Min bortemodus med et ekstra langt navn på enheten",
        image: "equipment-switch",
        icon: "home",
      },
    },
    {
      id: "custom:more_clock",
      x: 2,
      y: 0,
      w: 1,
      h: 2,
      config: { ...defaultCardConfig([]), type: "clock", title: "Min klokke" },
    },
    { id: "device:switch.load", x: 0, y: 3, w: 1, h: 2 },
  ];
  const before = structuredClone(customItems);
  await page.reload();
  await page.getByRole("tab", { name: "Mer", exact: true }).click();
  await roomPicker.selectOption("room:bath");
  await expect(grid.locator(".home-canvas-cell")).toHaveCount(2);
  await expect(grid.locator(".phone-misc-toggle")).toContainText(
    "Min bortemodus",
  );
  await expect(
    grid.locator('.phone-misc-icon img[src$="switch.webp"]'),
  ).toBeVisible();
  await expect(grid.locator(".mobile-card-tile")).toContainText("Min klokke");
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await grid
      .locator(".phone-misc-device")
      .evaluate((el) => el.scrollHeight - el.clientHeight),
  ).toBeLessThanOrEqual(1);
  expect(customItems).toEqual(before);
  expect(writes).toBe(0);
  await page.emulateMedia({ forcedColors: "active" });
  const systemColors = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.cssText = "color:CanvasText;background:Canvas";
    document.body.append(probe);
    const colors = {
      background: getComputedStyle(probe).backgroundColor,
      color: getComputedStyle(probe).color,
    };
    probe.remove();
    return colors;
  });
  await expect(grid.locator(".phone-misc-device")).toHaveCSS(
    "color",
    systemColors.color,
  );
  await expect(grid.locator(".home-canvas-surface").first()).toHaveCSS(
    "background-color",
    systemColors.background,
  );
});

test("phone climate shows a real thermostat, AC readings and sensor disclosure with safe adjustments and room selection", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const data = await setup(page);
  const thermostat = data.controls.find((c) => c.domain === "climate")!;
  thermostat.name = "Termostat · Vaskerom";
  thermostat.area_id = "laundry";
  thermostat.attributes.current_temperature = 20.5;
  const minimum = data.controls.find(
    (c) => c.entity_id === "sensor.mobile_temperature",
  )!;
  Object.assign(minimum, {
    name: "Minimumstemperatur",
    area_id: "",
    device_name: "Temperature Min",
  });
  const forecast = data.controls.find(
    (c) => c.entity_id === "sensor.mobile_humidity",
  )!;
  Object.assign(forecast, {
    name: "Prognosetemperatur",
    state: "5.6",
    area_id: "",
    device_name: "SMARTi Forecast",
    attributes: { device_class: "temperature", unit_of_measurement: "°C" },
  });
  const ac = Object.assign(structuredClone(thermostat), {
    id: "climate.ac",
    entity_id: "climate.ac",
    area_id: "",
    name: "Stue · AC",
    state: "cool",
    attributes: {
      temperature: 20,
      current_temperature: 22.1,
      temperature_unit: "°C",
      hvac_action: "cooling",
      hvac_modes: ["cool", "heat", "off"],
    },
  });
  data.controls.push(ac);
  for (let i = 0; i < 7; i++)
    data.controls.push(
      Object.assign(structuredClone(minimum), {
        id: `sensor.extra_climate_${i}`,
        entity_id: `sensor.extra_climate_${i}`,
        name:
          i === 0
            ? "Duggpunkt"
            : i === 1
              ? "Temperatur · Bil"
              : `Temperatur ${i + 1}`,
        device_name: i === 0 ? "SMARTi Forecast" : "Temperatursensor",
        state: String(7 + i / 10),
      }),
    );
  data.areas.push({ area_id: "laundry", name: "Vaskerom" });
  const sent: { entity: string; action: string; value?: number }[] = [];
  let status = "state_updated",
    writes = 0;
  await page.route("**/api/home/layout/climate*", (route) => {
    if (route.request().method() !== "GET") writes++;
    return route.fulfill({
      json: { revision: 0, items: null, group_by_room: true },
    });
  });
  await page.route("**/api/controls/*/commands", (route) => {
    const entity = decodeURIComponent(
      new URL(route.request().url()).pathname.split("/").at(-2)!,
    );
    const body = route.request().postDataJSON();
    sent.push({ entity, ...body });
    if (status === "state_updated" && body.action === "set_temperature")
      thermostat.attributes.temperature = body.value;
    return route.fulfill({ json: { status } });
  });
  await page.reload();
  await page.getByRole("tab", { name: "Klima", exact: true }).click();
  const grid = page.locator('.home-canvas[data-page="climate"]');
  const thermo = grid.locator(".phone-climate-thermostat");
  const plus = thermo.getByRole("button", {
    name: "Termostat · Vaskerom: Øk ønsket temperatur",
    exact: true,
  });
  const minus = thermo.getByRole("button", {
    name: "Termostat · Vaskerom: Senk ønsket temperatur",
    exact: true,
  });
  const picker = grid
    .locator(".phone-room-bar")
    .getByRole("combobox", { name: "Velg rom", exact: true });
  await expect(grid).toHaveAttribute("data-reference-phone", "true");
  await expect(
    thermo.locator(".phone-climate-art .equipment-art.art-thermostat"),
  ).toBeVisible();
  await expect(
    grid.locator(".phone-climate-ac .mobile-card-product"),
  ).toBeVisible();
  await expect(thermo.locator(".phone-climate-art > svg")).toBeHidden();
  await expect(thermo.locator(".phone-climate-setpoint > strong")).toHaveText(
    "20 °C",
  );
  await expect(thermo).toContainText("Målt av termostat: 20,5 °C");
  await expect(thermo.locator(".phone-climate-mode")).toContainText(
    "Varmemodus",
  );
  await expect(grid.locator(".phone-climate-ac-values")).toContainText(
    "22,1 °C",
  );
  await expect(grid.locator(".phone-climate-ac-values")).toContainText("20 °C");
  const unassigned = grid.getByRole("region", {
    name: "Uten rom",
    exact: true,
  });
  await expect(unassigned.locator("h2")).toContainText("9 sensorer");
  await expect(unassigned.locator(".phone-climate-sensor")).toHaveCount(4);
  await unassigned
    .getByRole("button", { name: "Vis alle 9 sensorer", exact: true })
    .click();
  await expect(unassigned.locator(".phone-climate-sensor")).toHaveCount(9);
  await unassigned
    .getByRole("button", { name: "Vis færre sensorer", exact: true })
    .click();
  await picker.selectOption("room:laundry");
  await expect(grid.locator(".phone-climate-device")).toHaveCount(1);
  await expect(grid.locator(".phone-climate-room h2")).toBeHidden();
  await picker.selectOption("none");
  await expect(thermo).toHaveCount(0);
  await picker.selectOption("all");
  expect(sent).toHaveLength(0);
  expect(writes).toBe(0);
  expect(data.history()).toBe(0);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (theme) => (document.documentElement.dataset.theme = theme),
      theme,
    );
    await grid.screenshot({
      path: `/private/tmp/smarti-107-climate-${theme}-${info.project.name}.png`,
      animations: "disabled",
    });
  }
  await plus.click();
  await expect(thermo.locator(".phone-climate-setpoint > strong")).toHaveText(
    "20,5 °C",
  );
  expect(sent[0]).toEqual({
    entity: thermostat.entity_id,
    action: "set_temperature",
    value: 20.5,
  });
  await minus.click();
  await expect(thermo.locator(".phone-climate-setpoint > strong")).toHaveText(
    "20 °C",
  );
  await grid
    .getByRole("button", { name: "Åpne klima: Stue · AC", exact: true })
    .click();
  await expect(page.getByRole("dialog").locator(".thermostat")).toBeVisible();
  await page.keyboard.press("Escape");
  const sensor = grid.locator(
    '[data-card="device:sensor.mobile_temperature"] .phone-climate-sensor',
  );
  await sensor.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect.poll(() => data.history()).toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await expect(sensor).toBeFocused();
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      )
      .toBeLessThanOrEqual(1);
    for (const card of await grid.locator(".phone-climate-device").all())
      expect(
        await card.evaluate((el) => el.scrollHeight - el.clientHeight),
      ).toBeLessThanOrEqual(1);
  }
  await page
    .getByRole("button", { name: "Vis søk og filtre", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Søk i klima", exact: true })
    .fill("Duggpunkt");
  // The existing category search includes the matching room's sources.
  await expect(unassigned).toBeVisible();
  await page
    .getByRole("textbox", { name: "Søk i klima", exact: true })
    .fill("");
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
  await expect(grid.locator(".phone-climate-board")).toHaveCount(0);
  await page.getByRole("button", { name: "Avbryt", exact: true }).click();
  await expect(thermo).toBeVisible();
  await page.setViewportSize({ width: 834, height: 1112 });
  await expect(grid.locator(".phone-climate-board")).toHaveCount(0);
  await expect(grid.locator(".thermostat")).toHaveCount(2);
  expect(writes).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  thermostat.attributes.temperature = 30;
  await page.reload();
  await page.getByRole("tab", { name: "Klima", exact: true }).click();
  await expect(plus).toBeDisabled();
  thermostat.capabilities[0].minimum = -10;
  thermostat.attributes.temperature = 0;
  thermostat.state = "cool";
  thermostat.attributes.hvac_action = "cooling";
  await page.reload();
  await page.getByRole("tab", { name: "Klima", exact: true }).click();
  await expect(thermo).toHaveAttribute("data-tone", "cool");
  await expect(thermo.locator(".phone-climate-setpoint > strong")).toHaveText(
    "0 °C",
  );
  await minus.click();
  await expect(thermo.locator(".phone-climate-setpoint > strong")).toHaveText(
    "−0,5 °C",
  );
  status = "accepted_unconfirmed";
  await plus.click();
  await expect(thermo.getByRole("status")).toContainText(
    "Venter på termostaten",
  );
  await expect(thermo.locator(".phone-climate-setpoint > strong")).toHaveText(
    "−0,5 °C",
  );
  status = "failed";
  await plus.click();
  await expect(thermo.getByRole("status")).toContainText(
    "Kunne ikke stille temperaturen",
  );
  expect(sent).toHaveLength(5);
  data.access.permissions = ["climate.view"];
  await page.reload();
  await page.getByRole("tab", { name: "Klima", exact: true }).click();
  await expect(plus).toBeDisabled();
  await expect(thermo).toContainText("Kun visning");
  thermostat.availability = "unavailable";
  await page.reload();
  await page.getByRole("tab", { name: "Klima", exact: true }).click();
  await expect(thermo.locator(".phone-climate-setpoint > strong")).toHaveText(
    "—",
  );
  await expect(minus).toBeDisabled();
  expect(sent).toHaveLength(5);
  expect(writes).toBe(0);
});
