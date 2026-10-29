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
    if (i === 0 && count > 0) {
      const row = dialog.locator(".metric-device-open").first();
      const name = await row.locator("strong").innerText();
      await row.click();
      const detail = page.getByRole("dialog", { name, exact: true });
      await expect(
        detail.getByRole("button", { name: "Skjul enhet", exact: true }),
      ).toBeVisible();
      await expect(
        detail.getByRole("button", { name: "Tilpass lys", exact: true }),
      ).toBeVisible();
      const toggle = detail.getByRole("switch");
      await expect(toggle).toHaveAttribute("aria-checked", "true");
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", "false");
      await expect(detail).toBeVisible();
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", "true");
      await detail.screenshot({
        path: `/tmp/metric-device-${test.info().project.name}.png`,
      });
      await detail
        .getByRole("button", { name: "Lukk innstillinger", exact: true })
        .click();
      await expect(detail).toHaveCount(0);
    }
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
  await metrics.first().click();
  const humidity = page.getByRole("dialog", {
    name: "Snittemperatur",
    exact: true,
  });
  await humidity
    .getByRole("button", { name: "Åpne Temperatur", exact: true })
    .click();
  const sensor = page
    .getByRole("dialog")
    .filter({ has: page.locator(".metric-device-detail") })
    .last();
  await expect(
    page.getByRole("region", { name: "Enhetshistorikk", exact: true }),
  ).toBeVisible();
  await sensor
    .getByRole("button", { name: "Lukk innstillinger", exact: true })
    .click();
  await humidity
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
