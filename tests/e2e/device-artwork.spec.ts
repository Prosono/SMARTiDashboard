import {
  test,
  expect,
  type Page,
} from "../../frontend/node_modules/@playwright/test";
import type { Control } from "../../frontend/src/types";

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

test("all-device visuals reuse shared artwork and semantic icons at phone, tablet and desktop widths", async ({
  page,
}) => {
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
        ["motion", "movement"],
        ["presence", "presence"],
        ["open-window", "window-open"],
        ["front-lock", "lock"],
        ["media", "speaker-white"],
        ["AC", "air-conditioner"],
        ["thermostat", "thermostat"],
        ["fan", "fan"],
        ["blind", "blind"],
        ["shade", "roller"],
        ["curtain", "curtain"],
        ["awning", "awning"],
        ["garage", "garage"],
        ["alarm", "alarm"],
      ]) {
        const card = page.locator(`.controls-grid > [data-entity$=".${id}"]`);
        const image = card.locator(".device-product-art img");
        await card.scrollIntoViewIfNeeded();
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
              b = img.closest("article")!.getBoundingClientRect();
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
        page.locator(
          '[data-entity="binary_sensor.unknown-window"] .device-product-art img',
        ),
      ).toHaveCount(0);
      for (const [entity, icon] of [
        ["sensor.battery", "battery"],
        ["sensor.temperature", "thermometer"],
        ["camera.camera", "camera"],
      ])
        await expect(
          page.locator(`[data-entity="${entity}"] .device-product-art svg`),
        ).toHaveClass(new RegExp(`lucide-${icon}`));
      await expect(
        page.locator('[data-entity="climate.AC"] .art-air-conditioner'),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator('[data-entity="binary_sensor.smoke"] button.device-open-detail')
    .click();
  await expect(
    page.getByRole("dialog").locator('img[src$="/smoke.webp"]'),
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
  for (const tab of ["Zigbee", "Z-Wave"]) {
    await page.getByRole("button", { name: tab, exact: true }).click();
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
      .getByRole("button", { name: "Lukk detaljer", exact: true })
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
  const light = page.locator('[data-entity="light.chosen-light"]');
  await light.scrollIntoViewIfNeeded();
  await expect(light.locator(".equipment-art svg")).toBeVisible();
  const media = page.locator('[data-entity="media_player.media"]');
  await media.scrollIntoViewIfNeeded();
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

test("compact portraits never extend into room labels, titles or favorite buttons in either home style", async ({
  page,
}) => {
  test.setTimeout(60000);
  const mutations = await setup(page);
  for (const width of [320, 390, 700, 834, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const style of ["harmony", "classic"])
      for (const theme of ["light", "dark"]) {
        await page.evaluate(
          ({ style, theme }) => {
            document.documentElement.dataset.homeStyle = style;
            document.documentElement.dataset.theme = theme;
          },
          { style, theme },
        );
        for (const kind of [
          "pendant",
          "bulb",
          "floor",
          "desk",
          "ceiling",
          "spot",
          "outdoor",
        ]) {
          const card = page.locator(`[data-entity="light.${kind}"]`);
          await card.scrollIntoViewIfNeeded();
          await expect(
            card.locator(".light-color-control > button"),
          ).toBeVisible();
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
              title = bounds(".device-title"),
              star = bounds(".star");
            return {
              fits: [art, image].every(
                (r) =>
                  r.top >= box.top - 0.5 &&
                  r.bottom <= box.bottom + 0.5 &&
                  r.left >= box.left - 0.5 &&
                  r.right <= box.right + 0.5,
              ),
              clearOfText: art.bottom <= title.top,
              clearOfStar: art.right <= star.left,
              glow: getComputedStyle(
                card.querySelector(".equipment-art")!,
                "::before",
              ).content,
            };
          });
          expect(
            geometry.fits,
            `${width}/${style}/${theme}/${kind}: portrait containment`,
          ).toBe(true);
          expect(
            geometry.clearOfText,
            `${width}/${style}/${theme}/${kind}: room/title overlap`,
          ).toBe(true);
          expect(
            geometry.clearOfStar,
            `${width}/${style}/${theme}/${kind}: favorite overlap`,
          ).toBe(true);
          expect(geometry.glow).toBe("none");
        }
      }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(
    () => (document.documentElement.dataset.homeStyle = "harmony"),
  );
  await page.locator('[data-entity="light.pendant"]').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `/private/tmp/smarti-120-spacing-${test.info().project.name}.png`,
    animations: "disabled",
  });
  expect(mutations).toEqual([]);
});
