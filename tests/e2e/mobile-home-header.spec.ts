import {
  expect,
  test,
  type Locator,
  type Page,
} from "../../frontend/node_modules/@playwright/test";
import type { Control } from "../../frontend/src/types";

async function openHome(
  page: Page,
  mode: "advanced" | "normal" | "simple" = "advanced",
  additionalControls: Control[] = [],
) {
  await page.route("**/api/home/experience", (route) =>
    route.fulfill({ json: { mode } }),
  );
  await page.route("**/api/home", async (route) => {
    const response = await route.fetch();
    const home = await response.json();
    await route.fulfill({
      response,
      json: {
        ...home,
        home_name: "Testboligen",
        controls: [...home.controls, ...additionalControls],
      },
    });
  });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(
    page.locator(
      mode === "simple" ? ".simple-home-dashboard" : ".home-overview",
    ),
  ).toBeVisible();
}

async function expectFocusedPhoneSearch(input: Locator) {
  await expect(input).toBeFocused();
  await expect
    .poll(() =>
      input.evaluate((element) =>
        parseFloat(getComputedStyle(element).fontSize),
      ),
    )
    .toBeGreaterThanOrEqual(16);
}

async function expectSingleRow(
  toolbar: Locator,
  title: string,
  search: string,
) {
  await expect(toolbar).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(toolbar).toHaveCSS("box-shadow", "none");
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

  for (const [width, theme] of [
    [393, "light"],
    [320, "dark"],
  ] as const) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(
      (value) => (document.documentElement.dataset.theme = value),
      theme,
    );
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
    await expectFocusedPhoneSearch(input);
    await input.press("Escape");
    await expect(input).toBeHidden();
  }

  await page.setViewportSize({ width: 834, height: 1112 });
  await expect(toolbar.locator(".mobile-home-switcher")).toBeHidden();
  await expect(toolbar.locator(".home-date")).toBeVisible();
  await expect(toolbar.getByText("Testboligen", { exact: true })).toBeVisible();
});

for (const mode of ["advanced", "normal", "simple"] as const) {
  test(`the compact header finds and opens devices from the overview in ${mode} mode`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 393, height: 844 });
    await openHome(page, mode);
    const overview = page.locator(
      mode === "simple" ? ".simple-home-dashboard" : ".home-overview",
    );
    const search = overview.getByRole("button", {
      name: "Søk etter enheter",
      exact: true,
    });

    await search.click();
    const dialog = page.getByRole("dialog", {
      name: "Søk etter enheter",
      exact: true,
    });
    const input = dialog.getByRole("searchbox", {
      name: "Finn en enhet",
      exact: true,
    });
    const result = dialog.getByRole("button", {
      name: "Åpne Pendellampe",
      exact: true,
    });
    await expectFocusedPhoneSearch(input);

    await input.fill("Stue");
    await expect(result).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Åpne Kjøkkenbenk", exact: true }),
    ).toHaveCount(0);
    await input.fill("pendellampe");
    await expect(result).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Åpne Gulvlampe", exact: true }),
    ).toHaveCount(0);
    await result.click();

    const device = page.getByRole("dialog", {
      name: "Pendellampe",
      exact: true,
    });
    await expect(device).toBeVisible();
    await expect(page.locator(".devices-page")).toHaveCount(0);
    await device
      .getByRole("button", { name: "Lukk enhetsdetaljer", exact: true })
      .click();
    await expect(device).toBeHidden();
    await expect(dialog).toBeVisible();
    await expect(input).toHaveValue("pendellampe");
    await expect(result).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(search).toBeFocused();
    if (mode === "simple") {
      await expect(
        overview.getByRole("heading", { name: "Oversikt", exact: true }),
      ).toBeVisible();
    } else {
      await expect(
        overview.getByRole("tab", { name: "Oversikt", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
    }
  });
}

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

test("workspace pages share a compact mobile top bar and keep search on the open page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await openHome(page);
  const menu = page.getByRole("navigation", { name: "Hovedmeny" });
  const bar = page.locator(".workspace-phone-topbar");
  const logo = bar.getByRole("button", { name: /Mine hjem/ });
  const search = bar.locator(".page-topbar-search");
  const alert = bar.getByRole("button", {
    name: /Vis varsler|Trenger din oppmerksomhet/,
  });
  for (const [destination, title] of [
    ["Rom", "Rom"],
    ["Enheter", "Enheter"],
    ["Automasjoner", "Automasjoner"],
    ["Utvidelser", "Utvidelser"],
    ["Oppdateringer", "Oppdateringer"],
    ["Rapporter og innsikt", "Rapporter"],
    ["Support", "Support"],
    ["Innstillinger", "Innstillinger"],
  ]) {
    await menu.getByRole("button", { name: destination, exact: true }).click();
    await expect(page.locator(".phone-topbar:visible")).toHaveCount(1);
    await expect(logo).toBeVisible();
    const label = bar.locator(".phone-page-heading");
    await expect(label).toHaveText(title);
    await expect
      .poll(() =>
        label.evaluate((element) => element.scrollWidth <= element.clientWidth),
      )
      .toBe(true);
    await expect(alert).toBeVisible();
    await expect(bar).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(bar).toHaveCSS("box-shadow", "none");
    if (destination === "Support") await expect(search).toHaveCount(0);
  }

  await menu
    .getByRole("button", { name: "Rapporter og innsikt", exact: true })
    .click();
  await page.getByRole("tab", { name: /Grafer og historikk/ }).click();
  await expect(search).toHaveAccessibleName("Søk i historikken");
  await search.click();
  await expectFocusedPhoneSearch(
    page.getByRole("textbox", { name: "Søk etter enhet" }),
  );
  await menu
    .getByRole("button", { name: "Innstillinger", exact: true })
    .click();

  await expect(search).toHaveAccessibleName("Søk i innstillinger");
  await search.click();
  const searchDialog = page.getByRole("dialog", {
    name: "Søk i innstillinger",
  });
  const searchInput = searchDialog.getByRole("searchbox");
  await expectFocusedPhoneSearch(searchInput);
  await searchInput.fill("skjerm");
  await expect(
    searchDialog.getByRole("button", { name: "Nettverk" }),
  ).toHaveCount(0);
  await searchDialog.getByRole("button", { name: "Skjermsparer" }).click();
  await expect(searchDialog).toBeHidden();
  await expect(
    menu.getByRole("button", { name: "Innstillinger", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  await menu.getByRole("button", { name: "Enheter", exact: true }).click();
  await expect(search).toHaveAccessibleName("Søk etter kontroll eller rom");
  await search.click();
  const devices = page.locator(".devices-page");
  const deviceSearch = devices.getByRole("searchbox", {
    name: "Søk etter kontroll eller rom",
  });
  await expectFocusedPhoneSearch(deviceSearch);
  await deviceSearch.fill("Pendellampe");
  const results = devices.locator(".devices-control-list");
  await expect(results).toContainText("Pendellampe");
  await expect(results).not.toContainText("Kjøkkenbenk");

  await expect(alert).toBeVisible();
  await alert.click();
  const alerts = page.getByRole("dialog", {
    name: "Trenger din oppmerksomhet",
  });
  await expect(alerts).toBeVisible();
  await alerts.getByRole("button", { name: "Lukk innstillinger" }).click();
  await expect(alerts).toBeHidden();

  await bar
    .getByRole("button", { name: "Åpne innstillinger", exact: true })
    .click();
  await expect(bar.locator(".phone-page-heading")).toHaveText("Innstillinger");
  await page.setViewportSize({ width: 834, height: 1112 });
  await expect(bar).toBeHidden();
  await expect(page.locator(".workspace > .topbar")).toBeVisible();
});

test("search and alert headers stay within the safe area on a short phone screen", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Safe area emulation requires Chromium.",
  );
  await page.setViewportSize({ width: 393, height: 844 });
  const alerts: Control[] = Array.from({ length: 12 }, (_, index) => {
    const id = `binary_sensor.phone_alert_${index}`;
    return {
      id,
      entity_id: id,
      device_id: null,
      area_id: "living",
      name: `Røykvarsler ${index + 1}`,
      domain: "binary_sensor",
      state: "on",
      attributes: { device_class: "smoke" },
      capabilities: [],
      availability: "available",
      updated_at: null,
      integration: null,
      diagnostic: false,
    };
  });
  await openHome(page, "advanced", alerts);
  const cdp = await page.context().newCDPSession(page);
  const height = 420;
  for (const { width, top, bottom } of [
    { width: 320, top: 0, bottom: 0 },
    { width: 393, top: 59, bottom: 34 },
  ]) {
    await page.setViewportSize({ width, height });
    await cdp.send("Emulation.setSafeAreaInsetsOverride", {
      insets: { top, bottom },
    });

    for (const { trigger, title, closeLabel } of [
      {
        trigger: "Søk etter enheter",
        title: "Søk etter enheter",
        closeLabel: "Lukk søk",
      },
      {
        trigger: /^Trenger din oppmerksomhet:/,
        title: "Trenger din oppmerksomhet",
        closeLabel: "Lukk innstillinger",
      },
    ]) {
      await page.getByRole("button", { name: trigger }).click();
      const dialog = page.getByRole("dialog", { name: title, exact: true });
      const heading = dialog.getByRole("heading", { name: title, exact: true });
      const close = dialog.getByRole("button", {
        name: closeLabel,
        exact: true,
      });
      await expect(dialog).toBeVisible();

      const bounds = (await dialog.boundingBox())!;
      expect(bounds.y).toBeGreaterThanOrEqual(Math.max(32, top + 12) - 1);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(
        height - bottom - 11,
      );

      const scrollTop = await dialog
        .locator(".dashboard-settings-content")
        .evaluate((content) => {
          content.scrollTop = content.scrollHeight;
          return content.scrollTop;
        });
      expect(scrollTop).toBeGreaterThan(0);
      await expect(heading).toBeInViewport({ ratio: 1 });
      await expect(close).toBeInViewport({ ratio: 1 });
      await close.click();
      await expect(dialog).toBeHidden();
    }
  }
  await cdp.detach();
});
