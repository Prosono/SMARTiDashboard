import {
  test,
  expect,
  type Page,
} from "../../frontend/node_modules/@playwright/test";

async function login(page: Page) {
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
    (await (await page.request.get("/api/home/experience")).json()).mode ===
    "simple"
  ) {
    await navigate(page, "Innstillinger");
    await page
      .locator('.experience-picker button[data-mode="advanced"]')
      .click();
    await navigate(page, "Hjem");
  }
  await expect(page.locator(".home-overview")).toBeVisible();
}
async function navigate(page: Page, name: string) {
  await page
    .getByRole("navigation")
    .getByRole("button", { name, exact: true })
    .click();
}
async function appearance(page: Page) {
  await navigate(page, "Innstillinger");
  await page
    .getByRole("button", { name: "Tema og utseende", exact: true })
    .click();
}
async function addFromPicker(page: Page, name: string, entityId?: string) {
  const canvas = page.locator(".home-canvas");
  await canvas
    .getByRole("button", { name: "Legg til kort", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Legg til kort",
    exact: true,
  });
  await dialog
    .getByRole("button", {
      name: entityId ? "Enhet" : "Oversiktskort",
      exact: true,
    })
    .click();
  if (entityId)
    await dialog.getByRole("textbox", { name: "Søk etter enheter" }).fill(name);
  if (entityId)
    await dialog
      .locator(`.card-device-options [data-entity="${entityId}"]`)
      .click();
  else await dialog.getByRole("button", { name, exact: true }).click();
  await dialog
    .getByRole("button", { name: "Legg til kort", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
}
const control = (
  domain: string,
  name: string,
  state: string,
  attributes: Record<string, unknown> = {},
  actions: string[] = [],
) => ({
  id: `${domain}.harmony_${domain}`,
  entity_id: `${domain}.harmony_${domain}`,
  name,
  domain,
  state,
  attributes,
  area_id: "living",
  device_id: null,
  availability: "available",
  diagnostic: false,
  updated_at: null,
  integration: null,
  capabilities: actions.length
    ? [{ kind: domain, actions, minimum: 0, maximum: 100, step: 1, unit: "%" }]
    : [],
});
async function richHome(
  page: Page,
  additional: ReturnType<typeof control>[] = [],
) {
  await page.route("**/api/home", async (route) => {
    const response = await route.fetch(),
      home = await response.json();
    const extras = [
      ...additional,
      control("sensor", "Husets forbruk", "3100", {
        device_class: "power",
        unit_of_measurement: "W",
      }),
      {
        ...control("sensor", "Temperatur i stuen", "21.4", {
          device_class: "temperature",
          unit_of_measurement: "°C",
        }),
        id: "sensor.harmony_temperature",
        entity_id: "sensor.harmony_temperature",
      },
      {
        ...control("sensor", "Luftfuktighet i stuen", "47", {
          device_class: "humidity",
          unit_of_measurement: "%",
        }),
        id: "sensor.harmony_humidity",
        entity_id: "sensor.harmony_humidity",
      },
      control("cover", "Persienne", "open", { current_position: 65 }, [
        "open_cover",
        "stop_cover",
        "close_cover",
      ]),
      control("lock", "Ytterdør", "locked", {}, ["lock", "unlock"]),
      control("switch", "Gulvlampe stikkontakt", "off", {}, [
        "turn_on",
        "turn_off",
      ]),
      control("weather", "Været hjemme", "partlycloudy", {
        temperature: 11.8,
        temperature_unit: "°C",
      }),
      control(
        "media_player",
        "Høyttaler",
        "paused",
        {
          media_title: "Morgen hjemme",
          media_artist: "SMARTi test",
          volume_level: 0.35,
        },
        ["media_play", "media_pause"],
      ),
    ];
    await route.fulfill({
      json: {
        ...home,
        controls: [...home.controls, ...extras],
        favorites: [
          ...home.favorites,
          ...extras
            .filter((c) => c.domain !== "weather")
            .map((c) => c.entity_id),
        ],
      },
    });
  });
  await page.route("**/api/home/weather/*", (route) =>
    route.fulfill({ json: { days: {}, temperature_unit: "°C" } }),
  );
  await page.route("**/api/controls/sensor.harmony_*/history?*", (route) =>
    route.fulfill({
      json: {
        points: [
          { time: "2026-10-30T06:00:00Z", value: 18 },
          { time: "2026-10-30T09:00:00Z", value: 20 },
          { time: "2026-10-30T12:00:00Z", value: null },
          { time: "2026-10-30T15:00:00Z", value: 21.4 },
        ],
      },
    }),
  );
  await page.route("**/api/home/energy-flow/preferences", async (route) => {
    const response = await route.fetch();
    const config = await response.json();
    await route.fulfill({
      json: {
        ...config,
        home: { ...config.home, source: "sensor.harmony_sensor" },
      },
    });
  });
  await page.route("**/api/home/energy/statistics?*", (route) =>
    route.fulfill({
      json: {
        series: [
          {
            id: "sensor.harmony_sensor",
            current: {
              points: [
                { time: "2026-10-30T06:00:00Z", value: 700 },
                { time: "2026-10-30T08:00:00Z", value: 2800 },
                { time: "2026-10-30T10:00:00Z", value: 1400 },
                { time: "2026-10-30T12:00:00Z", value: 3100 },
              ],
            },
          },
        ],
      },
    }),
  );
}

test("Harmoni is selectable and persisted without changing home preferences; both original styles remain", async ({
  page,
}, info) => {
  await richHome(page);
  await login(page);
  const preferences = await (
    await page.request.get("/api/home/preferences")
  ).json();
  const favorites = (await (await page.request.get("/api/home")).json())
    .favorites;
  await appearance(page);
  await expect(page.getByLabel("Stil for Hjem").locator("option")).toHaveText([
    "Klassisk",
    "SMARTi Living",
    "SMARTi Harmoni",
  ]);
  await page.getByLabel("Stil for Hjem").selectOption("harmony");
  await expect(page.locator(".home-style-preview")).toContainText(
    "SMARTi Harmoni",
  );
  await navigate(page, "Hjem");
  await expect(page.locator("html")).toHaveAttribute(
    "data-home-style",
    "harmony",
  );
  await expect(page.locator(".harmony-device-grid").first()).toBeVisible();
  await expect(
    page.locator('.home-canvas [data-card="weather"]'),
  ).toContainText("11,8");
  await expect(page.locator(".harmony-trend").first()).toBeVisible();
  await page.screenshot({
    path: `/private/tmp/smarti-harmony-light-${info.project.name}.png`,
    fullPage: true,
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute(
    "data-home-style",
    "harmony",
  );
  for (const style of ["classic", "living", "harmony"]) {
    await appearance(page);
    await page.getByLabel("Stil for Hjem").selectOption(style);
    await navigate(page, "Hjem");
    await expect(page.locator("html")).toHaveAttribute(
      "data-home-style",
      style,
    );
    await expect(page.locator(".home-overview")).toBeVisible();
  }
  expect(
    await (await page.request.get("/api/home/preferences")).json(),
  ).toEqual(preferences);
  expect(
    (await (await page.request.get("/api/home")).json()).favorites,
  ).toEqual(favorites);
  await appearance(page);
  await page
    .getByRole("combobox", { name: "Utseende", exact: true })
    .selectOption("dark");
  await navigate(page, "Hjem");
  await page.screenshot({
    path: `/private/tmp/smarti-harmony-viewport-${info.project.name}.png`,
  });
  await page.screenshot({
    path: `/private/tmp/smarti-harmony-dark-${info.project.name}.png`,
    fullPage: true,
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("direct light controls, thermostat and details keep their existing behavior", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("smarti-home-style", "harmony"),
  );
  await login(page);
  const light = page
    .locator('.harmony-device[data-domain="light"]')
    .filter({ hasText: "Pendellampe" });
  const toggle = light.getByRole("switch");
  const before = await toggle.getAttribute("aria-checked");
  await toggle.click();
  await expect(toggle).toHaveAttribute(
    "aria-checked",
    before === "true" ? "false" : "true",
  );
  await expect(light.getByRole("status")).toContainText("Oppdatert i demo");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const slider = light.getByRole("slider");
  await slider.focus();
  const command = page.waitForRequest(
    (r) =>
      r.method() === "POST" &&
      r.url().includes("/commands") &&
      r.postDataJSON().action === "set_brightness",
  );
  await page.keyboard.press("ArrowRight");
  await command;
  await light
    .getByRole("button", { name: "Åpne Pendellampe", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Pendellampe", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".light-detail")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    light.getByRole("button", { name: "Åpne Pendellampe", exact: true }),
  ).toBeFocused();
  const thermostat = page
    .locator('.harmony-device[data-domain="climate"]')
    .first();
  const temperature = page.waitForRequest(
    (r) =>
      r.method() === "POST" &&
      r.url().includes("/commands") &&
      r.postDataJSON().action === "set_temperature",
  );
  await thermostat
    .getByRole("button", { name: /Ønsket temperatur \+/ })
    .click();
  await temperature;
  await expect(thermostat.getByRole("status")).toContainText(
    "Oppdatert i demo",
  );
});

test("locks and shades confirm actions; unavailable and read-only devices cannot send commands", async ({
  page,
}) => {
  await richHome(page);
  await page.addInitScript(() =>
    localStorage.setItem("smarti-home-style", "harmony"),
  );
  const commands: { action: string; confirmed: boolean }[] = [];
  await page.route("**/api/controls/*.harmony_*/commands", async (route) => {
    commands.push(route.request().postDataJSON());
    await route.fulfill({ json: { status: "simulated" } });
  });
  await login(page);
  const lock = page.locator('.harmony-device[data-domain="lock"]');
  await lock
    .getByRole("button", { name: "Ytterdør: Lås opp", exact: true })
    .click();
  expect(commands).toHaveLength(0);
  await page
    .getByRole("dialog", { name: "Lås opp Ytterdør?", exact: true })
    .getByRole("button", { name: "Avbryt" })
    .click();
  expect(commands).toHaveLength(0);
  await lock
    .getByRole("button", { name: "Ytterdør: Lås opp", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Lås opp Ytterdør?", exact: true })
    .getByRole("button", { name: "Lås opp", exact: true })
    .click();
  await expect.poll(() => commands.length).toBe(1);
  expect(commands[0]).toEqual({ action: "unlock", confirmed: true });
  const cover = page.locator('.harmony-device[data-domain="cover"]');
  await expect(cover).toContainText("65%");
  await cover
    .getByRole("button", { name: "Persienne: Lukk", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Lukk Persienne?", exact: true })
    .getByRole("button", { name: "Lukk", exact: true })
    .click();
  await expect.poll(() => commands.length).toBe(2);
  expect(commands[1]).toEqual({ action: "close_cover", confirmed: true });
  await page.route("**/api/home", async (route) => {
    const response = await route.fetch(),
      home = await response.json();
    await route.fulfill({
      json: {
        ...home,
        permissions: ["lights.view", "climate.view"],
        controls: home.controls.map((c: { domain: string }) =>
          c.domain === "light"
            ? { ...c, availability: "unavailable", state: "unavailable" }
            : c,
        ),
      },
    });
  });
  await page.reload();
  const lights = page.locator('.harmony-device[data-domain="light"]');
  await expect(lights.first()).toContainText("Utilgjengelig");
  for (const item of await lights.getByRole("switch").all())
    await expect(item).toBeDisabled();
  await expect(
    page.locator('.harmony-device[data-domain="climate"]').first(),
  ).toContainText("Kun visning");
});

test("all categories, room views and dialogs adapt to phone, wall tablet and desktop", async ({
  page,
}, info) => {
  await richHome(page);
  await page.addInitScript(() =>
    localStorage.setItem("smarti-home-style", "harmony"),
  );
  await login(page);
  const issues: string[] = [];
  page.on("pageerror", (error) => issues.push(error.message));
  for (const width of [320, 834, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const name of [
      "Oversikt",
      "Lys",
      "Energi",
      "Sikkerhet",
      "Klima",
      "Multimedia",
      "Diverse",
    ]) {
      await page.getByRole("tab", { name, exact: true }).click();
      // The existing energy setup opens on a home that has no configured agreement.
      if (name === "Energi") {
        const setup = page.getByRole("dialog", {
          name: "Energien i hjemmet ditt",
          exact: true,
        });
        await expect(setup).toBeVisible();
        await setup
          .getByRole("button", { name: "Lukk innstillinger", exact: true })
          .click();
      }
      await expect(page.getByRole("tabpanel")).toBeVisible();
      expect(
        await page
          .locator("body")
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
        `${name} at ${width}px`,
      ).toBe(true);
    }
    await page.getByRole("tab", { name: "Oversikt", exact: true }).click();
    await page.screenshot({
      path: `/private/tmp/smarti-harmony-${width}-${info.project.name}.png`,
      fullPage: true,
    });
  }
  await navigate(page, "Rom");
  await expect(page.locator(".room-summary-card").first()).toBeVisible();
  await page.locator(".room-summary-card").filter({ hasText: "Stue" }).click();
  await expect(page.locator(".room-detail")).toBeVisible();
  await expect(page.locator(".harmony-device").first()).toBeVisible();
  await page.locator(".harmony-device-open").first().click();
  await expect(page.getByRole("dialog").first()).toBeVisible();
  await page.keyboard.press("Escape");
  for (const width of [320, 834]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page
        .locator("body")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
  }
  expect(issues).toEqual([]);
});

test("missing history, loading commands, failures and disconnection show honest states", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("smarti-home-style", "harmony"),
  );
  await richHome(page);
  await page.route("**/api/home/energy/statistics?*", (route) =>
    route.fulfill({ status: 503, json: { detail: "history_unavailable" } }),
  );
  await page.route("**/api/controls/sensor.harmony_*/history?*", (route) =>
    route.fulfill({ status: 503, json: { detail: "history_unavailable" } }),
  );
  await login(page);
  await expect(
    page.locator('[data-card="metric:energy"] .metric-energy'),
  ).toContainText("Kunne ikke hente historikk");
  await expect(page.locator(".metric-energy .harmony-trend")).toHaveCount(0);
  const light = page
    .locator('.harmony-device[data-domain="light"]')
    .filter({ hasText: "Pendellampe" });
  let release: () => void = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    "**/api/controls/light.living_pendant/commands",
    async (route) => {
      await waiting;
      await route.fulfill({ status: 503, json: { detail: "connection_lost" } });
    },
  );
  await light.getByRole("switch").click();
  await expect(light).toHaveAttribute("aria-busy", "true");
  await expect(light).toContainText("Sender…");
  await expect(light.getByRole("switch")).toBeDisabled();
  release();
  await expect(light.getByRole("alert")).toContainText(
    "Kunne ikke bekrefte handlingen",
  );
  await expect(light).toHaveAttribute("aria-busy", "false");
  await page.route("**/api/home", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      json: { ...(await response.json()), connected: false },
    });
  });
  await page.clock.install();
  await page.reload();
  await expect(page.locator(".home-overview")).toBeVisible();
  await page.clock.fastForward(31_000);
  await expect(page.locator(".home-offline-notice")).toContainText(
    "Hjemmet er frakoblet",
  );
  await expect(
    page.locator('.harmony-device[data-domain="light"]').first(),
  ).toContainText("Frakoblet");
  await expect(
    page
      .locator('.harmony-device[data-domain="light"]')
      .first()
      .getByRole("switch"),
  ).toBeDisabled();
  await expect(page.locator(".harmony-trend")).toHaveCount(0);
});

test("Harmoni also follows palettes, simple mode and reduced motion", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    localStorage.setItem("smarti-home-style", "harmony");
    localStorage.setItem("smarti-palette", "fjord");
    localStorage.setItem("smarti-theme", "dark");
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await login(page);
  await expect(page.locator("html")).toHaveAttribute("data-palette", "fjord");
  await appearance(page);
  await page.locator('.experience-picker button[data-mode="simple"]').click();
  await navigate(page, "Hjem");
  await expect(
    page.locator(".home-canvas .harmony-device").first(),
  ).toBeVisible();
  await page.locator(".home-canvas .harmony-device-open").first().click();
  const dialog = page.getByRole("dialog").first();
  await expect(dialog).toBeVisible();
  await page.screenshot({
    path: `/private/tmp/smarti-harmony-dialog-${info.project.name}.png`,
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(
    page.locator(".home-canvas .harmony-device").first(),
  ).toBeVisible();
});

test.afterEach(async ({ page }) => {
  await page.evaluate(async () => {
    const session = await (
      await fetch(new URL("api/session", document.baseURI))
    ).json();
    if (!session.csrf) return;
    await fetch(new URL("api/home/experience", document.baseURI), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": session.csrf,
      },
      body: JSON.stringify({ mode: "advanced" }),
    });
  });
});

test("header backgrounds can be chosen, uploaded, reloaded and removed without changing the home", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("smarti-home-style", "harmony"),
  );
  await login(page);
  const original = await (
    await page.request.get("/api/home/preferences")
  ).json();
  await appearance(page);
  const settings = page.getByRole("region", {
    name: "Bakgrunn i Hjem",
    exact: true,
  });
  await settings.getByRole("radio", { name: "Utendørs", exact: true }).click();
  await expect(settings.getByRole("status")).toHaveText(
    "Bakgrunnen er lagret.",
  );
  await settings.getByRole("radio", { name: "Utendørs", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    settings.getByRole("radio", { name: "Kjøkken", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await settings.getByRole("radio", { name: "Utendørs", exact: true }).click();
  await expect(
    settings.getByRole("radio", { name: "Utendørs", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await navigate(page, "Hjem");
  await expect(page.locator(".home-header-photo")).toHaveCount(0);
  async function devices() {
    await navigate(page, "Enheter");
    await page.locator(".device-toolbar select").selectOption("light");
  }
  await devices();
  await expect(
    page.locator(".category-heading .home-header-photo"),
  ).toHaveAttribute("src", /home-outdoor.webp/);
  await page.reload();
  await devices();
  await expect(
    page.locator(".category-heading .home-header-photo"),
  ).toHaveAttribute("src", /home-outdoor.webp/);
  await appearance(page);
  const photo = await page.screenshot({
    clip: { x: 0, y: 0, width: 160, height: 100 },
  });
  await page
    .getByLabel("Last opp bakgrunnsbilde", { exact: true })
    .setInputFiles({
      name: "header.png",
      mimeType: "image/png",
      buffer: photo,
    });
  await expect(
    settings.getByRole("radio", { name: "Mitt bilde", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  const saved = await (await page.request.get("/api/home/appearance")).json();
  expect(saved.background).toBe("custom");
  const image = await page.request.get("/api/home/appearance/image");
  expect(image.headers()["content-type"]).toBe("image/jpeg");
  expect((await image.body()).length).toBeLessThanOrEqual(1_000_000);
  await devices();
  await page.reload();
  await devices();
  await expect(
    page.locator(".category-heading .home-header-photo"),
  ).toHaveAttribute(
    "src",
    new RegExp(`/api/home/appearance/image\\?v=${saved.image_version}`),
  );
  await expect(
    page.locator(".category-heading .home-header-photo"),
  ).toHaveAttribute("data-ready", "true");
  await appearance(page);
  await settings
    .getByRole("radio", { name: "Uten bilde", exact: true })
    .click();
  await expect(
    settings.getByRole("radio", { name: "Uten bilde", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await devices();
  await expect(
    page.locator(".category-heading .home-header-photo"),
  ).toHaveCount(0);
  await appearance(page);
  await settings
    .getByRole("button", { name: "Fjern eget bilde", exact: true })
    .click();
  await expect(
    settings.getByRole("radio", { name: "Mitt bilde", exact: true }),
  ).toHaveCount(0);
  expect(
    (await (await page.request.get("/api/home/appearance")).json()).background,
  ).toBe("auto");
  expect(
    await (await page.request.get("/api/home/preferences")).json(),
  ).toEqual(original);
});

test("bannerless pages keep the three-column canvas editable, resizable and persistent", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await page.addInitScript(() =>
    localStorage.setItem("smarti-home-style", "harmony"),
  );
  await richHome(page);
  await login(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [1440, 834, 320]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.getByRole("tab", { name: "Oversikt", exact: true }).click();
    await page.screenshot({
      path: `/private/tmp/smarti-grid-first-${width}-${info.project.name}.png`,
      fullPage: true,
    });
    for (const name of [
      "Oversikt",
      "Lys",
      "Energi",
      "Sikkerhet",
      "Klima",
      "Multimedia",
      "Diverse",
    ]) {
      await page.getByRole("tab", { name, exact: true }).click();
      await expect(
        page.locator(".home-hero-stage, .category-heading"),
      ).toHaveCount(0);
      if (name === "Energi") {
        await expect(page.locator(".home-canvas")).toHaveCount(0);
        const wizard = page.getByRole("dialog", {
          name: "Energien i hjemmet ditt",
          exact: true,
        });
        await expect(wizard).toBeVisible();
        await wizard
          .getByRole("button", { name: "Lukk innstillinger", exact: true })
          .click();
      } else {
        const grid = page.locator(".home-canvas-grid");
        await expect(grid).toBeVisible();
        await expect(grid).toHaveCSS(
          "--canvas-columns",
          width === 1440 ? "3" : width === 834 ? "2" : "1",
        );
        expect(
          await page
            .locator("body")
            .evaluate((el) => el.scrollWidth <= el.clientWidth),
        ).toBe(true);
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole("tab", { name: "Lys", exact: true }).click();
  const canvas = page.locator('.home-canvas[data-page="lights"]');
  const first = canvas.locator(".home-canvas-cell").first();
  const id = await first.getAttribute("data-card");
  const cell = canvas.locator(`[data-card="${id}"]`);
  await page
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
  await expect(cell.locator(".home-canvas-content")).toHaveAttribute(
    "inert",
    "",
  );
  const handle = cell.locator(".home-canvas-grip");
  await handle.focus();
  await page.keyboard.press("ArrowRight");
  await cell.getByRole("combobox", { name: /bredde/ }).selectOption("2");
  await cell.getByRole("combobox", { name: /høyde/ }).selectOption("3");
  await canvas.getByRole("button", { name: "Lagre", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-editing", "false");
  const saved = await (
    await page.request.get("/api/home/layout/lights")
  ).json();
  expect(
    saved.items.find((item: { id: string }) => item.id === id),
  ).toMatchObject({ w: 2, h: 3 });
  await page.reload();
  await page.getByRole("tab", { name: "Lys", exact: true }).click();
  const retained = canvas.locator(`[data-card="${id}"]`);
  await expect(retained).toHaveCSS("grid-column-end", "span 2");
  await expect(retained).toHaveCSS("grid-row-end", "span 3");
  await page
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
  await retained.getByRole("combobox", { name: /bredde/ }).selectOption("1");
  await canvas.getByRole("button", { name: "Avbryt", exact: true }).click();
  await expect(retained).toHaveCSS("grid-column-end", "span 2");
  await page.screenshot({
    path: `/private/tmp/smarti-grid-lights-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Oversikt", exact: true }).click();
  await page.screenshot({
    path: `/private/tmp/smarti-grid-overview-${info.project.name}.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("grid handles support pointer dragging, snapped resizing and touch reordering without device commands", async ({
  page,
}, info) => {
  await page.addInitScript(() =>
    localStorage.setItem("smarti-home-style", "harmony"),
  );
  await richHome(page);
  await login(page);
  await page.setViewportSize({ width: 1440, height: 1600 });
  await page.getByRole("tab", { name: "Lys", exact: true }).click();
  const canvas = page.locator('.home-canvas[data-page="lights"]');
  await page
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
  await canvas
    .getByRole("button", { name: "Startoppsett", exact: true })
    .click();
  const first = canvas.locator(".home-canvas-cell").first(),
    id = (await first.getAttribute("data-card"))!;
  const cell = canvas.locator(`[data-card="${id}"]`);
  const commands: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/commands"))
      commands.push(request.url());
  });
  // Raw pointer coordinates must be sampled after the previous layout settles.
  // Motion interpolation itself is checked separately below.
  await cell.evaluate(async (node) => {
    await Promise.all(
      node
        .getAnimations()
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
  const grid = (await canvas.locator(".home-canvas-grid").boundingBox())!;
  const step = (grid.width + 16) / 3;
  const grip = (await cell.locator(".home-canvas-grip").boundingBox())!;
  await page.mouse.move(grip.x + 30, grip.y + 18);
  await page.mouse.down();
  await page.mouse.move(grip.x + 30 + step, grip.y + 18, { steps: 8 });
  await page.mouse.up();
  await expect(cell).toHaveCSS("grid-column-start", "2");
  await cell.evaluate(async (node) => {
    await Promise.all(
      node
        .getAnimations()
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
  const corner = (await cell.locator(".home-canvas-resize").boundingBox())!;
  await page.mouse.move(corner.x + 16, corner.y + 16);
  await page.mouse.down();
  await page.mouse.move(corner.x + 16 + step, corner.y + 16 + 144, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(cell).toHaveCSS("grid-column-end", "span 2");
  await expect(cell).toHaveCSS("grid-row-end", "span 3");
  await canvas.getByRole("button", { name: "Lagre", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-editing", "false");
  const desktop = await (
    await page.request.get("/api/home/layout/lights")
  ).json();
  await page.setViewportSize({ width: 390, height: 1300 });
  await expect(canvas.locator(".home-canvas-grid")).toHaveCSS(
    "--canvas-columns",
    "1",
  );
  expect(
    await (await page.request.get("/api/home/layout/lights")).json(),
  ).toEqual(desktop);
  await page
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
  const touchFirst = canvas.locator(".home-canvas-cell").first();
  const touchId = await touchFirst.getAttribute("data-card");
  await touchFirst.scrollIntoViewIfNeeded();
  await touchFirst.evaluate(async (node) => {
    await Promise.all(
      node
        .getAnimations()
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
  const touchGrip = (await touchFirst
    .locator(".home-canvas-grip")
    .boundingBox())!;
  const next = (await canvas
    .locator(".home-canvas-cell")
    .nth(1)
    .boundingBox())!;
  const session = await page.context().newCDPSession(page);
  const point = { x: touchGrip.x + 35, y: touchGrip.y + 17 };
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: point.x, y: next.y + 18 }],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(canvas.locator(".home-canvas-cell").first()).not.toHaveAttribute(
    "data-card",
    touchId!,
  );
  await session.detach();
  await page.screenshot({
    path: `/private/tmp/smarti-grid-edit-touch-${info.project.name}.png`,
    fullPage: true,
  });
  await canvas.getByRole("button", { name: "Avbryt", exact: true }).click();
  expect(
    await (await page.request.get("/api/home/layout/lights")).json(),
  ).toEqual(desktop);
  expect(commands).toEqual([]);
});

test("each category can remove and add cards, retain failed edits and protect concurrent changes", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.addInitScript(() =>
    localStorage.setItem("smarti-home-style", "harmony"),
  );
  await richHome(page);
  await login(page);
  for (const [name, key] of [
    ["Oversikt", "overview"],
    ["Lys", "lights"],
    ["Klima", "climate"],
    ["Sikkerhet", "security"],
    ["Multimedia", "media"],
    ["Diverse", "misc"],
  ]) {
    await page.getByRole("tab", { name, exact: true }).click();
    const canvas = page.locator(`.home-canvas[data-page="${key}"]`);
    await page
      .getByRole("button", { name: "Rediger oppsett", exact: true })
      .click();
    const cell = canvas.locator(".home-canvas-cell").first();
    const id = (await cell.getAttribute("data-card"))!;
    const title = (await cell.locator(".home-canvas-grip span").textContent())!;
    await cell
      .getByRole("button", { name: `Fjern ${title}`, exact: true })
      .click();
    await expect(canvas.locator(`[data-card="${id}"]`)).toHaveCount(0);
    await expect
      .poll(() =>
        canvas.locator(".home-canvas-cell").evaluateAll(
          (nodes) =>
            !nodes.length ||
            nodes.some((node) => {
              const style = getComputedStyle(node);
              const firstRow =
                node.closest(".home-canvas")?.getAttribute("data-grouped") ===
                "true"
                  ? "2"
                  : "1";
              return (
                style.gridColumnStart === "1" && style.gridRowStart === firstRow
              );
            }),
        ),
      )
      .toBe(true);
    await addFromPicker(
      page,
      title,
      id.startsWith("device:") || id.startsWith("camera:")
        ? id.slice(id.indexOf(":") + 1)
        : undefined,
    );
    await expect(canvas.locator(`[data-card="${id}"]`)).toBeVisible();
    await canvas.getByRole("button", { name: "Lagre", exact: true }).click();
    await expect(canvas).toHaveAttribute("data-editing", "false");
    const saved = await (
      await page.request.get(`/api/home/layout/${key}`)
    ).json();
    expect(saved.items.some((item: { id: string }) => item.id === id)).toBe(
      true,
    );
  }
  const canvas = page.locator('.home-canvas[data-page="misc"]');
  await page
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
  await page.route("**/api/home/layout/misc", async (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({ status: 503, json: { detail: "unavailable" } })
      : route.continue(),
  );
  await canvas.getByRole("button", { name: "Lagre", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-editing", "true");
  await expect(canvas.getByRole("status")).toContainText(
    "Endringene dine er fortsatt her",
  );
  await page.unroute("**/api/home/layout/misc");
  await page.evaluate(async () => {
    const session = await (await fetch("/api/session")).json();
    const saved = await (await fetch("/api/home/layout/misc")).json();
    await fetch("/api/home/layout/misc", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": session.csrf,
      },
      body: JSON.stringify(saved),
    });
  });
  await canvas.getByRole("button", { name: "Lagre", exact: true }).click();
  await expect(canvas.getByRole("status")).toContainText("annet vindu");
  await expect(canvas).toHaveAttribute("data-editing", "true");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("tab", { name: "Lys", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Diverse", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await canvas.getByRole("button", { name: "Avbryt", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Rediger oppsett", exact: true }),
  ).toBeFocused();
});

test("equipment cards match their actual device type, color controls and linked readings in both themes", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await page.addInitScript(() => {
    localStorage.setItem("smarti-home-style", "harmony");
    localStorage.setItem("smarti-palette", "smarti");
  });
  const layouts = new Map<
    string,
    { revision: number; items: unknown[] | null }
  >();
  await page.route("**/api/home/layout/*", async (route) => {
    const key = new URL(route.request().url()).pathname;
    const current = layouts.get(key) || { revision: 0, items: null };
    if (route.request().method() === "GET")
      return route.fulfill({ json: current });
    const body = route.request().postDataJSON();
    const next = { revision: current.revision + 1, items: body.items };
    layouts.set(key, next);
    await route.fulfill({ json: next });
  });
  const make = (
    suffix: string,
    domain: string,
    name: string,
    state: string,
    attributes: Record<string, unknown> = {},
    actions: string[] = [],
  ) => ({
    ...control(domain, name, state, attributes, actions),
    id: `${domain}.equipment_${suffix}`,
    entity_id: `${domain}.equipment_${suffix}`,
  });
  const rgb = {
    ...make(
      "rgb",
      "light",
      "Fargelys",
      "on",
      {
        smarti_icon: "strip",
        brightness: 153,
        rgb_color: [151, 61, 238],
        color_mode: "rgb",
      },
      ["turn_on", "turn_off"],
    ),
    capabilities: [
      { kind: "power", actions: ["turn_on", "turn_off"] },
      {
        kind: "brightness",
        actions: ["set_brightness"],
        minimum: 0,
        maximum: 100,
        step: 1,
        unit: "%",
      },
      { kind: "color", actions: ["set_rgb_color"] },
    ],
  };
  const white = {
    ...make(
      "white",
      "light",
      "Justerbart hvitt",
      "on",
      {
        smarti_icon: "ceiling",
        brightness: 204,
        color_mode: "color_temp",
        color_temp_kelvin: 2700,
      },
      ["turn_on", "turn_off"],
    ),
    capabilities: [
      { kind: "power", actions: ["turn_on", "turn_off"] },
      {
        kind: "brightness",
        actions: ["set_brightness"],
        minimum: 0,
        maximum: 100,
        step: 1,
        unit: "%",
      },
      {
        kind: "color_temperature",
        actions: ["set_color_temp"],
        minimum: 2000,
        maximum: 6500,
        step: 1,
        unit: "K",
      },
    ],
  };
  const extras = [
    rgb,
    white,
    make("plain", "light", "Taklampe", "on", { smarti_icon: "pendant" }, [
      "turn_on",
      "turn_off",
    ]),
    {
      ...make(
        "plug",
        "switch",
        "Smart stikkontakt",
        "on",
        { device_class: "outlet" },
        ["turn_on", "turn_off"],
      ),
      device_id: "equipment-plug",
    },
    {
      ...make("power", "sensor", "Stikkontakt effekt", "134", {
        device_class: "power",
        unit_of_measurement: "W",
      }),
      device_id: "equipment-plug",
    },
    {
      ...make("energy", "sensor", "Registrert energi", "0.8", {
        device_class: "energy",
        unit_of_measurement: "kWh",
      }),
      device_id: "equipment-plug",
    },
    make("lock", "lock", "Dørlås", "locked", { battery_level: 82 }, [
      "lock",
      "unlock",
    ]),
    make("door", "binary_sensor", "Ytterdør", "off", { device_class: "door" }),
    make("window", "binary_sensor", "Vindu kjøkken", "on", {
      device_class: "window",
    }),
    make("motion", "binary_sensor", "Bevegelse gang", "off", {
      device_class: "motion",
    }),
    make("presence", "binary_sensor", "Tilstedeværelse", "on", {
      device_class: "occupancy",
    }),
    make("smoke", "binary_sensor", "Røykvarsler", "on", {
      device_class: "smoke",
      battery_level: 91,
    }),
    make("leak", "binary_sensor", "Vannlekkasje", "on", {
      device_class: "moisture",
    }),
    make("alarm", "alarm_control_panel", "Alarm", "armed_night"),
    make("battery", "sensor", "Batteri dørsensor", "12", {
      device_class: "battery",
      unit_of_measurement: "%",
    }),
    ...[
      ["blind", "Persienne", 60],
      ["shade", "Rullegardin", 40],
      ["curtain", "Gardiner", 75],
      ["awning", "Markise", 40],
      ["garage", "Garasjeport", 0],
    ].map(([device_class, name, position]) =>
      make(
        String(device_class),
        "cover",
        String(name),
        position ? "open" : "closed",
        { device_class, current_position: position },
        ["open_cover", "stop_cover", "close_cover"],
      ),
    ),
  ];
  await page.route("**/api/home", async (route) => {
    const response = await route.fetch();
    const home = await response.json();
    await route.fulfill({
      json: {
        ...home,
        controls: [...home.controls, ...extras],
        favorites: [...home.favorites, ...extras.map((c) => c.entity_id)],
      },
    });
  });
  const sent: { action: string; value?: number | number[] }[] = [];
  await page.route("**/api/controls/*equipment_*/commands", async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({ json: { status: "accepted_unconfirmed" } });
  });
  await login(page);
  const reset = async (name: string) => {
    await page.getByRole("tab", { name, exact: true }).click();
    const canvas = page.locator(".home-canvas");
    await page
      .getByRole("button", { name: "Rediger oppsett", exact: true })
      .click();
    await canvas
      .getByRole("button", { name: "Startoppsett", exact: true })
      .click();
    await canvas.getByRole("button", { name: "Lagre", exact: true }).click();
    await expect(canvas).toHaveAttribute("data-editing", "false");
  };
  await reset("Lys");
  const colorCard = page.locator('[data-card="device:light.equipment_rgb"]');
  await expect(colorCard.locator(".equipment-card")).toHaveAttribute(
    "data-art",
    "strip",
  );
  await expect(
    colorCard.getByRole("button", { name: "Fargelys: Lilla", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await colorCard
    .getByRole("button", { name: "Fargelys: Blå", exact: true })
    .click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toMatchObject({
    action: "set_rgb_color",
    value: [21, 162, 239],
  });
  await expect(colorCard.getByRole("status")).toContainText(
    "Venter på bekreftelse",
  );
  await colorCard
    .getByRole("slider", { name: "Fargelys: Lysstyrke", exact: true })
    .focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1]).toMatchObject({ action: "set_brightness", value: 61 });
  const whiteCard = page.locator('[data-card="device:light.equipment_white"]');
  await expect(whiteCard.locator(".harmony-device-reading")).toContainText(
    /2.?700 K/,
  );
  await whiteCard
    .getByRole("slider", {
      name: "Justerbart hvitt: Hvittemperatur",
      exact: true,
    })
    .focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => sent.length).toBe(3);
  expect(sent[2]).toMatchObject({ action: "set_color_temp", value: 2701 });
  await reset("Diverse");
  const plug = page.locator('[data-card="device:switch.equipment_plug"]');
  await expect(plug.locator(".harmony-device-reading")).toHaveText("134 W");
  await expect(plug).toContainText("0,8 kWh");
  for (const [suffix, art] of [
    ["blind", "blind"],
    ["shade", "roller"],
    ["curtain", "curtain"],
    ["awning", "awning"],
  ])
    await expect(
      page.locator(
        `[data-card="device:cover.equipment_${suffix}"] .equipment-card`,
      ),
    ).toHaveAttribute("data-art", art);
  await reset("Sikkerhet");
  await expect(
    page.locator(
      '[data-card="device:binary_sensor.equipment_leak"] .equipment-card',
    ),
  ).toHaveAttribute("data-attention", "true");
  await expect(
    page.locator(
      '[data-card="device:binary_sensor.equipment_smoke"] .equipment-card',
    ),
  ).toHaveAttribute("data-attention", "true");
  await expect(
    page.locator('[data-card="device:binary_sensor.equipment_door"]'),
  ).toContainText("Lukket");
  await expect(
    page.locator('[data-card="device:lock.equipment_lock"]'),
  ).toContainText("82%");
  for (const theme of ["light", "dark"]) {
    await appearance(page);
    await page
      .getByRole("combobox", { name: "Utseende", exact: true })
      .selectOption(theme);
    await navigate(page, "Hjem");
    for (const name of ["Lys", "Diverse", "Sikkerhet", "Oversikt"]) {
      await page.getByRole("tab", { name, exact: true }).click();
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1100 });
        await expect(page.locator(".home-canvas-grid")).toHaveCSS(
          "--canvas-columns",
          width === 1440 ? "3" : "1",
        );
        expect(
          await page
            .locator("body")
            .evaluate((el) => el.scrollWidth <= el.clientWidth),
        ).toBe(true);
        // Read each card and its controls in the same frame while responsive rows settle.
        const bounds = await page
          .locator(".equipment-card")
          .evaluateAll((cards) =>
            cards.flatMap((card) => {
              const outer = card.getBoundingClientRect();
              return Array.from(
                card.querySelectorAll(
                  ".equipment-controls button, .equipment-controls input",
                ),
              )
                .filter(
                  (control) =>
                    control.getClientRects().length &&
                    getComputedStyle(control).visibility === "visible",
                )
                .map((control) => ({
                  name: card.textContent || "",
                  bottom: control.getBoundingClientRect().bottom,
                  cardBottom: outer.bottom,
                }));
            }),
          );
        for (const item of bounds)
          expect(item.bottom, item.name).toBeLessThanOrEqual(
            item.cardBottom + 1,
          );
        const images = page.locator(".equipment-art img");
        await expect
          .poll(async () =>
            images.evaluateAll((elements) =>
              elements.every(
                (element) =>
                  (element as HTMLImageElement).complete &&
                  (element as HTMLImageElement).naturalWidth > 0,
              ),
            ),
          )
          .toBe(true);
        await page.locator(".home-canvas").screenshot({
          path: `/private/tmp/smarti-equipment-${name}-${theme}-${width}-${info.project.name}.png`,
          animations: "disabled",
        });
      }
    }
  }
  await page.getByRole("tab", { name: "Oversikt", exact: true }).click();
  const canvas = page.locator(".home-canvas");
  await page
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
  for (const name of ["Varsler", "Batterier", "Hub og tilkoblinger"])
    await addFromPicker(page, name);
  await canvas.getByRole("button", { name: "Lagre", exact: true }).click();
  await expect(canvas.locator('[data-card="summary:batteries"]')).toContainText(
    "12 %",
  );
  await expect(
    canvas.locator('[data-card="summary:connection"]'),
  ).toContainText("Tilkoblet");
  await expect(canvas.locator('[data-card="summary:alerts"]')).toContainText(
    "Røykvarsler",
  );
  await page.route("**/home/equipment/plug.webp", (route) => route.abort());
  await page.reload();
  await page.getByRole("tab", { name: "Diverse", exact: true }).click();
  const fallback = page.locator('[data-card="device:switch.equipment_plug"]');
  await expect(fallback.locator(".equipment-art svg")).toBeVisible();
  await expect(fallback.getByRole("switch")).toBeEnabled();
  await expect(fallback).toContainText("134 W");
});

test("grid content fits without nested scrolling and editing has calm layout motion", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  await page.addInitScript(() =>
    localStorage.setItem("smarti-home-style", "harmony"),
  );
  const layouts = new Map<
    string,
    { revision: number; items: unknown[] | null }
  >();
  await page.route("**/api/home/layout/*", (route) => {
    const key = new URL(route.request().url()).pathname;
    const current = layouts.get(key) || { revision: 0, items: null };
    if (route.request().method() === "GET")
      return route.fulfill({ json: current });
    const next = {
      revision: current.revision + 1,
      items: route.request().postDataJSON().items,
    };
    layouts.set(key, next);
    return route.fulfill({ json: next });
  });
  await richHome(page);
  await login(page);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1100 });
    for (const name of [
      "Oversikt",
      "Lys",
      "Klima",
      "Sikkerhet",
      "Multimedia",
      "Diverse",
    ]) {
      await page.getByRole("tab", { name, exact: true }).click();
      await expect(page.locator(".home-canvas-grid")).toHaveCSS(
        "--canvas-columns",
        width === 1440 ? "3" : "1",
      );
      const content = page.locator(".home-canvas-content");
      expect(
        await content.evaluateAll((nodes) =>
          nodes.every((node) => {
            node.scrollTop = 50;
            node.scrollLeft = 50;
            return (
              node.scrollTop === 0 &&
              node.scrollLeft === 0 &&
              getComputedStyle(node).overflow === "clip"
            );
          }),
        ),
      ).toBe(true);
      const scrollable = await page
        .locator(".home-canvas-content *")
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => {
              const css = getComputedStyle(node);
              return (
                [css.overflowX, css.overflowY].some((value) =>
                  ["auto", "scroll"].includes(value),
                ) &&
                (node.scrollHeight > node.clientHeight + 2 ||
                  node.scrollWidth > node.clientWidth + 2)
              );
            })
            .map((node) => node.className),
        );
      expect(scrollable).toEqual([]);
      if (name === "Lys")
        await expect(page.locator(".home-canvas-expand")).toHaveCount(0);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1300 });
  await page.getByRole("tab", { name: "Lys", exact: true }).click();
  const canvas = page.locator(".home-canvas");
  await expect(canvas.locator(".home-canvas-grid")).toHaveCSS(
    "--canvas-columns",
    "3",
  );
  const card = canvas.locator('[data-card="device:light.living_pendant"]');
  const commands: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/commands")) commands.push(request.url());
  });
  await page
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
  const originalWidth = (await card.boundingBox())!.width;
  await card.getByRole("combobox", { name: /bredde/ }).selectOption("2");
  const animation = await card.evaluate((node) => {
    const motion = node
      .getAnimations()
      .find(
        (animation) =>
          animation.effect instanceof KeyframeEffect &&
          animation.effect.target === node,
      )!;
    if (!motion) return null;
    const duration = Number(motion.effect!.getTiming().duration);
    motion.pause();
    motion.currentTime = 0;
    const start = node.getBoundingClientRect().width;
    motion.currentTime = duration / 2;
    const middle = node.getBoundingClientRect().width;
    motion.finish();
    const end = node.getBoundingClientRect().width;
    return {
      duration,
      start,
      middle,
      end,
      frames: (motion.effect as KeyframeEffect).getKeyframes(),
    };
  });
  expect(animation).not.toBeNull();
  expect(animation!.start).toBeCloseTo(originalWidth, 0);
  expect(animation!.middle).toBeGreaterThan(animation!.start);
  expect(animation!.middle).toBeLessThan(animation!.end);
  expect(animation!.duration).toBeLessThanOrEqual(300);
  expect(
    animation!.frames.every(
      (frame) => !("width" in frame) && !("height" in frame),
    ),
  ).toBe(true);
  await card.locator(".home-canvas-grip").focus();
  await page.keyboard.press("ArrowDown");
  const movement = await card.evaluate((node) => {
    const motion = node
      .getAnimations()
      .find(
        (animation) =>
          animation.effect instanceof KeyframeEffect &&
          animation.effect.target === node,
      )!;
    if (!motion) return null;
    const duration = Number(motion.effect!.getTiming().duration);
    motion.pause();
    motion.currentTime = 0;
    const start = node.getBoundingClientRect().y;
    motion.currentTime = duration / 2;
    const middle = node.getBoundingClientRect().y;
    motion.finish();
    return { start, middle, end: node.getBoundingClientRect().y };
  });
  expect(movement).not.toBeNull();
  expect(movement!.middle).toBeGreaterThan(movement!.start);
  expect(movement!.middle).toBeLessThan(movement!.end);
  // A smaller cell keeps the complete card accessible, rather than scrolling it.
  await card.getByRole("combobox", { name: /bredde/ }).selectOption("1");
  await card.getByRole("combobox", { name: /høyde/ }).selectOption("1");
  await canvas.getByRole("button", { name: "Lagre", exact: true }).click();
  const show = card.getByRole("button", {
    name: "Vis hele kortet: Pendellampe",
    exact: true,
  });
  await expect(show).toBeVisible();
  await show.click();
  const dialog = page.getByRole("dialog", { name: "Pendellampe", exact: true });
  await expect(dialog.locator('input[type="range"]').first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(show).toBeFocused();
  await page
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
  await card.getByRole("combobox", { name: /bredde/ }).selectOption("2");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await card.getByRole("combobox", { name: /bredde/ }).selectOption("3");
  expect(
    await canvas
      .locator(".home-canvas-cell")
      .evaluateAll(
        (nodes) => nodes.flatMap((node) => node.getAnimations()).length,
      ),
  ).toBe(0);
  await canvas.getByRole("button", { name: "Avbryt", exact: true }).click();
  expect(commands).toEqual([]);
  await page.screenshot({
    path: `/private/tmp/smarti-grid-motion-${info.project.name}.png`,
    fullPage: true,
  });
});

async function personalCardLayouts(page: Page) {
  const layouts = new Map<
    string,
    { revision: number; items: any[] | null; group_by_room?: boolean }
  >();
  await page.route("**/api/home/layout/*", (route) => {
    const key = new URL(route.request().url()).pathname;
    const current = layouts.get(key) || {
      revision: 0,
      items: null,
      group_by_room: false,
    };
    if (route.request().method() === "GET")
      return route.fulfill({ json: current });
    const body = route.request().postDataJSON();
    const next = {
      revision: current.revision + 1,
      items: body.items,
      ...(body.group_by_room !== undefined
        ? { group_by_room: body.group_by_room }
        : current.group_by_room !== undefined
          ? { group_by_room: current.group_by_room }
          : {}),
    };
    layouts.set(key, next);
    return route.fulfill({ json: next });
  });
  return layouts;
}

test("deleting a card compacts mixed sizes with motion, supports cancel and saves the new positions", async ({
  page,
}, info) => {
  await page.addInitScript(() =>
    localStorage.setItem("smarti-home-style", "harmony"),
  );
  const layouts = await personalCardLayouts(page);
  const configuration = (title: string, type = "auto") => ({
    type,
    title,
    icon: "light",
    image: "office",
    sources: ["light.living_pendant"],
    period: "24",
  });
  const original = [
    {
      id: "custom:delete",
      x: 0,
      y: 0,
      w: 3,
      h: 2,
      config: configuration("Fjern dette kortet"),
    },
    {
      id: "custom:wide",
      x: 0,
      y: 2,
      w: 2,
      h: 3,
      config: configuration("Stort lyskort"),
    },
    {
      id: "custom:small",
      x: 2,
      y: 2,
      w: 1,
      h: 1,
      config: configuration("Liten status", "compact"),
    },
    {
      id: "custom:tall",
      x: 2,
      y: 3,
      w: 1,
      h: 2,
      config: configuration("Høyt lyskort"),
    },
  ];
  layouts.set("/api/home/layout/lights", { revision: 0, items: original });
  await richHome(page);
  const commands: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/commands")) commands.push(request.url());
  });
  await login(page);
  await page.setViewportSize({
    width: info.project.name === "mobile" ? 390 : 1440,
    height: 1100,
  });
  await page.getByRole("tab", { name: "Lys", exact: true }).click();
  const canvas = page.locator('.home-canvas[data-page="lights"]'),
    wide = canvas.locator('[data-card="custom:wide"]');
  await expect(canvas).toHaveAttribute("data-grouped", "true");
  await page
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
  await canvas
    .getByRole("button", { name: "Fjern Fjern dette kortet", exact: true })
    .click();
  await expect(wide).toHaveCSS("grid-row-start", "2");
  const motion = await wide.evaluate((node) => {
    const animation = node
      .getAnimations()
      .find((a) => a.effect?.getTiming().iterations !== Infinity);
    if (!animation) return null;
    animation.pause();
    const duration = Number(animation.effect!.getTiming().duration);
    animation.currentTime = 0;
    const start = node.getBoundingClientRect().y;
    animation.currentTime = duration / 2;
    const middle = node.getBoundingClientRect().y;
    animation.finish();
    return { start, middle, end: node.getBoundingClientRect().y };
  });
  expect(motion).not.toBeNull();
  expect(motion!.middle).toBeLessThan(motion!.start);
  expect(motion!.middle).toBeGreaterThan(motion!.end);
  await canvas.getByRole("button", { name: "Avbryt", exact: true }).click();
  await expect(canvas.locator('[data-card="custom:delete"]')).toHaveCount(1);
  expect(layouts.get("/api/home/layout/lights")!.items).toEqual(original);
  await expect(wide).toHaveCSS("grid-row-start", "4");
  await page
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
  await canvas
    .getByRole("button", { name: "Fjern Fjern dette kortet", exact: true })
    .click();
  await canvas.getByRole("button", { name: "Lagre", exact: true }).click();
  const packed = [
    { ...original[1], x: 0, y: 0 },
    { ...original[2], x: 2, y: 0 },
    { ...original[3], x: 2, y: 1 },
  ];
  expect(layouts.get("/api/home/layout/lights")!.items).toEqual(packed);
  await page.reload();
  await page.getByRole("tab", { name: "Lys", exact: true }).click();
  await expect(canvas.locator('[data-card="custom:delete"]')).toHaveCount(0);
  await expect(wide).toHaveCSS("grid-row-start", "2");
  await expect(wide).toHaveCSS(
    "grid-column-end",
    info.project.name === "mobile" ? "span 1" : "span 2",
  );
  await expect(wide).toHaveCSS("grid-row-end", "span 3");
  expect(layouts.get("/api/home/layout/lights")!.items).toEqual(packed);
  expect(commands).toEqual([]);
});

test("categories default to rooms, preserve room-scoped editing and can save a free or empty layout", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await page.addInitScript(() =>
    localStorage.setItem("smarti-home-style", "harmony"),
  );
  const layouts = await personalCardLayouts(page);
  const categories = [
    ["Lys", "lights"],
    ["Diverse", "misc"],
    ["Klima", "climate"],
    ["Sikkerhet", "security"],
    ["Multimedia", "media"],
  ];
  for (const [, key] of categories)
    layouts.set(`/api/home/layout/${key}`, { revision: 0, items: null });
  const extra = ["light", "switch", "climate", "lock", "media_player"].flatMap(
    (domain) =>
      ["living", "kitchen"].map((room) => ({
        ...control(
          domain,
          `${domain} ${room}`,
          domain === "lock" ? "locked" : domain === "climate" ? "heat" : "off",
          domain === "climate"
            ? {
                current_temperature: 21,
                temperature: 22,
                hvac_modes: ["heat", "off"],
              }
            : {},
          domain === "climate"
            ? ["set_temperature", "set_hvac_mode"]
            : domain === "lock"
              ? ["lock", "unlock"]
              : ["turn_on", "turn_off"],
        ),
        id: `${domain}.room_${room}`,
        entity_id: `${domain}.room_${room}`,
        area_id: room,
      })),
  );
  extra.push({
    ...control("light", "Lys uten rom", "off", {}, ["turn_on", "turn_off"]),
    id: "light.room_none",
    entity_id: "light.room_none",
    area_id: null as any,
  });
  await richHome(page, extra);
  const commands: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/commands")) commands.push(request.url());
  });
  await login(page);
  await page.setViewportSize({
    width: info.project.name === "mobile" ? 390 : 1440,
    height: 1300,
  });
  for (const [name, key] of categories) {
    await page.getByRole("tab", { name, exact: true }).click();
    const canvas = page.locator(`.home-canvas[data-page="${key}"]`);
    await expect(canvas).toHaveAttribute("data-grouped", "true");
    await expect(
      canvas.locator('.home-canvas-room-heading[data-room="room:living"]'),
    ).toContainText("Stue");
    await expect(
      canvas.locator('.home-canvas-room-heading[data-room="room:kitchen"]'),
    ).toContainText("Kjøkken");
    const domain =
      key === "lights"
        ? "light"
        : key === "misc"
          ? "switch"
          : key === "security"
            ? "lock"
            : key === "media"
              ? "media_player"
              : "climate";
    for (const room of ["living", "kitchen"])
      await expect(
        canvas.locator(`[data-card="device:${domain}.room_${room}"]`),
      ).toHaveAttribute("data-room", `room:${room}`);
    expect(
      await canvas.locator(".home-canvas-grid").evaluate((node) => {
        let room = "";
        for (const child of Array.from(node.children) as HTMLElement[]) {
          if (child.classList.contains("home-canvas-room-heading"))
            room = child.dataset.room!;
          else if (child.dataset.room !== room) return false;
        }
        return true;
      }),
    ).toBe(true);
  }
  await page.getByRole("tab", { name: "Lys", exact: true }).click();
  const canvas = page.locator('.home-canvas[data-page="lights"]');
  await expect(
    canvas.locator('.home-canvas-room-heading[data-room="none"]'),
  ).toContainText("Uten rom");
  await page
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
  const toggle = canvas.getByRole("checkbox", {
    name: "Grupper etter rom",
    exact: true,
  });
  await expect(toggle).toBeChecked();
  await canvas.locator(".home-canvas-toolbar").screenshot({
    path: `/private/tmp/smarti-room-group-edit-${info.project.name}.png`,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  const target = canvas.locator('[data-card="device:light.room_living"]');
  await target.getByRole("combobox", { name: /bredde/ }).selectOption("2");
  await target.getByRole("combobox", { name: /høyde/ }).selectOption("3");
  await target.locator(".home-canvas-grip").focus();
  await page.keyboard.press("ArrowRight");
  await expect(target).toHaveAttribute("data-room", "room:living");
  await canvas.getByRole("button", { name: "Lagre", exact: true }).click();
  expect(layouts.get("/api/home/layout/lights")!.group_by_room).toBe(true);
  expect(
    layouts
      .get("/api/home/layout/lights")!
      .items!.find((item) => item.id === "device:light.room_living"),
  ).toMatchObject({ w: 2, h: 3 });
  await page.reload();
  await page.getByRole("tab", { name: "Lys", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-grouped", "true");
  await expect(target).toHaveCSS("grid-row-end", "span 3");
  await page
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
  await canvas
    .getByRole("button", { name: "Tøm oppsett", exact: true })
    .click();
  await expect(canvas.locator(".home-canvas-cell")).toHaveCount(0);
  await expect(canvas.locator(".home-canvas-room-heading")).toHaveCount(0);
  await canvas.getByRole("button", { name: "Avbryt", exact: true }).click();
  await expect(target).toHaveCount(1);
  await page
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
  await toggle.uncheck();
  await expect(canvas.locator(".home-canvas-room-heading")).toHaveCount(0);
  await canvas.getByRole("button", { name: "Lagre", exact: true }).click();
  await page.reload();
  await page.getByRole("tab", { name: "Lys", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-grouped", "false");
  expect(layouts.get("/api/home/layout/lights")!.group_by_room).toBe(false);
  await page.getByRole("tab", { name: "Klima", exact: true }).click();
  await expect(
    page.locator('.home-canvas[data-page="climate"]'),
  ).toHaveAttribute("data-grouped", "true");
  await page.getByRole("tab", { name: "Lys", exact: true }).click();
  await page
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
  await canvas
    .getByRole("button", { name: "Tøm oppsett", exact: true })
    .click();
  await canvas.getByRole("button", { name: "Lagre", exact: true }).click();
  await page.reload();
  await page.getByRole("tab", { name: "Lys", exact: true }).click();
  await expect(canvas.locator(".home-canvas-cell")).toHaveCount(0);
  await expect(canvas).toContainText("Plass til det du trenger");
  await page
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
  await addFromPicker(page, "Pendellampe", "light.living_pendant");
  await canvas.getByRole("button", { name: "Lagre", exact: true }).click();
  await expect(canvas.locator(".home-canvas-cell")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
  await canvas
    .getByRole("button", { name: "Startoppsett", exact: true })
    .click();
  await expect(toggle).toBeChecked();
  await canvas.getByRole("button", { name: "Lagre", exact: true }).click();
  await expect(
    canvas.locator('.home-canvas-room-heading[data-room="room:kitchen"]'),
  ).toBeVisible();
  await canvas.screenshot({
    path: `/private/tmp/smarti-room-groups-${info.project.name}.png`,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  expect(commands).toEqual([]);
});

test("visual card picker and per-card appearance support preview, cancel and duplicate device cards", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  await page.addInitScript(() =>
    localStorage.setItem("smarti-home-style", "harmony"),
  );
  const layouts = await personalCardLayouts(page);
  await richHome(page);
  await login(page);
  await page.setViewportSize({
    width: info.project.name === "mobile" ? 390 : 1440,
    height: 1100,
  });
  if (info.project.name === "mobile") {
    await appearance(page);
    await page
      .getByRole("combobox", { name: "Utseende", exact: true })
      .selectOption("dark");
    await navigate(page, "Hjem");
  }
  await page.getByRole("tab", { name: "Lys", exact: true }).click();
  const canvas = page.locator(".home-canvas");
  const card = canvas.locator('[data-card="device:light.living_pendant"]');
  const commands: string[] = [];
  page.on("request", (request) => {
    if (
      request.url().includes("/commands") ||
      (request.url().includes("/appearance") && request.method() !== "GET")
    )
      commands.push(request.url());
  });
  const before = (
    await (await page.request.get("/api/home")).json()
  ).controls.find(
    (c: any) => c.entity_id === "light.living_pendant",
  ).attributes;
  await page
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
  await card
    .getByRole("button", { name: "Rediger kort: Pendellampe", exact: true })
    .click();
  let dialog = page.getByRole("dialog", { name: "Rediger kort", exact: true });
  await dialog
    .getByRole("group", { name: "Korttype", exact: true })
    .getByRole("button", { name: "Bildekort", exact: true })
    .click();
  await dialog
    .getByRole("textbox", { name: "Navn på kortet", exact: true })
    .fill("Lesekroken");
  await dialog.locator("summary").filter({ hasText: "Ikon og bilde" }).click();
  await dialog
    .getByRole("group", { name: "Velg ikon", exact: true })
    .getByRole("button", { name: "Lys", exact: true })
    .click();
  await dialog
    .getByRole("group", { name: "Velg bilde", exact: true })
    .getByRole("button", { name: "Kontor", exact: true })
    .click();
  await expect(
    dialog.locator(".card-builder-preview .home-canvas-content"),
  ).toHaveAttribute("inert", "");
  await dialog.screenshot({
    path: `/private/tmp/smarti-card-editor-${info.project.name}.png`,
    animations: "disabled",
  });
  await dialog
    .getByRole("button", { name: "Bruk endringer", exact: true })
    .click();
  await canvas.getByRole("button", { name: "Lagre", exact: true }).click();
  await page.reload();
  await page.getByRole("tab", { name: "Lys", exact: true }).click();
  await expect(card.locator(".personal-status-card")).toContainText(
    "Lesekroken",
  );
  await expect(card.locator(".personal-status-photo")).toHaveAttribute(
    "src",
    /home-office\.webp$/,
  );
  expect(
    layouts
      .get("/api/home/layout/lights")!
      .items!.find((item) => item.id === "device:light.living_pendant").config,
  ).toMatchObject({
    type: "picture",
    title: "Lesekroken",
    icon: "light",
    image: "office",
    sources: ["light.living_pendant"],
  });
  await page
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
  await card
    .getByRole("button", { name: "Rediger kort: Lesekroken", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Rediger kort", exact: true });
  await dialog
    .getByRole("textbox", { name: "Navn på kortet", exact: true })
    .fill("Forkastes");
  await dialog.getByRole("button", { name: "Avbryt", exact: true }).click();
  await expect(card).not.toContainText("Forkastes");
  await canvas
    .getByRole("button", { name: "Legg til kort", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Legg til kort", exact: true });
  await expect(
    dialog.getByRole("heading", { name: "Hva vil du legge til?", exact: true }),
  ).toBeVisible();
  await dialog.screenshot({
    path: `/private/tmp/smarti-card-picker-${info.project.name}.png`,
    animations: "disabled",
  });
  await dialog.getByRole("button", { name: "Enhet", exact: true }).click();
  await dialog
    .getByRole("textbox", { name: "Søk etter enheter", exact: true })
    .fill("Pendellampe");
  await dialog
    .getByRole("button", { name: "Pendellampe", exact: true })
    .click();
  await dialog
    .getByRole("group", { name: "Korttype", exact: true })
    .getByRole("button", { name: "Kompakt", exact: true })
    .click();
  await dialog
    .getByRole("textbox", { name: "Navn på kortet", exact: true })
    .fill("Hurtiglys");
  await dialog
    .getByRole("button", { name: "Legg til kort", exact: true })
    .click();
  await canvas.getByRole("button", { name: "Lagre", exact: true }).click();
  const duplicate = canvas.locator('[data-card^="custom:"]');
  await expect(duplicate.locator(".personal-status-card")).toContainText(
    "Hurtiglys",
  );
  await expect(card.locator(".personal-status-photo")).toHaveAttribute(
    "src",
    /home-office\.webp$/,
  );
  expect(
    (await (await page.request.get("/api/home")).json()).controls.find(
      (c: any) => c.entity_id === "light.living_pendant",
    ).attributes,
  ).toEqual(before);
  expect(commands).toEqual([]);
  expect(
    await page
      .locator("body")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
});

test("graph cards add and edit several real sources with compatible units, gaps and missing-source handling", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  await page.addInitScript(() =>
    localStorage.setItem("smarti-home-style", "harmony"),
  );
  const layouts = await personalCardLayouts(page);
  const extra = [
    {
      ...control("sensor", "Temperatur Celsius", "20", {
        device_class: "temperature",
        unit_of_measurement: "°C",
      }),
      id: "sensor.builder_c",
      entity_id: "sensor.builder_c",
    },
    {
      ...control("sensor", "Temperatur Fahrenheit", "68", {
        device_class: "temperature",
        unit_of_measurement: "°F",
      }),
      id: "sensor.builder_f",
      entity_id: "sensor.builder_f",
    },
  ];
  await richHome(page, extra);
  await page.route("**/api/controls/sensor.builder_*/history?*", (route) => {
    const fahrenheit = route.request().url().includes("builder_f");
    return route.fulfill({
      json: {
        unit: fahrenheit ? "°F" : "°C",
        points: fahrenheit
          ? [
              { time: "2026-10-31T02:00:00Z", value: 68 },
              { time: "2026-10-31T04:00:00Z", value: 86 },
            ]
          : [
              { time: "2026-10-31T00:00:00Z", value: 10 },
              { time: "2026-10-31T01:00:00Z", value: null },
              { time: "2026-10-31T04:00:00Z", value: 30 },
            ],
      },
    });
  });
  const histories: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/history?")) histories.push(r.url());
  });
  await login(page);
  await page.setViewportSize({
    width: info.project.name === "mobile" ? 390 : 1440,
    height: 1100,
  });
  const canvas = page.locator(".home-canvas");
  await page
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
  await canvas
    .getByRole("button", { name: "Legg til kort", exact: true })
    .click();
  let dialog = page.getByRole("dialog", { name: "Legg til kort", exact: true });
  await dialog.getByRole("button", { name: "Graf", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Temperatur Celsius", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Husets forbruk", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", { name: "Temperatur Fahrenheit", exact: true })
    .click();
  await dialog.screenshot({
    path: `/private/tmp/smarti-graph-sources-${info.project.name}.png`,
    animations: "disabled",
  });
  await dialog.getByRole("button", { name: "Velg kort", exact: true }).click();
  await dialog
    .getByRole("textbox", { name: "Navn på kortet", exact: true })
    .fill("Temperatur sammen");
  await expect(
    dialog.locator('.personal-graph g[data-source="sensor.builder_c"] path'),
  ).toHaveCount(2);
  await expect(dialog.locator(".personal-graph-legend")).toContainText("20 °C");
  await dialog.screenshot({
    path: `/private/tmp/smarti-graph-editor-${info.project.name}.png`,
    animations: "disabled",
  });
  await dialog
    .getByRole("button", { name: "Legg til kort", exact: true })
    .click();
  await canvas.getByRole("button", { name: "Lagre", exact: true }).click();
  let graph = canvas.locator('[data-card^="custom:"]');
  // The existing chart is also rendered inert in the draft. Wait for the saved
  // canvas before testing keyboard focus rather than racing the async save.
  await expect(canvas).toHaveAttribute("data-editing", "false");
  await expect(
    graph.locator('.personal-graph g[data-source="sensor.builder_f"]'),
  ).toHaveCount(1);
  const plot = graph.locator(".measured-chart svg");
  await plot.focus();
  await expect(plot).toBeFocused();
  await page.keyboard.press("Home");
  await expect(graph.locator(".measured-chart-tooltip")).toContainText("10 °C");
  await page.keyboard.press("ArrowRight");
  await expect(
    graph.locator(".measured-chart-tooltip-row").first(),
  ).toContainText("—");
  await page.keyboard.press("End");
  await expect(graph.locator(".measured-chart-tooltip")).toContainText("30 °C");
  await graph.screenshot({
    path: `/private/tmp/smarti-refined-graph-${info.project.name}.png`,
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await plot.scrollIntoViewIfNeeded();
  const plotBounds = (await plot.boundingBox())!;
  if (info.project.name === "mobile")
    await page.touchscreen.tap(
      plotBounds.x + plotBounds.width / 2,
      plotBounds.y + plotBounds.height / 2,
    );
  else
    await page.mouse.move(
      plotBounds.x + plotBounds.width / 2,
      plotBounds.y + plotBounds.height / 2,
    );
  await expect(graph.locator(".measured-chart-tooltip")).toContainText("20 °C");
  await page.mouse.move(0, 0);
  await graph
    .locator(".personal-graph-legend")
    .getByRole("button", { name: /Temperatur Fahrenheit/ })
    .click();
  await expect(graph.locator('g[data-source="sensor.builder_f"]')).toHaveCount(
    0,
  );
  await graph
    .locator(".personal-graph-legend")
    .getByRole("button", { name: /Temperatur Fahrenheit/ })
    .click();
  await page
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
  await graph
    .getByRole("button", {
      name: "Rediger kort: Temperatur sammen",
      exact: true,
    })
    .click();
  dialog = page.getByRole("dialog", { name: "Rediger kort", exact: true });
  await dialog
    .getByRole("button", { name: "+ Legg til datakilde", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Temperatur i stuen", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Velg kort", exact: true }).click();
  await dialog
    .getByRole("combobox", { name: "Tidsrom", exact: true })
    .selectOption("6");
  await dialog
    .getByRole("button", { name: "Bruk endringer", exact: true })
    .click();
  await canvas.getByRole("button", { name: "Lagre", exact: true }).click();
  await page.reload();
  graph = canvas.locator('[data-card^="custom:"]');
  await expect(graph.locator(".personal-graph-legend > div")).toHaveCount(3);
  expect(
    layouts
      .get("/api/home/layout/overview")!
      .items!.find((item) => item.id.startsWith("custom:")).config,
  ).toMatchObject({
    type: "graph",
    period: "6",
    sources: [
      "sensor.builder_c",
      "sensor.builder_f",
      "sensor.harmony_temperature",
    ],
  });
  expect(
    histories.some((url) => url.includes("builder_f/history?hours=6")),
  ).toBe(true);
  extra.splice(1, 1);
  histories.length = 0;
  await page.reload();
  await expect(graph.locator(".personal-graph-legend")).toContainText(
    "Datakilde mangler",
  );
  await expect(graph.locator('g[data-source="sensor.builder_c"]')).toHaveCount(
    1,
  );
  expect(histories.some((url) => url.includes("builder_f/history"))).toBe(
    false,
  );
});

test("editing wiggles only visible idle surfaces, keeps handles stable and respects reduced motion", async ({
  page,
}, info) => {
  await page.addInitScript(() =>
    localStorage.setItem("smarti-home-style", "harmony"),
  );
  await personalCardLayouts(page);
  await richHome(page);
  await login(page);
  await page.setViewportSize({
    width: info.project.name === "mobile" ? 390 : 1440,
    height: 1100,
  });
  await page.getByRole("tab", { name: "Lys", exact: true }).click();
  const canvas = page.locator(".home-canvas");
  const cell = canvas.locator(".home-canvas-cell").first(),
    surface = cell.locator(".home-canvas-surface");
  const lightShadow = await surface.evaluate(
    (el) => getComputedStyle(el).boxShadow,
  );
  expect(lightShadow).not.toBe("none");
  await page
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
  await cell.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await expect(cell).toHaveAttribute("data-wiggle-visible", "true");
  await expect(surface).toHaveCSS("animation-name", "home-card-wiggle");
  const angles = await surface.evaluate((el) => {
    const animation = el
      .getAnimations()
      .find(
        (a) =>
          a instanceof CSSAnimation && a.animationName === "home-card-wiggle",
      )!;
    animation.pause();
    animation.currentTime = 0;
    const start = new DOMMatrixReadOnly(getComputedStyle(el).transform).b;
    animation.currentTime = Number(animation.effect!.getTiming().duration);
    const end = new DOMMatrixReadOnly(getComputedStyle(el).transform).b;
    animation.play();
    return { start, end };
  });
  expect(angles.start * angles.end).toBeLessThan(0);
  expect(Math.abs(angles.start)).toBeLessThan(0.01);
  expect(
    await cell.evaluate((el) =>
      el
        .getAnimations()
        .some((a) => a.effect?.getTiming().iterations === Infinity),
    ),
  ).toBe(false);
  await cell.locator(".home-canvas-grip").focus();
  await expect(surface).toHaveCSS("animation-name", "none");
  await canvas
    .getByRole("button", { name: "Legg til kort", exact: true })
    .click();
  expect(
    await canvas
      .locator(".home-canvas-grid .home-canvas-surface")
      .evaluateAll((nodes) =>
        nodes.every((el) => getComputedStyle(el).animationName === "none"),
      ),
  ).toBe(true);
  await page
    .getByRole("dialog", { name: "Legg til kort", exact: true })
    .getByRole("button", { name: "Lukk innstillinger", exact: true })
    .click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await canvas
      .locator(".home-canvas-surface")
      .evaluateAll((nodes) =>
        nodes.every((el) => getComputedStyle(el).animationName === "none"),
      ),
  ).toBe(true);
  await canvas.getByRole("button", { name: "Avbryt", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(surface).toHaveCSS("animation-name", "none");
  await appearance(page);
  await page
    .getByRole("combobox", { name: "Utseende", exact: true })
    .selectOption("dark");
  await navigate(page, "Hjem");
  await page.getByRole("tab", { name: "Lys", exact: true }).click();
  expect(
    await surface.evaluate((el) => getComputedStyle(el).boxShadow),
  ).not.toEqual(lightShadow);
  await page.screenshot({
    path: `/private/tmp/smarti-depth-${info.project.name}.png`,
    fullPage: true,
  });
});

test("numeric history keeps real gaps and supports keyboard and pointer or touch inspection", async ({
  page,
}, info) => {
  await page.addInitScript(() =>
    localStorage.setItem("smarti-home-style", "harmony"),
  );
  await richHome(page);
  await page.route("**/api/history/entities", (route) =>
    route.fulfill({
      json: [
        {
          ...control("sensor", "Temperatur i stuen", "22", {
            device_class: "temperature",
            unit_of_measurement: "°C",
          }),
          id: "sensor.harmony_temperature",
          entity_id: "sensor.harmony_temperature",
        },
      ],
    }),
  );
  await page.route("**/api/history/states?*", (route) => {
    const query = new URL(route.request().url()).searchParams;
    const start = Date.parse(query.get("start")!),
      end = Date.parse(query.get("end")!);
    return route.fulfill({
      json: {
        series: [
          {
            entity_id: "sensor.harmony_temperature",
            start: query.get("start"),
            end: query.get("end"),
            unit: "°C",
            minimum: 18,
            maximum: 22,
            samples: 7,
            truncated: false,
            points: [18, 18.6, 20.2, 19.4, null, 21.4, 22].map((value, i) => ({
              time: new Date(start + ((end - start) * i) / 6).toISOString(),
              state: value === null ? "unavailable" : String(value),
              value,
            })),
          },
        ],
      },
    });
  });
  await login(page);
  if (info.project.name === "mobile") {
    await appearance(page);
    await page
      .getByRole("combobox", { name: "Utseende", exact: true })
      .selectOption("dark");
  }
  await page
    .getByRole("button", { name: "Rapporter og innsikt", exact: true })
    .click();
  await page
    .getByRole("tab", { name: "Grafer og historikk", exact: true })
    .click();
  if (!(await page.locator("#history-sources").isVisible()))
    await page.getByRole("button", { name: "Velg kilder" }).click();
  await page.getByRole("checkbox", { name: /Temperatur i stuen/ }).check();
  if (info.project.name === "mobile")
    await page
      .getByRole("button", { name: "Vis resultat", exact: true })
      .click();
  const series = page.locator(".history-series"),
    plot = series.locator(".measured-chart svg");
  await expect(plot).toBeVisible();
  await expect(series.locator(".measured-chart-line")).toHaveCount(2);
  await plot.focus();
  await page.keyboard.press("Home");
  await expect(series.locator(".control-history-reading strong")).toHaveText(
    "18 °C",
  );
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
  await expect(series.locator(".control-history-reading strong")).toHaveText(
    "Måling mangler",
  );
  await page.keyboard.press("End");
  await expect(series.locator(".control-history-reading strong")).toHaveText(
    "22 °C",
  );
  await page.keyboard.press("Escape");
  // Keep the intended touch point above the fixed phone navigation.
  await plot.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const box = (await plot.boundingBox())!;
  const x = box.x + (box.width * (8 + (464 * 4) / 6)) / 480;
  if (info.project.name === "mobile")
    await page.touchscreen.tap(x, box.y + box.height / 2);
  else await page.mouse.move(x, box.y + box.height / 2);
  await expect(series.locator(".control-history-reading strong")).toHaveText(
    "Måling mangler",
  );
  await expect(series.locator(".measured-chart-tooltip-row strong")).toHaveText(
    "—",
  );
  await page.mouse.move(0, 0);
  await plot.focus();
  await page.keyboard.press("End");
  await page.keyboard.press("Escape");
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    )
    .toBe(true);
  await series.screenshot({
    path: `/private/tmp/smarti-elegant-history-${info.project.name}.png`,
  });
});
