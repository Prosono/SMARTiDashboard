import { test, expect } from "../../frontend/node_modules/@playwright/test";

// Widgets are tablet/desktop only; exercise touch layout at tablet width.
test.beforeEach(async ({ page }, info) => {
  if (info.project.name === "mobile")
    await page.setViewportSize({ width: 768, height: 1024 });
});
test("welcome shows only weather in normal and advanced modes", async ({
  page,
}) => {
  await page.route("**/api/home", async (r) => {
    const response = await r.fetch();
    const data = await response.json();
    const c = (id: string, domain: string, attrs: any) => ({
      id,
      entity_id: id,
      name: id === "weather.test" ? "Været hjemme" : "Stuehøyttaler",
      domain,
      state: domain === "weather" ? "sunny" : "playing",
      availability: "available",
      attributes: attrs,
      capabilities: [],
      diagnostic: false,
    });
    await r.fulfill({
      json: {
        ...data,
        controls: [
          ...data.controls.filter(
            (c: any) =>
              !["weather", "camera", "media_player"].includes(c.domain),
          ),
          c("weather.test", "weather", {
            temperature: 14,
            temperature_unit: "°C",
          }),
          c("media_player.test", "media_player", {
            media_title: "Kveldsmusikk",
            media_artist: "Min spilleliste",
          }),
        ],
      },
    });
  });
  await page.route("**/api/home/weather/*", (r) =>
    r.fulfill({ json: { days: {}, temperature_unit: "°C" } }),
  );
  await page.clock.install();
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  const highlights = page.getByRole("region", {
    name: "Været hjemme",
    exact: true,
  });
  for (const mode of ["Normal", "Avansert"]) {
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Innstillinger", exact: true })
      .click();
    await page
      .locator(".experience-picker")
      .getByRole("button", { name: new RegExp("^" + mode) })
      .click();
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Hjem", exact: true })
      .click();
    await expect(
      highlights.getByRole("region", { name: "Værmelding" }),
    ).toBeVisible();
    await expect(highlights.locator(".highlight-card")).toHaveCount(1);
    await expect(highlights.locator(".highlight-navigation")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Vis mer informasjon", exact: true }),
    ).toHaveCount(0);
    expect(
      await highlights
        .locator(".highlight-card")
        .evaluate((e) => getComputedStyle(e).backgroundImage),
    ).toBe("none");
    await page.clock.runFor(25000);
    await expect(highlights).not.toContainText("Kveldsmusikk");
    await page
      .locator(".home-welcome")
      .screenshot({
        path: `../artifacts/weather-only-${mode}-${test.info().project.name}.png`,
      });
  }
  expect(
    await page.locator("body").evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBe(true);
});
