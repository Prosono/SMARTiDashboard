import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("section banners start collapsed and can be expanded and collapsed", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  for (const name of ["Lys", "Klima", "Sikkerhet", "Multimedia"]) {
    await page.getByRole("tab", { name, exact: true }).click();
    const toggle = page.getByRole("button", {
      name: "Utvid banner",
      exact: true,
    });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    const id = await toggle.getAttribute("aria-controls");
    const banner = page
      .locator("[data-collapsible-banner]")
      .filter({ visible: false });
    await expect(banner).toHaveCount(1);
    await toggle.click();
    const collapse = page.getByRole("button", {
      name: "Skjul banner",
      exact: true,
    });
    await expect(collapse).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("[data-collapsible-banner]")).toBeVisible();
    expect(await collapse.getAttribute("aria-controls")).toBe(id);
    await collapse.click();
    await expect(page.locator("[data-collapsible-banner]")).toBeHidden();
    expect(
      await page
        .locator("body")
        .evaluate((e) => e.scrollWidth <= e.clientWidth),
    ).toBe(true);
  }
});
