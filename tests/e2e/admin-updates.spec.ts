import { test, expect } from "../../frontend/node_modules/@playwright/test";
import fs from "node:fs";
import path from "node:path";
test("operator approves and withdraws a version on desktop and mobile", async ({
  page,
}, info) => {
  let approved = false;
  await page.route("**/*", async (r) => {
    const u = new URL(r.request().url());
    if (u.pathname === "/admin/updates")
      return r.fulfill({ path: "backend/app/cloud_web/admin-updates.html" });
    if (u.pathname === "/api/session")
      return r.fulfill({ json: { csrf: "test-csrf", portal_admin: true } });
    if (u.pathname === "/api/admin/hub-versions")
      return r.fulfill({json: [{id: "test-hub", name: "Testhjem", versions: {core: {version: "2026.10.1", reported: 1793000000}}}]});
    if (u.pathname === "/api/admin/releases") {
      if (r.request().method() === "POST") {
        expect(r.request().headers()["x-csrf-token"]).toBe("test-csrf");
        approved = r.request().postDataJSON().approved;
        return r.fulfill({ json: { saved: true } });
      }
      return r.fulfill({
        json: [
          {
            component: "core",
            version: "2026.10.4",
            approved,
            notes: "Testet på testhub",
            updated: 1793000000,
          },
        ],
      });
    }
    const f = path.join(
      process.cwd(),
      "backend/app/cloud_web",
      path.basename(u.pathname),
    );
    if (u.pathname.startsWith("/assets/") && fs.existsSync(f))
      return r.fulfill({ path: f });
    return r.fulfill({ status: 404, body: "" });
  });
  await page.goto("/admin/updates");
  await expect(page.getByRole("link", {name: "Oppdateringer", exact: true})).toBeVisible();
  await expect(
    page.getByText("Venter på godkjenning", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Testhjem", {exact: true})).toBeVisible();
  await expect(page.getByText("2026.10.1", {exact: true})).toBeVisible();
  await expect(page.getByText("Ikke rapportert", {exact: true})).toHaveCount(3);
  page.on("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Godkjenn for kunder", exact: true })
    .click();
  await expect(
    page.getByText("Godkjent for kunder", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Trekk tilbake godkjenning" }).click();
  await expect(
    page.getByText("Venter på godkjenning", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `/tmp/smarti-admin-updates-${info.project.name}.png`,
    fullPage: true,
  });
});
