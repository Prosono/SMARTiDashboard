import { test, expect } from "../../frontend/node_modules/@playwright/test";
test("security overview filters real sensors and opens their controls", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page.getByRole("tab", { name: "Sikkerhet", exact: true }).click();
  const security = page.locator(".security-overview");
  await expect(
    security.getByRole("heading", { name: "Sikkerhet", exact: true }),
  ).toBeVisible();
  await expect(
    security
      .locator(".security-device-list")
      .getByRole("button")
      .filter({ hasText: "Ytterdør" }),
  ).toBeVisible();
  await security.getByLabel("Søk i sikkerhet").fill("finnesikke");
  await expect(security.locator(".security-device-list button")).toHaveCount(0);
  await security.getByLabel("Søk i sikkerhet").fill("");
  await security
    .locator(".security-device-list")
    .getByRole("button")
    .filter({ hasText: "Ytterdør" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Ytterdør");
  await expect(page.getByRole("dialog")).toContainText("Lukket");
  await page
    .getByRole("button", { name: "Lukk innstillinger", exact: true })
    .click();
  expect(
    await security.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBeTruthy();
  await page.screenshot({
    path: `../artifacts/security-${test.info().project.name}.png`,
    fullPage: true,
  });
});
