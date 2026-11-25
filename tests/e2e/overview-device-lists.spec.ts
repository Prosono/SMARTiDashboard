import {
  test,
  expect,
  type Locator,
  type Page,
} from "../../frontend/node_modules/@playwright/test";
import type { Control, Home } from "../../frontend/src/types";

test.use({ storageState: { cookies: [], origins: [] } });

function control(
  entityId: string,
  name: string,
  state: string,
  attributes: Control["attributes"] = {},
  actions: string[] = [],
  kind = entityId.split(".")[0],
): Control {
  return {
    id: entityId,
    entity_id: entityId,
    domain: entityId.split(".")[0],
    name,
    state,
    attributes,
    area_id: "living",
    device_id: null,
    availability: "available",
    diagnostic: false,
    integration: null,
    updated_at: null,
    capabilities: actions.length
      ? [
          {
            kind,
            actions,
            maximum: null,
            minimum: null,
            step: null,
            unit: null,
          },
        ]
      : [],
  };
}

function fixtures() {
  const lights = [
    control(
      "light.test_pendant",
      "Pendellampe",
      "on",
      {},
      ["turn_on", "turn_off"],
      "power",
    ),
    control(
      "light.test_floor",
      "Gulvlampe",
      "on",
      {},
      ["turn_on", "turn_off"],
      "power",
    ),
  ];
  const climate = control(
    "climate.test_thermostat",
    "Termostat ved varmtvannsberederen på vaskerommet",
    "heat",
    {
      current_temperature: 21.4,
      temperature: 22,
      temperature_unit: "°C",
      hvac_modes: ["heat", "off"],
    },
    ["set_temperature", "set_hvac_mode"],
  );
  const player = control(
    "media_player.test_speaker",
    "Stuehøyttaler",
    "playing",
    {},
    ["media_play", "media_pause"],
  );
  const lock = control("lock.test_front_door", "Dørlås entré", "locked", {}, [
    "lock",
    "unlock",
  ]);
  const cover = control(
    "cover.test_blinds",
    "Rullgardin stue",
    "open",
    { current_position: 60, device_class: "blind" },
    ["open_cover", "close_cover"],
  );
  const temperature = control(
    "sensor.test_temperature",
    "Temperatur stue",
    "21.4",
    {
      device_class: "temperature",
      unit_of_measurement: "°C",
    },
  );
  const humidity = control("sensor.test_humidity", "Luftfuktighet stue", "47", {
    device_class: "humidity",
    unit_of_measurement: "%",
  });
  return { lights, climate, player, lock, cover, temperature, humidity };
}

async function openOverview(page: Page, controls: Control[]) {
  const commands: { entityId: string; action: string }[] = [];
  await page.route("**/api/home", async (route) => {
    const response = await route.fetch();
    const state: Home = await response.json();
    await route.fulfill({
      json: {
        ...state,
        controls,
        favorites: [],
        areas: [{ area_id: "living", name: "Stue" }],
      },
    });
  });
  await page.route("**/api/home/layout/overview*", (route) =>
    route.fulfill({ json: { revision: 0, items: null, group_by_room: true } }),
  );
  await page.route("**/api/home/experience", (route) =>
    route.fulfill({ json: { mode: "normal" } }),
  );
  await page.route("**/api/controls/*/commands", async (route) => {
    const entityId = decodeURIComponent(
      new URL(route.request().url()).pathname.split("/").at(-2)!,
    );
    const { action } = route.request().postDataJSON();
    commands.push({ entityId, action });
    const device = controls.find((item) => item.entity_id === entityId);
    if (device && action === "turn_on") device.state = "on";
    if (device && action === "turn_off") device.state = "off";
    await route.fulfill({ json: { status: "state_updated" } });
  });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  const overview = page.locator(".home-overview");
  await expect(overview).toBeVisible();
  return { overview, commands };
}

function opener(overview: Locator, title: string) {
  return overview.getByRole("button", {
    name: new RegExp(`^(?:Åpne kort: )?${title}(?:$|[ .])`),
  });
}

async function openGroup(page: Page, overview: Locator, title: string) {
  await opener(overview, title).click();
  const dialog = page.getByRole("dialog", { name: title, exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function closeGroup(dialog: Locator) {
  await dialog.getByRole("button", { name: /Lukk/ }).click();
  await expect(dialog).not.toBeVisible();
}

async function openDevice(page: Page, group: Locator, name: string) {
  await group
    .getByRole("button", { name: new RegExp(`^(?:Åpne )?${name}$`) })
    .click();
  const detail = page.getByRole("dialog", { name, exact: true });
  await expect(
    detail.getByRole("button", { name: "Lukk enhetsdetaljer", exact: true }),
  ).toBeVisible();
  await detail
    .getByRole("button", { name: "Lukk enhetsdetaljer", exact: true })
    .click();
  await expect(detail).not.toBeVisible();
  await expect(group).toBeVisible();
}

test("overview lists control lights and open the matching devices and sensor readings", async ({
  page,
}, info) => {
  const { lights, climate, player, lock, cover, temperature, humidity } =
    fixtures();
  const fan = control("fan.test_ventilation", "Ventilasjon", "on", {}, [
    "turn_on",
    "turn_off",
  ]);
  const television = control("media_player.test_tv", "TV soverom", "off", {}, [
    "turn_on",
    "turn_off",
  ]);
  const { overview, commands } = await openOverview(page, [
    ...lights,
    climate,
    fan,
    player,
    television,
    lock,
    cover,
    temperature,
    humidity,
  ]);

  const lighting = await openGroup(page, overview, "Lys i hjemmet");
  await lighting
    .getByRole("switch", { name: "Alle lys i hjemmet", exact: true })
    .click();
  await expect
    .poll(() =>
      commands.map(({ entityId, action }) => `${entityId}:${action}`).sort(),
    )
    .toEqual(["light.test_floor:turn_off", "light.test_pendant:turn_off"]);
  const pendant = lighting.getByRole("switch", { name: /Pendellampe/ });
  const floor = lighting.getByRole("switch", { name: /Gulvlampe/ });
  await expect(pendant).toHaveAttribute("aria-checked", "false");
  await expect(floor).toHaveAttribute("aria-checked", "false");
  await pendant.click();
  await expect
    .poll(() => commands.slice(2))
    .toEqual([{ entityId: "light.test_pendant", action: "turn_on" }]);
  await expect(pendant).toHaveAttribute("aria-checked", "true");
  await expect(floor).toHaveAttribute("aria-checked", "false");
  await openDevice(page, lighting, lights[0].name);
  await closeGroup(lighting);

  if (info.project.name === "mobile")
    await page.setViewportSize({ width: 320, height: 640 });
  for (const [title, devices] of [
    ["Klima", [climate, fan]],
    ["Multimedia", [player, television]],
    ["Låser", [lock]],
    ["Rullgardiner", [cover]],
  ] as const) {
    const group = await openGroup(page, overview, title);
    if (info.project.name === "mobile") {
      await expect
        .poll(() =>
          group.evaluate((element) => {
            const box = element.getBoundingClientRect();
            return (
              box.left >= 0 &&
              box.right <= window.innerWidth + 1 &&
              box.top >= 0 &&
              box.bottom <= window.innerHeight + 1 &&
              element.scrollWidth <= element.clientWidth + 1
            );
          }),
        )
        .toBe(true);
    }
    for (const device of devices) await openDevice(page, group, device.name);
    await closeGroup(group);
  }

  const readings = await openGroup(page, overview, "Temperatur og fuktighet");
  await expect(
    readings.getByRole("button", { name: /Temperatur stue/ }),
  ).toContainText(/21[,.]4\s*°C/);
  await expect(
    readings.getByRole("button", { name: /Luftfuktighet stue/ }),
  ).toContainText(/47\s*%/);
  await closeGroup(readings);
});

test("overview only shows device summaries backed by entities in the home", async ({
  page,
}) => {
  const { overview } = await openOverview(page, fixtures().lights);
  await expect(opener(overview, "Lys i hjemmet")).toBeVisible();
  for (const title of [
    "Klima",
    "Multimedia",
    "Låser",
    "Rullgardiner",
    "Temperatur og fuktighet",
  ])
    await expect(opener(overview, title)).toHaveCount(0);
});
