import { test, expect } from "../../frontend/node_modules/@playwright/test";
test("home highlights rotate, pause and open multimedia", async ({ page }) => {
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
  const highlights = page.getByRole("region", { name: "Glimt fra hjemmet" });
  await expect(
    highlights.getByRole("region", { name: "Værmelding" }),
  ).toBeVisible();
  await page.mouse.move(0, 0);
  await page.clock.runFor(12100);
  await expect(highlights).toContainText("Kveldsmusikk");
  await highlights.getByRole("button", { name: "Forrige kort" }).click();
  await expect(
    highlights.getByRole("region", { name: "Værmelding" }),
  ).toBeVisible();
  await page.mouse.move(0, 0);
  await page.clock.runFor(25000);
  await expect(
    highlights.getByRole("region", { name: "Værmelding" }),
  ).toBeVisible();
  await expect(
    highlights.getByRole("button", { name: "Start automatisk bytte" }),
  ).toBeVisible();
  await page.locator(".home-welcome").screenshot({
    path: `../artifacts/${test.info().project.name}-home-highlights.png`,
    animations: "disabled",
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(
    highlights.getByRole("button", { name: "Start automatisk bytte" }),
  ).toHaveCount(0);
  await highlights.getByRole("button", { name: "Vis Stuehøyttaler" }).click();
  await highlights.getByRole("button", { name: "Åpne Multimedia" }).click();
  await expect(
    page.getByRole("tab", { name: "Multimedia", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  expect(
    await page.locator("body").evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBe(true);
});
