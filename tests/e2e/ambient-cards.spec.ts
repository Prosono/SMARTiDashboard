import {
  test,
  expect,
  type Page,
} from "../../frontend/node_modules/@playwright/test";

test.use({ timezoneId: "America/New_York" });
const fixed = new Date("2026-11-01T12:34:56Z");
const skyFixture = () => ({
  generated_at: fixed.toISOString(),
  timezone: "Europe/Oslo",
  demo: false,
  available: true,
  location_status: "configured",
  day: {
    date: "2026-11-01",
    start: "2026-10-31T23:00:00Z",
    end: "2026-11-01T23:00:00Z",
  },
  sun: {
    azimuth: 185,
    altitude: 15,
    rise: "2026-11-01T06:40:00Z",
    set: "2026-11-01T15:20:00Z",
    noon: "2026-11-01T11:30:00Z",
    state: "normal",
    daylight_seconds: 31200,
  },
  moon: {
    azimuth: 45,
    altitude: -30,
    rise: "2026-11-01T19:20:00Z",
    set: "2026-11-01T09:20:00Z",
    state: "normal",
    phase: 0.75,
    fraction: 0.5,
  },
  path: [
    {
      time: "2026-10-31T23:00:00Z",
      sun: { azimuth: 350, altitude: -40 },
      moon: { azimuth: 5, altitude: 40 },
    },
    {
      time: fixed.toISOString(),
      sun: { azimuth: 185, altitude: 15 },
      moon: { azimuth: 45, altitude: -30 },
    },
    {
      time: "2026-11-01T23:00:00Z",
      sun: { azimuth: 5, altitude: -35 },
      moon: { azimuth: 340, altitude: 25 },
    },
  ],
});
const config = (type: string, title = "", extra = {}) => ({
  type,
  title,
  sources: [],
  icon: "auto",
  image: "auto",
  period: "24",
  ...extra,
});

async function setup(page: Page, initial: any[] = []) {
  await page.addInitScript(() =>
    localStorage.setItem("smarti-home-style", "harmony"),
  );
  await page.clock.setFixedTime(fixed);
  const layouts = new Map<string, any>([
    ["/api/home/layout/overview", { revision: 0, items: initial }],
  ]);
  await page.route("**/api/home/layout/*", (route) => {
    const key = new URL(route.request().url()).pathname;
    const current = layouts.get(key) || { revision: 0, items: null };
    if (route.request().method() === "GET")
      return route.fulfill({ json: current });
    const next = {
      ...route.request().postDataJSON(),
      revision: current.revision + 1,
    };
    layouts.set(key, next);
    return route.fulfill({ json: next });
  });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(page.locator(".home-welcome")).toBeVisible();
  if (!(await page.locator(".home-canvas").count())) {
    await page
      .getByRole("navigation", { name: "Hovedmeny" })
      .getByRole("button", { name: "Innstillinger", exact: true })
      .click();
    await page
      .locator('.experience-picker button[data-mode="advanced"]')
      .click();
    await page
      .getByRole("navigation", { name: "Hovedmeny" })
      .getByRole("button", { name: "Hjem", exact: true })
      .click();
  }
  return layouts;
}

test("all seven time/sky designs add from graphical previews, keep options and show home time rather than panel time", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  let skyRequests = 0;
  await page.route("**/api/home/sky", (route) => {
    skyRequests++;
    return route.fulfill({ json: skyFixture() });
  });
  const commands: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/commands")) commands.push(r.url());
  });
  const layouts = await setup(page);
  await page.setViewportSize({
    width: info.project.name === "mobile" ? 390 : 1440,
    height: 1100,
  });
  const canvas = page.locator(".home-canvas");
  await canvas
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
  const names = [
    "Digital klokke",
    "Analog klokke",
    "Orbital klokke",
    "Horisont",
    "Dagslys",
    "Månefase",
    "Dato og uke",
  ];
  for (const [index, name] of names.entries()) {
    await canvas
      .getByRole("button", { name: "Legg til kort", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Legg til kort",
      exact: true,
    });
    await dialog
      .getByRole("button", { name: "Klokke og himmel", exact: true })
      .click();
    if (index === 0) {
      await expect(
        dialog.locator(".card-ambient-options > button"),
      ).toHaveCount(7);
      await dialog.screenshot({
        path: `/private/tmp/smarti-time-picker-${info.project.name}.png`,
        animations: "disabled",
      });
    }
    await dialog.getByRole("button", { name, exact: true }).click();
    if (index === 0) {
      await expect(dialog.locator(".ambient-digital-face > time")).toHaveText(
        "13:34",
      );
      await dialog
        .getByRole("textbox", { name: "Navn på kortet", exact: true })
        .fill("Klokke hjemme");
      await expect(
        dialog.getByRole("checkbox", { name: "Vis sekunder", exact: true }),
      ).toBeChecked();
    }
    if (name === "Horisont")
      await expect(dialog.locator(".ambient-sky-readings")).toContainText(
        "Under horisonten",
      );
    await dialog
      .getByRole("button", { name: "Legg til kort", exact: true })
      .click();
  }
  await canvas.getByRole("button", { name: "Lagre", exact: true }).click();
  await expect(canvas.locator(".ambient-card")).toHaveCount(7);
  await expect(canvas.locator(".home-canvas-expand")).toHaveCount(0);
  const items = layouts.get("/api/home/layout/overview").items;
  expect(items.every((item: any) => item.config.sources.length === 0)).toBe(
    true,
  );
  expect(
    items.find((item: any) => item.config.type === "horizon"),
  ).toMatchObject({ w: 2, h: 3 });
  expect(skyRequests).toBeLessThanOrEqual(3);
  const digital = canvas.locator(".ambient-clock-digital");
  await expect(digital.locator(".ambient-digital-face > time")).toHaveText(
    "13:34",
  );
  await page.clock.setFixedTime(new Date("2026-11-01T12:34:59Z"));
  await expect(digital.locator(".ambient-digital-face > span > b")).toHaveText(
    "59",
  );
  for (const theme of ["light", "dark"]) {
    await page
      .getByRole("navigation", { name: "Hovedmeny" })
      .getByRole("button", { name: "Innstillinger", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Tema og utseende", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Utseende", exact: true })
      .selectOption(theme);
    await page
      .getByRole("navigation", { name: "Hovedmeny" })
      .getByRole("button", { name: "Hjem", exact: true })
      .click();
    await canvas.screenshot({
      path: `/private/tmp/smarti-time-cards-${theme}-${info.project.name}.png`,
      animations: "disabled",
    });
    expect(
      await canvas.locator(".home-canvas-content").evaluateAll((nodes) =>
        nodes.every((node) => {
          node.scrollTop = 30;
          node.scrollLeft = 30;
          return node.scrollTop === 0 && node.scrollLeft === 0;
        }),
      ),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
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
  await editor
    .getByRole("button", { name: "Analog klokke", exact: true })
    .click();
  await editor
    .getByRole("combobox", { name: "Tidsformat", exact: true })
    .selectOption("12h");
  await editor
    .getByRole("checkbox", { name: "Vis sekunder", exact: true })
    .uncheck();
  await editor
    .getByRole("button", { name: "Bruk endringer", exact: true })
    .click();
  await canvas.getByRole("button", { name: "Lagre", exact: true }).click();
  await page.reload();
  expect(
    layouts.get("/api/home/layout/overview").items[0].config,
  ).toMatchObject({
    type: "clock",
    clock_style: "analog",
    show_seconds: false,
    time_format: "12h",
  });
  await expect(
    canvas
      .getByRole("article", { name: "Klokke hjemme", exact: true })
      .locator(".ambient-hand-second"),
  ).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await canvas
      .locator(".ambient-card")
      .evaluateAll(
        (nodes) =>
          nodes.flatMap((node) => node.getAnimations({ subtree: true })).length,
      ),
  ).toBe(0);
  expect(commands).toEqual([]);
});

test("sky cards distinguish missing location, unavailable data, polar nights and stale positions while clocks keep working", async ({
  page,
}, info) => {
  let mode = "missing";
  await page.route("**/api/home/sky", (route) => {
    if (mode === "error")
      return route.fulfill({ status: 503, json: { detail: "unavailable" } });
    const sky = skyFixture();
    if (mode === "missing")
      return route.fulfill({
        json: {
          ...sky,
          timezone: "Pacific/Auckland",
          available: false,
          location_status: "missing",
          sun: null,
          moon: { phase: 0.75, fraction: 0.5 },
          path: [],
        },
      });
    return route.fulfill({
      json: {
        ...sky,
        sun: {
          ...sky.sun,
          rise: null,
          set: null,
          altitude: -20,
          state: "always_down",
          daylight_seconds: 0,
        },
      },
    });
  });
  const types = ["clock", "horizon", "daylight", "moon"];
  await setup(
    page,
    types.map((type, i) => ({
      id: `custom:ambient_${type}`,
      x: i % 3,
      y: Math.floor(i / 3) * 3,
      w: 1,
      h: 3,
      config: config(type),
    })),
  );
  await page.setViewportSize({
    width: info.project.name === "mobile" ? 390 : 1440,
    height: 1100,
  });
  const canvas = page.locator(".home-canvas");
  await expect(
    canvas.locator(".ambient-clock .ambient-digital-face > time"),
  ).toHaveText("01:34");
  await expect(canvas.locator(".ambient-clock-date")).toContainText(
    "2. november",
  );
  await expect(canvas.locator(".ambient-horizon")).toContainText(
    "Hjemmets plassering mangler",
  );
  await expect(canvas.locator(".ambient-moon")).toContainText("50 %");
  mode = "error";
  await page.reload();
  await expect(
    canvas.locator(".ambient-clock .ambient-digital-face > time"),
  ).toHaveText("07:34");
  await expect(canvas.locator(".ambient-clock .ambient-heading")).toContainText(
    "Enhetens tid",
  );
  await expect(canvas.locator(".ambient-horizon")).toContainText(
    "Kan ikke hente himmeldata",
  );
  mode = "polar";
  await canvas
    .locator(".ambient-horizon")
    .getByRole("button", { name: "Prøv igjen", exact: true })
    .click();
  await expect(canvas.locator(".ambient-daylight")).toContainText(
    "Solen står ikke opp i dag",
  );
  await expect(
    canvas.locator(".ambient-horizon .ambient-sky-readings"),
  ).toContainText("Under horisonten");
  await page.clock.setFixedTime(new Date("2026-11-01T12:39:56Z"));
  await expect(canvas.locator(".ambient-horizon")).toHaveAttribute(
    "data-stale",
    "true",
  );
  await expect(canvas.locator(".ambient-horizon")).toContainText(
    "Sist beregnet",
  );
  expect(
    await canvas
      .locator("svg")
      .evaluateAll((nodes) =>
        nodes.every((node) => !node.outerHTML.includes("NaN")),
      ),
  ).toBe(true);
});
