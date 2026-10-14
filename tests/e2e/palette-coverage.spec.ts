import { test, expect } from "../../frontend/node_modules/@playwright/test";
test("all palettes reach hero, controls, energy and settings in both modes", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  const seen = new Set<string>();
  for (const mode of ["light", "dark"]) {
    if (mode === "dark")
      await page.locator('button[aria-label="Mørkt"]').click();
    for (const name of ["SMARTi", "Fjord", "Skog", "Sand", "Plomme"]) {
      await page.getByLabel("Velg fargepalett", { exact: true }).click();
      await page
        .locator(".palette-menu .palette-options button")
        .filter({ has: page.getByText(name, { exact: true }) })
        .click();
      // Close the picker without changing the current palette.
      const menu = page.locator(".palette-menu");
      if ((await menu.getAttribute("open")) !== null)
        await page.getByLabel("Velg fargepalett", { exact: true }).click();
      await expect(page.locator(".home-welcome")).toBeVisible();
      const hero = await page
        .locator(".home-welcome")
        .evaluate((el) => getComputedStyle(el, "::before").backgroundImage);
      expect(seen.has(hero)).toBe(false);
      seen.add(hero);
      await page.getByRole("tab", { name: "Energi", exact: true }).click();
      await expect(page.locator(".energy-flow-cinematic")).toBeVisible();
      const inherited = await page
        .locator(".energy-flow-cinematic")
        .evaluate((el) =>
          ["--surface", "--text", "--accent"].every(
            (key) =>
              getComputedStyle(el).getPropertyValue(key).trim() ===
              getComputedStyle(document.documentElement)
                .getPropertyValue(key)
                .trim(),
          ),
        );
      expect(inherited).toBe(true);
      if (name === "Plomme") await page.locator(".energy-flow-cinematic").screenshot({path:`test-results/palette-energy-${mode}-${test.info().project.name}.png`});
      await page.getByRole("tab", { name: "Oversikt", exact: true }).click();
    }
  }
  await page
    .locator(".home-welcome")
    .screenshot({
      path: `test-results/palette-hero-${test.info().project.name}.png`,
    });
  await page.getByRole("button", { name: "Tilpass Hjem", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(
    await dialog.evaluate(
      (el) =>
        getComputedStyle(el).getPropertyValue("--surface").trim() ===
        getComputedStyle(document.documentElement)
          .getPropertyValue("--surface")
          .trim(),
    ),
  ).toBe(true);
});
