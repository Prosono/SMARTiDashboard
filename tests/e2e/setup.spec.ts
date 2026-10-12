import { test, expect } from "../../frontend/node_modules/@playwright/test";

for (const code of ["origin_rejected", "invalid_setup_secret"] as const) {
  test(`setup explains ${code}`, async ({ page }) => {
    await page.route("**/api/bootstrap", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ json: { configured: false, mode: "demo" } });
      } else {
        await route.fulfill({ status: 403, json: { detail: code } });
      }
    });
    await page.goto("/");
    await page.getByLabel("Engangshemmelighet", { exact: true }).fill("fake-test-secret-at-least-24");
    await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
    await page.getByLabel("Passord", { exact: true }).fill("test-password-not-for-live");
    await page.getByRole("button", { name: "Opprett hjem", exact: true }).click();
    await expect(page.getByText(code === "origin_rejected" ? /HA-adressen er ikke godkjent/ : /Engangshemmeligheten stemmer ikke/)).toBeVisible();
  });
}

test("owner creation recovers to login after login failure", async ({ page }) => {
  let configured = false;
  let creations = 0;
  await page.route("**/api/bootstrap", async (route) => {
    if (route.request().method() === "POST") {
      configured = true;
      creations++;
      await route.fulfill({ json: { status: "configured" } });
    } else await route.fulfill({ json: { configured, mode: "demo" } });
  });
  await page.route("**/api/login", (route) => route.fulfill({ status: 401, json: { detail: "invalid_credentials" } }));
  await page.goto("/");
  await page.getByLabel("Engangshemmelighet", { exact: true }).fill("fake-test-secret-at-least-24");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page.getByLabel("Passord", { exact: true }).fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Opprett hjem", exact: true }).click();
  await expect(page.getByText("Kunne ikke logge inn. Kontroller brukernavn og passord.")).toBeVisible();
  await expect(page.getByLabel("Engangshemmelighet", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(page.getByText("Kunne ikke logge inn. Kontroller brukernavn og passord.")).toBeVisible();
  expect(creations).toBe(1);
});
