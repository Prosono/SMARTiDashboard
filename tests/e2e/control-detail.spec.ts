import { test, expect } from "../../frontend/node_modules/@playwright/test";
test("device dialog uses full width and exposes interactive state history", async ({ page }, info) => {
  const end = new Date().toISOString();
  const start = new Date(Date.now() - 86400000).toISOString();
  const middle = new Date(Date.now() - 43200000).toISOString();
  await page.route("**/api/controls/*/history?*", route => route.fulfill({ json: route.request().url().includes("sensor.") && !route.request().url().includes("binary_sensor.") ? {
    start, end, samples: 3, unit: "%", minimum: 70, maximum: 90,
    points: [{ time: start, state: "90", value: 90 }, { time: middle, state: "80", value: 80 }, { time: end, state: "70", value: 70 }]
  } : {
    start, end, samples: 3, minimum: null, maximum: null,
    points: [{ time: start, state: "off", value: null }, { time: middle, state: "on", value: null }, { time: end, state: "off", value: null }]
  } }));
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page.getByLabel("Passord", { exact: true }).fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page.getByRole("tab", { name: "Sikkerhet", exact: true }).click();
  await page.locator(".security-device-list").getByRole("button").filter({ hasText: "Ytterdør" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".control-detail")).toBeVisible();
  await dialog.screenshot({ path: `test-results/control-detail-initial-${info.project.name}.png` });
  const width = await dialog.locator(".control-detail").evaluate(el => el.getBoundingClientRect().width / el.parentElement!.getBoundingClientRect().width);
  expect(width).toBeGreaterThan(0.95);
  await dialog.getByRole("button", { name: "Historikk", exact: true }).click();
  const chart = dialog.getByRole("img", { name: /Historikkgraf/ });
  await expect(chart).toBeVisible();
  await chart.focus();
  await page.keyboard.press("Home");
  await expect(dialog.locator(".control-history-reading strong")).toHaveText("Lukket");
  await page.keyboard.press("ArrowRight");
  await expect(dialog.locator(".control-history-reading strong")).toHaveText("Åpen");
  await dialog.getByLabel("Tidsrom", { exact: true }).selectOption("168");
  await expect(chart).toBeVisible();
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBeTruthy();
  await dialog.getByRole("combobox", { name: "Måling / status", exact: true }).selectOption({ label: "Batteri" });
  await expect(dialog.locator(".control-history-reading strong")).toHaveText("70 %");
  await chart.focus();
  await page.keyboard.press("Home");
  await expect(dialog.locator(".control-history-reading strong")).toHaveText("90 %");
  const bounds = await chart.boundingBox();
  await page.mouse.move(bounds!.x + bounds!.width * 0.51, bounds!.y + 40);
  await expect(dialog.locator(".control-history-reading strong")).toHaveText("80 %");
  await dialog.screenshot({ path: `test-results/control-detail-${info.project.name}.png` });
});

test("light tiles open full device controls and history", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page.getByLabel("Passord", { exact: true }).fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page.getByRole("tab", { name: "Lys", exact: true }).click();
  await page.locator(".lighting-tile .device-open-detail").first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".control-detail .lucide-lightbulb")).toBeVisible();
  await expect(dialog.getByRole("switch")).toBeVisible();
  await expect(dialog.locator('input[type="range"]').first()).toBeVisible();
  await dialog.getByRole("button", { name: "Historikk", exact: true }).click();
  await expect(dialog).toContainText("Ingen lagret historikk");
});
