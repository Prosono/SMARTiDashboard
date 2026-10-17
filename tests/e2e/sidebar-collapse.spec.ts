import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("sidebar preference survives reload without collapsing mobile navigation", async ({ page, isMobile }) => {
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page.getByLabel("Passord", { exact: true }).fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  const nav = page.getByRole("navigation", { name: "Hovedmeny" });
  await expect(nav).toBeVisible();
  if (isMobile) {
    await page.evaluate(() => localStorage.setItem("smarti-sidebar:tester", "collapsed"));
    await page.reload();
    await expect(nav).toBeVisible();
    await expect(page.locator(".sidebar-toggle")).toBeHidden();
    await expect(nav.getByRole("button", { name: "Hjem", exact: true }).locator("span").first()).toBeVisible();
    const box = await page.locator(".sidebar").boundingBox();
    expect(box!.width).toBe(page.viewportSize()!.width);
  } else {
    await page.getByRole("button", { name: "Trekk sammen sidemenyen", exact: true }).click();
    await expect(page.locator(".sidebar")).toHaveCSS("width", "80px");
    await nav.getByRole("button", { name: "Innstillinger", exact: true }).click();
    await expect(nav.getByRole("button", { name: "Innstillinger", exact: true })).toHaveAttribute("aria-current", "page");
    await page.reload();
    await expect(page.getByRole("button", { name: "Utvid sidemenyen", exact: true })).toBeVisible();
    await expect(page.locator(".sidebar")).toHaveCSS("width", "80px");
    await page.getByRole("button", { name: "Utvid sidemenyen", exact: true }).click();
    await expect(page.locator(".sidebar")).toHaveCSS("width", "216px");
  }
});
