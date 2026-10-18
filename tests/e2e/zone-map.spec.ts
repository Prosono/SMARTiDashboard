import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("zone overview renders all radii and updates after editing", async ({ page }) => {
  const zones = [
    { id: "work", name: "Jobb", latitude: 58.16, longitude: 8.02, radius: 150, passive: false },
    { id: "cabin", name: "Hytta", latitude: 58.3, longitude: 8.2, radius: 300, passive: true },
  ];
  await page.route("**/api/manage/settings/home", r => r.fulfill({ json: { location_name: "Hjem", latitude: 58.1, longitude: 8, elevation: 12, time_zone: "Europe/Oslo" } }));
  await page.route("**/api/manage/settings/zones", r => r.fulfill({ json: zones }));
  await page.route("**/api/manage/settings/zones/work", r => {
    Object.assign(zones[0], r.request().postDataJSON());
    return r.fulfill({ json: { saved: true } });
  });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page.getByLabel("Passord", { exact: true }).fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page.getByRole("navigation", { name: "Hovedmeny" }).getByRole("button", { name: "Innstillinger", exact: true }).click();
  await page.getByRole("button", { name: "Hjem og personer", exact: true }).click();
  const overview = page.locator(".location-panel .home-location-map");
  await expect(overview.locator(".smarti-map-zone")).toHaveCount(2);
  await expect(overview.getByText("Jobb · 150 m", { exact: true })).toBeVisible();
  await expect(overview.getByText("Hytta · 300 m · Kun automasjoner", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Endre Jobb", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Rediger sone" });
  await expect(dialog.locator(".smarti-map-zone")).toHaveCount(1);
  await dialog.getByLabel("Radius (meter)", { exact: true }).fill("220");
  await dialog.getByRole("button", { name: "Lagre sone", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(overview.getByText("Jobb · 220 m", { exact: true })).toBeVisible();
  await expect(overview.locator(".smarti-map-zone")).toHaveCount(2);
});
