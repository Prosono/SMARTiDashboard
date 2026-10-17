import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("selected home tabs center within the mobile strip without scrolling the page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  const nav = page.getByRole("tablist", { name: "Visninger i Hjem" });
  const centered = async () =>
    nav.evaluate((el) => {
      const item = el.querySelector('[aria-selected="true"]')!;
      const box = el.getBoundingClientRect(),
        rect = item.getBoundingClientRect();
      const desired =
        el.scrollLeft +
        rect.left -
        box.left -
        el.clientLeft +
        rect.width / 2 -
        el.clientWidth / 2;
      return Math.abs(
        el.scrollLeft -
          Math.max(0, Math.min(desired, el.scrollWidth - el.clientWidth)),
      );
    });
  await nav.getByRole("tab", { name: "Lys", exact: true }).click();
  await expect.poll(centered).toBeLessThan(2);
  const y = await page.evaluate(() => window.scrollY);
  await page.keyboard.press("ArrowRight");
  await expect(
    nav.getByRole("tab", { name: "Energi", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect.poll(centered).toBeLessThan(2);
  expect(await page.evaluate(() => window.scrollY)).toBe(y);
  await nav.getByRole("tab", { name: "Multimedia", exact: true }).click();
  await expect.poll(centered).toBeLessThan(2);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 844 });
  await expect.poll(centered).toBeLessThan(2);
  await page.keyboard.press("Home");
  await expect(
    nav.getByRole("tab", { name: "Oversikt", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => nav.evaluate((el) => el.scrollLeft)).toBe(0);
});
