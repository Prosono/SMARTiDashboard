import {
  test,
  expect,
  type Page,
} from "../../frontend/node_modules/@playwright/test";
import type { Control } from "../../frontend/src/types";
import {
  deviceRow,
  deviceSearch,
  openDeviceControl,
  selectDeviceCategory,
} from "./deviceNavigation";

test.use({ storageState: { cookies: [], origins: [] } });
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "wait" });
});
const control = (
  id: string,
  domain: string,
  attributes: Record<string, unknown> = {},
  state = "on",
): Control => ({
  id: `${domain}.${id}`,
  entity_id: `${domain}.${id}`,
  name: id,
  domain,
  state,
  attributes,
  device_id: `registry-${id}`,
  area_id: "living",
  availability: "available",
  diagnostic: false,
  integration: null,
  updated_at: null,
  capabilities: [],
});
const controls = [
  control("chosen-light", "light", { smarti_icon: "track" }),
  control("LED-list", "light"),
  control("wall-switch", "switch"),
  control("smoke", "binary_sensor", { device_class: "smoke" }, "off"),
  control("motion", "binary_sensor", { device_class: "motion" }, "off"),
  control("active-motion", "binary_sensor", { device_class: "motion" }),
  {
    ...control(
      "unknown-motion",
      "binary_sensor",
      { device_class: "motion" },
      "unknown",
    ),
    availability: "unknown",
  },
  control("presence", "binary_sensor", { device_class: "occupancy" }),
  control("open-window", "binary_sensor", { device_class: "window" }),
  {
    ...control(
      "unknown-window",
      "binary_sensor",
      { device_class: "window" },
      "unknown",
    ),
    availability: "unknown",
  },
  control("front-lock", "lock", {}, "locked"),
  control("media", "media_player", {
    smarti_icon: "speaker_white",
    smarti_media_image: "speaker-white",
  }),
  control(
    "battery",
    "sensor",
    { device_class: "battery", unit_of_measurement: "%" },
    "82",
  ),
  control(
    "temperature",
    "sensor",
    { device_class: "temperature", unit_of_measurement: "°C" },
    "20",
  ),
  control("AC", "climate"),
  control("thermostat", "climate"),
  control("water-heater", "water_heater"),
  control("camera", "camera"),
  ...["pendant", "bulb", "floor", "desk", "ceiling", "spot", "outdoor"].map(
    (kind) => ({
      ...control(kind, "light", {
        smarti_icon: kind,
        brightness: 81,
        supported_color_modes: ["rgb", "color_temp"],
        color_mode: "color_temp",
        rgb_color: [255, 212, 163],
      }),
      name: kind === "pendant" ? "Lys Spisebord ved vinduet" : kind,
      capabilities: [
        {
          kind: "power",
          actions: ["turn_on", "turn_off"],
          unit: null,
          minimum: null,
          maximum: null,
          step: null,
        },
        {
          kind: "brightness",
          actions: ["set_brightness"],
          unit: "%",
          minimum: 0,
          maximum: 100,
          step: 1,
        },
        {
          kind: "color",
          actions: ["set_rgb_color"],
          unit: null,
          minimum: null,
          maximum: null,
          step: null,
        },
        {
          kind: "color_temperature",
          actions: ["set_color_temp"],
          unit: "K",
          minimum: 2200,
          maximum: 6500,
          step: 100,
        },
      ],
    }),
  ),
  control("fan", "fan"),
  ...["blind", "shade", "curtain", "awning", "garage"].map((device_class) =>
    control(
      device_class,
      "cover",
      { device_class, current_position: 0 },
      "closed",
    ),
  ),
  control("alarm", "alarm_control_panel", {}, "disarmed"),
  control(
    "consumption",
    "sensor",
    { device_class: "energy", unit_of_measurement: "kWh" },
    "1783.80692",
  ),
  control(
    "cost",
    "sensor",
    { device_class: "monetary", unit_of_measurement: "NOK" },
    "166.17641",
  ),
  {
    ...control(
      "backup_next",
      "sensor",
      { device_class: "timestamp" },
      "2026-11-08T04:14:23+00:00",
    ),
    name: "Backup Next scheduled automatic backup",
  },
  {
    ...control("backup_state", "sensor", {}, "idle"),
    name: "Backup Backup Manager state",
  },
  { ...control("ac_mode", "sensor", {}, "cool"), name: "Stue AC Mode" },
  {
    ...control("people", "sensor", {}, "unavailable"),
    name: "Roode Combined People Inside",
    availability: "unavailable",
  },
  control("generic", "sensor", {}, "idle"),
];
async function setup(page: Page) {
  const mutations: string[] = [];
  await page.addInitScript(() =>
    localStorage.setItem("smarti-home-style", "harmony"),
  );
  await page.route("**/api/home/experience", (r) =>
    r.fulfill({ json: { mode: "advanced" } }),
  );
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
  await page.route("**/api/controls/*/commands", (route) => {
    mutations.push(route.request().url());
    return route.fulfill({ json: { status: "state_updated" } });
  });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Hovedmeny" })
    .getByRole("button", { name: "Enheter", exact: true })
    .click();
  return mutations;
}

async function inventoryRow(page: Page, entitySuffix: string) {
  const fixture = controls.find(({ entity_id }) =>
    entity_id.endsWith(`.${entitySuffix}`),
  )!;
  await deviceSearch(page).fill(fixture.name);
  const row = deviceRow(page, fixture.name);
  await row.scrollIntoViewIfNeeded();
  return row;
}

test("all-device visuals reuse shared artwork and semantic icons at phone, tablet and desktop widths", async ({
  page,
}) => {
  test.setTimeout(60000);
  const mutations = await setup(page);
  for (const width of [320, 390, 834, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      for (const [id, file] of [
        ["chosen-light", "track"],
        ["LED-list", "strip"],
        ["wall-switch", "switch"],
        ["smoke", "smoke"],
        ["motion", "movement-idle"],
        ["active-motion", "movement"],
        ["unknown-motion", "motion"],
        ["presence", "presence"],
        ["open-window", "window-open"],
        ["front-lock", "lock"],
        ["media", "speaker-white"],
        ["AC", "air-conditioner"],
        ["thermostat", "thermostat"],
        ["water-heater", "water-heater"],
        ["fan", "fan"],
        ["blind", "blind"],
        ["shade", "roller"],
        ["curtain", "curtain"],
        ["awning", "awning"],
        ["garage", "garage"],
        ["alarm", "alarm"],
        ["battery", "battery"],
        ["temperature", "temperature-sensor"],
        ["consumption", "meter"],
        ["cost", "money"],
        ["backup_next", "backup"],
        ["backup_state", "backup"],
        ["ac_mode", "air-conditioner"],
        ["people", "presence"],
        ["generic", "data"],
      ]) {
        const card = await inventoryRow(page, id);
        const image = card.locator(".device-product-art img");
        await expect(image).toHaveAttribute(
          "src",
          new RegExp(`/${file}\\.webp$`),
        );
        await expect
          .poll(() =>
            image.evaluate((img: HTMLImageElement) => img.naturalWidth),
          )
          .toBeGreaterThan(0);
        expect(
          await image.evaluate((img) => {
            const a = img.getBoundingClientRect(),
              b = img.closest(".devices-control-row")!.getBoundingClientRect();
            return (
              a.width >= 32 &&
              a.height >= 32 &&
              a.left >= b.left &&
              a.right <= b.right &&
              getComputedStyle(img).opacity === "1"
            );
          }),
        ).toBe(true);
      }
      await expect(
        (await inventoryRow(page, "unknown-window")).locator(
          ".device-product-art img",
        ),
      ).toHaveCount(0);
      await expect(
        (await inventoryRow(page, "camera")).locator(
          ".device-product-art svg",
        ),
      ).toHaveClass(/lucide-camera/);
      await expect(
        (await inventoryRow(page, "AC")).locator(".art-air-conditioner"),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const smoke = await openDeviceControl(page, "smoke");
  await expect(
    smoke.locator('img[src$="/smoke.webp"]'),
  ).toBeVisible();
  await page.screenshot({
    path: "/private/tmp/smarti-device-detail.png",
    animations: "disabled",
  });
  expect(mutations).toEqual([]);
});

test("protocol rows and details use registry-matched shared visuals while preserving product pictures and controller branding", async ({
  page,
}) => {
  const devices = [
    {
      id: "light-radio",
      name: "Chosen fixture",
      ha_device_id: "registry-chosen-light",
      status: "online",
      image_url: "/home/equipment/plug.webp",
    },
    {
      id: "smoke-radio",
      name: "Smoke fixture",
      ha_device_id: "registry-smoke",
      status: "asleep",
      image_url: "/missing-product.webp",
      custom_image: true,
    },
    {
      id: "product-radio",
      name: "Custom product",
      ha_device_id: "registry-chosen-light",
      status: "online",
      image_url: "/home/equipment/plug.webp",
      custom_image: true,
    },
    {
      id: "controller",
      name: "Controller fixture",
      status: "online",
      controller: true,
    },
    { id: "unmatched", name: "chosen-light", status: "unknown" },
  ];
  await page.route("**/missing-product.webp", (r) => r.abort());
  for (const provider of ["zigbee2mqtt", "zwave_js"]) {
    await page.route(`**/api/devices/${provider}`, (r) =>
      r.fulfill({ json: { status: "ready", devices } }),
    );
    await page.route(`**/api/devices/${provider}/detail?*`, (r) => {
      const device = devices.find(
        (d) =>
          d.id === new URL(r.request().url()).searchParams.get("device_id"),
      )!;
      return r.fulfill({
        json: {
          ...device,
          network_status: "ready",
          controls: controls.filter((c) => c.device_id === device.ha_device_id),
        },
      });
    });
  }
  const mutations = await setup(page);
  for (const tab of ["zigbee2mqtt", "zwave_js"] as const) {
    await selectDeviceCategory(page, tab);
    const row = (name: string) =>
      page.locator(".protocol-row").filter({
        has: page.getByRole("button", { name: new RegExp(`^${name}`) }),
      });
    await expect(
      row("Chosen fixture").locator(".device-product-art img"),
    ).toHaveAttribute("src", /\/track.webp$/);
    await expect(
      row("Smoke fixture").locator(".device-product-art img"),
    ).toHaveAttribute("src", /\/smoke.webp$/);
    await expect(row("Custom product").locator("img")).toHaveAttribute(
      "src",
      /\/plug.webp$/,
    );
    await expect(
      row("Controller fixture").locator(".controller-protocol-logo"),
    ).toBeVisible();
    await expect(
      row("chosen-light").locator(".device-product-art"),
    ).toHaveCount(0);
    await row("Chosen fixture").getByRole("button").first().click();
    await expect(
      page.getByRole("dialog").locator(".device-dialog-picture img"),
    ).toHaveAttribute("src", /\/track.webp$/);
    await page
      .getByRole("button", { name: "Lukk enhetsdetaljer", exact: true })
      .click();
  }
  expect(mutations).toEqual([]);
});

test("missing shared images fall back to the same semantic artwork and configured media icon", async ({
  page,
}) => {
  await page.route("**/home/equipment/track.webp", (r) => r.abort());
  await page.route("**/home/media-devices/speaker-white.webp", (r) =>
    r.abort(),
  );
  const mutations = await setup(page);
  const light = await inventoryRow(page, "chosen-light");
  await expect(light.locator(".equipment-art svg")).toBeVisible();
  const media = await inventoryRow(page, "media");
  await expect(
    media.locator(".device-product-art .lucide-speaker"),
  ).toBeVisible();
  await expect(media.locator(".device-product-art img")).toHaveCount(0);
  await page.screenshot({
    path: "/private/tmp/smarti-device-inventory.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(mutations).toEqual([]);
});

test("compact portraits stay clear of device labels and light controls remain available in the detail panel", async ({
  page,
}) => {
  test.setTimeout(60000);
  const mutations = await setup(page);
  for (const width of [320, 390, 700, 834, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
      }, theme);
      for (const kind of [
        "pendant",
        "bulb",
        "floor",
        "desk",
        "ceiling",
        "spot",
        "outdoor",
      ]) {
        const card = await inventoryRow(page, kind);
        const image = card.locator(".device-product-art img");
        await expect
          .poll(() =>
            image.evaluate((img: HTMLImageElement) => img.naturalWidth),
          )
          .toBeGreaterThan(0);
        const geometry = await card.evaluate((card) => {
          const bounds = (selector: string) =>
            card.querySelector(selector)!.getBoundingClientRect();
          const art = bounds(".equipment-art"),
            image = bounds(".equipment-art img"),
            box = bounds(".device-product-art"),
            title = bounds(".devices-row-name");
          return {
            fits: [art, image].every(
              (r) =>
                r.top >= box.top - 0.5 &&
                r.bottom <= box.bottom + 0.5 &&
                r.left >= box.left - 0.5 &&
                r.right <= box.right + 0.5,
            ),
            clearOfText: art.right <= title.left,
            glow: getComputedStyle(
              card.querySelector(".equipment-art")!,
              "::before",
            ).content,
          };
        });
        expect(
          geometry.fits,
          `${width}/${theme}/${kind}: portrait containment`,
        ).toBe(true);
        expect(
          geometry.clearOfText,
          `${width}/${theme}/${kind}: room/title overlap`,
        ).toBe(true);
        expect(geometry.glow).toBe("none");
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(
    () => (document.documentElement.dataset.homeStyle = "harmony"),
  );
  const detail = await openDeviceControl(page, "Lys Spisebord ved vinduet");
  await expect(detail.locator(".light-color-control > button")).toBeVisible();
  await expect(detail.locator(".device-detail-favorite")).toBeVisible();
  expect(
    await detail.evaluate((node) => {
      const art = node
        .querySelector(".device-detail-portrait")!
        .getBoundingClientRect();
      const favorite = node
        .querySelector(".device-detail-favorite")!
        .getBoundingClientRect();
      return art.right <= favorite.left || art.bottom <= favorite.top;
    }),
  ).toBe(true);
  await page.screenshot({
    path: `/private/tmp/smarti-120-spacing-${test.info().project.name}.png`,
    animations: "disabled",
  });
  expect(mutations).toEqual([]);
});

test("sensor rows show readable values and timestamps while retaining exact raw data in details", async ({
  page,
}, info) => {
  const mutations = await setup(page);
  for (const width of [320, 390, 834, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const energy = await inventoryRow(page, "consumption");
    await expect(energy.locator(".devices-row-status")).toContainText(
      "1 783,807",
    );
    await expect(
      (await inventoryRow(page, "cost")).locator(".devices-row-status"),
    ).toContainText("166,18");
    const backup = await inventoryRow(page, "backup_next");
    await expect(backup.locator(".devices-row-status")).toContainText(
      "08.11.2026",
    );
    await expect(backup.locator(".devices-row-status")).not.toContainText(
      "T04:14:",
    );
    if (width === 390) {
      await backup.scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          backup
            .locator(".device-product-art img")
            .evaluate((img: HTMLImageElement) => img.naturalWidth),
        )
        .toBeGreaterThan(0);
      await backup.screenshot({
        path: `/private/tmp/smarti-121-sensor-${info.project.name}.png`,
        animations: "disabled",
      });
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
  const energy = await openDeviceControl(page, "consumption");
  await expect(energy.locator(".sensor-value")).toHaveAttribute(
    "title",
    "1783.80692 kWh",
  );
  await energy
    .getByRole("button", { name: "Lukk enhetsdetaljer", exact: true })
    .click();
  const backup = await openDeviceControl(
    page,
    "Backup Next scheduled automatic backup",
  );
  await expect(backup.locator("time")).toHaveAttribute(
    "datetime",
    "2026-11-08T04:14:23+00:00",
  );
  await backup
    .getByRole("button", { name: "Tekniske detaljer", exact: true })
    .click();
  await expect(backup.locator(".details")).toContainText(
    "2026-11-08T04:14:23+00:00",
  );
  expect(mutations).toEqual([]);
});
