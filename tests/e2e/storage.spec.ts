import { test, expect } from "../../frontend/node_modules/@playwright/test";

for (const failure of ["quota", "blocked"] as const) {
  test(`app survives ${failure} browser storage`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript((mode) => {
      if (mode === "quota") {
        Storage.prototype.setItem = () => {
          throw new DOMException(
            "The quota has been exceeded.",
            "QuotaExceededError",
          );
        };
      } else {
        Object.defineProperty(window, "localStorage", {
          get() {
            throw new DOMException("Storage is blocked.", "SecurityError");
          },
        });
      }
    }, failure);
    await page.goto("/");
    await expect(page.getByLabel("Brukernavn", { exact: true })).toBeVisible({
      timeout: 5000,
    });
    await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
    await page
      .getByLabel("Passord", { exact: true })
      .fill("test-password-not-for-live");
    await page.getByRole("button", { name: "Logg inn", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Velkommen hjem." }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Mørkt", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Mer", exact: true })
      .click();
    await page.getByLabel("Språk").selectOption("en");
    await expect(
      page.getByRole("heading", { name: "Settings", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Home", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Welcome home." }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Velkommen hjem." }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
}
