import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("category counters open the matching devices", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Enheter", exact: true })
    .click();
  await page.locator(".device-toolbar select").selectOption("light");
  const metrics = page.locator(".category-metric-button");
  await expect(metrics).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    const button = metrics.nth(i);
    const label = await button.getAttribute("aria-label");
    const count = Number(
      (await button.locator("strong").innerText()).split(" / ")[0],
    );
    await button.click();
    const dialog = page.getByRole("dialog", { name: label!, exact: true });
    await expect(dialog).toBeVisible();
    if (i !== 1) await expect(dialog.locator("li")).toHaveCount(count);
    else
      await expect(dialog.locator(".metric-details section")).toHaveCount(
        count,
      );
    if (i === 0 && count > 0)
      await expect(dialog.locator("li span").first()).toHaveText("På");
    if (i === 2)
      await dialog.screenshot({
        path: `/tmp/metric-details-${test.info().project.name}.png`,
      });
    await dialog
      .getByRole("button", { name: "Lukk innstillinger", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(button).toBeFocused();
  }
  await page.locator(".device-toolbar select").selectOption("climate");
  await metrics.first().click();
  const climate = page.getByRole("dialog", {
    name: "Snittemperatur",
    exact: true,
  });
  await expect(climate).toBeVisible();
  expect(await climate.locator("li").count()).toBeGreaterThan(0);
  await climate
    .getByRole("button", { name: "Lukk innstillinger", exact: true })
    .click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Hjem", exact: true })
    .click();
  for (const tab of ["Sikkerhet", "Multimedia", "Diverse"]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    const buttons = page.locator(".category-metric-button");
    expect(await buttons.count()).toBeGreaterThan(0);
    for (let i = 0; i < (await buttons.count()); i++) {
      const button = buttons.nth(i);
      const label = await button.getAttribute("aria-label");
      const count = Number(
        (await button.locator("strong").innerText()).split(" / ")[0],
      );
      await button.click();
      const dialog = page.getByRole("dialog", { name: label!, exact: true });
      await expect(dialog.locator("li")).toHaveCount(count);
      await dialog
        .getByRole("button", { name: "Lukk innstillinger", exact: true })
        .click();
    }
  }
});
