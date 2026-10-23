import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("search toolbars start collapsed while image banners stay visible", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  for (const name of ["Lys", "Klima", "Sikkerhet", "Multimedia", "Diverse"]) {
    await page.getByRole("tab", { name, exact: true }).click();
    const imageBanner = page.locator(".category-summary");
    await expect(imageBanner).toBeVisible();
    await expect(page.locator(".category-heading h1")).toHaveText(name);
    await expect
      .poll(() =>
        imageBanner
          .locator("img")
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBeGreaterThan(0);
    await imageBanner.screenshot({
      path: `/tmp/smarti-category-${name}-${info.project.name}.png`,
    });
    const toggle = page.getByRole("button", {
      name: "Vis søk og filtre",
      exact: true,
    });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    const id = await toggle.getAttribute("aria-controls");
    const banner = page
      .locator("[data-collapsible-toolbar]")
      .filter({ visible: false });
    await expect(banner).toHaveCount(1);
    await toggle.click();
    const collapse = page.getByRole("button", {
      name: "Skjul søk og filtre",
      exact: true,
    });
    await expect(collapse).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("[data-collapsible-toolbar]")).toBeVisible();
    expect(await collapse.getAttribute("aria-controls")).toBe(id);
    await expect(imageBanner).toBeVisible();
    await collapse.click();
    await expect(page.locator("[data-collapsible-toolbar]")).toBeHidden();
    await expect(imageBanner).toBeVisible();
    expect(
      await page
        .locator("body")
        .evaluate((e) => e.scrollWidth <= e.clientWidth),
    ).toBe(true);
  }
});
