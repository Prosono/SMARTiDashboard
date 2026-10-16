import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("weather has an honest empty state when no weather entity exists", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route("**/api/home", async (route) => {
    const response = await route.fetch();
    const home = await response.json();
    await route.fulfill({
      json: {
        ...home,
        controls: home.controls.filter(
          (c: { domain: string }) => c.domain !== "weather",
        ),
      },
    });
  });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(page.locator(".home-highlights")).toContainText(
    "Ingen værmelding er koblet til hjemmet ennå.",
  );
  await expect(page.locator(".home-highlights .highlight-card")).toHaveCount(1);
});
