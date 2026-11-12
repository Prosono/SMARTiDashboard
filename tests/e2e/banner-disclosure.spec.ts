import {
  test,
  expect,
  type Page,
} from "../../frontend/node_modules/@playwright/test";

async function login(page: Page, mode = "advanced") {
  await page.route("**/api/home/experience", (route) =>
    route.fulfill({ json: { mode } }),
  );
  await page.route("**/api/home", async (route) => {
    const response = await route.fetch();
    const home = await response.json();
    const device = (
      domain: string,
      name: string,
      state: string,
      attributes = {},
    ) => ({
      id: `${domain}.banner_test`,
      entity_id: `${domain}.banner_test`,
      domain,
      name,
      state,
      attributes,
      area_id: "living",
      device_id: null,
      availability: "available",
      diagnostic: false,
      updated_at: null,
      integration: null,
      capabilities: [],
    });
    await route.fulfill({
      json: {
        ...home,
        controls: [
          ...home.controls,
          device("media_player", "Stuehøyttaler", "idle"),
          device("alarm_control_panel", "Alarm", "disarmed"),
          device("binary_sensor", "Røykvarsler", "on", {
            device_class: "smoke",
          }),
        ],
      },
    });
  });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(page.locator('[data-home-banners="off"]')).toBeVisible();
}
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "wait" });
});
const banners =
  ".home-welcome, .home-hero-stage, .category-heading, .category-summary, .home-header-photo, .simple-welcome, .media-summary-metrics";
const categories = [
  ["Lys", "Søk etter rom eller lys"],
  ["Klima", "Søk i klima"],
  ["Sikkerhet", "Søk i sikkerhet"],
  ["Multimedia", "Søk i multimedia"],
  ["Diverse", "Søk i diverse"],
];
test(`Harmoni starts with cards and reveals search from its round toolbar icon`, async ({
  page,
}, info) => {
  await login(page);
  const home = page.locator(".home-overview");
  await expect(home.locator(banners)).toHaveCount(0);
  if (info.project.name === "mobile")
    await expect(home.locator(".home-toolbar .home-date")).toBeHidden();
  else await expect(home.locator(".home-toolbar .home-date")).toBeVisible();
  const toolbar = (await home.locator(".home-toolbar").boundingBox())!;
  const tabs = (await page.getByRole("tablist").boundingBox())!;
  expect(toolbar.y + toolbar.height).toBeLessThanOrEqual(tabs.y + 1);
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    for (const [category, search] of categories) {
      const name =
        category === "Diverse" && info.project.name === "mobile"
          ? "Mer"
          : category;
      await page.getByRole("tab", { name, exact: true }).click();
      await expect(home.locator(banners)).toHaveCount(0);
      await expect(home.locator(".home-category-title")).toHaveCount(0);
      if (info.project.name === "mobile")
        await expect(
          home.getByRole("heading", { name, exact: true, level: 1 }),
        ).toBeVisible();
      else
        await expect(
          home.getByRole("heading", { name, exact: true, level: 1 }),
        ).toHaveCSS("position", "absolute");
      const input = home.getByRole("textbox", { name: search, exact: true });
      const toggle = home
        .locator(".home-toolbar")
        .getByRole("button", { name: "Vis søk og filtre", exact: true });
      await expect(input).toBeHidden();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(toggle).toHaveCSS("border-radius", "50%");
      await expect(home.locator(".toolbar-toggle")).toHaveCount(0);
      const toolbarId = (await home
        .locator("[data-collapsible-toolbar]")
        .getAttribute("id"))!;
      await expect(toggle).toHaveAttribute("aria-controls", toolbarId);
      await toggle.click();
      await expect(input).toBeVisible();
      await expect(input).toBeFocused();
      await expect(home.locator("[data-collapsible-toolbar]")).toHaveAttribute(
        "id",
        toolbarId,
      );
      await input.fill("finnes-ikke-9571");
      await expect(input).toHaveValue("finnes-ikke-9571");
      await input.clear();
      await input.press("Escape");
      await expect(input).toBeHidden();
      await expect(toggle).toBeFocused();
      expect(
        await page
          .locator("body")
          .evaluate((e) => e.scrollWidth <= e.clientWidth),
      ).toBe(true);
    }
  }
  await page.getByRole("tab", { name: "Oversikt", exact: true }).click();
  {
    const grid = home.locator(".home-canvas");
    await expect(grid).toBeVisible();
    const gridBox = (await grid.boundingBox())!;
    const tabsBox = (await page.getByRole("tablist").boundingBox())!;
    expect(gridBox.y - tabsBox.y - tabsBox.height).toBeLessThan(28);
    await expect(grid.locator(".home-canvas-toolbar")).toHaveCount(0);
    await expect(
      home.getByText("Hjemmet med et blikk", { exact: true }),
    ).toHaveCount(0);
    await page.screenshot({
      path: `/private/tmp/smarti-bannerless-${info.project.name}.png`,
      fullPage: true,
    });
  }
});

test("revealed Home searches filter devices and room selection remains available", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("smarti-home-style", "harmony"),
  );
  await login(page);
  await page.getByRole("tab", { name: "Lys", exact: true }).click();
  const canvas = page.locator('.home-canvas[data-page="lights"]');
  await expect(canvas.locator(".home-canvas-cell")).not.toHaveCount(0);
  const count = await canvas.locator(".home-canvas-cell").count();
  const search = page.getByRole("textbox", {
    name: "Søk etter rom eller lys",
    exact: true,
  });
  await page
    .getByRole("button", { name: "Vis søk og filtre", exact: true })
    .click();
  await search.fill("finnes-ikke-9571");
  await expect(canvas.locator(".home-canvas-cell")).toHaveCount(0);
  await search.clear();
  await expect(canvas.locator(".home-canvas-cell")).toHaveCount(count);
  const room = page
    .getByRole("group", { name: "Filtrer og styr lys", exact: true })
    .getByLabel("Velg rom", { exact: true });
  await room.selectOption("room:kitchen");
  await expect(canvas).toContainText("Kjøkkenbenk");
  await expect(canvas).not.toContainText("Pendellampe");
  await room.selectOption("all");
});

test("red alert stays accessible above tabs and respects reduced motion", async ({
  page,
}, info) => {
  await page.addInitScript(() =>
    localStorage.setItem("smarti-home-style", "harmony"),
  );
  await login(page);
  const alert = page.locator(".home-toolbar-alert");
  await expect(alert).toBeVisible();
  await expect(alert).toHaveAccessibleName(/Trenger din oppmerksomhet: [1-9]/);
  await expect(alert.locator("span")).toHaveCSS(
    "background-color",
    "rgb(198, 50, 34)",
  );
  if (info.project.name === "mobile") {
    await expect(alert.locator(".phone-alert-bell")).toBeVisible();
  } else {
    await expect(alert).toHaveCSS("color", "rgb(212, 59, 41)");
    expect(
      await alert.evaluate(
        (e) => getComputedStyle(e, "::before").animationName,
      ),
    ).toBe("harmony-alert-pulse");
  }
  await alert.click();
  await expect(
    page.getByRole("dialog", {
      name: "Trenger din oppmerksomhet",
      exact: true,
    }),
  ).toContainText("Røykvarsler");
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Lys", exact: true }).click();
  await alert.click();
  await expect(
    page.getByRole("dialog", {
      name: "Trenger din oppmerksomhet",
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await alert.evaluate((e) => getComputedStyle(e, "::before").animationName),
  ).toBe("none");
});

test("simple Home omits banners but keeps search on its category destinations", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("smarti-home-style", "classic"),
  );
  await login(page, "simple");
  const simple = page.locator(".simple-home-dashboard");
  await expect(simple.locator(banners)).toHaveCount(0);
  await expect(simple.locator(".home-toolbar .home-date")).toBeVisible();
  for (const [button, search] of [
    ["Diverse", "Søk i diverse"],
    ["Musikk og TV", "Søk i multimedia"],
    ["Kameraer og trygghet", "Søk i sikkerhet"],
  ]) {
    const fullCard = simple.getByRole("button", {
      name: "Vis hele kortet: Rom og alle enheter",
      exact: true,
    });
    let surface = simple;
    if (await fullCard.isVisible()) {
      await fullCard.click();
      surface = page.getByRole("dialog", {
        name: "Rom og alle enheter",
        exact: true,
      });
    }
    const browse = surface.locator(".simple-dashboard-browse");
    if ((await browse.getAttribute("open")) === null)
      await browse.locator("summary").first().click();
    await surface.getByRole("button", { name: button, exact: true }).click();
    await expect(simple.locator(banners)).toHaveCount(0);
    await expect(
      simple.getByRole("textbox", { name: search, exact: true }),
    ).toBeHidden();
    await simple
      .getByRole("button", { name: "Vis søk og filtre", exact: true })
      .click();
    await expect(
      simple.getByRole("textbox", { name: search, exact: true }),
    ).toBeVisible();
    await simple
      .getByRole("button", { name: "← Tilbake til hjemmet", exact: true })
      .click();
  }
});

test("device management retains its own heading and collapsible toolbar", async ({
  page,
}) => {
  await login(page);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Enheter", exact: true })
    .click();
  await page.locator(".device-toolbar select").selectOption("light");
  const lights = page.locator(".light-overview");
  await expect(lights.locator(".category-heading")).toBeVisible();
  await expect(lights.locator("[data-collapsible-toolbar]")).toBeHidden();
  await lights
    .getByRole("button", { name: "Vis søk og filtre", exact: true })
    .click();
  await expect(
    lights.getByRole("textbox", {
      name: "Søk etter rom eller lys",
      exact: true,
    }),
  ).toBeVisible();
});

test("the top settings icon edits the active canvas and returns focus after cancel or save", async ({
  page,
}, info) => {
  await page.addInitScript(() =>
    localStorage.setItem("smarti-home-style", "harmony"),
  );
  await login(page);
  const toolbar = page.locator(".home-toolbar");
  for (const name of [
    "Oversikt",
    "Lys",
    "Klima",
    "Sikkerhet",
    "Multimedia",
    info.project.name === "mobile" ? "Mer" : "Diverse",
  ]) {
    await page.getByRole("tab", { name, exact: true }).click();
    const canvas = page.locator(".home-canvas");
    await expect(canvas.locator(".home-canvas-toolbar")).toHaveCount(0);
    await expect(
      canvas.getByRole("button", { name: "Rediger oppsett", exact: true }),
    ).toHaveCount(0);
    const settings = toolbar.getByRole("button", {
      name: "Rediger oppsett",
      exact: true,
    });
    await expect(settings).toBeEnabled();
    await expect(settings).toHaveCSS("border-radius", "50%");
    await expect(settings).toHaveAttribute(
      "aria-controls",
      (await canvas.getAttribute("id"))!,
    );
    await settings.click();
    await expect(canvas).toHaveAttribute("data-editing", "true");
    await expect(settings).toHaveAttribute("aria-pressed", "true");
    if (info.project.name === "mobile") {
      await expect(canvas.locator(".mobile-layout-editor")).toBeVisible();
      await expect(canvas.locator(".home-canvas-resize-tools")).toHaveCount(0);
    } else
      await expect(
        canvas.locator(".home-canvas-content").first(),
      ).toHaveAttribute("inert", "");
    await settings.click();
    await expect(canvas).toHaveAttribute("data-editing", "true");
    if (name === "Oversikt" && info.project.name !== "mobile") {
      await canvas
        .getByRole("button", { name: "Tilpass Hjem", exact: true })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Tilpass Hjem", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
    }
    await canvas.getByRole("button", { name: "Avbryt", exact: true }).click();
    await expect(canvas).toHaveAttribute("data-editing", "false");
    await expect(settings).toBeFocused();
    await expect(canvas.locator(".home-canvas-toolbar")).toHaveCount(0);
  }
  await page.getByRole("tab", { name: "Lys", exact: true }).click();
  const settings = toolbar.getByRole("button", {
    name: "Rediger oppsett",
    exact: true,
  });
  await settings.click();
  await page
    .locator(".home-canvas")
    .getByRole("button", { name: "Lagre", exact: true })
    .click();
  await expect(settings).toHaveAttribute("aria-pressed", "false");
  await expect(settings).toBeFocused();
  await page.reload();
  await page.getByRole("tab", { name: "Lys", exact: true }).click();
  await expect(page.locator(".home-canvas")).toHaveAttribute(
    "data-editing",
    "false",
  );
  await expect(
    page.getByRole("textbox", { name: "Søk etter rom eller lys", exact: true }),
  ).toBeHidden();
  await page.screenshot({
    path: `/private/tmp/smarti-toolbar-lights-${info.project.name}.png`,
  });
});
