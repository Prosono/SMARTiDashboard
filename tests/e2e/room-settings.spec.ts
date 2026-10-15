import { test, expect } from "../../frontend/node_modules/@playwright/test";
test("room settings stay in a modal and persist personal visibility", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Rom", exact: true })
    .click();
  await page.getByRole("button", { name: "Stue", exact: true }).click();
  const room = page.locator(".room-detail");
  await room
    .getByRole("button", { name: "Administrer rom", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const visible = dialog.getByRole("checkbox", {
    name: "Vis i rommet: Pendellampe",
    exact: true,
  });
  await expect(visible).toBeEnabled();
  if (!(await visible.isChecked())) {
    await visible.click();
    await expect(visible).toBeChecked();
    await expect(visible).toBeEnabled();
  }
  await visible.click();
  await expect(dialog.getByRole("status")).toContainText("lagret");
  await dialog.getByRole("button", { name: "Lukk innstillinger" }).click();
  await expect(room.locator(".room-section-lights")).not.toContainText(
    "Pendellampe",
  );
  await room
    .getByRole("button", { name: "Administrer rom", exact: true })
    .click();
  await expect(visible).not.toBeChecked();
  await visible.click();
  await expect(dialog.getByRole("status")).toContainText("lagret");
  const favorite = dialog.getByRole("checkbox", {
    name: "Favoritt: Pendellampe",
    exact: true,
  });
  const was = await favorite.isChecked();
  await favorite.click();
  await expect(dialog.getByRole("status")).toContainText("lagret");
  await expect(favorite).toBeChecked({ checked: !was });
  await dialog
    .getByRole("button", { name: "Legg til enheter", exact: true })
    .click();
  await expect(
    dialog.getByRole("combobox", { name: "Velg enhet", exact: true }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "Koble til en ny enhet" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".device-setup")).toBeVisible();
});
