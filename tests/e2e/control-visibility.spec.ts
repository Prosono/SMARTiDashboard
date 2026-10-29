import { test, expect } from "../../frontend/node_modules/@playwright/test";

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
  await page.locator(".device-toolbar select").selectOption("light");
  const lights = page.locator(".light-overview");
  await expect(lights.locator(".lighting-room")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Skjulte enheter", exact: true })
    .click();
  const manager = page.getByRole("dialog", { name: "Synlighet for enheter" });
  await manager.getByLabel("Vis alle enheter for å organisere").check();
  await manager.getByLabel("Søk etter enheter").fill("Kjøkkenbenk");
  await manager.getByRole("button", { name: "Skjul", exact: true }).click();
  await expect(
    manager.getByRole("button", { name: "Vis igjen", exact: true }),
  ).toBeVisible();
  await manager
    .getByRole("button", { name: "Lukk innstillinger", exact: true })
    .click();
  await expect(lights.locator(".lighting-room")).toHaveCount(2);
  await expect(
    lights.getByRole("heading", { name: "Kjøkken", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Enheter", exact: true })
    .click();
  await page.locator(".device-toolbar select").selectOption("light");
  await expect(lights.locator(".lighting-room")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Skjulte enheter", exact: true })
    .click();
  await expect(manager.getByText("Kjøkkenbenk", { exact: true })).toBeVisible();
  await manager.screenshot({
    path: `/tmp/hidden-controls-${test.info().project.name}.png`,
  });
  await manager.getByRole("button", { name: "Vis igjen", exact: true }).click();
  await expect(
    manager.getByText("Ingen enheter i dette utvalget.", { exact: true }),
  ).toBeVisible();
  await manager
    .getByRole("button", { name: "Lukk innstillinger", exact: true })
    .click();
  await expect(lights.locator(".lighting-room")).toHaveCount(3);
});
