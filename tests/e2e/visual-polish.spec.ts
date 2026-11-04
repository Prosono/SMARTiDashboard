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
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(page.locator(".home-overview")).toBeVisible();
}

test("phone dialogs do not focus the whole panel and shared artwork follows device state on phone and tablet", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const base = await (await page.request.get("/api/home")).json();
  const make = (id: string, name: string, dc: string, state = "off") => ({
    id,
    entity_id: id,
    name,
    domain: id.split(".")[0],
    attributes: { device_class: dc },
    state,
    availability: "available",
    diagnostic: false,
    area_id: "living",
    device_id: null,
    capabilities: [],
    updated_at: null,
    integration: null,
  });
  const window = make("binary_sensor.window", "Vindu Stue", "window", "on");
  const controls = [
    window,
    make("binary_sensor.movement", "Bevegelse Gang", "motion"),
    make("binary_sensor.presence", "Tilstedeværelse Stue", "occupancy"),
    make("switch.rocker", "Lysbryter", "", "on"),
  ];
  await page.route("**/api/home", (route) =>
    route.fulfill({
      json: {
        ...base,
        controls: [
          ...base.controls.filter((c: any) => c.domain === "light"),
          ...controls,
        ],
        favorites: [],
        connected: true,
        areas: [{ area_id: "living", name: "Stue" }],
      },
    }),
  );
  await page.route("**/api/home/layout/*", (route) =>
    route.fulfill({ json: { revision: 0, items: null, group_by_room: true } }),
  );
  await page.reload();
  await page.getByRole("tab", { name: "Sikkerhet", exact: true }).click();
  const panel = page.getByRole("tabpanel");
  await expect(panel).not.toHaveAttribute("tabindex", "0");
  for (const file of ["window-open", "movement", "presence"]) {
    const image = panel.locator(`img[src*="/equipment/${file}.webp"]`).first();
    await expect(image).toBeVisible();
    expect(
      await image.evaluate((el) => (el as HTMLImageElement).naturalWidth),
    ).toBeGreaterThan(0);
  }
  for (let n = 0; n < 3; n++) {
    await panel.getByRole("button", { name: /Vindu Stue.*detaljer/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page
      .getByRole("button", { name: "Lukk innstillinger", exact: true })
      .last()
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await panel.evaluate((el) => el === document.activeElement)).toBe(
      false,
    );
    expect(
      await panel.evaluate((el) => getComputedStyle(el).outlineStyle),
    ).toBe("none");
  }
  const selectedTab = page.getByRole("tab", { name: "Sikkerhet", exact: true });
  await selectedTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Klima", exact: true }),
  ).toBeFocused();
  await expect(page.getByRole("tab", { name: "Klima", exact: true })).toHaveCSS(
    "outline-style",
    "solid",
  );
  await page
    .getByRole("tab", { name: "Diverse", exact: true })
    .or(page.getByRole("tab", { name: "Mer", exact: true }))
    .click();
  await expect(
    page.locator('.phone-misc-toggle img[src*="/equipment/switch.webp"]'),
  ).toBeVisible();
  window.state = "off";
  await page.reload();
  await page.getByRole("tab", { name: "Sikkerhet", exact: true }).click();
  await expect(panel.locator('img[src*="window-closed.webp"]')).toBeVisible();
  await page.screenshot({
    path: `/private/tmp/smarti-110-artwork-phone-${info.project.name}.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1024, height: 1000 });
  for (const file of ["window-closed", "movement", "presence"])
    await expect(
      panel.locator(`.equipment-art img[src*="/${file}.webp"]`).first(),
    ).toBeVisible();
  await page.getByRole("tab", { name: "Oversikt", exact: true }).click();
  await expect(
    page.locator(".simple-date-day .calendar-artwork img"),
  ).toBeVisible();
  await expect(
    page.locator(".simple-date-day .calendar-artwork > strong"),
  ).toHaveText(String(new Date().getDate()));
  await page.screenshot({
    path: `/private/tmp/smarti-110-artwork-tablet-${info.project.name}.png`,
    fullPage: true,
    animations: "disabled",
  });
});

test("camera recovers a failed startup, decodes video and releases the preview when the full card opens", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  const base = await (await page.request.get("/api/home")).json();
  const camera = {
    id: "camera.test",
    entity_id: "camera.test",
    name: "Testkamera",
    domain: "camera",
    state: "idle",
    attributes: {},
    availability: "available",
    diagnostic: false,
    area_id: "living",
    device_id: null,
    capabilities: [],
  };
  await page.route("**/api/home", (route) =>
    route.fulfill({
      json: {
        ...base,
        controls: [
          ...base.controls.filter((c: any) => c.domain !== "camera"),
          camera,
        ],
        connected: true,
      },
    }),
  );
  await page.route("**/api/home/layout/security*", (route) =>
    route.fulfill({
      json: {
        revision: 0,
        items: [{ id: "camera:camera.test", x: 0, y: 0, w: 1, h: 1 }],
        group_by_room: false,
      },
    }),
  );
  let starts = 0;
  const stopped: string[] = [];
  await page.route("**/api/home/camera/camera.test/live", (route) => {
    starts++;
    return starts === 1
      ? route.fulfill({
          status: 503,
          json: { detail: "live_stream_unavailable" },
        })
      : route.fulfill({
          json: {
            id: `fixture${starts}`,
            path: `home/camera-stream/fixture${starts}/master.m3u8`,
          },
        });
  });
  await page.route("**/api/home/camera-stream/fixture**", async (route) => {
    const parts = new URL(route.request().url()).pathname.split("/");
    if (route.request().method() === "DELETE") {
      stopped.push(parts.at(-1)!);
      return route.fulfill({ json: { stopped: true } });
    }
    const name = parts.at(-1)!;
    return route.fulfill({
      path: `${info.config.rootDir}/../fixtures/live/${name}`,
      contentType: name.endsWith(".m3u8")
        ? "application/vnd.apple.mpegurl"
        : "video/mp4",
    });
  });
  await page.reload();
  await page.getByRole("tab", { name: "Sikkerhet", exact: true }).click();
  const preview = page.locator(".home-canvas-content .camera-live-card");
  await preview.scrollIntoViewIfNeeded();
  await expect
    .poll(
      () =>
        preview
          .locator("video")
          .evaluate((v: HTMLVideoElement) => v.currentTime),
      { timeout: 20000 },
    )
    .toBeGreaterThan(0.2);
  await expect(preview.locator(".camera-state")).toHaveText("LIVE");
  expect(starts).toBe(2);
  await page
    .getByRole("button", { name: "Vis hele kortet: Testkamera", exact: true })
    .click();
  const expanded = page.getByRole("dialog").locator(".camera-live-card");
  await expect.poll(() => stopped.includes("fixture2")).toBe(true);
  await expect(preview.locator("video")).not.toHaveAttribute("src", /./);
  await expect
    .poll(
      () =>
        expanded
          .locator("video")
          .evaluate((v: HTMLVideoElement) => v.currentTime),
      { timeout: 20000 },
    )
    .toBeGreaterThan(0.2);
  await expanded
    .getByRole("button", { name: "Stopp live: Testkamera", exact: true })
    .click();
  await expect.poll(() => stopped.includes("fixture3")).toBe(true);
  await page.keyboard.press("Escape");
  await expect.poll(() => starts).toBe(4);
  await page.getByRole("tab", { name: "Oversikt", exact: true }).click();
  await expect.poll(() => stopped.includes("fixture4")).toBe(true);
});
