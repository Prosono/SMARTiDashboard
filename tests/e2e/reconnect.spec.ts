import { test, expect } from "../../frontend/node_modules/@playwright/test";
test("dashboard recovers after network loss without a page reload", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(page.locator(".home-tabs")).toBeVisible();
  await page.evaluate(() => {
    (window as any).__connectionTest = "same-document";
  });
  await context.setOffline(true);
  await page.waitForTimeout(1500);
  await context.setOffline(false);
  const response = await page.waitForResponse(
    (r) => r.url().endsWith("/api/home") && r.status() === 200,
  );
  expect(response.ok()).toBeTruthy();
  await expect(page.locator(".home-tabs")).toBeVisible();
  expect(await page.evaluate(() => (window as any).__connectionTest)).toBe(
    "same-document",
  );
});
