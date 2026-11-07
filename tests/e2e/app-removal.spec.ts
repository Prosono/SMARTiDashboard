import {
  test,
  expect,
  type Page,
} from "../../frontend/node_modules/@playwright/test";
test.use({ storageState: { cookies: [], origins: [] } });
const app = {
  slug: "test_music",
  name: "Musikkserver",
  description: "Musikk i hjemmet",
  installed: true,
  version: "1.0",
  version_latest: "1.0",
  state: "started",
  repository: "test",
  available: true,
  update_available: false,
  system_managed: false,
};
async function setup(page: Page, fail = false) {
  let removed = false;
  const writes: { action: string; confirm_slug: string; request_id: string }[] =
    [];
  await page.route("**/api/home/experience", (r) =>
    r.fulfill({ json: { mode: "advanced" } }),
  );
  await page.route("**/api/manage/apps", (r) =>
    r.fulfill({
      json: [
        ...(removed ? [] : [app]),
        { ...app, slug: "system_app", name: "Systemapp", system_managed: true },
        { ...app, slug: "candidate", name: "Ny app", installed: false },
      ],
    }),
  );
  await page.route("**/api/manage/apps/operations", (r) =>
    r.fulfill({ json: [] }),
  );
  await page.route("**/api/manage/apps/*/actions", (r) => {
    writes.push(r.request().postDataJSON());
    if (fail)
      return r.fulfill({ status: 503, json: { detail: "fixture failure" } });
    removed = true;
    return r.fulfill({ json: { status: "completed", action: "uninstall" } });
  });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Hovedmeny" })
    .getByRole("button", { name: "Utvidelser", exact: true })
    .click();
  await page.getByRole("tab", { name: "Apper", exact: true }).click();
  return writes;
}

test("installed apps can be removed directly from the list only after confirmation", async ({
  page,
}, info) => {
  const writes = await setup(page);
  const card = page.getByRole("article", { name: "Musikkserver", exact: true });
  await expect(
    card.getByRole("button", { name: "Avinstaller", exact: true }),
  ).toBeVisible();
  await card.getByRole("button", { name: "Avinstaller", exact: true }).click();
  expect(writes).toEqual([]);
  await expect(page.getByRole("dialog")).toContainText("Appdata kan gå tapt");
  await page
    .getByRole("button", { name: "Lukk innstillinger", exact: true })
    .click();
  expect(writes).toEqual([]);
  await card.getByRole("button", { name: "Avinstaller", exact: true }).click();
  await page
    .getByRole("button", { name: "Bekreft avinstaller", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(card).toHaveCount(0);
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    action: "uninstall",
    confirm_slug: "test_music",
  });
  expect(writes[0].request_id).toMatch(/^[0-9a-f-]{36}$/);
  const managed = page.getByRole("article", { name: "Systemapp", exact: true });
  await expect(managed).toContainText("Administreres av en integrasjon");
  await expect(
    managed.getByRole("button", { name: "Avinstaller", exact: true }),
  ).toHaveCount(0);
  await managed.locator(".app-card").click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Avinstaller", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: `/private/tmp/smarti-121-app-removal-${info.project.name}.png`,
    animations: "disabled",
  });
});

test("uninstall failure is visible in the confirmation and never pretends the app was removed", async ({
  page,
}) => {
  const writes = await setup(page, true);
  const card = page.getByRole("article", { name: "Musikkserver", exact: true });
  await card.getByRole("button", { name: "Avinstaller", exact: true }).click();
  await page
    .getByRole("button", { name: "Bekreft avinstaller", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Handlingen kunne ikke bekreftes",
  );
  await expect(card).toHaveCount(1);
  expect(writes).toHaveLength(1);
});
