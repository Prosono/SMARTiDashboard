import {
  test,
  expect,
  type Page,
} from "../../frontend/node_modules/@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(page.locator(".home-welcome")).toBeVisible();
});
async function swipe(page: Page, selector: string, dx: number, dy = 0) {
  const target = page.locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  const x = box.x + (dx < 0 ? box.width * 0.85 : box.width * 0.15),
    y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  for (let i = 1; i <= 5; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + (dx * i) / 5, y: y + (dy * i) / 5 }],
    });
    await page.waitForTimeout(20);
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await cdp.detach();
}
test("five views support keyboard, real touch swipes and control gesture isolation", async ({
  page,
}) => {
  const tabs = page.getByRole("tablist", { name: "Visninger i Hjem" });
  await expect(tabs.getByRole("tab")).toHaveCount(5);
  await tabs.getByRole("tab", { name: "Oversikt", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Lys", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".home-welcome")).toHaveCount(0);
  await expect(page.locator(".home-lights")).toContainText("Pendellampe");
  await page.getByLabel("Søk i rom og enheter").fill("Kjøkken");
  await expect(page.locator(".home-room-control-group")).toHaveCount(1);
  await expect(page.locator(".home-room-control-group")).toContainText(
    "Kjøkkenbenk",
  );
  await page.getByLabel("Søk i rom og enheter").fill("");
  // Begin on the dimmer: its horizontal gesture must never change the page.
  await swipe(page, '.home-lights input[type="range"]', -80);
  await expect(
    page.getByRole("tab", { name: "Lys", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await swipe(page, ".home-view-heading p", -100);
  await expect(
    page.getByRole("tab", { name: "Energi", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".home-empty-view")).toContainText(
    "Her kommer energien din",
  );
  await swipe(page, ".home-empty-view p", 100);
  await expect(
    page.getByRole("tab", { name: "Lys", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await swipe(page, ".home-view-heading p", 5, 75);
  await expect(
    page.getByRole("tab", { name: "Lys", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Lys", exact: true }).focus();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("tab", { name: "Klima", exact: true }),
  ).toBeFocused();
  await expect(page.locator(".home-climate")).toContainText("Gulvvarme");
  await page.keyboard.press("Home");
  await expect(
    page.getByRole("tab", { name: "Oversikt", exact: true }),
  ).toBeFocused();
});
test("presence and security warnings remain honest online and offline", async ({
  page,
}) => {
  const base = await (await page.request.get("/api/home")).json();
  const control = (id: string, state: string) => ({
    id,
    entity_id: id,
    domain: "person",
    name: id.split(".")[1],
    state,
    availability: state === "unknown" ? "unknown" : "available",
    attributes: {},
    capabilities: [],
    area_id: null,
    device_id: null,
    diagnostic: false,
  });
  let data = {
    ...base,
    mode: "live",
    controls: [
      ...base.controls,
      control("person.Ada", "home"),
      control("person.Ola", "not_home"),
      control("person.Liv", "unknown"),
      {
        ...control("binary_sensor.Røyk", "on"),
        domain: "binary_sensor",
        attributes: { device_class: "smoke" },
      },
    ],
  };
  await page.route("**/api/home", (r) => r.fulfill({ json: data }));
  await page.reload();
  const presence = page.getByRole("region", { name: "Hvem er hjemme" });
  await expect(presence.locator("li").filter({ hasText: "Ada" })).toContainText(
    "Hjemme",
  );
  await expect(presence.locator("li").filter({ hasText: "Ola" })).toContainText(
    "Borte",
  );
  await expect(presence.locator("li").filter({ hasText: "Liv" })).toContainText(
    "Ukjent",
  );
  await expect(page.locator(".home-alert-banner")).toContainText("Røyk");
  await page.locator(".home-alert-banner").click();
  await expect(
    page.getByRole("tab", { name: "Sikkerhet", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  data = { ...data, connected: false };
  await page.reload();
  await expect(presence.locator("li").filter({ hasText: "Ada" })).toContainText(
    "Ukjent",
  );
  for (const width of [320, 834, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const name of ["Oversikt", "Lys", "Energi", "Sikkerhet", "Klima"]) {
      await page.getByRole("tab", { name, exact: true }).click();
      expect(
        await page
          .locator("body")
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
    }
  }
  data = { ...data, connected: true };
  await page.reload();
  await page.setViewportSize({
    width: test.info().project.name === "mobile" ? 390 : 1440,
    height: 900,
  });
  await page.getByRole("tab", { name: "Oversikt", exact: true }).click();
  await page.screenshot({
    animations: "disabled",
    path: `../artifacts/${test.info().project.name}-home-tabs.png`,
    fullPage: true,
  });
});

test("mobile and dark room controls keep navigation readable", async ({
  page,
}) => {
  await page.getByRole("tab", { name: "Lys", exact: true }).click();
  await page.screenshot({
    path: `../artifacts/${test.info().project.name}-lights-tab.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Mørkt", exact: true }).click();
  await page.getByRole("tab", { name: "Klima", exact: true }).click();
  await page.screenshot({
    path: `../artifacts/${test.info().project.name}-climate-dark-tab.png`,
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page
      .locator("body")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
});
