import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("debugging requires confirmation and keeps the underlying UI inside SMARTi", async ({
  page,
}) => {
  let targetRequests = 0;
  await page.route("**/api/manage/debugging/target", (r) => {
    targetRequests++;
    return r.fulfill({ json: { available: true, path: "/config/dashboard" } });
  });
  await page.route("**/config/dashboard", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html><body><h1>Home Assistant</h1><label>HA brukernavn<input></label><a href="/config/test-panel">Åpne testpanel</a></body></html>',
    }),
  );
  await page.route("**/config/test-panel", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: "<!doctype html><html><body><h1>Testpanel</h1></body></html>",
    }),
  );
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Innstillinger", exact: true })
    .click();
  await page.getByRole("button", { name: "Debugging", exact: true }).click();
  const open = page.getByRole("button", {
    name: "Åpne underliggende operativsystem",
  });
  await open.click();
  await expect(page.getByRole("dialog")).toContainText("Stopp!");
  await expect(page.locator('iframe[title="Home Assistant"]')).toHaveCount(0);
  expect(targetRequests).toBe(0);
  await page.getByRole("button", { name: "Avbryt", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await open.click();
  await page
    .getByRole("button", { name: "Jeg forstår – koble meg til" })
    .click();
  const frame = page.frameLocator('iframe[title="Home Assistant"]');
  await expect(
    frame.getByRole("heading", { name: "Home Assistant" }),
  ).toBeVisible();
  expect(targetRequests).toBe(1);
  await frame.getByLabel("HA brukernavn").fill("example");
  await frame.getByRole("link", { name: "Åpne testpanel" }).click();
  await expect(frame.getByRole("heading", { name: "Testpanel" })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");
  await page
    .getByRole("button", { name: "Last inn på nytt", exact: true })
    .click();
  await expect(
    frame.getByRole("heading", { name: "Home Assistant" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Tilbake til SMARTi", exact: true })
    .click();
  await expect(page.locator('iframe[title="Home Assistant"]')).toHaveCount(0);
  await open.click();
  await expect(
    page.getByRole("button", { name: "Jeg forstår – koble meg til" }),
  ).toBeVisible();
  expect(targetRequests).toBe(1);
});

test("debugging explains unavailable standalone access", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Innstillinger", exact: true })
    .click();
  await page.getByRole("button", { name: "Debugging", exact: true }).click();
  await page
    .getByRole("button", { name: "Åpne underliggende operativsystem" })
    .click();
  await page
    .getByRole("button", { name: "Jeg forstår – koble meg til" })
    .click();
  await expect(page.getByRole("alert")).toContainText("appvisning");
  await expect(page.locator('iframe[title="Home Assistant"]')).toHaveCount(0);
});
