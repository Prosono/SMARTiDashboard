import {
  test,
  expect,
  type Page,
} from "../../frontend/node_modules/@playwright/test";

async function login(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("smarti-home-style", "harmony");
    localStorage.setItem("smarti-theme", "light");
  });
  await page.route("**/api/home/experience", (route) =>
    route.fulfill({ json: { mode: "advanced" } }),
  );
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(page.locator(".home-overview")).toBeVisible();
}
async function read(page: Page, mobile: boolean) {
  return (
    await page.request.get(
      `/api/home/layout/lights${mobile ? "?surface=mobile" : ""}`,
    )
  ).json();
}
async function write(page: Page, mobile: boolean, body: unknown) {
  const session = await (await page.request.get("/api/session")).json();
  const response = await page.request.put(
    `/api/home/layout/lights${mobile ? "?surface=mobile" : ""}`,
    {
      data: body,
      headers: {
        "x-csrf-token": session.csrf,
        origin: new URL(page.url()).origin,
      },
    },
  );
  expect(response.ok()).toBe(true);
  return response.json();
}

test("phone and desktop/tablet dashboards edit independently, keep draft surface on resize and protect conflicts", async ({
  page,
  browser,
  baseURL,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  const controls = (await (await page.request.get("/api/home")).json()).controls
    .filter((c: any) => c.domain === "light")
    .slice(0, 3);
  expect(controls).toHaveLength(3);
  const items = controls.map((c: any, x: number) => ({
    id: `device:${c.entity_id}`,
    x,
    y: 0,
    w: 1,
    h: 2,
  }));
  const initialDesktop = await read(page, false),
    initialMobile = await read(page, true);
  const desktopSeed = await write(page, false, {
    revision: initialDesktop.revision,
    items,
    group_by_room: false,
  });
  const mobileSeed = await write(page, true, {
    revision: initialMobile.revision,
    items,
    group_by_room: false,
  });
  const phoneContext = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const phone = await phoneContext.newPage();
  const commands: string[] = [];
  for (const p of [page, phone])
    p.on("request", (request) => {
      if (request.method() !== "GET" && request.url().includes("/commands"))
        commands.push(request.url());
    });
  try {
    await login(phone);
    for (const p of [page, phone])
      await p.getByRole("tab", { name: "Lys", exact: true }).click();
    const desktop = page.locator('.home-canvas[data-page="lights"]'),
      mobile = phone.locator('.home-canvas[data-page="lights"]');
    await expect(desktop).toHaveAttribute("data-layout-surface", "desktop");
    await expect(mobile).toHaveAttribute("data-layout-surface", "mobile");
    await page
      .getByRole("button", { name: "Rediger oppsett", exact: true })
      .click();
    await desktop
      .getByRole("button", { name: `Fjern ${controls[0].name}`, exact: true })
      .click();
    await desktop.getByRole("button", { name: "Lagre", exact: true }).click();
    const desktopSaved = await read(page, false);
    expect(desktopSaved.items).toHaveLength(2);
    expect(await read(phone, true)).toEqual(mobileSeed);
    await expect(mobile.locator(".phone-light")).toHaveCount(3);
    await phone
      .getByRole("button", { name: "Rediger oppsett", exact: true })
      .click();
    await expect(mobile.locator(".mobile-layout-toolbar")).toContainText(
      "Mobiloppsett",
    );
    await expect(mobile.locator(".home-canvas-resize-tools")).toHaveCount(0);
    await expect(mobile.locator(".home-canvas-card-tools")).toHaveCount(0);
    await expect(mobile.locator(".mobile-layout-row")).toHaveCount(3);
    expect(
      await mobile
        .locator(".mobile-layout-main-actions")
        .evaluate((el) => el.getBoundingClientRect().height),
    ).toBeLessThanOrEqual(48);
    await mobile
      .getByRole("button", {
        name: `Valg for ${controls[0].name}`,
        exact: true,
      })
      .click();
    await phone
      .getByRole("button", { name: "Rediger kort", exact: true })
      .click();
    await phone
      .getByRole("textbox", { name: "Navn på kortet", exact: true })
      .fill("Mobilfavoritt");
    await phone
      .getByRole("button", { name: "Bruk endringer", exact: true })
      .click();
    await mobile
      .getByRole("button", {
        name: `Valg for ${controls[2].name}`,
        exact: true,
      })
      .click();
    await phone
      .getByRole("button", { name: "Fjern kort", exact: true })
      .click();
    await expect(mobile.locator(".mobile-layout-row")).toHaveCount(2);
    // Keyboard sorting is available without exposing multiple buttons on every card.
    await mobile
      .getByRole("button", { name: "Flytt Mobilfavoritt", exact: true })
      .focus();
    await phone.keyboard.press("ArrowDown");
    await expect(mobile.locator(".mobile-layout-row").first()).toContainText(
      controls[1].name,
    );
    const handle = mobile.getByRole("button", {
      name: `Flytt ${controls[1].name}`,
      exact: true,
    });
    const from = (await handle.boundingBox())!;
    const to = (await mobile
      .locator(".mobile-layout-row")
      .last()
      .boundingBox())!;
    await phone.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await phone.mouse.down();
    await phone.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
      steps: 8,
    });
    await phone.mouse.up();
    await expect(mobile.locator(".mobile-layout-row").first()).toContainText(
      "Mobilfavoritt",
    );
    await mobile
      .getByRole("button", { name: "Flytt Mobilfavoritt", exact: true })
      .press("ArrowDown");
    // Changing breakpoint must not redirect an already-open phone draft to desktop.
    await phone.setViewportSize({ width: 834, height: 1112 });
    await expect(mobile).toHaveAttribute("data-editing-surface", "mobile");
    await phone.getByRole("button", { name: "Lagre", exact: true }).click();
    await expect(mobile).toHaveAttribute("data-layout-surface", "desktop");
    const phoneSaved = await read(phone, true);
    expect(phoneSaved.revision).toBe(mobileSeed.revision + 1);
    expect(phoneSaved.items.map((item: any) => item.id).sort()).toEqual(
      items
        .slice(0, 2)
        .map((item: any) => item.id)
        .sort(),
    );
    expect(
      phoneSaved.items.find((item: any) => item.id === items[0].id).config
        .title,
    ).toBe("Mobilfavoritt");
    expect(await read(page, false)).toEqual(desktopSaved);
    await phone.setViewportSize({ width: 390, height: 844 });
    await expect(mobile).toHaveAttribute("data-layout-surface", "mobile");
    await expect(mobile.locator(".phone-light")).toHaveCount(2);
    await expect(mobile).toContainText("Mobilfavoritt");
    await phone.reload();
    await phone.getByRole("tab", { name: "Lys", exact: true }).click();
    await expect(mobile).toContainText("Mobilfavoritt");
    await page.reload();
    await page.getByRole("tab", { name: "Lys", exact: true }).click();
    await expect(desktop).not.toContainText("Mobilfavoritt");
    expect(await read(page, false)).toEqual(desktopSaved);
    await phone
      .getByRole("button", { name: "Rediger oppsett", exact: true })
      .click();
    for (const width of [320, 390, 430]) {
      await phone.setViewportSize({ width, height: 844 });
      expect(
        await phone.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
      ).toBeLessThanOrEqual(1);
    }
    await phone.screenshot({
      path: "/private/tmp/smarti-108-mobile-editor.png",
      fullPage: true,
      animations: "disabled",
    });
    for (const image of await mobile
      .locator(".mobile-layout-thumbnail img")
      .all()) {
      expect(
        await image.evaluate((el) => {
          const art = el.getBoundingClientRect(),
            frame = el
              .closest(".mobile-layout-thumbnail")!
              .getBoundingClientRect();
          return art.top >= frame.top - 1 && art.bottom <= frame.bottom + 1;
        }),
      ).toBe(true);
    }
    await phone
      .getByRole("button", { name: "Valg for mobiloppsett", exact: true })
      .click();
    await phone
      .getByRole("button", { name: "Tøm oppsett", exact: true })
      .click();
    await expect(mobile.locator(".mobile-layout-row")).toHaveCount(0);
    await phone.getByRole("button", { name: "Avbryt", exact: true }).click();
    expect(await read(phone, true)).toEqual(phoneSaved);
    await phone
      .getByRole("button", { name: "Rediger oppsett", exact: true })
      .click();
    const external = await write(page, true, { ...phoneSaved, items: [] });
    await phone.getByRole("button", { name: "Lagre", exact: true }).click();
    await expect(mobile.getByRole("status")).toContainText(
      "endret i et annet vindu",
    );
    await expect(mobile.locator(".mobile-layout-row")).toHaveCount(2);
    expect(await read(phone, true)).toEqual(external);
    expect(await read(page, false)).toEqual(desktopSaved);
    expect(commands).toHaveLength(0);
    await phone.getByRole("button", { name: "Avbryt", exact: true }).click();
  } finally {
    await phoneContext.close();
    // Restore deterministic demo layouts for any later browser scenario.
    for (const mobile of [false, true]) {
      const current = await read(page, mobile);
      await write(page, mobile, {
        revision: current.revision,
        items,
        group_by_room: false,
      });
    }
  }
  expect(desktopSeed.revision).toBeGreaterThan(0);
});
