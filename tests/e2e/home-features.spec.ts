import { test, expect } from "../../frontend/node_modules/@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(page.locator(".home-welcome")).toBeVisible();
});
test("scenes create without execution, edit targets, favorite and confirm activation", async ({
  page,
}) => {
  let activations = 0;
  page.on("request", (r) => {
    if (r.url().includes("/scenes/activate/")) activations++;
  });
  await page.getByRole("button", { name: "Lag scene", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Din nye scene" });
  await dialog
    .getByLabel("Hva skal scenen hete?")
    .fill("Filmtest " + test.info().project.name);
  await dialog.getByRole("button", { name: "Filmkveld", exact: true }).click();
  await dialog.getByRole("button", { name: "Neste", exact: true }).click();
  await dialog.getByRole("checkbox", { name: /Pendellampe/ }).check();
  await dialog.getByLabel("Pendellampe: Lysstyrke", { exact: true }).fill("35");
  await dialog.getByRole("button", { name: "Neste", exact: true }).click();
  await expect(dialog).toContainText("35%");
  await page.screenshot({
    path: `../artifacts/${test.info().project.name}-scene-editor.png`,
    fullPage: true,
  });
  await dialog
    .getByRole("button", { name: "Lagre scene", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(activations).toBe(0);
  const card = page
    .locator(".scene-card")
    .filter({ hasText: "Filmtest " + test.info().project.name });
  await card.getByRole("button", { name: /Favorittscene:/ }).click();
  await expect(
    card.getByRole("button", { name: /Favorittscene:/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await card.getByRole("button", { name: /Rediger scene:/ }).click();
  const edit = page.getByRole("dialog", { name: "Rediger scene" });
  await edit.getByRole("button", { name: "Neste", exact: true }).click();
  await expect(
    edit.getByLabel("Pendellampe: Lysstyrke", { exact: true }),
  ).toHaveValue("35");
  await edit.getByLabel("Pendellampe: Lysstyrke", { exact: true }).fill("50");
  await edit.getByRole("button", { name: "Neste", exact: true }).click();
  await edit.getByRole("button", { name: "Lagre scene", exact: true }).click();
  await expect(edit).not.toBeVisible();
  page.once("dialog", (d) => d.dismiss());
  await card.getByRole("button", { name: "Aktiver", exact: true }).click();
  expect(activations).toBe(0);
  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "Aktiver", exact: true }).click();
  await expect.poll(() => activations).toBe(1);
  await expect(page.locator(".home-scenes")).toContainText(
    "Simulert i demohjemmet",
  );
});
test("energy choices persist, period changes and missing samples stay gaps", async ({
  page,
}) => {
  const base = await (await page.request.get("/api/home")).json();
  const sensor = {
    id: "sensor.test_energy",
    entity_id: "sensor.test_energy",
    name: "Hovedmåler",
    domain: "sensor",
    state: "1250",
    attributes: { unit_of_measurement: "kWh" },
    availability: "available",
    area_id: "living",
    device_id: null,
    capabilities: [],
    diagnostic: false,
  };
  await page.route("**/api/home", (r) =>
    r.fulfill({ json: { ...base, controls: [...base.controls, sensor] } }),
  );
  let prefs = { meters: [sensor.id], hidden: [], period: "24h", chart: "bar" };
  await page.route("**/api/home/energy/preferences", (r) => {
    if (r.request().method() === "PUT") prefs = r.request().postDataJSON();
    return r.fulfill({ json: prefs });
  });
  await page.route("**/api/home/energy/statistics?**", (r) => {
    const points = Array.from({ length: 24 }, (_, i) => ({
      time: new Date(Date.UTC(2026, 9, 12, i)).toISOString(),
      value: i === 6 ? null : (i % 4) + 1,
    }));
    return r.fulfill({
      json: {
        start: points[0].time,
        end: "2026-10-13T00:00:00Z",
        previous_start: "2026-10-11T00:00:00Z",
        period: prefs.period,
        series: [
          {
            id: sensor.id,
            name: sensor.name,
            unit: "kWh",
            kind: "energy",
            current: {
              value: 56,
              complete: false,
              coverage: 96,
              peak: 4,
              points,
            },
            previous: {
              value: 60,
              complete: true,
              coverage: 100,
              peak: 4,
              points,
            },
            change_percent: null,
          },
        ],
      },
    });
  });
  await page.reload();
  const energy = page.locator(".energy-workspace");
  await energy.scrollIntoViewIfNeeded();
  await expect(energy).toContainText("96%");
  await expect(energy).toContainText("Trenger komplette data");
  await energy
    .getByRole("button", { name: "Tilpass energi", exact: true })
    .click();
  await energy
    .getByRole("checkbox", { name: "Forrige periode", exact: true })
    .uncheck();
  await energy.getByLabel("Graftype").selectOption("line");
  await energy
    .getByRole("button", { name: "Lagre visning", exact: true })
    .click();
  await expect(energy.locator(".energy-comparison")).toHaveCount(0);
  await expect(energy.locator(".energy-current-line")).toHaveCount(1);
  await expect(energy.locator(".energy-current-line")).toHaveAttribute(
    "d",
    /M.*M/,
  );
  await energy.getByRole("button", { name: "7 dager", exact: true }).click();
  await expect(
    energy.getByRole("button", { name: "7 dager", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(energy.locator(".energy-comparison")).toHaveCount(0);
  await energy.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `../artifacts/${test.info().project.name}-energy.png`,
    fullPage: true,
  });
  expect(
    await page
      .locator("body")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
});
test("real HLS decoding starts only in view and stop releases the session", async ({
  page,
}) => {
  const base = await (await page.request.get("/api/home")).json();
  await page.route("**/api/home", (r) =>
    r.fulfill({
      json: {
        ...base,
        controls: [
          ...base.controls,
          {
            id: "camera.test",
            entity_id: "camera.test",
            name: "Testkamera",
            domain: "camera",
            state: "idle",
            attributes: {},
            availability: "available",
            area_id: null,
            device_id: null,
            capabilities: [],
            diagnostic: false,
          },
        ],
      },
    }),
  );
  let starts = 0,
    stops = 0,
    segments = 0;
  await page.route("**/api/home/camera/camera.test/live", (r) => {
    starts++;
    return r.fulfill({
      json: { id: "fixture", path: "home/camera-stream/fixture/master.m3u8" },
    });
  });
  await page.route("**/api/home/camera-stream/fixture**", async (r) => {
    if (r.request().method() === "DELETE") {
      stops++;
      return r.fulfill({ json: { stopped: true } });
    }
    const name = new URL(r.request().url()).pathname.split("/").at(-1)!;
    if (name.endsWith(".m4s")) segments++;
    const body = await readFile(path.resolve("../tests/fixtures/live", name));
    return r.fulfill({
      body,
      contentType: name.endsWith(".m3u8")
        ? "application/vnd.apple.mpegurl"
        : "video/mp4",
    });
  });
  await page.reload();
  await expect(page.locator(".home-welcome")).toBeVisible();
  expect(starts).toBe(0);
  const card = page.locator(".camera-live-card");
  await card.scrollIntoViewIfNeeded();
  await expect
    .poll(
      () =>
        card.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime),
      { timeout: 20000 },
    )
    .toBeGreaterThan(0.2);
  await expect(card.locator(".camera-state")).toHaveText("LIVE");
  expect(segments).toBeGreaterThan(0);
  await card.getByRole("button", { name: "Stopp live: Testkamera" }).click();
  await expect.poll(() => stops).toBeGreaterThan(0);
  await expect(card.locator("video")).not.toHaveAttribute("src", /./);
  await card.getByRole("button", { name: "Start live: Testkamera" }).click();
  await expect.poll(() => starts).toBe(2);
  await page.locator(".home-welcome").scrollIntoViewIfNeeded();
  await expect.poll(() => stops).toBe(2);
});
