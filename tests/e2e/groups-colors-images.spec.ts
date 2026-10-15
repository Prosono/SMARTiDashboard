import { test, expect } from "../../frontend/node_modules/@playwright/test";
test("room image library, color controls and shared groups", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Rom", exact: true })
    .click();
  await page.getByRole("button", { name: "Stue", exact: true }).click();
  await page
    .locator(".room-detail")
    .getByRole("button", { name: "Administrer rom", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Bildebank", exact: true }).click();
  await expect(dialog.locator(".room-image-grid img")).toHaveCount(12);
  await dialog.getByRole("button", { name: "Garasje", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("lagret");
  await dialog.getByRole("button", { name: "Lukk innstillinger" }).click();
  await page
    .getByRole("button", { name: "Farge og hvitt lys", exact: true })
    .first()
    .click();
  await expect(dialog.locator("input[type=color]")).toBeVisible();
  await dialog.getByRole("button", { name: "Hvitt lys", exact: true }).click();
  await expect(dialog.locator("input[type=range]")).toBeVisible();
  await dialog.getByRole("button", { name: "Lukk innstillinger" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Enheter", exact: true })
    .click();
  await page.getByRole("button", { name: "Grupper", exact: true }).click();
  await page.getByRole("button", { name: "Lag gruppe", exact: true }).click();
  await dialog.getByLabel("Gruppenavn").fill("Testgruppe");
  await dialog.getByRole("checkbox", { name: /Pendellampe/ }).check();
  await dialog
    .getByRole("button", { name: "Lagre gruppe", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".control-groups")).toContainText("Testgruppe");
  await page.screenshot({
    path: `../artifacts/groups-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("hub groups show members without local edit or delete", async ({
  page,
}) => {
  await page.route("**/api/groups", async (route) => {
    await route.fulfill({
      json: [
        {
          id: "ha:light.existing",
          name: "Eksisterende lysgruppe",
          source: "home_assistant",
          entities: ["light.living_pendant"],
          revision: "",
          actions: ["turn_on", "turn_off"],
          available: true,
        },
      ],
    });
  });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Enheter", exact: true })
    .click();
  await page.getByRole("button", { name: "Grupper", exact: true }).click();
  await page.getByRole("button", { name: /Eksisterende lysgruppe/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".group-members")).toContainText("Pendellampe");
  await expect(
    dialog.getByRole("button", { name: "Slå på alle", exact: true }),
  ).toBeEnabled();
  await expect(
    dialog.getByRole("button", { name: "Rediger gruppe", exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Slett gruppe", exact: true }),
  ).toHaveCount(0);
  await expect(dialog).toContainText("synkroniseres fra hjemmesentralen");
});
