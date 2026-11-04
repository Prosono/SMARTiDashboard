import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("session survives validation outages and only shows login after confirmed revocation", async ({
  page,
  context,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("smarti-home-style", "harmony"),
  );
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(page.locator(".home-overview")).toBeVisible();
  const cookie = (await context.cookies()).find(
    (c) => c.name === "smarti_session",
  )!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.sameSite).toBe("Strict");
  expect(cookie.expires - Date.now() / 1000).toBeGreaterThan(300 * 86400);
  const initial = await (await page.request.get("/api/session")).json();
  let offline = true,
    checks = 0;
  await page.route("**/api/session", (route) => {
    checks++;
    return offline
      ? route.fulfill({
          status: 503,
          json: { detail: "validation_unavailable" },
        })
      : route.continue();
  });
  await page.reload();
  await expect(page.getByRole("status")).toContainText(
    "Kunne ikke koble til hjemmet",
  );
  await expect(page.getByLabel("Brukernavn", { exact: true })).toHaveCount(0);
  offline = false;
  await page.getByRole("button", { name: "Prøv igjen", exact: true }).click();
  await expect(page.locator(".home-overview")).toBeVisible();
  expect((await (await page.request.get("/api/session")).json()).csrf).toBe(
    initial.csrf,
  );
  let navigations = 0;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations++;
  });
  offline = true;
  const previous = checks;
  await page.evaluate(() =>
    window.dispatchEvent(new Event("smarti-check-session")),
  );
  await expect.poll(() => checks).toBeGreaterThan(previous);
  await expect(page.locator(".home-overview")).toBeVisible();
  await expect(page.getByLabel("Brukernavn", { exact: true })).toHaveCount(0);
  expect(navigations).toBe(0);
  offline = false;
  const revoked = await page.request.post("/api/logout", {
    headers: {
      "x-csrf-token": initial.csrf,
      origin: new URL(page.url()).origin,
    },
  });
  expect(revoked.ok()).toBe(true);
  await page.evaluate(() =>
    window.dispatchEvent(new Event("smarti-check-session")),
  );
  await expect(page.getByLabel("Brukernavn", { exact: true })).toBeVisible();
  expect(navigations).toBe(0);
});
