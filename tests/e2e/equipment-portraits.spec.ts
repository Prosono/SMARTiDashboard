import {
  test,
  expect,
  type Page,
} from "../../frontend/node_modules/@playwright/test";
import { equipmentAssets } from "../../frontend/src/home/equipmentAssets";
test.use({ storageState: { cookies: [], origins: [] } });
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "wait" });
});
async function setup(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem("smarti-home-style", "harmony"),
  );
  const controls = equipmentAssets.map(({ kind, nb }) => {
    const domain = ["leak", "motion", "smoke"].includes(kind)
      ? "binary_sensor"
      : ["charger", "switch"].includes(kind)
        ? "switch"
        : "light";
    return {
      id: `${domain}.portrait_${kind}`,
      entity_id: `${domain}.portrait_${kind}`,
      domain,
      name: nb,
      state: domain === "binary_sensor" ? "off" : "on",
      attributes:
        domain === "binary_sensor"
          ? { device_class: kind === "leak" ? "moisture" : kind }
          : domain === "light"
            ? {
                brightness: 128,
                color_mode: "color_temp",
              }
            : {},
      area_id: "living",
      device_id: null,
      availability: "available",
      diagnostic: false,
      integration: null,
      updated_at: null,
      capabilities:
        domain === "binary_sensor"
          ? []
          : [{ kind: "power", actions: ["turn_on", "turn_off"] }],
    };
  });
  await page.route("**/api/home", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      json: {
        ...(await response.json()),
        connected: true,
        controls,
        areas: [{ area_id: "living", name: "Stue" }],
        favorites: [],
      },
    });
  });
  let saved = {
    revision: 0,
    items: controls.map((c, i) => ({
      id: `custom:portrait_${equipmentAssets[i].kind}`,
      x: i % 3,
      y: Math.floor(i / 3) * 2,
      w: 1,
      h: 2,
      config: {
        type: "auto",
        title: c.name,
        icon: "auto",
        image: `equipment-${equipmentAssets[i].kind}`,
        sources: [c.entity_id],
        period: "24",
      },
    })),
  };
  await page.route("**/api/home/layout/overview*", (route) => {
    if (route.request().method() !== "GET")
      saved = {
        ...route.request().postDataJSON(),
        revision: saved.revision + 1,
      };
    return route.fulfill({ json: saved });
  });
  const commands: string[] = [];
  await page.route("**/api/controls/*/commands", (route) => {
    commands.push(route.request().url());
    return route.fulfill({ json: { status: "state_updated" } });
  });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  if (
    (await (await page.request.get("/api/home/experience")).json()).mode !==
    "advanced"
  ) {
    const nav = page.getByRole("navigation", { name: "Hovedmeny" });
    await nav
      .getByRole("button", { name: "Innstillinger", exact: true })
      .click();
    await page
      .locator('.experience-picker button[data-mode="advanced"]')
      .click();
    await nav.getByRole("button", { name: "Hjem", exact: true }).click();
  }
  await expect(page.locator(".home-canvas-cell")).toHaveCount(
    equipmentAssets.length,
  );
  return { controls, commands, saved: () => saved };
}
test("all shared component portraits load on phone, tablet and desktop glass cards in both themes", async ({
  page,
}) => {
  test.setTimeout(60000);
  const data = await setup(page);
  for (const theme of ["light", "dark"])
    for (const width of [390, 834, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      await expect(page.locator(".home-canvas")).toHaveAttribute(
        "data-mobile-layout",
        width === 390 ? "compact" : "detailed",
      );
      for (const { kind } of equipmentAssets) {
        const cell = page.locator(`[data-card="custom:portrait_${kind}"]`),
          image = cell.locator(`img[src*="/equipment/${kind}.webp"]`).first();
        await cell.scrollIntoViewIfNeeded();
        await expect(image).toHaveAttribute(
          "src",
          new RegExp(`/equipment/${kind}\\.webp$`),
        );
        await expect
          .poll(() =>
            image.evaluate((img: HTMLImageElement) => img.naturalWidth),
          )
          .toBeGreaterThanOrEqual(512);
        const measured = await image.evaluate((el) => {
          const a = el.getBoundingClientRect(),
            b = el.closest(".home-canvas-cell")!.getBoundingClientRect();
          return {
            w: a.width,
            h: a.height,
            inside:
              a.left >= b.left - 1 &&
              a.right <= b.right + 1 &&
              a.top >= b.top - 1 &&
              a.bottom <= b.bottom + 1,
          };
        });
        expect(measured.inside).toBe(true);
        expect(measured.w).toBeGreaterThan(10);
        expect(measured.h).toBeGreaterThan(10);
        await expect(cell.locator(".home-canvas-surface")).toHaveCSS(
          "backdrop-filter",
          /blur/,
        );
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      if (width === 1440)
        await page.locator(".home-canvas").screenshot({
          path: `/private/tmp/smarti-1.36.92-portraits-${theme}.png`,
        });
    }
  expect(data.commands).toHaveLength(0);
});
test("new images can be selected, saved and reloaded; missing images retain status and native fallbacks", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const data = await setup(page);
  await page
    .getByRole("button", { name: "Rediger oppsett", exact: true })
    .click();
  const cell = page.locator('[data-card="custom:portrait_charger"]');
  await page
    .getByRole("button", { name: "Valg for Elbillader", exact: true })
    .click();
  await page.getByRole("button", { name: "Rediger kort", exact: true }).click();
  const editor = page.getByRole("dialog");
  const photos = editor.getByText("Ikon og bilde", { exact: true });
  if (await photos.count()) await photos.click();
  await editor.getByRole("button", { name: "Elbillader", exact: true }).click();
  await editor
    .getByRole("button", { name: "Bruk endringer", exact: true })
    .click();
  await page.getByRole("button", { name: "Lagre", exact: true }).click();
  expect(
    data.saved().items.find((i) => i.id === "custom:portrait_charger")!.config
      .image,
  ).toBe("equipment-charger");
  await page.reload();
  await expect(cell.locator(".mobile-card-product img")).toHaveAttribute(
    "src",
    /charger.webp$/,
  );
  await page.route("**/home/equipment/movement.webp", (route) => route.abort());
  await page.route("**/home/equipment/charger.webp", (route) => route.abort());
  // Use automatic art again to exercise the native image-failure fallback.
  data
    .saved()
    .items.find((i) => i.id === "custom:portrait_charger")!.config.image =
    "auto";
  await page.reload();
  data
    .saved()
    .items.find((i) => i.id === "custom:portrait_motion")!.config.image =
    "auto";
  await page.reload();
  const motion = page.locator('[data-card="custom:portrait_motion"]');
  await motion.scrollIntoViewIfNeeded();
  await expect(motion.locator(".art-movement svg")).toBeVisible();
  await cell.scrollIntoViewIfNeeded();
  await expect(cell.locator(".art-charger svg")).toBeVisible();
  expect(data.commands).toHaveLength(0);
});
