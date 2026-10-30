import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("Living style persists, works with both themes, and keeps Home controls available", async ({
  page,
}, testInfo) => {
  await page.route("**/api/home", async (route) => {
    const response = await route.fetch();
    const home = await response.json();
    await route.fulfill({
      json: {
        ...home,
        controls: [
          ...home.controls,
          {
            id: "weather.test",
            entity_id: "weather.test",
            name: "Været hjemme",
            domain: "weather",
            state: "sunny",
            availability: "available",
            diagnostic: false,
            attributes: { temperature: 14, temperature_unit: "°C" },
            capabilities: [],
          },
        ],
      },
    });
  });
  await page.route("**/api/home/weather/*", (route) =>
    route.fulfill({ json: { days: {}, temperature_unit: "°C" } }),
  );
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
  await expect(page.locator(".home-header-weather")).toContainText("14");
  const favorite = page
    .locator(".living-favorite")
    .filter({ hasText: "Pendellampe" });
  const favoriteSwitch = favorite.getByRole("switch");
  const wasOn = await favoriteSwitch.getAttribute("aria-checked");
  await favoriteSwitch.click();
  await expect(favoriteSwitch).toHaveAttribute(
    "aria-checked",
    wasOn === "true" ? "false" : "true",
  );
  await expect(favorite.getByRole("status")).toContainText("Oppdatert i demo");
  await favorite.getByRole("button", { name: "Åpne Pendellampe" }).click();
  await expect(page.getByRole("dialog", { name: "Pendellampe" })).toBeVisible();
  await page
    .getByRole("dialog", { name: "Pendellampe" })
    .getByRole("button", { name: "Lukk innstillinger" })
    .click();
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
  await page.locator('.experience-picker button[data-mode="simple"]').click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Hjem", exact: true })
    .click();
  await expect(
    page.locator(".living-simple-favorites .living-favorite").first(),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Innstillinger", exact: true })
    .click();
  await page.locator('.experience-picker button[data-mode="normal"]').click();
  await page
    .getByRole("button", { name: "Tema og utseende", exact: true })
    .click();
  await page.getByLabel("Stil for Hjem").selectOption("classic");
  await expect(page.locator("html")).toHaveAttribute(
    "data-home-style",
    "classic",
  );
});
