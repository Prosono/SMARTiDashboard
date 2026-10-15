import { test, expect } from "../../frontend/node_modules/@playwright/test";
test("room lighting overview filters and controls lights", async ({ page }) => {
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
  const lights = page.locator(".light-overview");
  await expect(
    lights.getByRole("heading", { name: "Lys", exact: true }),
  ).toBeVisible();
  await expect(lights.locator(".lighting-room").first()).toBeVisible();
  await expect(
    lights.locator(".lighting-room > header img").first(),
  ).toHaveJSProperty("naturalWidth", 1600);
  await lights.getByLabel("Søk etter rom eller lys").fill("finnesikke");
  await expect(lights.locator(".lighting-room")).toHaveCount(0);
  await lights.getByLabel("Søk etter rom eller lys").fill("");
  const toggle = lights.getByRole("switch", {
    name: "Pendellampe",
    exact: true,
  });
  await expect(toggle).toBeEnabled();
  const old = await toggle.getAttribute("aria-checked");
  await toggle.click();
  await expect(toggle).toHaveAttribute(
    "aria-checked",
    old === "true" ? "false" : "true",
  );
  await lights
    .getByRole("button", { name: "Farge og hvitt lys", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("dialog").locator("input[type=color]"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Lukk innstillinger", exact: true })
    .click();
  expect(
    await lights.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBeTruthy();
  await page.screenshot({
    path: `../artifacts/lights-${test.info().project.name}.png`,
    fullPage: true,
  });
});
