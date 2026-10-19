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

test("manual hub setup verifies credentials inside the dialog", async ({
  page,
}) => {
  let provisioned = false;
  let attempts = 0;
  await page.route("**/api/remote/claim-code", (r) =>
    r.fulfill({
      json: {
        code: "automatic-test-code",
        expires_at: Date.now() / 1000 + 300,
      },
    }),
  );
  await page.route("**/api/remote", (r) =>
    r.fulfill({ json: { provisioned, linked: false, remote_enabled: true } }),
  );
  await page.route("**/api/remote/provision", (r) => {
    attempts++;
    expect(r.request().postDataJSON()).toEqual({
      installation_id: "11111111-1111-4111-8111-111111111111",
      credential: "test-key-only-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    });
    if (attempts === 1)
      return r.fulfill({
        status: 422,
        json: { detail: "remote_identity_rejected" },
      });
    provisioned = true;
    return r.fulfill({ json: { provisioned: true, restart_required: false } });
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
    .getByLabel("Hub-ID", { exact: true })
    .fill("11111111-1111-4111-8111-111111111111");
  const key = dialog.getByLabel("Tilkoblingsnøkkel", { exact: true });
  await expect(key).toHaveAttribute("type", "password");
  await key.fill("test-key-only-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
  await dialog
    .getByRole("button", { name: "Kontroller og lagre", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("ugyldig");
  await expect(key).toHaveValue(
    "test-key-only-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  );
  await dialog
    .getByRole("button", { name: "Kontroller og lagre", exact: true })
    .click();
  await expect(
    dialog.getByLabel("Tilkoblingsnøkkel", { exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Hent engangskode", exact: true }),
  ).toBeVisible();
  await expect(dialog.getByLabel("Engangskode")).toHaveValue(
    "automatic-test-code",
  );
  await expect(dialog.getByRole("status")).toContainText("Huben er klargjort");
});
