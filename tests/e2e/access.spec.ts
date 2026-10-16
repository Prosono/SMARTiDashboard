import { test, expect } from "../../frontend/node_modules/@playwright/test";
test("administrator edits function access and restricted resident sees only allowed data", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(page.locator(".home-tabs")).toBeVisible();
  const name = "access" + test.info().project.name;
  await page.evaluate(async (name) => {
    const session = await (await fetch("api/session")).json();
    const r = await fetch("api/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": session.csrf,
      },
      body: JSON.stringify({
        name,
        password: "resident-password-long",
        role: "user",
      }),
    });
    if (!r.ok) throw Error("create user");
  }, name);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Innstillinger", exact: true })
    .click();
  const row = page
    .locator(".system-list-row")
    .filter({ has: page.locator(".account-person strong", { hasText: name }) });
  await row.getByRole("button", { name: "Tilgang", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Tilgangsprofil").selectOption("custom");
  for (const checkbox of await dialog.getByRole("checkbox").all())
    await checkbox.uncheck();
  await dialog.getByRole("checkbox", { name: "Lys: Se", exact: true }).check();
  await page.screenshot({
    path: "../artifacts/access-" + test.info().project.name + ".png",
    fullPage: true,
  });
  await dialog
    .getByRole("button", { name: "Lagre tilgang", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.evaluate(async () => {
    const session = await (await fetch("api/session")).json();
    await fetch("api/logout", {
      method: "POST",
      headers: { "X-CSRF-Token": session.csrf },
    });
  });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill(name);
  await page
    .getByLabel("Passord", { exact: true })
    .fill("resident-password-long");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Lys", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Sikkerhet", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("tab", { name: "Klima", exact: true }),
  ).toHaveCount(0);
  const result = await page.evaluate(async () => {
    const session = await (await fetch("api/session")).json();
    const home = await (await fetch("api/home")).json();
    const r = await fetch("api/controls/light.living_pendant/commands", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": session.csrf,
      },
      body: JSON.stringify({ action: "turn_on" }),
    });
    return { controls: home.controls, status: r.status };
  });
  expect(result.status).toBe(403);
  expect(result.controls.length).toBeGreaterThan(0);
  expect(
    result.controls.every(
      (c: any) => c.domain === "light" && !c.capabilities.length,
    ),
  ).toBe(true);
});
