import { test, expect } from "../../frontend/node_modules/@playwright/test";
test("automation overview filters, layouts and editor", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  const nav = page.getByRole("navigation", { name: "Hovedmeny" });
  await nav.getByRole("button", { name: "Innstillinger", exact: true }).click();
  await page
    .getByRole("button", { name: "Tema og utseende", exact: true })
    .click();
  await page
    .locator(".experience-picker")
    .getByRole("button", { name: /^Avansert/ })
    .click();
  await nav.getByRole("button", { name: "Automasjoner", exact: true }).click();
  const root = page.locator(".automation-overview");
  await expect(root.locator(".automation-item").first()).toBeVisible();
  await expect(root.locator(".automation-trigger").first()).toContainText(
    "20:00:00",
  );
  await root
    .getByRole("button", { name: "Vis utløsere", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toContainText("20:00:00");
  await page.getByRole("button", { name: "Lukk innstillinger" }).click();
  await root
    .getByRole("button", { name: /^Velg ikon for/ })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Natt", exact: true })
    .click();
  await expect(root.locator(".automation-icon-button").first()).toHaveAttribute(
    "data-icon",
    "moon",
  );
  await root.getByRole("button", { name: "Kort", exact: true }).click();
  await expect(root.locator(".automation-results")).toHaveClass(/grid/);
  const search = root.getByRole("searchbox", {
    name: "Søk i automasjoner",
    exact: true,
  });
  const phone = await page.evaluate(
    () =>
      window.matchMedia(
        "(max-width: 650px), (max-height: 500px) and (pointer: coarse)",
      ).matches,
  );
  const toolbarSearch = page.getByRole("button", {
    name: "Søk i automasjoner",
    exact: true,
  });
  if (phone) {
    await toolbarSearch.click();
    await expect(search).toBeFocused();
  }
  await search.fill("no-match-xyz");
  await expect(root.locator(".automation-item")).toHaveCount(0);
  await root.getByRole("button", { name: "Nullstill filtre" }).click();
  await root.getByRole("button", { name: "Liste", exact: true }).click();
  await expect(root.locator(".automation-item").first()).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: `../artifacts/${test.info().project.name}-automation-overview.png`,
    fullPage: true,
  });
  await root
    .locator(".automation-item")
    .first()
    .getByRole("button", { name: "Kjør", exact: true })
    .click();
  await expect(
    root.getByText("Kjøre handlingene nå? Betingelsene kontrolleres først."),
  ).toBeVisible();
  await root.getByRole("button", { name: "Avbryt", exact: true }).click();
  await root
    .locator(".automation-item")
    .first()
    .getByRole("button", { name: "Rediger", exact: true })
    .click();
  await expect(root).toHaveCount(0);
  if (phone) await expect(toolbarSearch).toBeHidden();
});
