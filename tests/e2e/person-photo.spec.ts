import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("person without login can preview and save a photo without submitting name changes", async ({ page }) => {
  let data: string | undefined;
  await page.route("**/api/manage/settings/people", route => route.fulfill({ json: {
    people: [{ id: "ola", entity_id: "person.ola", name: "Ola", editable: true, device_trackers: [] }], trackers: []
  } }));
  await page.route("**/api/home/people/person.ola/photo**", route => {
    if (route.request().method() === "PUT") {
      data = route.request().postDataJSON().data;
      return route.fulfill({ json: { saved: true } });
    }
    return route.fulfill({ status: 404 });
  });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page.getByLabel("Passord", { exact: true }).fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page.getByRole("navigation", { name: "Hovedmeny" }).getByRole("button", { name: "Innstillinger", exact: true }).click();
  await page.getByRole("button", { name: "Hjem og personer", exact: true }).click();
  await page.getByRole("button", { name: "Rediger person", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Rediger person" });
  await dialog.locator('input[type="file"]').setInputFiles("frontend/public/brand/matter-icon.png");
  await expect(dialog.locator(".account-photo-editor img")).toHaveAttribute("src", /^data:image\/jpeg;base64,/);
  await dialog.getByRole("button", { name: "Lagre profilbilde", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveText("Profilbildet er oppdatert.");
  expect(data?.length).toBeGreaterThan(100);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Bruk systembildet", exact: true }).click();
  await expect.poll(() => data).toBe("");
});
