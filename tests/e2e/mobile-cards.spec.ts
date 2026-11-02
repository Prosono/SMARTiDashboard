import {
  test,
  expect,
  type Page,
} from "../../frontend/node_modules/@playwright/test";
import type { GridItem } from "../../frontend/src/home/homeGridModel";

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
  await page.route("**/api/home", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      json: {
        ...(await response.json()),
        connected: true,
        controls,
        favorites: [],
        areas: [{ area_id: "living", name: "Stue" }],
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
  await page.route("**/api/home/layout/overview", (route) => {
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
    saved: () => saved,
    writes: () => writes,
    history: () => history,
  };
}
async function squares(page: Page, columns = 2) {
  const grid = page.locator(".home-canvas-grid");
  await expect(page.locator(".mobile-card-tile")).toHaveCount(12);
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
test("detailed choice persists and editing never replaces saved desktop sizes with phone squares", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const data = await setup(page),
    before = structuredClone(data.saved().items);
  await page
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
  await page.getByRole("button", { name: "Detaljert", exact: true }).click();
  await page.getByRole("button", { name: "Avbryt", exact: true }).click();
  await expect(page.locator(".mobile-card-tile")).toHaveCount(0);
  await page.reload();
  await page
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Detaljert", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Ruter", exact: true }).click();
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
  await expect(
    page.locator(".home-canvas-room-heading").filter({ hasText: "Stue" }),
  ).toBeVisible();
  await expect(page.locator(".mobile-card-tile")).not.toHaveCount(0);
  for (const [label, key] of [
    ["Klima", "climate"],
    ["Sikkerhet", "security"],
    ["Multimedia", "media"],
    ["Diverse", "misc"],
  ]) {
    await page.getByRole("tab", { name: label, exact: true }).click();
    await expect(
      page.locator(`.home-canvas[data-page="${key}"]`),
    ).toHaveAttribute("data-mobile-layout", "compact");
    await expect(page.locator(".mobile-card-tile").first()).toBeVisible();
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
  await page.getByRole("tab", { name: "Diverse", exact: true }).click();
  await expect(
    page.locator('.mobile-card-product img[src$="plug.webp"]'),
  ).toHaveAttribute("src", /plug.webp$/);
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
  await page.getByRole("button", { name: "Detaljert", exact: true }).click();
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
