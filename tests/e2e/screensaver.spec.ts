import {
  devices,
  expect,
  test,
  type Page,
} from "../../frontend/node_modules/@playwright/test";

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

async function signIn(page: Page) {
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
}

async function openGallery(page: Page) {
  await page
    .getByRole("button", { name: "Innstillinger", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Skjermsparer", exact: true }).click();
  const gallery = page.getByRole("region", { name: "Bildegalleri" });
  const manager = gallery.locator(".screensaver-library");
  const preview = page
    .locator(".screensaver-settings")
    .getByRole("button", { name: "Forhåndsvis" });
  const dialog = page.getByRole("dialog", { name: "Skjermsparer" });
  const frame = dialog.locator(
    ".screensaver-photo-stage img[data-current][data-ready]",
  );
  return {
    gallery,
    manager,
    preview,
    dialog,
    frame,
    rows: gallery.locator(".screensaver-photo-list li"),
    duration: gallery.getByRole("combobox", { name: "Tid per bilde" }),
    showing: gallery.getByRole("switch", { name: "Vis bildegalleri" }),
    select: (name: string) =>
      gallery.getByRole("checkbox", { name, exact: true }),
    dimensions: () =>
      frame.evaluate((img: HTMLImageElement) => [
        img.naturalWidth,
        img.naturalHeight,
      ]),
    async closePreview() {
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
    },
    async openManager() {
      const summary = manager.locator("summary");
      await expect(summary).toHaveText(/Administrer fellesbibliotek/);
      if (
        !(await manager.evaluate((details: HTMLDetailsElement) => details.open))
      )
        await summary.click();
    },
    async remove(name: string) {
      await manager
        .getByRole("button", {
          name: `Slett ${name} fra fellesbiblioteket`,
          exact: true,
        })
        .click();
      await page
        .getByRole("dialog", {
          name: "Slett fra fellesbiblioteket?",
          exact: true,
        })
        .getByRole("button", { name: "Slett bilde", exact: true })
        .click();
      await expect(
        gallery.getByRole("checkbox", { name, exact: true }),
      ).toHaveCount(0);
    },
  };
}

test("screensaver shares photos across screens and keeps playback and photo choices independent", async ({
  page,
  browser,
  baseURL,
}, info) => {
  await page.clock.install({ time: new Date("2026-11-16T12:00:00Z") });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const other = await browser.newContext({
    ...(info.project.name === "mobile"
      ? devices["Desktop Chrome"]
      : devices["iPhone 13"]),
    baseURL,
    reducedMotion: "reduce",
  });
  const pageB = await other.newPage();
  const first = `Familie 1 ${info.project.name}.png`;
  const second = `Familie 2 ${info.project.name}.png`;
  try {
    await page.goto("/");
    await signIn(page);
    const a = await openGallery(page);
    await a.openManager();
    await expect(
      a.manager.getByRole("button", { name: "Legg til bilder", exact: true }),
    ).toBeEnabled();
    const photos = await Promise.all(
      [
        { name: first, color: "#ec651d", width: 180, height: 260 },
        { name: second, color: "#214be2", width: 260, height: 180 },
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
    await a.manager.locator('input[type="file"]').setInputFiles(photos);
    await expect(a.rows).toHaveCount(2);
    await expect(a.showing).not.toBeChecked();
    await a.showing.check();
    await a.duration.selectOption("5");

    await pageB.goto("/");
    await signIn(pageB);
    const b = await openGallery(pageB);
    await expect(b.rows).toHaveCount(2);
    for (const name of [first, second]) {
      const thumb = b.rows.filter({ hasText: name }).locator("img");
      await thumb.scrollIntoViewIfNeeded();
      await expect
        .poll(() => thumb.evaluate((img: HTMLImageElement) => img.naturalWidth))
        .toBeGreaterThan(0);
    }
    await expect(b.showing).not.toBeChecked();
    await expect(b.duration).toHaveValue("10");
    await b.preview.click();
    await expect(b.dialog.locator("time")).toBeVisible();
    await expect(b.dialog.locator(".screensaver-photo-stage")).toHaveCount(0);
    await b.closePreview();

    await b.showing.check();
    await b.select(first).uncheck();
    await expect(b.select(second)).toBeChecked();
    await expect(b.duration).toHaveCount(0);
    await b.preview.click();
    await expect.poll(b.dimensions).toEqual([260, 180]);
    await b.closePreview();

    await expect(a.showing).toBeChecked();
    await expect(a.select(first)).toBeChecked();
    await expect(a.select(second)).toBeChecked();
    await a.preview.click();
    await expect(a.frame).toHaveCount(1);
    await expect(a.frame).toHaveCSS("object-fit", "contain");
    await expect(a.dialog.locator("time")).toBeVisible();
    await expect.poll(a.dimensions).toEqual([180, 260]);
    await page.clock.fastForward(5_000);
    await expect.poll(a.dimensions).toEqual([260, 180]);
    await page.clock.fastForward(5_000);
    await expect.poll(a.dimensions).toEqual([180, 260]);
    await a.closePreview();

    await page.reload();
    await pageB.reload();
    await openGallery(page);
    await openGallery(pageB);
    await expect(a.rows).toHaveCount(2);
    await expect(b.rows).toHaveCount(2);
    await expect(a.showing).toBeChecked();
    await expect(a.duration).toHaveValue("5");
    await expect(a.select(first)).toBeChecked();
    await expect(b.showing).toBeChecked();
    await expect(b.select(first)).not.toBeChecked();
    await expect(b.select(second)).toBeChecked();

    await b.openManager();
    await b.remove(first);
    await expect(b.rows).toHaveCount(1);
    await pageB.reload();
    await openGallery(pageB);
    await expect(b.rows).toHaveCount(1);
    await expect(b.select(first)).toHaveCount(0);
    await page.reload();
    await openGallery(page);
    await expect(a.rows).toHaveCount(1);
    await expect(a.select(first)).toHaveCount(0);
    await expect(a.select(second)).toBeChecked();
    await a.preview.click();
    await expect.poll(a.dimensions).toEqual([260, 180]);
    await page.clock.fastForward(5_000);
    await expect.poll(a.dimensions).toEqual([260, 180]);
    await a.closePreview();
    await a.openManager();
    await a.remove(second);
    await expect(a.rows).toHaveCount(0);
  } finally {
    await other.close();
  }
});

test("legacy browser photos enter the shared library only after explicit confirmation", async ({
  page,
}, info) => {
  const entry = {
    id: (info.project.name === "mobile" ? "a" : "b").repeat(32),
    name: `Tidligere familiebilde ${info.project.name}.jpg`,
  };
  await page.goto("/");
  await page.evaluate(async ({ id, name }) => {
    const canvas = document.createElement("canvas");
    const image = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("Missing test photo")),
        "image/jpeg",
      );
    });
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("smarti-screensaver-gallery", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("galleries");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction("galleries", "readwrite");
        transaction
          .objectStore("galleries")
          .put([{ id, name, image, thumbnail: image }], "tester");
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
  }, entry);
  await signIn(page);
  const panel = await openGallery(page);
  await expect(panel.select(entry.name)).toBeVisible();
  await expect(panel.rows.filter({ hasText: entry.name })).toContainText(
    "Kun på denne skjermen",
  );
  async function photosOnHub() {
    const response = await page.request.get("/api/home/screensaver/photos");
    expect(response.ok()).toBeTruthy();
    const { photos } = (await response.json()) as { photos: (typeof entry)[] };
    return photos;
  }
  expect(await photosOnHub()).not.toContainEqual(entry);
  await panel.openManager();
  const share = panel.manager.getByRole("button", {
    name: "Del lokale bilder i fellesbiblioteket",
    exact: true,
  });
  const confirmation = page.getByRole("dialog", {
    name: "Del lokale bilder?",
    exact: true,
  });
  await share.click();
  await confirmation
    .getByRole("button", { name: "Avbryt", exact: true })
    .click();
  expect(await photosOnHub()).not.toContainEqual(entry);
  await share.click();
  await confirmation
    .getByRole("button", { name: "Del bilder", exact: true })
    .click();
  await expect.poll(photosOnHub).toContainEqual(entry);
  await expect(panel.rows.filter({ hasText: entry.name })).not.toContainText(
    "Kun på denne skjermen",
  );
  await panel.remove(entry.name);
});
