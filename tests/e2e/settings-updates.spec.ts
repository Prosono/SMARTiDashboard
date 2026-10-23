import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("settings combines SMARTi app and platform updates and checks without installing", async ({
  page,
}) => {
  let checks = 0,
    installs = 0,
    reloads = 0;
  let updateState = "offline";
  await page.route("**/api/manage/apps/self-update/check", (r) => {
    checks++;
    return r.fulfill({
      json: {
        slug: "abc_smarti",
        version: "1.36.5",
        version_latest: "1.36.6",
        update_available: true,
        checked_at: Date.now() / 1000,
        check_error: false,
      },
    });
  });
  await page.route("**/api/manage/apps/reload", (r) => {
    reloads++;
    return r.fulfill({ json: { saved: true } });
  });
  await page.route("**/api/manage/apps/self-update", (r) => {
    if (r.request().method() === "POST") {
      installs++;
      return r.fulfill({ json: { status: "accepted" } });
    }
    if (updateState === "offline")
      return r.fulfill({ status: 503, json: { detail: "restarting" } });
    return r.fulfill({
      json: { slug: "abc_smarti", version: updateState, state: "started" },
    });
  });
  await page.route("**/api/manage/updates", (r) =>
    r.fulfill({
      json: [
        {
          entity_id: "update.home_assistant_core_update",
          name: "Home Assistant Core",
          smarti: true,
          installed_version: "2026.10.1",
          latest_version: "2026.10.2",
          state: "on",
          can_install: true,
          can_backup: true,
        },
      ],
    }),
  );
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page
    .getByRole("button", { name: "Innstillinger", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: /^Normal/ }).click();
  await page
    .getByRole("navigation", { name: "Innstillingskategorier" })
    .getByRole("button", { name: "SMARTi-oppdateringer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "SMARTi-appen", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Oppdater SMARTi", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".system-row")).toContainText("2026.10.2");
  await expect(page.locator(".system-row h2")).not.toContainText(
    "Home Assistant",
  );
  expect(checks).toBeGreaterThan(0);
  expect(installs).toBe(0);
  await page
    .getByRole("button", { name: "Se etter oppdateringer", exact: true })
    .click();
  await expect.poll(() => reloads).toBe(1);
  await expect.poll(() => checks).toBeGreaterThan(1);
  await page
    .getByRole("button", { name: "Oppdater SMARTi", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Oppdater SMARTi?",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  expect(installs).toBe(0);
  await dialog
    .getByRole("button", { name: "Bekreft oppdatering", exact: true })
    .click();
  await expect.poll(() => installs).toBe(1);
  const progress = page.getByRole("dialog", {
    name: "Oppdaterer SMARTi",
    exact: true,
  });
  await expect(progress).toBeVisible();
  await expect(progress.getByRole("status")).toContainText(
    "Venter på at SMARTi starter igjen",
    { timeout: 10000 },
  );
  updateState = "1.36.5";
  await expect(
    progress.getByRole("button", { name: "Åpne oppdatert SMARTi" }),
  ).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(progress.locator(".smarti-update-orbit")).toHaveCSS(
    "animation-name",
    "none",
  );
  await page.screenshot({
    path: "/tmp/smarti-update-" + test.info().project.name + ".png",
  });
  updateState = "1.36.6";
  await expect(
    progress.getByRole("heading", { name: "SMARTi er oppdatert", exact: true }),
  ).toBeVisible({ timeout: 10000 });
  expect(installs).toBe(1);
  await expect(
    progress.getByRole("button", { name: "Åpne oppdatert SMARTi" }),
  ).toBeVisible();
});

test("rejected update stops installation animation", async ({ page }) => {
  let checks = 0,
    installs = 0,
    reloads = 0;
  let updateState = "offline";
  await page.route("**/api/manage/apps/self-update/check", (r) => {
    checks++;
    return r.fulfill({
      json: {
        slug: "abc_smarti",
        version: "1.36.5",
        version_latest: "1.36.6",
        update_available: true,
        checked_at: Date.now() / 1000,
        check_error: false,
      },
    });
  });
  await page.route("**/api/manage/apps/reload", (r) => {
    reloads++;
    return r.fulfill({ json: { saved: true } });
  });
  await page.route("**/api/manage/apps/self-update", (r) => {
    if (r.request().method() === "POST") {
      installs++;
      return r.fulfill({ json: { status: "failed" } });
    }
    if (updateState === "offline")
      return r.fulfill({ status: 503, json: { detail: "restarting" } });
    return r.fulfill({
      json: { slug: "abc_smarti", version: updateState, state: "started" },
    });
  });
  await page.route("**/api/manage/updates", (r) =>
    r.fulfill({
      json: [
        {
          entity_id: "update.home_assistant_core_update",
          name: "Home Assistant Core",
          smarti: true,
          installed_version: "2026.10.1",
          latest_version: "2026.10.2",
          state: "on",
          can_install: true,
          can_backup: true,
        },
      ],
    }),
  );
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page
    .getByRole("button", { name: "Innstillinger", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: /^Normal/ }).click();
  await page
    .getByRole("navigation", { name: "Innstillingskategorier" })
    .getByRole("button", { name: "SMARTi-oppdateringer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "SMARTi-appen", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Oppdater SMARTi", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".system-row")).toContainText("2026.10.2");
  await expect(page.locator(".system-row h2")).not.toContainText(
    "Home Assistant",
  );
  expect(checks).toBeGreaterThan(0);
  expect(installs).toBe(0);
  await page
    .getByRole("button", { name: "Se etter oppdateringer", exact: true })
    .click();
  await expect.poll(() => reloads).toBe(1);
  await expect.poll(() => checks).toBeGreaterThan(1);
  await page
    .getByRole("button", { name: "Oppdater SMARTi", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Oppdater SMARTi?",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  expect(installs).toBe(0);
  await dialog
    .getByRole("button", { name: "Bekreft oppdatering", exact: true })
    .click();
  await expect.poll(() => installs).toBe(1);
  await expect(
    page.getByRole("dialog", { name: "Oppdaterer SMARTi", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/Home Assistant avviste oppdateringen/),
  ).toBeVisible();
});
