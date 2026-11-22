import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("screensaver previews today's agenda, follows idle time, and saves the choices", async ({
  page,
}, info) => {
  await page.clock.install({ time: new Date("2026-11-16T12:00:00Z") });
  await page.route("**/api/home", async (route) => {
    const response = await route.fetch();
    const home = await response.json();
    await route.fulfill({
      response,
      json: {
        ...home,
        controls: [
          ...home.controls,
          {
            id: "weather.demo",
            entity_id: "weather.demo",
            name: "Testværet",
            domain: "weather",
            state: "cloudy",
            availability: "available",
            attributes: { temperature: 7.5, temperature_unit: "°C" },
            area_id: null,
            device_id: null,
            capabilities: [],
          },
        ],
      },
    });
  });
  await page.route("**/api/home/calendar", (route) =>
    route.fulfill({
      json: {
        today: "2026-11-16",
        timezone: "Europe/Oslo",
        calendars: ["calendar.demo"],
        sources: [],
      },
    }),
  );
  await page.route("**/api/home/calendar/events?start=*", (route) =>
    route.fulfill({
      json: {
        days: {
          "2026-11-16": [
            {
              start: "2026-11-16T17:00:00+01:00",
              end: "2026-11-16T18:00:00+01:00",
              summary: "Testavtale",
              all_day: false,
            },
          ],
        },
        failed: [],
      },
    }),
  );
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page
    .getByRole("button", { name: "Innstillinger", exact: true })
    .first()
    .click();
  const openSettings = page.getByRole("button", {
    name: "Skjermsparer",
    exact: true,
  });
  await expect(openSettings).toBeInViewport();
  await openSettings.click();
  const panel = page.locator(".screensaver-settings");
  const screensaver = page.getByRole("dialog", { name: "Skjermsparer" });
  await expect(panel.getByLabel("Start etter")).toHaveValue("0");
  await panel.getByRole("button", { name: "Forhåndsvis" }).click();
  await expect(screensaver).toBeVisible();
  await expect(screensaver.locator("time")).toBeVisible();
  await expect(screensaver).toContainText("16. november");
  await expect(screensaver.locator(".screensaver-weather")).toContainText(
    "Skyet",
  );
  await expect(
    screensaver.getByRole("region", { name: "Dagens kalender" }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(screensaver).toHaveCount(0);
  await expect(
    panel.getByRole("button", { name: "Forhåndsvis" }),
  ).toBeFocused();

  await panel.getByLabel("Dagens kalender", { exact: true }).check();
  await panel.getByLabel("Vær", { exact: true }).uncheck();
  await panel.getByLabel("Start etter").selectOption("1");
  await page.clock.fastForward(40_000);
  await expect(screensaver).toHaveCount(0);
  await page.evaluate(() =>
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" })),
  );
  await page.clock.fastForward(40_000);
  await expect(screensaver).toHaveCount(0);
  await page.clock.fastForward(25_000);
  await expect(screensaver).toBeVisible();
  await expect(
    screensaver.getByRole("region", { name: "Dagens kalender" }),
  ).toContainText("Testavtale");
  await expect(screensaver.locator(".screensaver-weather")).toHaveCount(0);
  await screensaver.locator("time").click();
  await expect(screensaver).toHaveCount(0);

  await page.reload();
  const saved = await page.evaluate(() => [
    localStorage.getItem("smarti-screensaver-delay"),
    localStorage.getItem("smarti-screensaver-weather"),
    localStorage.getItem("smarti-screensaver-calendar"),
  ]);
  expect(saved).toEqual(["1", "off", "on"]);
  await page
    .getByRole("button", { name: "Innstillinger", exact: true })
    .first()
    .click();
  await openSettings.click();
  await panel.getByLabel("Vær", { exact: true }).check();
  await panel.getByRole("button", { name: "Forhåndsvis" }).click();
  await expect(screensaver.locator(".screensaver-weather")).toContainText(
    "Skyet",
  );
  await expect(screensaver).toContainText("Testavtale");
  await page.screenshot({
    path: `/tmp/smarti-screensaver-${info.project.name}.png`,
  });
});

test("screensaver imports multiple photos, rotates the full frames and keeps the gallery on this device", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-16T12:00:00Z") });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  const openGallery = async () => {
    await page
      .getByRole("button", { name: "Innstillinger", exact: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Skjermsparer", exact: true })
      .click();
  };
  await openGallery();
  const gallery = page.getByRole("region", { name: "Bildegalleri" });
  await expect(
    gallery.getByRole("button", { name: "Legg til bilder", exact: true }),
  ).toBeEnabled();
  const photos = await Promise.all(
    [
      { name: "Familie 1.png", color: "#ec651d", width: 180, height: 260 },
      { name: "Familie 2.png", color: "#214be2", width: 260, height: 180 },
    ].map(async ({ name, ...picture }) => ({
      name,
      mimeType: "image/png",
      buffer: Buffer.from(
        await page.evaluate(({ color, width, height }) => {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d")!;
          context.fillStyle = color;
          context.fillRect(0, 0, width, height);
          return canvas.toDataURL("image/png").split(",")[1];
        }, picture),
        "base64",
      ),
    })),
  );
  await gallery.locator('input[type="file"]').setInputFiles(photos);
  await expect(gallery.getByRole("listitem")).toHaveCount(2);
  await expect(
    gallery.getByText("Familie 1.png", { exact: true }),
  ).toBeVisible();
  await expect(
    gallery.getByText("Familie 2.png", { exact: true }),
  ).toBeVisible();
  const duration = gallery.getByRole("combobox", {
    name: "Tid per bilde",
    exact: true,
  });
  await duration.selectOption("5");
  const preview = page
    .locator(".screensaver-settings")
    .getByRole("button", { name: "Forhåndsvis" });
  const dialog = page.getByRole("dialog", { name: "Skjermsparer" });
  const frame = dialog.locator(
    ".screensaver-photo-stage img[data-current][data-ready]",
  );
  const dimensions = () =>
    frame.evaluate((img: HTMLImageElement) => [
      img.naturalWidth,
      img.naturalHeight,
    ]);
  await preview.click();
  await expect(frame).toHaveCount(1);
  await expect(frame).toHaveCSS("object-fit", "contain");
  await expect(dialog.locator("time")).toBeVisible();
  expect(await dimensions()).toEqual([180, 260]);
  await page.clock.fastForward(5_000);
  await expect.poll(dimensions).toEqual([260, 180]);
  await page.clock.fastForward(5_000);
  await expect.poll(dimensions).toEqual([180, 260]);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await page.reload();
  await openGallery();
  await expect(gallery.getByRole("listitem")).toHaveCount(2);
  await expect(duration).toHaveValue("5");
  const visibleGallery = gallery.getByRole("switch", {
    name: "Vis bildegalleri",
  });
  await expect(visibleGallery).toBeChecked();
  await visibleGallery.uncheck();
  await preview.click();
  await expect(dialog.locator("time")).toBeVisible();
  await expect(dialog.locator(".screensaver-photo-stage")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.reload();
  await openGallery();
  await expect(gallery.getByRole("listitem")).toHaveCount(2);
  await expect(visibleGallery).not.toBeChecked();
  await visibleGallery.check();
  await gallery
    .getByRole("button", { name: "Fjern bilde Familie 1.png", exact: true })
    .click();
  await expect(gallery.getByRole("listitem")).toHaveCount(1);
  await expect(duration).toHaveCount(0);
  await preview.click();
  await expect.poll(dimensions).toEqual([260, 180]);
  await page.clock.fastForward(5_000);
  await expect.poll(dimensions).toEqual([260, 180]);
  await page.keyboard.press("Escape");
  await gallery
    .getByRole("button", { name: "Fjern bilde Familie 2.png", exact: true })
    .click();
  await expect(gallery.getByRole("listitem")).toHaveCount(0);
  await preview.click();
  await expect(dialog.locator(".screensaver-photo-stage")).toHaveCount(0);
  await expect(dialog.locator("time")).toBeVisible();
});
