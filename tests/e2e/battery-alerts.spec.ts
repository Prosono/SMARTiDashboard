import { test, expect } from "../../frontend/node_modules/@playwright/test";
import type { Control } from "../../frontend/src/types";

function entity(
  entity_id: string,
  name: string,
  device_id: string,
  state: string,
  attributes: Control["attributes"],
  diagnostic = false,
): Control {
  return {
    id: entity_id,
    entity_id,
    name,
    device_id,
    state,
    attributes,
    diagnostic,
    domain: entity_id.split(".")[0],
    area_id: "living",
    availability: "available",
    integration: null,
    updated_at: null,
    capabilities: [],
  };
}

const windowControl = entity(
  "binary_sensor.window_battery_test",
  "Vindusstatus",
  "window",
  "off",
  { device_class: "window" },
);
const controls = [
  windowControl,
  entity(
    "sensor.window_charge",
    "Batterimåling",
    "window",
    "13",
    { device_class: "battery", unit_of_measurement: "%" },
    true,
  ),
  entity("binary_sensor.smoke_battery_test", "Røyk i gangen", "smoke", "on", {
    device_class: "smoke",
    battery_level: 8,
  }),
  entity("binary_sensor.door_battery_test", "Terrassedør", "door", "off", {
    device_class: "door",
    battery_level: 20,
  }),
];

for (const mode of ["normal", "simple"] as const) {
  test(`low battery warnings identify and open the device in ${mode} mode`, async ({
    page,
  }) => {
    await page.route("**/api/home/experience", (route) =>
      route.fulfill({ json: { mode } }),
    );
    await page.route("**/api/home/layout/overview*", (route) =>
      route.fulfill({
        json: {
          revision: 0,
          items: [
            `device:${windowControl.entity_id}`,
            "summary:batteries",
            "summary:alerts",
          ].map((id, x) => ({ id, x, y: 0, w: 1, h: 2 })),
        },
      }),
    );
    await page.route("**/api/home", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        json: {
          ...(await response.json()),
          controls,
          devices: [
            {
              id: "window",
              name: "Kontakt i stuen",
              availability: "available",
            },
          ],
          favorites: [windowControl.entity_id],
        },
      });
    });
    await page.goto("/");
    await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
    await page
      .getByLabel("Passord", { exact: true })
      .fill("test-password-not-for-live");
    await page.getByRole("button", { name: "Logg inn", exact: true }).click();
    if (mode === "normal") {
      const card = page.locator(
        `[data-card="device:${windowControl.entity_id}"]`,
      );
      await expect(card).toContainText("Vindusstatus");
      await expect(card).toContainText("Kontakt i stuen");
      await expect(card).toContainText("13 %");
      const batterySummary = page.locator('[data-card="summary:batteries"]');
      await expect(
        batterySummary.getByLabel("Kontakt i stuen: 13 %"),
      ).toBeVisible();
      await expect(page.locator('[data-card="summary:alerts"]')).toContainText(
        "Lavt batteri: 13 %",
      );
    }
    const alerts = page.getByRole("button", {
      name: "Trenger din oppmerksomhet: 3",
    });
    await alerts.click();
    const dialog = page.getByRole("dialog", {
      name: "Trenger din oppmerksomhet",
    });
    const rows = dialog.getByRole("listitem");
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText("Røyk oppdaget");
    await expect(dialog.getByText("Terrassedør")).toHaveCount(0);
    await expect(rows.filter({ hasText: "Lavt batteri: 8 %" })).toHaveCount(1);
    const windowWarning = dialog.getByRole("button", {
      name: /Kontakt i stuen Lavt batteri: 13 %/,
    });
    await windowWarning.click();
    const device = page.getByRole("dialog", { name: "Vindusstatus" });
    await expect(
      device.getByText("Lukket", { exact: true }).first(),
    ).toBeVisible();
    await device.getByRole("button", { name: "Lukk enhetsdetaljer" }).click();
    await expect(windowWarning).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(alerts).toBeFocused();
  });
}
