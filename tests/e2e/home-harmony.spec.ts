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
  await expect(page.locator(".home-welcome")).toBeVisible();
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
async function richHome(page: Page) {
  await page.route("**/api/home", async (route) => {
    const response = await route.fetch(),
      home = await response.json();
    const extras = [
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
    await expect(page.locator(".home-welcome")).toBeVisible();
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
  await expect(page.locator(".home-welcome")).toBeVisible();
  await page.clock.fastForward(31_000);
  await expect(page.locator(".home-welcome")).toContainText(
    "venter på ferske data",
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

test("photo headers center the actual alert count, respect reduced motion and keep home/date above tabs", async ({
  page,
}, info) => {
  await page.addInitScript(() =>
    localStorage.setItem("smarti-home-style", "harmony"),
  );
  await page.route("**/api/home", async (route) => {
    const response = await route.fetch(),
      home = await response.json();
    const alarms = Array.from({ length: 19 }, (_, i) => ({
      ...control("binary_sensor", `Røykvarsler ${i + 1}`, "on", {
        device_class: "smoke",
      }),
      id: `binary_sensor.alert_${i}`,
      entity_id: `binary_sensor.alert_${i}`,
    }));
    await route.fulfill({
      json: {
        ...home,
        controls: [
          ...home.controls,
          ...alarms,
          control("weather", "Været hjemme", "partlycloudy", {
            temperature: 11.8,
            temperature_unit: "°C",
          }),
        ],
      },
    });
  });
  await page.route("**/api/home/weather/*", (route) =>
    route.fulfill({ json: { days: {}, temperature_unit: "°C" } }),
  );
  await login(page);
  const header = page.locator(".home-hero-stage");
  const alert = header.getByRole("button", {
    name: "Trenger din oppmerksomhet: 19",
    exact: true,
  });
  await expect(header.locator(".home-header-photo")).toHaveAttribute(
    "data-ready",
    "true",
  );
  await expect(
    page
      .locator('.home-canvas [data-card="weather"]')
      .getByRole("img", { name: "11,8 °C", exact: true }),
  ).toBeVisible();
  const currentDate = await page.evaluate(() =>
    new Date().toLocaleDateString("nb-NO", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }),
  );
  await expect(page.locator(".home-toolbar .home-date")).toHaveText(
    currentDate,
  );
  for (const width of [1440, 834, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const heroBox = (await header.locator(".home-hero-focus").boundingBox())!,
      alertBox = (await alert.boundingBox())!;
    expect(
      Math.abs(alertBox.x + alertBox.width / 2 - heroBox.x - heroBox.width / 2),
    ).toBeLessThan(2);
    expect(
      Math.abs(
        alertBox.y + alertBox.height / 2 - heroBox.y - heroBox.height / 2,
      ),
    ).toBeLessThan(2);
    if (width <= 1000) {
      const weather = (await page
        .locator('.home-canvas [data-card="weather"]')
        .boundingBox())!;
      expect(alertBox.y + alertBox.height + 8).toBeLessThanOrEqual(weather.y);
    }
    if (width <= 600) {
      const greetingBox = (await header
        .locator(".home-welcome-content")
        .boundingBox())!;
      expect(greetingBox.y + greetingBox.height + 8).toBeLessThanOrEqual(
        alertBox.y,
      );
    }
    const meta = (await page.locator(".home-toolbar").boundingBox())!,
      tabs = (await page
        .getByRole("tablist", { name: "Visninger i Hjem" })
        .boundingBox())!;
    expect(meta.y + meta.height).toBeLessThanOrEqual(tabs.y);
    expect(
      await page
        .locator("body")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: `/private/tmp/smarti-header-${width}-${info.project.name}.png`,
      animations: "disabled",
    });
  }
  expect(
    await alert.evaluate(
      (el) => getComputedStyle(el, "::before").animationName,
    ),
  ).toBe("harmony-alert-pulse");
  await alert.click();
  await expect(page.locator(".home-alert-list li")).toHaveCount(19);
  await page.keyboard.press("Escape");
  await expect(alert).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await alert.evaluate(
      (el) => getComputedStyle(el, "::before").animationName,
    ),
  ).toBe("none");
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
  await expect(
    page.locator(".home-hero-stage .home-header-photo"),
  ).toHaveAttribute("src", /home-outdoor.webp/);
  await page.reload();
  await expect(
    page.locator(".home-hero-stage .home-header-photo"),
  ).toHaveAttribute("src", /home-outdoor.webp/);
  for (const name of [
    "Lys",
    "Energi",
    "Sikkerhet",
    "Klima",
    "Multimedia",
    "Diverse",
  ]) {
    await page.getByRole("tab", { name, exact: true }).click();
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
    await expect(
      page.locator(".category-heading .home-header-photo"),
    ).toHaveAttribute("src", /home-outdoor.webp/);
    await expect(
      page.locator(".category-heading .home-header-photo"),
    ).toHaveAttribute("data-ready", "true");
  }
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
  await navigate(page, "Hjem");
  await page.reload();
  await expect(
    page.locator(".home-hero-stage .home-header-photo"),
  ).toHaveAttribute(
    "src",
    new RegExp(`/api/home/appearance/image\\?v=${saved.image_version}`),
  );
  await expect(
    page.locator(".home-hero-stage .home-header-photo"),
  ).toHaveAttribute("data-ready", "true");
  await appearance(page);
  await settings
    .getByRole("radio", { name: "Uten bilde", exact: true })
    .click();
  await expect(
    settings.getByRole("radio", { name: "Uten bilde", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await navigate(page, "Hjem");
  await expect(page.locator(".home-hero-stage .home-header-photo")).toHaveCount(
    0,
  );
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

test("summary pills live inside the photos and still open their details at every screen size", async ({
  page,
}, info) => {
  await page.addInitScript(() =>
    localStorage.setItem("smarti-home-style", "harmony"),
  );
  await richHome(page);
  await login(page);
  const categories = [
    { name: "Lys", id: "lights", label: "Lys på", count: 3 },
    { name: "Klima", id: "climate", label: "Snittemperatur", count: 3 },
    { name: "Sikkerhet", id: "security", label: "Dører låst", count: 4 },
    { name: "Multimedia", id: "media", label: "Spillere", count: 4 },
    { name: "Diverse", id: "misc", label: "Brytere", count: 3 },
  ];
  for (const theme of ["light", "dark"]) {
    await appearance(page);
    await page
      .getByRole("combobox", { name: "Utseende", exact: true })
      .selectOption(theme);
    await navigate(page, "Hjem");
    for (const width of [320, 834, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.getByRole("tab", { name: "Oversikt", exact: true }).click();
      const welcome = page.locator(".home-hero-stage");
      await expect(welcome.locator(".home-status-grid")).toHaveCount(1);
      await expect(page.locator(".home-status-grid")).toHaveCount(1);
      const bounds = (await welcome.boundingBox())!;
      for (const pill of await welcome.locator(".home-status").all()) {
        const box = (await pill.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(bounds.x);
        expect(box.x + box.width).toBeLessThanOrEqual(
          bounds.x + bounds.width + 1,
        );
        expect(box.y + box.height).toBeLessThanOrEqual(
          bounds.y + bounds.height + 1,
        );
      }
      await welcome.locator(".home-status.status-climate").click();
      await expect(
        page.getByRole("tab", { name: "Klima", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      for (const category of categories) {
        await page
          .getByRole("tab", { name: category.name, exact: true })
          .click();
        const header = page.locator(".category-heading");
        await expect(header.locator(".home-header-photo")).toHaveAttribute(
          "data-ready",
          "true",
        );
        await expect(header.locator(".category-metric-button")).toHaveCount(
          category.count,
        );
        await expect(page.locator(".category-metric-button")).toHaveCount(
          category.count,
        );
        const photo = (await header.boundingBox())!;
        if (category.id === "media") {
          const view = (await page.locator(".multimedia-view").boundingBox())!;
          expect(Math.abs(photo.width - view.width)).toBeLessThan(1);
        }
        for (const pill of await header
          .locator(".category-metric-button")
          .all()) {
          const box = (await pill.boundingBox())!;
          expect(box.x).toBeGreaterThanOrEqual(photo.x);
          expect(box.y).toBeGreaterThanOrEqual(photo.y);
          expect(box.x + box.width).toBeLessThanOrEqual(
            photo.x + photo.width + 1,
          );
          expect(box.y + box.height).toBeLessThanOrEqual(
            photo.y + photo.height + 1,
          );
          await expect(pill).toHaveCSS("color", "rgb(255, 254, 253)");
        }
        const pill = header.getByRole("button", {
          name: category.label,
          exact: true,
        });
        await pill.click();
        await expect(
          page.getByRole("dialog", { name: category.label, exact: true }),
        ).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(pill).toBeFocused();
        expect(
          await page
            .locator("body")
            .evaluate((el) => el.scrollWidth <= el.clientWidth),
        ).toBe(true);
        if (
          (theme === "light" && width === 1440) ||
          (theme === "dark" && width === 320)
        ) {
          await header.screenshot({
            path: `/private/tmp/smarti-pills-${category.id}-${width}-${info.project.name}.png`,
            animations: "disabled",
          });
        }
      }
    }
  }
});

test("photo banners share a height and the three-column canvas edits, resizes, saves and reloads", async ({
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
    let expectedHeight = 0;
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
      const header = page.locator(
        name === "Oversikt" ? ".home-hero-stage" : ".category-heading",
      );
      const box = (await header.boundingBox())!;
      if (!expectedHeight) expectedHeight = box.height;
      expect(Math.abs(expectedHeight - box.height)).toBeLessThan(1);
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
  await canvas
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
  await canvas
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
  await canvas
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
  const grid = (await canvas.locator(".home-canvas-grid").boundingBox())!;
  const step = (grid.width + 16) / 3;
  const grip = (await cell.locator(".home-canvas-grip").boundingBox())!;
  await page.mouse.move(grip.x + 30, grip.y + 18);
  await page.mouse.down();
  await page.mouse.move(grip.x + 30 + step, grip.y + 18, { steps: 8 });
  await page.mouse.up();
  await expect(cell).toHaveCSS("grid-column-start", "2");
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
  await canvas
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
  const touchFirst = canvas.locator(".home-canvas-cell").first();
  const touchId = await touchFirst.getAttribute("data-card");
  await touchFirst.scrollIntoViewIfNeeded();
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
    await canvas
      .getByRole("button", { name: "Rediger oppsett", exact: true })
      .click();
    const cell = canvas.locator(".home-canvas-cell").first();
    const id = (await cell.getAttribute("data-card"))!;
    const title = (await cell.locator(".home-canvas-grip span").textContent())!;
    await cell
      .getByRole("button", { name: `Fjern ${title}`, exact: true })
      .click();
    await expect(canvas.locator(`[data-card="${id}"]`)).toHaveCount(0);
    await canvas
      .getByRole("button", { name: "Legg til kort", exact: true })
      .click();
    await canvas
      .locator(".home-canvas-library")
      .getByRole("button", { name: title, exact: true })
      .click();
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
  await canvas
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
    canvas.getByRole("button", { name: "Rediger oppsett", exact: true }),
  ).toBeFocused();
});
