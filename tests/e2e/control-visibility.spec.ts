import { test, expect } from "../../frontend/node_modules/@playwright/test";
import { openDeviceOverview, selectDeviceCategory } from "./deviceNavigation";

test("hidden lights remove empty rooms and can be restored", async ({
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
    .getByRole("button", { name: "Enheter", exact: true })
    .click();
  await openDeviceOverview(page, "light");
  const lights = page.locator(".light-overview");
  const rooms = lights.getByRole("heading", {
    level: 2,
    name: /^(Stue|Kjøkken|Soverom)(?: |$)/,
  });
  const kitchen = lights.getByRole("heading", {
    level: 2,
    name: /^Kjøkken(?: |$)/,
  });
  await expect(rooms).toHaveCount(3);
  await page
    .getByRole("button", { name: "Tilbake til enhetslisten", exact: true })
    .click();
  await selectDeviceCategory(page, "hidden");
  const manager = page.getByRole("region", { name: "Skjulte enheter" });
  await manager.getByLabel("Vis alle enheter for å organisere").check();
  await manager.getByLabel("Søk etter enheter").fill("Kjøkkenbenk");
  await manager.getByRole("button", { name: "Skjul", exact: true }).click();
  await expect(
    manager.getByRole("button", { name: "Vis igjen", exact: true }),
  ).toBeVisible();
  await selectDeviceCategory(page, "all");
  await openDeviceOverview(page, "light");
  await expect(rooms).toHaveCount(2);
  await expect(kitchen).toHaveCount(0);
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Enheter", exact: true })
    .click();
  await openDeviceOverview(page, "light");
  await expect(rooms).toHaveCount(2);
  await expect(kitchen).toHaveCount(0);
  await page
    .getByRole("button", { name: "Tilbake til enhetslisten", exact: true })
    .click();
  await selectDeviceCategory(page, "hidden");
  await expect(manager.getByText("Kjøkkenbenk", { exact: true })).toBeVisible();
  await manager.screenshot({
    path: `/tmp/hidden-controls-${test.info().project.name}.png`,
  });
  await manager.getByRole("button", { name: "Vis igjen", exact: true }).click();
  await expect(
    manager.getByText("Ingen enheter i dette utvalget.", { exact: true }),
  ).toBeVisible();
  await selectDeviceCategory(page, "all");
  await openDeviceOverview(page, "light");
  await expect(rooms).toHaveCount(3);
  await expect(kitchen).toBeVisible();
});
