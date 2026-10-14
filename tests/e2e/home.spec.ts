import { test, expect } from "../../frontend/node_modules/@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(page.locator(".home-welcome h1")).toBeVisible();
});
test("daily journey, persisted favorite, command and room filter", async ({
  page,
}) => {
  await expect(
    page.getByText("Du utforsker et eksempel. Ingen ekte enheter blir styrt."),
  ).toBeVisible();
  await page.screenshot({
    path: `../artifacts/${test.info().project.name}-light.png`,
    fullPage: true,
  });
  const card = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Pendellampe", exact: true }),
  });
  const toggle = card.getByRole("switch");
  const before = await toggle.getAttribute("aria-checked");
  await toggle.click();
  await expect(toggle).toHaveAttribute(
    "aria-checked",
    before === "true" ? "false" : "true",
  );
  await expect(card.getByRole("status")).toHaveText("Oppdatert i demo.");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Enheter", exact: true })
    .click();
  await page.getByLabel("Søk etter enhet eller rom").fill("Stikkontakt");
  await expect(page.locator("article")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Stikkontakt", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Rom", exact: true })
    .click();
  await page.getByLabel("Søk etter enhet eller rom").fill("");
  await page.getByRole("button", { name: "Soverom", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Nattbord", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Nattbord: På" }),
  ).toBeDisabled();
  await expect(page.locator("body")).toHaveJSProperty(
    "scrollWidth",
    await page.locator("body").evaluate((e) => e.clientWidth),
  );
});
test("themes, language, no sensitive cache and responsive navigation", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Mørkt", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Innstillinger", exact: true })
    .click();
  await page.getByLabel("Utseende").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByLabel("Språk").selectOption("en");
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  const response = await page.request.get("/api/home");
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(
    await page.evaluate(() =>
      navigator.serviceWorker.getRegistrations().then((v) => v.length),
    ),
  ).toBe(0);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Home", exact: true })
    .click();
  await expect(page.locator(".home-welcome h1")).toBeVisible();
  await page.screenshot({
    path: `../artifacts/${test.info().project.name}-dark.png`,
    fullPage: true,
  });
});

test("personalization persists rooms and favorites and has no dashboard builder", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Tilpass Hjem", exact: true }).click();
  await page.getByRole("checkbox", { name: "Kjøkken", exact: true }).check();
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/home/preferences")).json()).rooms,
    )
    .toContain("kitchen");
  await page.getByRole("button", { name: "Ferdig", exact: true }).click();
  await expect(page.locator(".home-room-card")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".home-room-card")).toHaveCount(1);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Innstillinger", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Dashbord", exact: true }),
  ).toHaveCount(0);
  expect((await page.request.get("/api/dashboards")).status()).toBe(410);
});

test("capability profiles, cameras on demand, missing data and large homes", async ({
  page,
}) => {
  const base = await (await page.request.get("/api/home")).json();
  const make = (
    id: string,
    domain: string,
    state: string,
    attributes: Record<string, unknown> = {},
  ) => ({
    id,
    entity_id: `${domain}.${id}`,
    name: id,
    domain,
    state,
    attributes,
    availability: state === "unavailable" ? "unavailable" : "available",
    area_id: "living",
    device_id: null,
    capabilities: [],
    diagnostic: false,
    updated_at: null,
    integration: null,
  });
  let profile = {
    ...base,
    mode: "live",
    favorites: [],
    controls: [make("Light", "light", "on")],
  };
  await page.route("**/api/home", (route) => route.fulfill({ json: profile }));
  await page.reload();
  await expect(page.locator(".home-welcome")).toBeVisible();
  await expect(page.locator("#home-security")).toHaveCount(0);
  await expect(page.locator("#home-energy")).toHaveCount(0);
  await expect(page.locator(".home-cameras")).toHaveCount(0);
  profile = {
    ...profile,
    controls: [
      make("Power", "sensor", "3200", {
        unit_of_measurement: "W",
        device_class: "power",
      }),
      make("Charging", "binary_sensor", "on", {
        device_class: "battery_charging",
      }),
      make("Front", "camera", "idle"),
      make("Lock", "lock", "unavailable"),
    ],
  };
  await page.route("**/api/home/history/**", (route) =>
    route.fulfill({
      json: {
        unit: "W",
        points: [
          { time: "2026-10-12T10:00:00Z", value: 2400 },
          { time: "2026-10-12T11:00:00Z", value: 3200 },
        ],
      },
    }),
  );
  let cameraRequests = 0;
  await page.route("**/api/home/camera/**", (route) => {
    cameraRequests++;
    return route.fulfill({ status: 503 });
  });
  await page.reload();
  await page.getByRole("tab", { name: "Energi", exact: true }).click();
  await expect(page.locator("#home-energy")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Elbil & lader", exact: true }),
  ).toBeVisible();
  expect(cameraRequests).toBe(0);
  await page.getByRole("tab", { name: "Sikkerhet", exact: true }).click();
  await expect(page.locator("#home-security")).toContainText("Lock");
  await page.locator(".home-cameras").scrollIntoViewIfNeeded();
  await expect(
    page.getByText("Strømmen kunne ikke startes", { exact: true }),
  ).toBeVisible();
  // Live requests now use a POST handshake; no still-image polling is performed.
  expect(cameraRequests).toBeGreaterThanOrEqual(1);
  profile = { ...profile, connected: false };
  await page.reload();
  await expect(page.locator(".home-welcome")).toContainText(
    "venter på ferske data",
  );
  await page.getByRole("tab", { name: "Sikkerhet", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Stopp live: Front", exact: true }),
  ).toBeDisabled();
  profile = {
    ...profile,
    connected: true,
    controls: Array.from({ length: 600 }, (_, i) =>
      make(`Light${i}`, "light", "off"),
    ),
  };
  await page.reload();
  await expect(page.locator(".home-welcome")).toBeVisible();
  expect(await page.locator(".device").count()).toBeLessThan(20);
  await page.setViewportSize({ width: 834, height: 1112 });
  await page.screenshot({
    path: `../artifacts/${test.info().project.name}-home-tablet.png`,
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page
      .locator("body")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
});

test("room photo and explicitly configured home mode work without automatic execution", async ({
  page,
}) => {
  let runs = 0;
  page.on("request", (r) => {
    if (r.url().includes("/modes/night/run")) runs++;
  });
  await page.getByRole("button", { name: "Tilpass Hjem", exact: true }).click();
  const photo = await page.screenshot({
    clip: { x: 0, y: 0, width: 16, height: 16 },
  });
  await page
    .getByLabel("Rombilde: Kjøkken", { exact: true })
    .setInputFiles({ name: "room.png", mimeType: "image/png", buffer: photo });
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/home/preferences")).json()).images
          .kitchen,
    )
    .toBe(true);
  await page.getByText("Hjemme, Borte, Natt og Ferie", { exact: true }).click();
  await page
    .getByLabel("Rutine for Natt", { exact: true })
    .selectOption("demo-automation.evening");
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/home/preferences")).json()).modes
          .night,
    )
    .toBe("demo-automation.evening");
  expect(runs).toBe(0);
  await page.getByRole("button", { name: "Ferdig", exact: true }).click();
  page.once("dialog", (d) => d.dismiss());
  await page
    .getByRole("navigation", { name: "Hjemmemoduser" })
    .getByRole("button", { name: /Natt/ })
    .click();
  expect(runs).toBe(0);
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("navigation", { name: "Hjemmemoduser" })
    .getByRole("button", { name: /Natt/ })
    .click();
  await expect(
    page.getByText("Simulert i demohjemmet.", { exact: true }),
  ).toBeVisible();
  expect(runs).toBe(1);
});
