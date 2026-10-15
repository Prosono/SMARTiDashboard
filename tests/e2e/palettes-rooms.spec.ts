import { test, expect } from "../../frontend/node_modules/@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(page.locator(".home-welcome")).toBeVisible();
});
test("five palettes in both modes persist independently", async ({ page }) => {
  const values = [
    ["smarti", "SMARTi"],
    ["fjord", "Fjord"],
    ["forest", "Skog"],
    ["sand", "Sand"],
    ["plum", "Plomme"],
  ];
  const backgrounds = new Set<string>();
  for (const mode of ["light", "dark"]) {
    if (mode === "dark")
      await page.getByRole("button", { name: "Mørkt", exact: true }).click();
    for (const [id, name] of values) {
      await page.getByLabel("Velg fargepalett", { exact: true }).click();
      await page
        .locator(".palette-menu")
        .getByRole("button", { name: `Palett: ${name}`, exact: true })
        .click();
      await expect(page.locator("html")).toHaveAttribute("data-palette", id);
      await expect(page.locator("html")).toHaveAttribute("data-theme", mode);
      backgrounds.add(
        await page
          .locator("html")
          .evaluate((el) => getComputedStyle(el).getPropertyValue("--bg")),
      );
      expect(
        await page
          .locator("body")
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
    }
  }
  expect(backgrounds.size).toBe(10);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.getByLabel("Velg fargepalett", { exact: true }).click();
  const picker = await page
    .locator(".palette-menu .palette-picker")
    .boundingBox();
  expect(picker!.x).toBeGreaterThanOrEqual(0);
  expect(picker!.x + picker!.width).toBeLessThanOrEqual(320);
  expect(
    await page
      .locator(".sidebar")
      .evaluate((el) => getComputedStyle(el).backgroundImage),
  ).toBe("none");
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "plum");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByLabel("Velg fargepalett", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Palett: Plomme", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(page.locator(".palette-menu")).not.toHaveAttribute("open", "");
  await page.getByRole("button", { name: "Lyst", exact: true }).click();
  await page.getByLabel("Velg fargepalett", { exact: true }).click();
  await page
    .getByRole("button", { name: "Palett: Fjord", exact: true })
    .click();
  await page.screenshot({
    path: `../artifacts/${test.info().project.name}-palette-fjord.png`,
    fullPage: true,
    animations: "disabled",
  });
});
test("room groups, search, navigation and controls", async ({ page }) => {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Rom", exact: true })
    .click();
  await page.getByRole("button", { name: "Stue", exact: true }).click();
  const room = page.locator(".room-detail");
  await expect(
    room.getByRole("heading", { name: "Stue", exact: true }),
  ).toBeVisible();
  await expect(room.locator(".room-section-lights")).toContainText(
    "Pendellampe",
  );
  await expect(room.locator(".room-section-climate")).toContainText(
    "Gulvvarme",
  );
  const toggle = room
    .locator(".room-section-lights article")
    .filter({ hasText: "Pendellampe" })
    .getByRole("switch");
  const before = await toggle.getAttribute("aria-checked");
  await toggle.click();
  await expect(toggle).toHaveAttribute(
    "aria-checked",
    before === "true" ? "false" : "true",
  );
  await room.getByLabel("Søk i rommet").fill("Gulvvarme");
  await expect(room.locator(".room-section")).toHaveCount(1);
  await room
    .getByRole("navigation", { name: "Inndelinger i rommet" })
    .getByRole("button", { name: /Lys & stemning/ })
    .click();
  await expect(room.getByLabel("Søk i rommet")).toHaveValue("");
  await expect(room.locator(".room-section-lights")).toBeVisible();
  await expect(room.locator(".room-section-climate")).toHaveCount(0);
  await expect(
    room.getByRole("button", { name: /Lys & stemning/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await room
    .getByRole("navigation", { name: "Inndelinger i rommet" })
    .getByRole("button", { name: /^Alle/ })
    .click();
  await expect(room.locator(".room-section-climate")).toBeVisible();

  await page
    .getByRole("navigation", { name: "Velg rom", exact: true })
    .getByRole("button", { name: "Kjøkken", exact: true })
    .click();
  await expect(
    room.getByRole("heading", { name: "Kjøkken", exact: true }),
  ).toBeVisible();
  await expect(room.locator(".room-section-power")).toContainText(
    "Stikkontakt",
  );
  await page.getByLabel("Velg fargepalett", { exact: true }).click();
  await page.getByRole("button", { name: "Palett: Skog", exact: true }).click();
  await page.screenshot({
    path: `../artifacts/${test.info().project.name}-room-forest.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Mørkt", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Velg rom", exact: true })
    .getByRole("button", { name: "Stue", exact: true })
    .click();
  await page.screenshot({
    path: `../artifacts/${test.info().project.name}-room-dark.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("navigation", { name: "Velg rom", exact: true })
    .getByRole("button", { name: "Soverom", exact: true })
    .click();
  await expect(
    room.getByRole("switch", { name: "Nattbord: På", exact: true }),
  ).toBeDisabled();
  await page.setViewportSize({ width: 320, height: 800 });
  expect(
    await page
      .locator("body")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page
    .getByRole("navigation", { name: "Velg rom", exact: true })
    .getByRole("button", { name: "Alle rom", exact: true })
    .click();
  await expect(room).toHaveCount(0);
});
