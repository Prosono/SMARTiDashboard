import { test, expect } from "../../frontend/node_modules/@playwright/test";
test("personal experience modes simplify navigation and survive reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  const settings = () =>
    page
      .getByRole("navigation")
      .getByRole("button", { name: "Innstillinger", exact: true });
  const home = () =>
    page
      .getByRole("navigation")
      .getByRole("button", { name: "Hjem", exact: true });
  await settings().click();
  await page
    .locator(".experience-picker")
    .screenshot({
      path: `../artifacts/experience-picker-${test.info().project.name}.png`,
    });
  await page
    .locator(".experience-picker")
    .getByRole("button", { name: /^Enkel/ })
    .click();
  await expect(page.locator(".shell")).toHaveAttribute(
    "data-experience",
    "simple",
  );
  await expect(
    page
      .getByRole("navigation")
      .getByRole("button", { name: "Integrasjoner", exact: true }),
  ).toHaveCount(0);
  await home().click();
  await expect(
    page.getByRole("heading", { name: "Hva vil du gjøre hjemme?" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Hva vil du gjøre hjemme?", { exact: true }),
  ).toBeVisible();
  expect(
    await page.locator(".simple-home .device").count(),
  ).toBeLessThanOrEqual(8);
  await page.getByLabel("Finn en enhet").fill("finnesikkexyz");
  await expect(
    page.getByText("Ingen enheter her.", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".shell")).toHaveAttribute(
    "data-experience",
    "simple",
  );
  await page.screenshot({
    path: `../artifacts/experience-simple-${test.info().project.name}.png`,
    fullPage: true,
  });
  await settings().click();
  await page
    .locator(".experience-picker")
    .getByRole("button", { name: /^Normal/ })
    .click();
  await expect(page.locator(".shell")).toHaveAttribute(
    "data-experience",
    "normal",
  );
  await expect(
    page.getByRole("button", { name: "Administrasjon", exact: true }),
  ).toHaveCount(0);
  await home().click();
  await page
    .getByRole("button", { name: "Vis mer informasjon", exact: true })
    .click();
  await expect(page.locator(".home-overview")).toHaveAttribute(
    "data-overview-detail",
    "true",
  );
  await settings().click();
  await page
    .locator(".experience-picker")
    .getByRole("button", { name: /^Avansert/ })
    .click();
  await expect(page.locator(".shell")).toHaveAttribute(
    "data-experience",
    "advanced",
  );
  await expect(
    page
      .getByRole("navigation")
      .getByRole("button", { name: "Integrasjoner", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Tema og utseende", exact: true })
    .click();
  await page.getByLabel("Ditt språk", { exact: true }).selectOption("en");
  await expect(page.getByLabel("Your language", { exact: true })).toHaveValue(
    "en",
  );
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Theme and appearance", exact: true })
    .click();
  await expect(page.getByLabel("Your language", { exact: true })).toHaveValue(
    "en",
  );
  await page.getByLabel("Your language", { exact: true }).selectOption("nb");
  await expect(page.getByLabel("Ditt språk", { exact: true })).toHaveValue(
    "nb",
  );
});
