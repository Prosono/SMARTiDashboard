import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("remote linking stays in a dialog and supports cancelling the claim", async ({
  page,
}) => {
  let cancelled = false;
  await page.route("**/api/remote", (r) =>
    r.fulfill({
      json: { provisioned: true, linked: false, remote_enabled: true },
    }),
  );
  await page.route("**/api/remote/claim-code", (r) => {
    if (r.request().method() === "DELETE") {
      cancelled = true;
      return r.fulfill({ json: { cancelled: true } });
    }
    return r.fulfill({
      json: {
        code: "test-claim-code-only-000000000000000000000000",
        expires_at: Date.now() / 1000 + 300,
      },
    });
  });
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
  await page
    .getByRole("navigation", { name: "Innstillingskategorier" })
    .getByRole("button", { name: "System", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Administrer fjerntilgang", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Fjerntilgang",
    exact: true,
  });
  await dialog
    .getByRole("button", { name: "Hent engangskode", exact: true })
    .click();
  await expect(dialog.getByLabel("Engangskode")).toHaveValue(
    "test-claim-code-only-000000000000000000000000",
  );
  await dialog
    .getByRole("button", { name: "Avbryt koden", exact: true })
    .click();
  await expect(dialog.getByLabel("Engangskode")).toHaveCount(0);
  expect(cancelled).toBe(true);
});
