import { test, expect } from "../../frontend/node_modules/@playwright/test";
test("climate overview filters and opens real room controls", async ({
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
  await page.locator(".device-toolbar select").selectOption("climate");
  const climate = page.locator(".climate-overview");
  await expect(
    climate.getByRole("heading", { name: "Klima", exact: true }),
  ).toBeVisible();
  await expect(climate.locator(".climate-room-card").first()).toBeVisible();
  await climate.getByLabel("Søk i klima").fill("finnesikke");
  await expect(climate.locator(".climate-room-card")).toHaveCount(0);
  await climate.getByLabel("Søk i klima").fill("");
  await climate.getByRole("button", { name: "Liste", exact: true }).click();
  await expect(climate.locator(".climate-room-grid")).toHaveClass(/is-list/);
  await climate.getByRole("button", { name: "Kort", exact: true }).click();
  await climate
    .locator(".climate-room-card")
    .filter({ hasText: "Stue" })
    .click();
  await expect(page.getByRole("dialog").locator(".thermostat")).toBeVisible();
  await page
    .getByRole("button", { name: "Lukk innstillinger", exact: true })
    .click();
  await climate
    .getByRole("button", { name: "Ventilasjon", exact: true })
    .click();
  await expect(climate.locator(".climate-empty")).toBeVisible();
  await climate.getByRole("button", { name: "Oversikt", exact: true }).click();
  expect(
    await climate.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBeTruthy();
  await page.screenshot({
    path: `../artifacts/climate-${test.info().project.name}.png`,
    fullPage: true,
  });
});
