import {
  test,
  expect,
  type Locator,
} from "../../frontend/node_modules/@playwright/test";
import { defaultCardConfig } from "../../frontend/src/home/cardConfigModel";

async function loadedPicture(slot: Locator, filename: string) {
  const image = slot
    .locator(
      ".device-product-art img, .mobile-card-product img, .equipment-art img",
    )
    .first();
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute(
    "src",
    new RegExp(`/equipment/${filename}\\.webp$`),
  );
  await expect
    .poll(() =>
      image.evaluate(
        (el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
      ),
    )
    .toBe(true);
  expect(
    await image.evaluate((el) => {
      const image = el.getBoundingClientRect(),
        box = el
          .closest(".device-product-art, .mobile-card-product, .equipment-art")!
          .getBoundingClientRect();
      return image.width <= box.width + 1 && image.height <= box.height + 1;
    }),
  ).toBe(true);
}

for (const theme of ["light", "dark"]) {
  test(`climate pictures retain device readings and saved choices in ${theme} theme`, async ({
    page,
  }, info) => {
    await page.addInitScript((theme) => {
      localStorage.setItem("smarti-home-style", "harmony");
      localStorage.setItem("smarti-theme", theme);
    }, theme);
    await page.goto("/");
    await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
    await page
      .getByLabel("Passord", { exact: true })
      .fill("test-password-not-for-live");
    await page.getByRole("button", { name: "Logg inn", exact: true }).click();
    await expect(
      page.getByRole("tab", { name: "Klima", exact: true }),
    ).toBeVisible();
    const original = await (await page.request.get("/api/home")).json();
    const thermostat = original.controls.find(
      (c: any) => c.domain === "climate",
    );
    const make = (
      entity_id: string,
      name: string,
      attributes: object,
      state = "20.5",
    ) => ({
      ...thermostat,
      id: entity_id,
      entity_id,
      name,
      domain: entity_id.split(".")[0],
      state,
      attributes,
      capabilities: [],
      availability: "available",
      diagnostic: false,
      area_id: "living",
    });
    const controls = [
      {
        ...thermostat,
        area_id: "living",
        attributes: { ...thermostat.attributes, current_temperature: 20.5 },
      },
      make(
        "climate.fixture_ac",
        "Air Conditioner",
        {
          temperature: 20,
          current_temperature: 22.1,
          hvac_action: "cooling",
          hvac_modes: ["cool", "off"],
        },
        "cool",
      ),
      make("sensor.fixture_temperature", "Temperatur", {
        device_class: "temperature",
        unit_of_measurement: "°C",
      }),
      make(
        "sensor.fixture_humidity",
        "Luftfuktighet",
        { device_class: "humidity", unit_of_measurement: "%" },
        "46",
      ),
      make(
        "sensor.fixture_co2",
        "CO2",
        { device_class: "carbon_dioxide", unit_of_measurement: "ppm" },
        "600",
      ),
      make("fan.fixture", "Ventilasjon", {}, "on"),
      make("sensor.fixture_custom", "Eget bilde", {
        device_class: "temperature",
        unit_of_measurement: "°C",
      }),
      make("sensor.fixture_none", "Uten bilde", {
        device_class: "temperature",
        unit_of_measurement: "°C",
      }),
    ];
    let writes = 0;
    await page.route("**/api/home", (route) =>
      route.fulfill({ json: { ...original, controls, favorites: [] } }),
    );
    await page.route("**/api/home/layout/climate*", (route) => {
      if (route.request().method() !== "GET") writes++;
      return route.fulfill({
        json: {
          revision: 0,
          group_by_room: false,
          items: controls.map((c, i) => ({
            id: `device:${c.entity_id}`,
            x: i % 3,
            y: Math.floor(i / 3) * 2,
            w: 1,
            h: 2,
            ...(c.entity_id === "sensor.fixture_custom" ||
            c.entity_id === "sensor.fixture_none"
              ? {
                  config: {
                    ...defaultCardConfig([c.entity_id]),
                    image: c.entity_id.endsWith("custom")
                      ? "equipment-fan"
                      : "none",
                  },
                }
              : {}),
          })),
        },
      });
    });
    await page.route("**/api/controls/*/history?*", (route) =>
      route.fulfill({ json: { points: [], unit: "°C" } }),
    );
    await page.reload();
    await page.getByRole("tab", { name: "Klima", exact: true }).click();
    const grid = page.locator('.home-canvas[data-page="climate"]');
    const widths = info.project.name === "desktop" ? [1280, 820] : [390];
    for (const width of widths) {
      await page.setViewportSize({ width, height: 1000 });
      const card = (entity: string) =>
        grid.locator(`[data-card="device:${entity}"]`);
      for (const [entity, filename] of [
        [thermostat.entity_id, "thermostat"],
        ["climate.fixture_ac", "air-conditioner"],
        ["sensor.fixture_temperature", "environment"],
        ["sensor.fixture_humidity", "environment"],
        ["sensor.fixture_co2", "environment"],
        ["fan.fixture", "fan"],
        ["sensor.fixture_custom", "fan"],
      ]) {
        const tile = card(entity);
        // The phone exposes additional sensors on request.
        if (width < 600 && !(await tile.count())) {
          const more = grid.getByRole("button", {
            name: /Vis alle .*sensorer/,
          });
          if (await more.count()) await more.click();
        }
        await loadedPicture(tile, filename);
      }
      await expect(card("sensor.fixture_none").locator("img")).toHaveCount(0);
      await expect(card(thermostat.entity_id)).toContainText("20,5");
      await expect(card("sensor.fixture_co2")).toContainText("600");
      expect(
        await grid.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      ).toBe(true);
      await page.screenshot({
        path: `/private/tmp/smarti-122-climate-${theme}-${width}.png`,
        fullPage: true,
      });
    }
    expect(writes).toBe(0);
  });
}

test("classic climate room portraits keep filters and thermostat commands intact", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page.getByRole("tab", { name: "Klima", exact: true }).click();
  const climate = page.locator(".climate-overview");
  const room = climate
    .locator(".climate-room-card")
    .filter({ hasText: "Stue" });
  await loadedPicture(room, "thermostat");
  const search = page.getByRole("button", {
    name: "Vis søk og filtre",
    exact: true,
  });
  if (await search.count()) await search.click();
  await climate.getByLabel("Søk i klima", { exact: true }).fill("finnesikke");
  await expect(climate.locator(".climate-room-card")).toHaveCount(0);
  await climate.getByLabel("Søk i klima", { exact: true }).fill("");
  const values: number[] = [];
  await page.route("**/api/controls/climate.living/commands", async (route) => {
    values.push(route.request().postDataJSON().value);
    await route.fulfill({ json: { status: "accepted_unconfirmed" } });
  });
  const before = Number(
    (await room.locator(".climate-quick-temperature strong").innerText())
      .replace(",", ".")
      .replace(/[^0-9.]/g, ""),
  );
  await room
    .getByRole("button", { name: "Øk temperatur Gulvvarme", exact: true })
    .click();
  await expect.poll(() => values).toEqual([before + 0.5]);
  await page.screenshot({
    path: `/private/tmp/smarti-122-classic-${test.info().project.name}.png`,
    fullPage: true,
  });
});
