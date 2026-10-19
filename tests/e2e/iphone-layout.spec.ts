import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("phone viewport fits dashboard and phone settings use native bridge", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 700 });
  await page.addInitScript(() => {
    (window as any).webkit = {
      messageHandlers: {
        smartiPhoneSettings: {
          postMessage: (value: string) => {
            (window as any).phoneMessage = value;
          },
        },
      },
    };
  });
  await page.route("**/api/manage/integration-setup/discoveries", r => r.fulfill({json: [{id: "found", domain: "reolink", name: "Kamera", source: "zeroconf"}]}));
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(page.locator(".home-welcome")).toBeVisible();
  await expect(page.locator(".nav-discovery-count").first()).toBeVisible();
  const devices = page.getByRole("navigation").getByRole("button", { name: "Enheter", exact: true });
  const icon = await devices.locator("svg").boundingBox();
  expect(icon?.height).toBe(21);
  const badge = await devices.locator(".nav-discovery-count").boundingBox();
  expect(badge!.y).toBeLessThan(icon!.y + icon!.height);
  const label = await devices.locator("span").first().boundingBox();
  expect(label!.y).toBeGreaterThanOrEqual(icon!.y + icon!.height);
  for (const width of [393, 320, 852]) {
    await page.setViewportSize({ width, height: 700 });
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
      hero: document.querySelector(".home-welcome")!.getBoundingClientRect()
        .right,
    }));
    expect(dimensions.scroll, JSON.stringify(dimensions)).toBeLessThanOrEqual(
      width + 1,
    );
    expect(dimensions.hero).toBeLessThanOrEqual(width);
  }
  await page.setViewportSize({ width: 393, height: 700 });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Innstillinger", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Denne iPhonen", exact: true })
    .click();
  expect(await page.evaluate(() => (window as any).phoneMessage)).toBe("open");
  await page.getByRole("button", { name: "Fjernaksess", exact: true }).click();
  expect(await page.evaluate(() => (window as any).phoneMessage)).toBe("remote");
});
