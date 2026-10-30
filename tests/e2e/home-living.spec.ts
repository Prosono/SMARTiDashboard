import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("Living style persists, works with both themes, and keeps Home controls available", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(page.locator(".home-welcome h1")).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Innstillinger", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Tema og utseende", exact: true })
    .click();
  await page.getByLabel("Stil for Hjem").selectOption("living");
  await expect(page.locator("html")).toHaveAttribute(
    "data-home-style",
    "living",
  );
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Hjem", exact: true })
    .click();
  await expect(page.locator(".home-welcome")).toBeVisible();
  await page.screenshot({
    path: `/private/tmp/smarti-living-light-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Innstillinger", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Tema og utseende", exact: true })
    .click();
  await page.getByLabel("Utseende").selectOption("dark");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Hjem", exact: true })
    .click();
  await expect(page.locator(".home-welcome")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".home-metric-card").first()).toBeVisible();
  await page.screenshot({
    path: `/private/tmp/smarti-living-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Lys", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute(
    "data-home-style",
    "living",
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page
      .locator("body")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Innstillinger", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Tema og utseende", exact: true })
    .click();
  await page.getByLabel("Stil for Hjem").selectOption("classic");
  await expect(page.locator("html")).toHaveAttribute(
    "data-home-style",
    "classic",
  );
});
