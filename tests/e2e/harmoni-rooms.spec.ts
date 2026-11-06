import {
  test,
  expect,
  type Page,
} from "../../frontend/node_modules/@playwright/test";

async function setup(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("smarti-home-style", "harmony");
    localStorage.setItem("smarti-theme", "light");
  });
  const make = (
    id: string,
    name: string,
    state: string,
    area = "living",
    attributes: Record<string, unknown> = {},
    actions: string[] = [],
  ) => ({
    id,
    entity_id: id,
    name,
    state,
    area_id: area || null,
    device_id: null,
    domain: id.split(".")[0],
    attributes,
    diagnostic: false,
    updated_at: null,
    integration: null,
    availability: state === "unavailable" ? "unavailable" : "available",
    capabilities: actions.length
      ? [
          {
            kind: id.split(".")[0],
            actions,
            unit: id.startsWith("climate") ? "°C" : "%",
            minimum: 5,
            maximum: 30,
            step: 0.5,
          },
        ]
      : [],
  });
  const lights = [
    make(
      "light.pendant",
      "Pendellampe",
      "on",
      "living",
      { brightness: 140, smarti_icon: "pendant" },
      ["turn_on", "turn_off", "set_brightness"],
    ),
    make(
      "light.desk",
      "Leselampe ved vinduet",
      "off",
      "living",
      { brightness: 0, smarti_icon: "desk" },
      ["turn_on", "turn_off", "set_brightness"],
    ),
  ];
  lights.forEach((c) => {
    c.capabilities[0].minimum = 0;
    c.capabilities[0].maximum = 100;
    c.capabilities[0].step = 1;
  });
  const controls = [
    ...lights,
    make(
      "climate.floor",
      "Gulvvarme Stue",
      "heat",
      "living",
      {
        temperature: 20,
        current_temperature: 21.4,
        temperature_unit: "°C",
        hvac_action: "heating",
        hvac_modes: ["heat", "cool", "off"],
      },
      ["set_temperature", "set_hvac_mode"],
    ),
    make("sensor.humidity", "Luftfuktighet", "46", "living", {
      device_class: "humidity",
      unit_of_measurement: "%",
    }),
    make("binary_sensor.window", "Vindu Stue", "off", "living", {
      device_class: "window",
    }),
    make("binary_sensor.motion", "Bevegelse", "off", "living", {
      device_class: "motion",
    }),
    make("binary_sensor.smoke", "Røykdetektor", "unavailable", "living", {
      device_class: "smoke",
    }),
    make("switch.socket", "Smart stikkontakt", "on", "living", {}, [
      "turn_on",
      "turn_off",
    ]),
    make(
      "sensor.power",
      "Effekt med et svært langt navn som må få plass",
      "14.9",
      "living",
      { device_class: "power", unit_of_measurement: "W" },
    ),
    make(
      "sensor.energy",
      "Svært liten registrert energi",
      "0.000248",
      "living",
      { device_class: "energy", unit_of_measurement: "kWh" },
    ),
    make("lock.front", "Ytterdør", "locked", "living", {}, ["lock", "unlock"]),
    make(
      "light.kitchen",
      "Taklampe Kjøkken",
      "on",
      "kitchen",
      { brightness: 200 },
      ["turn_on", "turn_off"],
    ),
    make("sensor.loose", "Temperatur uten rom", "19.8", "", {
      device_class: "temperature",
      unit_of_measurement: "°C",
    }),
  ];
  const state = {
    connected: true,
    permissions: undefined as string[] | undefined,
    hidden: [] as string[],
  };
  const commands: { id: string; body: Record<string, unknown> }[] = [];
  const writes: string[] = [];
  page.on("request", (request) => {
    if (
      ["PUT", "DELETE"].includes(request.method()) &&
      request.url().includes("/home/layout/")
    )
      writes.push(request.url());
  });
  await page.route("**/api/home", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      json: {
        ...(await response.json()),
        connected: state.connected,
        ...(state.permissions ? { permissions: state.permissions } : {}),
        controls,
        favorites: [],
        areas: [
          { area_id: "living", name: "Stue" },
          { area_id: "kitchen", name: "Kjøkken" },
          { area_id: "empty", name: "Et rom med et veldig langt navn" },
        ],
      },
    });
  });
  await page.route("**/api/home/room-view/*", async (route) => {
    if (route.request().method() === "PUT")
      state.hidden = route.request().postDataJSON().hidden;
    await route.fulfill({ json: { hidden: state.hidden } });
  });
  await page.route("**/api/controls/*/commands", async (route) => {
    const id = decodeURIComponent(
      new URL(route.request().url()).pathname.split("/").at(-2)!,
    );
    const body = route.request().postDataJSON();
    commands.push({ id, body });
    const c = controls.find((c) => c.entity_id === id)!;
    if (body.action === "turn_off") c.state = "off";
    if (body.action === "turn_on") c.state = "on";
    if (body.action === "set_temperature")
      c.attributes.temperature = body.value;
    await route.fulfill({ json: { status: "state_updated" } });
  });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Hovedmeny" })
    .getByRole("button", { name: "Rom", exact: true })
    .click();
  await expect(
    page.locator(".rooms-overview[data-harmoni-rooms]"),
  ).toBeVisible();
  return { controls, state, commands, writes };
}
const openLiving = async (page: Page) => {
  await page
    .locator(".room-summary-card")
    .filter({ has: page.getByRole("heading", { name: "Stue", exact: true }) })
    .click();
  await expect(page.locator(".room-detail[data-harmoni-rooms]")).toBeVisible();
};

test("Harmoni room overview and room controls reflow across phone/tablet/desktop with real readings and artwork", async ({
  page,
}, info) => {
  const data = await setup(page);
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    for (const width of [320, 390, 834, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const overview = page.locator(".rooms-overview");
      await expect(overview.locator(".room-summary-card")).toHaveCount(4);
      expect(
        await page
          .locator("body")
          .evaluate((e) => e.scrollWidth <= e.clientWidth),
      ).toBe(true);
      const living = overview
        .locator(".room-summary-card")
        .filter({ hasText: "Stue" });
      await expect(living).toContainText("21,4 °C");
      await expect(living).toContainText("46 %");
      await expect(living.locator(".room-summary-photo img")).toBeVisible();
      if (width === 390 || width === 1440)
        await page.screenshot({
          path: `/private/tmp/smarti-114-overview-${theme}-${width}-${info.project.name}.png`,
          fullPage: true,
          animations: "disabled",
        });
      await openLiving(page);
      const room = page.locator(".room-detail");
      await expect(room.locator(".room-detail-hero")).toHaveCount(0);
      await expect(
        room.getByRole("combobox", { name: "Velg rom", exact: true }),
      ).toHaveValue("living");
      await expect(
        room.locator('.harmony-device[data-domain="light"]').first(),
      ).toHaveAttribute("data-card-tone", "lighting");
      await expect(
        room.locator('.harmony-device[data-art="window"] img'),
      ).toHaveAttribute("src", /window-closed\.webp$/);
      const thermostat = room.locator('.harmony-device[data-domain="climate"]');
      const box = await thermostat.boundingBox();
      expect(box!.width).toBeGreaterThan(250);
      await expect(
        thermostat.locator(".thermostat-target strong"),
      ).toContainText("20");
      await expect(
        room
          .locator(".harmony-device")
          .filter({ hasText: "Effekt med et svært langt navn" })
          .locator(".equipment-measurement"),
      ).toHaveText("14,9 W");
      for (const card of await room.locator(".harmony-device").all()) {
        const geometry = await card.evaluate((el) => ({
          x: el.getBoundingClientRect().x,
          right: el.getBoundingClientRect().right,
          scroll: el.scrollWidth,
          width: el.clientWidth,
          height: el.clientHeight,
          scrollHeight: el.scrollHeight,
        }));
        expect(geometry.x).toBeGreaterThanOrEqual(0);
        expect(
          geometry.right,
          `${await card.innerText()} ${JSON.stringify(geometry)}`,
        ).toBeLessThanOrEqual(width);
        expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 2);
        expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.height + 2);
      }
      expect(
        await page
          .locator("body")
          .evaluate((e) => e.scrollWidth <= e.clientWidth),
      ).toBe(true);
      if (width === 390 || width === 1440)
        await page.screenshot({
          path: `/private/tmp/smarti-114-detail-${theme}-${width}-${info.project.name}.png`,
          fullPage: true,
          animations: "disabled",
        });
      await room.getByRole("button", { name: "Alle rom", exact: true }).click();
    }
  }
  expect(data.commands).toHaveLength(0);
  expect(data.writes).toHaveLength(0);
});

test("room search, room selector, direct controls, confirmations and saved visibility stay functional", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  const data = await setup(page);
  await page.getByRole("button", { name: "Søk i rom", exact: true }).click();
  const search = page.getByRole("textbox", {
    name: "Søk etter rom",
    exact: true,
  });
  await search.fill("finnesikke");
  await expect(page.locator(".room-summary-card")).toHaveCount(0);
  await search.press("Escape");
  await expect(page.locator(".room-summary-card")).toHaveCount(4);
  await expect(
    page.getByRole("button", { name: "Søk i rom", exact: true }),
  ).toBeFocused();
  await openLiving(page);
  const room = page.locator(".room-detail");
  const light = room.locator(".harmony-device").filter({
    has: page.getByRole("button", { name: "Åpne Pendellampe", exact: true }),
  });
  await light.getByRole("switch").click();
  await expect(light.getByRole("switch")).toHaveAttribute(
    "aria-checked",
    "false",
  );
  expect(data.commands[0]).toMatchObject({
    id: "light.pendant",
    body: { action: "turn_off" },
  });
  await room
    .getByRole("button", {
      name: "Gulvvarme Stue: Ønsket temperatur +",
      exact: true,
    })
    .click();
  await expect.poll(() => data.commands.length).toBe(2);
  expect(data.commands[1]).toMatchObject({
    id: "climate.floor",
    body: { action: "set_temperature", value: 20.5 },
  });
  await room
    .getByRole("button", { name: "Ytterdør: Lås opp", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Lås opp Ytterdør?", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Avbryt", exact: true }).click();
  expect(data.commands).toHaveLength(2);
  await room
    .getByRole("button", { name: "Administrer rom", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("checkbox", { name: "Vis i rommet: Pendellampe", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("lagret");
  await dialog
    .getByRole("button", { name: "Lukk innstillinger", exact: true })
    .click();
  await expect(light).toHaveCount(0);
  await room
    .getByRole("combobox", { name: "Velg rom", exact: true })
    .selectOption("kitchen");
  await expect(
    room.getByRole("heading", { name: "Kjøkken", exact: true }),
  ).toBeVisible();
  await expect(room.locator(".harmony-device")).toHaveCount(1);
  await room
    .getByRole("combobox", { name: "Velg rom", exact: true })
    .selectOption("empty");
  await expect(
    room.getByRole("heading", { name: "Rom for mer", exact: true }),
  ).toBeVisible();
  expect(data.writes).toHaveLength(0);
});

test("room controls retain permissions and cooling state, and glass respects reduced transparency", async ({
  page,
}) => {
  await page.setViewportSize({ width: 834, height: 1100 });
  const data = await setup(page);
  data.state.permissions = ["lights.view", "climate.view", "security.view"];
  await page.reload();
  await page
    .getByRole("navigation", { name: "Hovedmeny" })
    .getByRole("button", { name: "Rom", exact: true })
    .click();
  await openLiving(page);
  const room = page.locator(".room-detail");
  for (const toggle of await room.getByRole("switch").all())
    await expect(toggle).toBeDisabled();
  await expect(
    room.getByRole("button", {
      name: "Gulvvarme Stue: Ønsket temperatur +",
      exact: true,
    }),
  ).toBeDisabled();
  expect(data.commands).toHaveLength(0);
  const selector = room.getByRole("combobox", {
    name: "Velg rom",
    exact: true,
  });
  await selector.focus();
  await expect(room.locator(".harmoni-room-title")).toHaveCSS(
    "outline-style",
    "solid",
  );
  data.state.permissions = undefined;
  const thermostat = data.controls.find((c) => c.domain === "climate")!;
  thermostat.state = "cool";
  thermostat.attributes.hvac_action = "cooling";
  await page.reload();
  await page
    .getByRole("navigation", { name: "Hovedmeny" })
    .getByRole("button", { name: "Rom", exact: true })
    .click();
  await openLiving(page);
  const climateCard = room.locator('.harmony-device[data-domain="climate"]');
  await expect(climateCard.locator(".thermostat")).toHaveAttribute(
    "data-tone",
    "cool",
  );
  expect(
    await climateCard.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--card-identity").trim(),
    ),
  ).toBe("#216d9b");
  await expect(climateCard).toHaveCSS("backdrop-filter", /blur\(8px\)/);
  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
  });
  await expect(climateCard).toHaveCSS("backdrop-filter", "none");
  expect(data.commands).toHaveLength(0);
  expect(data.writes).toHaveLength(0);
});
