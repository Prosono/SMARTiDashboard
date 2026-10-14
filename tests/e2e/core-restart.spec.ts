import { test, expect } from "../../frontend/node_modules/@playwright/test";
test("system restart requires confirmation and is never replayed after an uncertain response", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/manage/settings/system", (r) =>
    r.fulfill({
      json: {
        demo: false,
        unavailable: [],
        host: {},
        core: {},
        network: [],
        backups: [],
      },
    }),
  );
  await page.route("**/api/manage/settings/restart", (r) => {
    calls++;
    expect(r.request().postDataJSON().confirm).toBe(true);
    return r.fulfill({ json: { status: "unconfirmed" } });
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
  await page.getByRole("button", { name: "System", exact: true }).click();
  await page
    .getByRole("button", { name: "Start hjemmesentralen på nytt", exact: true })
    .click();
  expect(calls).toBe(0);
  await page.getByRole("button", { name: "Avbryt", exact: true }).click();
  expect(calls).toBe(0);
  await page
    .getByRole("button", { name: "Start hjemmesentralen på nytt", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Bekreft omstart", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Omstart kunne ikke bekreftes",
  );
  expect(calls).toBe(1);
  await page
    .getByRole("button", { name: "Lukk innstillinger", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start hjemmesentralen på nytt", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Bekreft omstart", exact: true }),
  ).toHaveCount(0);
  expect(calls).toBe(1);
});
