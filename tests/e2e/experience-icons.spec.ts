import {
  test,
  expect,
  type Page,
} from "../../frontend/node_modules/@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });
const settings = (page: Page) =>
  page
    .getByRole("navigation", { name: "Hovedmeny" })
    .getByRole("button", { name: "Innstillinger", exact: true });
async function setup(page: Page) {
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await settings(page).click();
}

test("mode illustrations stay legible, distinct and clear of text and selection marks across screen sizes", async ({
  page,
}, info) => {
  await setup(page);
  const picker = page.locator(".experience-picker");
  for (const width of [320, 390, 700, 834, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      await expect(picker.getByRole("button")).toHaveCount(3);
      await expect(picker.locator("button[aria-pressed=true]")).toHaveCount(1);
      const drawings: string[] = [];
      for (const mode of ["simple", "normal", "advanced"]) {
        const button = picker.locator(`button[data-mode=${mode}]`);
        const icon = button.locator(`[data-mode-icon=${mode}]`);
        await expect(icon).toBeVisible();
        await expect(icon).toHaveAttribute("aria-hidden", "true");
        drawings.push(await icon.innerHTML());
        const bounds = await button.evaluate((button) => {
          const icon = button
            .querySelector(".experience-mode-icon")!
            .getBoundingClientRect();
          const box = button.getBoundingClientRect();
          const label = button.querySelector("strong")!.getBoundingClientRect();
          const check = button
            .querySelector(".experience-check")!
            .getBoundingClientRect();
          const overlaps = (r: DOMRect) =>
            icon.left < r.right &&
            icon.right > r.left &&
            icon.top < r.bottom &&
            icon.bottom > r.top;
          return {
            inside:
              icon.top >= box.top &&
              icon.bottom <= box.bottom &&
              icon.left >= box.left &&
              icon.right <= box.right,
            clear: !overlaps(label) && !overlaps(check),
            width: icon.width,
            height: icon.height,
            photographicBackground: getComputedStyle(
              button,
              "::before",
            ).backgroundImage.includes("url("),
          };
        });
        expect(bounds.inside, `${mode}/${width}/${theme}`).toBe(true);
        expect(bounds.clear, `${mode}/${width}/${theme}`).toBe(true);
        expect(bounds.width).toBeGreaterThanOrEqual(48);
        expect(bounds.height).toBeGreaterThanOrEqual(48);
        expect(bounds.photographicBackground).toBe(false);
      }
      expect(new Set(drawings).size).toBe(3);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      if (width === 390 || width === 1440)
        await picker.screenshot({
          path: `/private/tmp/smarti-121-modes-${info.project.name}-${width}-${theme}.png`,
          animations: "disabled",
        });
    }
  }
});

test("keyboard mode selection keeps the selected marker and focus visible and survives reload", async ({
  page,
}) => {
  await setup(page);
  for (const mode of ["simple", "normal", "advanced"]) {
    const button = page.locator(`.experience-picker button[data-mode=${mode}]`);
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".shell")).toHaveAttribute(
      "data-experience",
      mode,
    );
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(button.locator(".experience-check svg")).toBeVisible();
    await expect(button).toBeFocused();
    expect(
      await button.evaluate((button) => getComputedStyle(button).outlineStyle),
    ).toBe("solid");
    await page.reload();
    await expect(page.locator(".shell")).toHaveAttribute(
      "data-experience",
      mode,
    );
    await settings(page).click();
    await expect(
      page.locator(`.experience-picker button[data-mode=${mode}]`),
    ).toHaveAttribute("aria-pressed", "true");
    expect((await (await page.request.get("/api/session")).json()).role).toBe(
      "admin",
    );
  }
});

test("a failed save preserves the selected mode and does not steal focus from another control", async ({
  page,
}) => {
  await setup(page);
  const picker = page.locator(".experience-picker");
  const current = await picker
    .locator("button[aria-pressed=true]")
    .getAttribute("data-mode");
  let release!: () => void;
  const pending = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/home/experience", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    await pending;
    return route.fulfill({
      status: 500,
      json: { detail: "fixture save failure" },
    });
  });
  const choice = picker.locator(
    `button[data-mode=${current === "simple" ? "normal" : "simple"}]`,
  );
  await choice.focus();
  await page.keyboard.press("Enter");
  await expect(choice).toBeDisabled();
  await settings(page).focus();
  release();
  await expect(picker.getByRole("alert")).toContainText("Kunne ikke lagre");
  await expect(picker.locator(`button[data-mode=${current}]`)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(settings(page)).toBeFocused();
});
