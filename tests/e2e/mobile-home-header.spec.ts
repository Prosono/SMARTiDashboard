import {
  expect,
  test,
  type Locator,
  type Page,
} from "../../frontend/node_modules/@playwright/test";

async function openHome(page: Page) {
  await page.route("**/api/home/experience", (route) =>
    route.fulfill({ json: { mode: "advanced" } }),
  );
  await page.route("**/api/home", async (route) => {
    const response = await route.fetch();
    const home = await response.json();
    await route.fulfill({
      response,
      json: { ...home, home_name: "Testboligen" },
    });
  });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(page.locator(".home-overview")).toBeVisible();
}

async function expectSingleRow(
  toolbar: Locator,
  title: string,
  search: string,
) {
  const items = [
    toolbar.locator(".mobile-home-switcher"),
    toolbar.getByRole("heading", { level: 1, name: title, exact: true }),
    toolbar.getByRole("button", { name: search, exact: true }),
    toolbar.locator(".home-toolbar-alert"),
    toolbar.getByRole("button", { name: "Rediger oppsett", exact: true }),
  ];
  for (const item of items) await expect(item).toBeVisible();

  await expect
    .poll(async () => {
      const bounds = await toolbar.boundingBox();
      const boxes = await Promise.all(items.map((item) => item.boundingBox()));
      if (!bounds || boxes.some((box) => !box)) return false;
      const positioned = boxes.flatMap((box) => (box ? [box] : []));
      const centers = positioned.map((box) => box.y + box.height / 2);
      return (
        bounds.height <= 68 &&
        Math.max(...centers) - Math.min(...centers) <= 4 &&
        positioned.every(
          (box, index) =>
            box.x >= bounds.x - 1 &&
            box.x + box.width <= bounds.x + bounds.width + 1 &&
            (!index ||
              box.x >=
                positioned[index - 1].x + positioned[index - 1].width - 1),
        )
      );
    })
    .toBe(true);
}

test("the compact home header fits in one row and keeps category search", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 844 });
  await openHome(page);
  const toolbar = page.locator(".home-overview .home-toolbar");

  for (const width of [393, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole("tab", { name: "Oversikt", exact: true }).click();
    await expectSingleRow(toolbar, "Oversikt", "Søk etter enheter");
    await page.getByRole("tab", { name: "Lys", exact: true }).click();
    await expectSingleRow(toolbar, "Lys", "Vis søk og filtre");
    await toolbar
      .getByRole("button", { name: "Vis søk og filtre", exact: true })
      .click();
    const input = page.getByRole("textbox", {
      name: "Søk etter rom eller lys",
      exact: true,
    });
    await expect(input).toBeFocused();
    await input.press("Escape");
    await expect(input).toBeHidden();
  }

  await page.setViewportSize({ width: 834, height: 1112 });
  await expect(toolbar.locator(".mobile-home-switcher")).toBeHidden();
  await expect(toolbar.locator(".home-date")).toBeVisible();
  await expect(toolbar.getByText("Testboligen", { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 393, height: 844 });
  await page.getByRole("tab", { name: "Oversikt", exact: true }).click();
  await toolbar
    .getByRole("button", { name: "Søk etter enheter", exact: true })
    .click();
  await expect(
    page.getByRole("searchbox", {
      name: "Søk etter kontroll eller rom",
      exact: true,
    }),
  ).toBeFocused();
});

test("the SMARTi logo opens My homes, with the current home and the portal fallback", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 844 });
  await openHome(page);
  const logo = page
    .locator(".home-overview .home-toolbar")
    .getByRole("button", { name: /Mine hjem/ });
  await logo.click();

  const dialog = page.getByRole("dialog", { name: "Mine hjem", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Testboligen", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("link", { name: /Mine hjem/ })).toHaveAttribute(
    "href",
    /^https:\/\/home\.smarti\.dev\/(?:\?.*)?$/,
  );
  await expect(dialog.locator("iframe")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(logo).toBeFocused();
});
