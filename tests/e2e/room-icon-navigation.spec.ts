import { test, expect } from "../../frontend/node_modules/@playwright/test";
test("room icon persists, simple navigation omits Rooms, bottom menu follows selection", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  const nav = page.getByRole("navigation", { name: "Hovedmeny" });
  await nav.getByRole("button", {name:"Innstillinger",exact:true}).click();
  await page.locator(".experience-picker").getByRole("button",{name:/^Avansert/}).click();
  await nav.getByRole("button", { name: "Rom", exact: true }).click();
  await page.getByRole("button", { name: "Stue", exact: true }).click();
  await page
    .locator(".room-detail")
    .getByRole("button", { name: "Administrer rom", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Bilde eller ikon", exact: true })
    .click();
  await dialog
    .locator(".room-icon-grid")
    .getByRole("button", { name: "Soverom", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("lagret");
  await dialog.getByRole("button", { name: "Lukk innstillinger" }).click();
  await expect(
    page.locator(".room-detail img[data-room-icon=true]").first(),
  ).toBeVisible();
  await expect(
    page.locator(".room-detail img[data-room-icon=true]").first(),
  ).toHaveJSProperty("naturalWidth", 150);
  await nav.getByRole("button", { name: "Innstillinger", exact: true }).click();
  await expect
    .poll(() =>
      nav.evaluate((el) => {
        const item = el
            .querySelector('[aria-current="page"]')!
            .getBoundingClientRect(),
          box = el.getBoundingClientRect();
        const target = Math.max(
          0,
          Math.min(
            el.scrollLeft +
              item.left -
              box.left -
              el.clientLeft +
              item.width / 2 -
              el.clientWidth / 2,
            el.scrollWidth - el.clientWidth,
          ),
        );
        return Math.abs(el.scrollLeft - target);
      }),
    )
    .toBeLessThan(2);
  await page
    .locator(".experience-picker")
    .getByRole("button", { name: /^Enkel/ })
    .click();
  await expect(
    nav.getByRole("button", { name: "Rom", exact: true }),
  ).toHaveCount(0);
  await nav.getByRole("button", { name: "Hjem", exact: true }).click();
  await expect(
    page.locator(".simple-room-tiles img[data-room-icon=true]").first(),
  ).toBeVisible();
  await page.reload();
  await expect(
    nav.getByRole("button", { name: "Rom", exact: true }),
  ).toHaveCount(0);
});
